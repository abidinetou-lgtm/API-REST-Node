import { prisma } from "../lib/prisma.js";
import { HttpError } from "../utils/http-error.js";
import { STAFF_ROLES } from "../utils/roles.js";
import { paginated, paginationArgs } from "../utils/pagination.js";
import { recordAudit } from "./audit.service.js";
import type { CreateTicketInput, ListTicketsQuery } from "../schemas/ticket.schema.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { Role, TicketStatus } from "../generated/prisma/enums.js";

type Actor = { id: string; role: Role };

const ticketSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true, email: true } },
};

// Users only have access to their own tickets, the support team to all of them
function visibleTicketsFilter(actor: Actor) {
  return STAFF_ROLES.includes(actor.role) ? {} : { createdById: actor.id };
}

export async function createTicket(actor: Actor, input: CreateTicketInput) {
  return prisma.ticket.create({
    data: { ...input, createdById: actor.id },
    select: ticketSelect,
  });
}

export async function listTickets(actor: Actor, query: ListTicketsQuery) {
  const where: Prisma.TicketWhereInput = {
    AND: [
      visibleTicketsFilter(actor),
      query.status ? { status: { in: query.status } } : {},
      query.createdById ? { createdById: query.createdById } : {},
      query.createdFrom || query.createdTo ? { createdAt: { gte: query.createdFrom, lte: query.createdTo } } : {},
      query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: "insensitive" } },
              { description: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {},
    ],
  };

  const [tickets, total] = await prisma.$transaction([
    prisma.ticket.findMany({
      where,
      select: ticketSelect,
      // The id keeps the order stable between pages when two tickets share the same value
      orderBy: [{ [query.sort]: query.order }, { id: query.order }],
      ...paginationArgs(query),
    }),
    prisma.ticket.count({ where }),
  ]);

  return paginated(tickets, total, query);
}

export async function getTicket(actor: Actor, id: string) {
  // A ticket owned by someone else returns 404, not 403, to avoid revealing that it exists
  const ticket = await prisma.ticket.findFirst({
    where: { id, ...visibleTicketsFilter(actor) },
    select: ticketSelect,
  });

  if (!ticket) {
    throw new HttpError(404, "TICKET_NOT_FOUND", "Ticket not found");
  }
  return ticket;
}

export async function updateTicketStatus(actor: Actor, id: string, status: TicketStatus) {
  const ticket = await prisma.ticket.findUnique({ where: { id }, select: { status: true } });
  if (!ticket) {
    throw new HttpError(404, "TICKET_NOT_FOUND", "Ticket not found");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.ticket.update({ where: { id }, data: { status }, select: ticketSelect });

    if (ticket.status !== status) {
      await recordAudit(tx, {
        action: "TICKET_STATUS_CHANGED",
        actorId: actor.id,
        targetType: "TICKET",
        targetId: id,
        metadata: { from: ticket.status, to: status },
      });
    }
    return updated;
  });
}
