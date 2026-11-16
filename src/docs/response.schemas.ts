import { z } from "zod";
import { AuditAction, AuditTargetType, MessageAuthorType, Role, TicketStatus } from "../generated/prisma/enums.js";
import { AI_STATUSES } from "../lib/ai-prompts.js";

// Shape of the API responses. Strict objects: a field that is not documented here
// (a password hash for example) makes the contract tests fail.

const dateTime = z.iso.datetime();

export const userSummarySchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
});

export const currentUserSchema = z.strictObject({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  role: z.enum(Role),
});

export const userSchema = z.strictObject({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  role: z.enum(Role),
  isActive: z.boolean(),
  status: z.enum(["PENDING", "ACTIVE", "DISABLED"]).meta({
    description: "PENDING until the invitation is accepted",
  }),
  createdAt: dateTime,
  updatedAt: dateTime,
});

export const createdUserSchema = z.strictObject({
  user: userSchema,
  invitationSent: z.boolean().meta({ description: "false if the email could not be sent, the invitation can be sent again" }),
});

export const sessionSchema = z.strictObject({
  accessToken: z.string().meta({ description: "JWT valid 15 minutes, to send in the Authorization: Bearer header" }),
  user: currentUserSchema,
});

export const ticketSchema = z.strictObject({
  id: z.uuid(),
  title: z.string(),
  description: z.string(),
  status: z.enum(TicketStatus),
  needsAgent: z.boolean().meta({ description: "true while the customer waits for an answer from a person of the support team" }),
  createdAt: dateTime,
  updatedAt: dateTime,
  createdBy: userSummarySchema,
});

// Name only: the email address of the support team is not shown to the customers
const authorSchema = z.strictObject({ id: z.uuid(), name: z.string() });

export const ticketMessageSchema = z.strictObject({
  id: z.uuid(),
  ticketId: z.uuid(),
  authorType: z.enum(MessageAuthorType).meta({ description: "CUSTOMER, SUPPORT (a person of the team) or AI" }),
  author: authorSchema.nullable().meta({ description: "null for the messages of the AI" }),
  body: z.string(),
  createdAt: dateTime,
});

export const aiStatusSettingSchema = z.strictObject({
  status: z.enum(AI_STATUSES),
  autoReply: z.boolean(),
  instructions: z.string(),
  isDefault: z.boolean().meta({ description: "true while nobody changed the setting" }),
  updatedAt: dateTime.nullable(),
  updatedBy: authorSchema.nullable(),
});

export const aiSettingsSchema = z.strictObject({
  enabled: z.boolean().meta({ description: "false while AI_API_KEY is not set" }),
  provider: z.enum(["openai", "deepseek"]).nullable(),
  model: z.string().nullable().meta({ description: "null when the model is chosen in the OpenAI dashboard prompt" }),
  promptId: z.string().nullable().meta({ description: "Prompt of the OpenAI dashboard used as reference, if any" }),
  maxAutoReplies: z.int(),
  statuses: z.array(aiStatusSettingSchema),
});

export const aiSuggestionSchema = z.strictObject({
  suggestion: z.string().meta({ description: "Draft to read and edit before sending it as a message" }),
});

export const auditLogSchema = z.strictObject({
  id: z.uuid(),
  action: z.enum(AuditAction),
  actorId: z.uuid().nullable().meta({ description: "null when the action was not done by a logged in user" }),
  actor: userSummarySchema.nullable(),
  targetType: z.enum(AuditTargetType),
  targetId: z.uuid(),
  metadata: z.record(z.string(), z.unknown()).nullable().meta({ description: "For example the previous and new role" }),
  ipAddress: z.string().nullable(),
  requestId: z.string().nullable(),
  createdAt: dateTime,
});

export function paginatedSchema<T extends z.ZodType>(item: T) {
  return z.strictObject({
    data: z.array(item),
    meta: z.strictObject({
      page: z.int(),
      limit: z.int(),
      total: z.int(),
      totalPages: z.int(),
    }),
  });
}

export const messageSchema = z.strictObject({ message: z.string() });

export const healthSchema = z.strictObject({ status: z.literal("ok") });

export const errorSchema = z.strictObject({
  error: z.strictObject({
    code: z.string().meta({ description: "Stable code to test in the client, for example TICKET_NOT_FOUND" }),
    message: z.string(),
    details: z.array(z.strictObject({ field: z.string(), message: z.string() })).optional().meta({
      description: "Only for VALIDATION_FAILED",
    }),
    requestId: z.uuid().meta({ description: "Also sent in the X-Request-Id header" }),
  }),
});
