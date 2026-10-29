import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { createTicketSchema, ticketIdSchema, updateStatusSchema } from "../schemas/ticket.schema.js";
import { authenticate, authorize, currentUser } from "../middlewares/auth.middleware.js";
import { STAFF_ROLES } from "../utils/roles.js";
import { HttpError } from "../utils/http-error.js";
import type { Request } from "express";

export const ticketRouter = Router();

ticketRouter.use(authenticate);

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
function visibleTicketsFilter(req: Request) {
  const user = currentUser(req);
  return STAFF_ROLES.includes(user.role) ? {} : { createdById: user.id };
}

ticketRouter.post("/", async (req, res) => {
  const data = createTicketSchema.parse(req.body);
  const ticket = await prisma.ticket.create({
    data: { ...data, createdById: currentUser(req).id },
    select: ticketSelect,
  });
  res.status(201).json(ticket);
});

ticketRouter.get("/", async (req, res) => {
  const tickets = await prisma.ticket.findMany({
    where: visibleTicketsFilter(req),
    select: ticketSelect,
    orderBy: { createdAt: "desc" },
  });
  res.json(tickets);
});

ticketRouter.get("/:id", async (req, res) => {
  const { id } = ticketIdSchema.parse(req.params);

  // A ticket owned by someone else returns 404, not 403, to avoid revealing that it exists
  const ticket = await prisma.ticket.findFirst({
    where: { id, ...visibleTicketsFilter(req) },
    select: ticketSelect,
  });

  if (!ticket) {
    throw new HttpError(404, "Ticket not found");
  }

  res.json(ticket);
});

ticketRouter.patch("/:id/status", authorize(STAFF_ROLES), async (req, res) => {
  const { id } = ticketIdSchema.parse(req.params);
  const { status } = updateStatusSchema.parse(req.body);

  const exists = await prisma.ticket.findUnique({ where: { id }, select: { id: true } });
  if (!exists) {
    throw new HttpError(404, "Ticket not found");
  }

  const ticket = await prisma.ticket.update({ where: { id }, data: { status }, select: ticketSelect });
  res.json(ticket);
});
