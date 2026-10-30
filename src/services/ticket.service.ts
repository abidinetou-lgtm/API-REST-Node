import { prisma } from "../lib/prisma.js";
import { HttpError } from "../utils/http-error.js";
import { STAFF_ROLES } from "../utils/roles.js";
import type { CreateTicketInput } from "../schemas/ticket.schema.js";
import type { Role, TicketStatus } from "../generated/prisma/enums.js";

type Actor = { id: number; role: Role };

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

export async function listTickets(actor: Actor) {
  return prisma.ticket.findMany({
    where: visibleTicketsFilter(actor),
    select: ticketSelect,
    orderBy: { createdAt: "desc" },
  });
}

export async function getTicket(actor: Actor, id: number) {
  // A ticket owned by someone else returns 404, not 403, to avoid revealing that it exists
  const ticket = await prisma.ticket.findFirst({
    where: { id, ...visibleTicketsFilter(actor) },
    select: ticketSelect,
  });

  if (!ticket) {
    throw new HttpError(404, "Ticket not found");
  }
  return ticket;
}

export async function updateTicketStatus(id: number, status: TicketStatus) {
  const exists = await prisma.ticket.findUnique({ where: { id }, select: { id: true } });
  if (!exists) {
    throw new HttpError(404, "Ticket not found");
  }

  return prisma.ticket.update({ where: { id }, data: { status }, select: ticketSelect });
}
