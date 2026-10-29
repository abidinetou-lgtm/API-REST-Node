import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { createTicketSchema, ticketIdSchema, updateStatusSchema } from "../schemas/ticket.schema.js";

export const ticketRouter = Router();

ticketRouter.post("/", async (req, res) => {
  const data = createTicketSchema.parse(req.body);
  const ticket = await prisma.ticket.create({ data });
  res.status(201).json(ticket);
});

ticketRouter.get("/", async (_req, res) => {
  const tickets = await prisma.ticket.findMany({ orderBy: { createdAt: "desc" } });
  res.json(tickets);
});

ticketRouter.get("/:id", async (req, res) => {
  const { id } = ticketIdSchema.parse(req.params);
  const ticket = await prisma.ticket.findUnique({ where: { id } });

  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  res.json(ticket);
});

ticketRouter.patch("/:id/status", async (req, res) => {
  const { id } = ticketIdSchema.parse(req.params);
  const { status } = updateStatusSchema.parse(req.body);
  const ticket = await prisma.ticket.update({ where: { id }, data: { status } });
  res.json(ticket);
});
