import { z } from "zod";
import { paginationSchema } from "./pagination.schema.js";

export const createMessageSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

// A conversation is read from the oldest message by default
export const listMessagesSchema = paginationSchema.extend({
  order: z.enum(["asc", "desc"]).default("asc"),
});

export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesSchema>;
