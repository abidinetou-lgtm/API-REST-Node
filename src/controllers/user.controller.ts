import type { Request, Response } from "express";
import { currentUser } from "../middlewares/auth.middleware.js";
import { changeUserRole, createUser, getUser, listUsers, resendInvitation, setUserActive } from "../services/user.service.js";
import type { ChangeRoleInput, CreateUserInput, ListUsersQuery } from "../schemas/user.schema.js";

type IdParams = { id: string };

export async function create(req: Request<{}, unknown, CreateUserInput>, res: Response) {
  res.status(201).json(await createUser(currentUser(req), req.body));
}

export async function list(_req: Request, res: Response) {
  const query: ListUsersQuery = res.locals.query;
  res.json(await listUsers(query));
}

export async function getById(req: Request<IdParams>, res: Response) {
  res.json(await getUser(req.params.id));
}

export async function resendInvite(req: Request<IdParams>, res: Response) {
  await resendInvitation(currentUser(req), req.params.id);
  res.status(204).end();
}

export async function disable(req: Request<IdParams>, res: Response) {
  res.json(await setUserActive(currentUser(req), req.params.id, false));
}

export async function enable(req: Request<IdParams>, res: Response) {
  res.json(await setUserActive(currentUser(req), req.params.id, true));
}

export async function changeRole(req: Request<IdParams, unknown, ChangeRoleInput>, res: Response) {
  res.json(await changeUserRole(currentUser(req), req.params.id, req.body));
}
