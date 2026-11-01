import { z } from "zod";
import { AuditAction, AuditTargetType } from "../generated/prisma/enums.js";
import { commaList, paginationSchema } from "./pagination.schema.js";

export const listAuditLogsSchema = paginationSchema
  .extend({
    action: commaList(z.enum(AuditAction)).optional(),
    actorId: z.uuid().optional(),
    targetType: z.enum(AuditTargetType).optional(),
    targetId: z.uuid().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: "from must be before to",
    path: ["from"],
  });

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsSchema>;
