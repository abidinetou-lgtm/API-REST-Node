import type { Request, Response } from "express";
import { currentUser } from "../middlewares/auth.middleware.js";
import { createTicket, getTicket, listTickets, updateTicketStatus } from "../services/ticket.service.js";
import type { CreateTicketInput, ListTicketsQuery, UpdateStatusInput } from "../schemas/ticket.schema.js";

type IdParams = { id: string };

export async function create(req: Request<{}, unknown, CreateTicketInput>, res: Response) {
  res.status(201).json(await createTicket(currentUser(req), req.body));
}

export async function list(req: Request, res: Response) {
  const query: ListTicketsQuery = res.locals.query;
  res.json(await listTickets(currentUser(req), query));
}

export async function getById(req: Request<IdParams>, res: Response) {
  res.json(await getTicket(currentUser(req), req.params.id));
}

export async function updateStatus(req: Request<IdParams, unknown, UpdateStatusInput>, res: Response) {
  res.json(await updateTicketStatus(req.params.id, req.body.status));
}
