import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { aiClient, type AiClient } from "../lib/ai-client.js";
import {
  AI_STATUSES,
  DEFAULT_STATUS_SETTINGS,
  buildPrompt,
  isAiStatus,
  nextStatus,
  parseAiAnswer,
  type AiAnswer,
  type AiStatus,
  type ConversationMessage,
  type PromptMode,
  type StatusSettings,
} from "../lib/ai-prompts.js";
import { HttpError } from "../utils/http-error.js";
import { recordAudit } from "./audit.service.js";
import type { UpdateAiSettingInput } from "../schemas/ai.schema.js";
import type { Role, TicketStatus } from "../generated/prisma/enums.js";

type Actor = { id: string; role: Role };

// Only the last messages are sent to the AI: limits the cost of long conversations
const MAX_CONTEXT_MESSAGES = 20;

const newestFirst = [{ createdAt: "desc" as const }, { id: "desc" as const }];

const updatedBySelect = { select: { id: true, name: true } };

type SettingRow = {
  autoReply: boolean;
  instructions: string;
  updatedAt: Date;
  updatedBy: { id: string; name: string } | null;
};

function toPublicSetting(status: AiStatus, row?: SettingRow | null) {
  if (!row) {
    return { status, ...DEFAULT_STATUS_SETTINGS[status], isDefault: true, updatedAt: null, updatedBy: null };
  }
  return {
    status,
    autoReply: row.autoReply,
    instructions: row.instructions,
    isDefault: false,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}

export async function getStatusSettings(status: AiStatus): Promise<StatusSettings> {
  const row = await prisma.aiStatusSetting.findUnique({
    where: { status },
    select: { autoReply: true, instructions: true },
  });
  return row ?? DEFAULT_STATUS_SETTINGS[status];
}

export async function listAiSettings() {
  const rows = await prisma.aiStatusSetting.findMany({ include: { updatedBy: updatedBySelect } });

  return {
    enabled: aiClient !== null,
    provider: aiClient?.provider ?? null,
    model: aiClient?.model ?? null,
    promptId: aiClient?.promptId ?? null,
    maxAutoReplies: env.AI_MAX_AUTO_REPLIES,
    statuses: AI_STATUSES.map((status) => toPublicSetting(status, rows.find((row) => row.status === status))),
  };
}

export async function updateAiSetting(actor: Actor, status: AiStatus, input: UpdateAiSettingInput) {
  const previous = await getStatusSettings(status);

  return prisma.$transaction(async (tx) => {
    const row = await tx.aiStatusSetting.upsert({
      where: { status },
      create: { status, ...input, updatedById: actor.id },
      update: { ...input, updatedById: actor.id },
      include: { updatedBy: updatedBySelect },
    });

    // The previous instructions are kept in the log, to be able to go back
    await recordAudit(tx, {
      action: "AI_SETTING_CHANGED",
      actorId: actor.id,
      targetType: "AI_SETTING",
      targetId: row.id,
      metadata: { status, from: previous, to: input },
    });

    return toPublicSetting(status, row);
  });
}

type TicketState = {
  // null for a ticket that is being created
  id: string | null;
  status: TicketStatus;
  needsAgent: boolean;
};

// Whether the AI answers the new message of the customer by itself
export async function canAutoReply(ticket: TicketState) {
  // A ticket already waiting for the team (handoff, AI failure...) stays with the team
  if (!aiClient || ticket.needsAgent || !isAiStatus(ticket.status)) {
    return false;
  }

  const { autoReply } = await getStatusSettings(ticket.status);
  if (!autoReply) {
    return false;
  }

  if (!ticket.id) {
    return env.AI_MAX_AUTO_REPLIES > 0;
  }

  // Only the answers given since a person of the team last wrote are counted
  const lastSupportMessage = await prisma.ticketMessage.findFirst({
    where: { ticketId: ticket.id, authorType: "SUPPORT" },
    orderBy: newestFirst,
    select: { createdAt: true },
  });
  const aiReplies = await prisma.ticketMessage.count({
    where: {
      ticketId: ticket.id,
      authorType: "AI",
      createdAt: lastSupportMessage ? { gt: lastSupportMessage.createdAt } : undefined,
    },
  });

  return aiReplies < env.AI_MAX_AUTO_REPLIES;
}

type Conversation = {
  title: string;
  description: string;
  status: TicketStatus;
  messages: (ConversationMessage & { id: string })[];
};

async function loadConversation(ticketId: string): Promise<Conversation | null> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      title: true,
      description: true,
      status: true,
      messages: {
        orderBy: newestFirst,
        take: MAX_CONTEXT_MESSAGES,
        select: { id: true, authorType: true, body: true },
      },
    },
  });

  if (!ticket) {
    return null;
  }
  return { ...ticket, messages: ticket.messages.reverse() };
}

