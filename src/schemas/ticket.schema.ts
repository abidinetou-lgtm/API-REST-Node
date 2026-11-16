import { z } from "zod";
import { TicketStatus } from "../generated/prisma/enums.js";
import { commaList, paginationSchema, searchSchema } from "./pagination.schema.js";

export const createTicketSchema = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(10).max(2000),
});

export const updateStatusSchema = z.object({
  status: z.enum(TicketStatus),
});

export const ticketIdSchema = z.object({
  id: z.uuid(),
});

export const listTicketsSchema = paginationSchema
  .extend({
    status: commaList(z.enum(TicketStatus)).optional(),
    search: searchSchema.optional(),
    createdById: z.uuid().optional(),
    needsAgent: z.stringbool().optional().meta({ description: "true: only the tickets waiting for a person of the support team" }),
    createdFrom: z.coerce.date().optional(),
    createdTo: z.coerce.date().optional(),
    sort: z.enum(["createdAt", "updatedAt", "title", "status"]).default("createdAt"),
  })
  .refine((query) => !query.createdFrom || !query.createdTo || query.createdFrom <= query.createdTo, {
    message: "createdFrom must be before createdTo",
    path: ["createdFrom"],
  });

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type ListTicketsQuery = z.infer<typeof listTicketsSchema>;
