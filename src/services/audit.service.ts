import { prisma } from "../lib/prisma.js";
import { getRequestContext } from "../lib/request-context.js";
import { paginated, paginationArgs } from "../utils/pagination.js";
import type { ListAuditLogsQuery } from "../schemas/audit.schema.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { AuditAction, AuditTargetType } from "../generated/prisma/enums.js";

type AuditEntry = {
  action: AuditAction;
  actorId: string | null;
  targetType: AuditTargetType;
  targetId: string;
  metadata?: Prisma.InputJsonObject;
};

// Takes the transaction of the action: the log is saved only if the action succeeds, and the other way around
export async function recordAudit(tx: Prisma.TransactionClient, entry: AuditEntry) {
  const context = getRequestContext();

  await tx.auditLog.create({
    data: {
      ...entry,
      ipAddress: context?.ip,
      requestId: context?.requestId,
    },
  });
}

export async function listAuditLogs(query: ListAuditLogsQuery) {
  const where: Prisma.AuditLogWhereInput = {
    action: query.action ? { in: query.action } : undefined,
    actorId: query.actorId,
    targetType: query.targetType,
    targetId: query.targetId,
    createdAt: query.from || query.to ? { gte: query.from, lte: query.to } : undefined,
  };

  const [logs, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: [{ createdAt: query.order }, { id: query.order }],
      ...paginationArgs(query),
    }),
    prisma.auditLog.count({ where }),
  ]);

  return paginated(logs, total, query);
}
