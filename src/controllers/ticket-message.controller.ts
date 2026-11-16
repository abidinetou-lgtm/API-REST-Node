import type { Request, Response } from "express";
import { currentUser } from "../middlewares/auth.middleware.js";
import { addMessage, listMessages } from "../services/ticket-message.service.js";
import type { CreateMessageInput, ListMessagesQuery } from "../schemas/ticket-message.schema.js";

type IdParams = { id: string };

export async function list(req: Request<IdParams>, res: Response) {
  const query: ListMessagesQuery = res.locals.query;
  res.json(await listMessages(currentUser(req), req.params.id, query));
}

export async function create(req: Request<IdParams, unknown, CreateMessageInput>, res: Response) {
  res.status(201).json(await addMessage(currentUser(req), req.params.id, req.body));
}
