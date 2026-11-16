import { prisma } from "../lib/prisma.js";
import { HttpError } from "../utils/http-error.js";
import { STAFF_ROLES } from "../utils/roles.js";
import { paginated, paginationArgs } from "../utils/pagination.js";
import { recordAudit } from "./audit.service.js";
import { canAutoReply, scheduleAutoReply } from "./ai.service.js";
import { visibleTicketsFilter } from "./ticket.service.js";
import type { CreateMessageInput, ListMessagesQuery } from "../schemas/ticket-message.schema.js";
import type { Role, TicketStatus } from "../generated/prisma/enums.js";

type Actor = { id: string; role: Role };

type TicketState = {
  id: string;
  status: TicketStatus;
  needsAgent: boolean;
  createdById: string;
};

// The email address of the support team is not shown to the customers
const messageSelect = {
  id: true,
  ticketId: true,
  authorType: true,
  body: true,
  createdAt: true,
  author: { select: { id: true, name: true } },
};

// Same rule as the tickets: someone else's ticket answers 404
async function findVisibleTicket(actor: Actor, ticketId: string): Promise<TicketState> {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, ...visibleTicketsFilter(actor) },
    select: { id: true, status: true, needsAgent: true, createdById: true },
  });

  if (!ticket) {
    throw new HttpError(404, "TICKET_NOT_FOUND", "Ticket not found");
  }
  return ticket;
}

export async function listMessages(actor: Actor, ticketId: string, query: ListMessagesQuery) {
  await findVisibleTicket(actor, ticketId);

  const where = { ticketId };
  const [messages, total] = await prisma.$transaction([
    prisma.ticketMessage.findMany({
      where,
      select: messageSelect,
      orderBy: [{ createdAt: query.order }, { id: query.order }],
      ...paginationArgs(query),
    }),
    prisma.ticketMessage.count({ where }),
  ]);

  return paginated(messages, total, query);
}

export async function addMessage(actor: Actor, ticketId: string, { body }: CreateMessageInput) {
  const ticket = await findVisibleTicket(actor, ticketId);

  if (ticket.status === "CLOSED") {
    throw new HttpError(409, "TICKET_CLOSED", "The ticket is closed");
  }

  // A member of the team writing on their own ticket is the customer of that ticket
  const fromSupport = STAFF_ROLES.includes(actor.role) && ticket.createdById !== actor.id;
  return fromSupport ? addSupportMessage(actor, ticket, body) : addCustomerMessage(actor, ticket, body);
}

async function addSupportMessage(actor: Actor, ticket: TicketState, body: string) {
  return prisma.$transaction(async (tx) => {
    const message = await tx.ticketMessage.create({
      data: { ticketId: ticket.id, authorType: "SUPPORT", authorId: actor.id, body },
      select: messageSelect,
    });

    // A person of the team answers a new ticket: they take it, and the AI stops answering by itself
    const takesOver = ticket.status === "OPEN";
    await tx.ticket.update({
      where: { id: ticket.id },
      data: { needsAgent: false, ...(takesOver ? { status: "IN_PROGRESS" as const } : {}) },
    });

    if (takesOver) {
      await recordAudit(tx, {
        action: "TICKET_STATUS_CHANGED",
        actorId: actor.id,
        targetType: "TICKET",
        targetId: ticket.id,
        metadata: { from: "OPEN", to: "IN_PROGRESS", reason: "SUPPORT_REPLY" },
      });
    }
    return message;
  });
}

async function addCustomerMessage(actor: Actor, ticket: TicketState, body: string) {
  const willAutoReply = await canAutoReply(ticket);

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.ticketMessage.create({
      data: { ticketId: ticket.id, authorType: "CUSTOMER", authorId: actor.id, body },
      select: messageSelect,
    });

    // Without an automatic answer, the customer now waits for a person of the team
    await tx.ticket.update({ where: { id: ticket.id }, data: { needsAgent: !willAutoReply } });
    return created;
  });

  if (willAutoReply) {
    scheduleAutoReply(ticket.id);
  }
  return message;
}
