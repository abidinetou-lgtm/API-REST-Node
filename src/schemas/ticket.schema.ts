import { z } from "zod";
import { TicketStatus } from "../generated/prisma/enums.js";

export const createTicketSchema = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(10).max(2000),
});

export const updateStatusSchema = z.object({
  status: z.enum(TicketStatus),
});

export const ticketIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
