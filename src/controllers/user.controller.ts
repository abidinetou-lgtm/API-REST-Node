import type { Request, Response } from "express";
import { currentUser } from "../middlewares/auth.middleware.js";
import { createUser, getUser, listUsers, resendInvitation, setUserActive } from "../services/user.service.js";
import type { CreateUserInput } from "../schemas/user.schema.js";

type IdParams = { id: string };

export async function create(req: Request<{}, unknown, CreateUserInput>, res: Response) {
  res.status(201).json(await createUser(req.body));
}

export async function list(_req: Request, res: Response) {
  res.json(await listUsers());
}

export async function getById(req: Request<IdParams>, res: Response) {
  res.json(await getUser(Number(req.params.id)));
}

export async function resendInvite(req: Request<IdParams>, res: Response) {
  await resendInvitation(Number(req.params.id));
  res.status(204).end();
}

export async function disable(req: Request<IdParams>, res: Response) {
  res.json(await setUserActive(currentUser(req), Number(req.params.id), false));
}

export async function enable(req: Request<IdParams>, res: Response) {
  res.json(await setUserActive(currentUser(req), Number(req.params.id), true));
}