async function askAi(client: AiClient, conversation: Conversation, status: AiStatus, mode: PromptMode) {
  const { instructions } = await getStatusSettings(status);
  const prompt = buildPrompt({ mode, status, instructions, ticket: conversation, messages: conversation.messages });
  return parseAiAnswer(await client.completeJson(prompt));
}

async function autoReply(client: AiClient, ticketId: string) {
  const conversation = await loadConversation(ticketId);
  if (!conversation || !isAiStatus(conversation.status)) {
    return;
  }
  const currentStatus = conversation.status;
  const lastMessageId = conversation.messages.at(-1)?.id ?? null;

  let answer: AiAnswer;
  try {
    answer = await askAi(client, conversation, currentStatus, "reply");
  } catch (error) {
    // The customer must not stay without an answer: a person of the team takes over
    console.error(`AI auto reply failed for ticket ${ticketId}`, error);
    await prisma.ticket.update({ where: { id: ticketId }, data: { needsAgent: true } });
    return;
  }

  await prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findUnique({
      where: { id: ticketId },
      select: { status: true, messages: { orderBy: newestFirst, take: 1, select: { id: true } } },
    });
    if (!ticket) {
      return;
    }

    // A new message arrived during the generation: it has its own answer on the way
    if ((ticket.messages[0]?.id ?? null) !== lastMessageId) {
      return;
    }

    // A person changed the status during the generation: their decision wins and the answer is dropped.
    // If the ticket is still active, the last message of the customer now waits for a person.
    if (ticket.status !== currentStatus) {
      if (ticket.status === "OPEN" || ticket.status === "IN_PROGRESS") {
        await tx.ticket.update({ where: { id: ticketId }, data: { needsAgent: true } });
      }
      return;
    }

    const status = nextStatus({
      current: currentStatus,
      proposed: answer.status,
      customerHasReplied: conversation.messages.some((message) => message.authorType === "CUSTOMER"),
    });

    await tx.ticketMessage.create({ data: { ticketId, authorType: "AI", body: answer.reply } });
    await tx.ticket.update({
      where: { id: ticketId },
      // The AI asking for a person is the signal for the team, even on a ticket already IN_PROGRESS
      data: { status, needsAgent: answer.status === "IN_PROGRESS" },
    });

    if (status !== currentStatus) {
      await recordAudit(tx, {
        action: "TICKET_STATUS_CHANGED",
        actorId: null,
        targetType: "TICKET",
        targetId: ticketId,
        metadata: { from: currentStatus, to: status, source: "AI" },
      });
    }
  });
}

const pendingReplies = new Set<Promise<void>>();

// Not awaited by the request: the customer gets the response without waiting for the AI
export function scheduleAutoReply(ticketId: string) {
  if (!aiClient) {
    return;
  }

  const task: Promise<void> = autoReply(aiClient, ticketId)
    .catch((error) => console.error(`AI auto reply failed for ticket ${ticketId}`, error))
    .finally(() => pendingReplies.delete(task));
  pendingReplies.add(task);
}

// Used on shutdown and by the tests, so that no answer is lost
export async function waitForPendingReplies() {
  await Promise.allSettled([...pendingReplies]);
}

// Draft for the support team: nothing is saved or sent to the customer
export async function suggestReply(ticketId: string) {
  if (!aiClient) {
    throw new HttpError(503, "AI_DISABLED", "The AI is not configured");
  }

  const conversation = await loadConversation(ticketId);
  if (!conversation) {
    throw new HttpError(404, "TICKET_NOT_FOUND", "Ticket not found");
  }
  if (!isAiStatus(conversation.status)) {
    throw new HttpError(409, "TICKET_CLOSED", "The ticket is closed");
  }

  try {
    const answer = await askAi(aiClient, conversation, conversation.status, "draft");
    // Only shown to the agent: the status of the ticket does not change
    return { suggestion: answer.reply, suggestedStatus: answer.status ?? null };
  } catch (error) {
    console.error(`AI suggestion failed for ticket ${ticketId}`, error);
    throw new HttpError(502, "AI_UNAVAILABLE", "The AI could not answer, try again later");
  }
}
