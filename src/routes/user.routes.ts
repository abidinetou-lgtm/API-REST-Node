import { Router } from "express";
import * as userController from "../controllers/user.controller.js";
import { createUserSchema, userIdSchema } from "../schemas/user.schema.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { ADMIN_ROLES } from "../utils/roles.js";

export const userRouter = Router();

userRouter.use(authenticate);

userRouter.post("/", authorize(["SUPER_ADMIN"]), validate({ body: createUserSchema }), userController.create);
userRouter.get("/", authorize(ADMIN_ROLES), userController.list);
userRouter.get("/:id", authorize(ADMIN_ROLES), validate({ params: userIdSchema }), userController.getById);
userRouter.post("/:id/resend-invitation", authorize(["SUPER_ADMIN"]), validate({ params: userIdSchema }), userController.resendInvite);
userRouter.patch("/:id/disable", authorize(ADMIN_ROLES), validate({ params: userIdSchema }), userController.disable);
userRouter.patch("/:id/enable", authorize(ADMIN_ROLES), validate({ params: userIdSchema }), userController.enable);
