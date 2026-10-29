import { Router } from "express";
import { createUserSchema, userIdSchema } from "../schemas/user.schema.js";
import { createUser, getUser, listUsers, resendInvitation, setUserActive } from "../services/user.service.js";
import { authenticate, authorize, currentUser } from "../middlewares/auth.middleware.js";
import { ADMIN_ROLES } from "../utils/roles.js";

export const userRouter = Router();

userRouter.use(authenticate);

userRouter.post("/", authorize(["SUPER_ADMIN"]), async (req, res) => {
  const input = createUserSchema.parse(req.body);
  const result = await createUser(input);
  res.status(201).json(result);
});

userRouter.get("/", authorize(ADMIN_ROLES), async (_req, res) => {
  res.json(await listUsers());
});

userRouter.get("/:id", authorize(ADMIN_ROLES), async (req, res) => {
  const { id } = userIdSchema.parse(req.params);
  res.json(await getUser(id));
});

userRouter.post("/:id/resend-invitation", authorize(["SUPER_ADMIN"]), async (req, res) => {
  const { id } = userIdSchema.parse(req.params);
  await resendInvitation(id);
  res.status(204).end();
});

userRouter.patch("/:id/disable", authorize(ADMIN_ROLES), async (req, res) => {
  const { id } = userIdSchema.parse(req.params);
  res.json(await setUserActive(currentUser(req), id, false));
});

userRouter.patch("/:id/enable", authorize(ADMIN_ROLES), async (req, res) => {
  const { id } = userIdSchema.parse(req.params);
  res.json(await setUserActive(currentUser(req), id, true));
});
