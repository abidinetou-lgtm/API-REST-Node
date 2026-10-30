import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import {
  acceptInvitationSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from "../schemas/auth.schema.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { loginLimiter, sensitiveLimiter } from "../middlewares/rate-limit.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";

export const authRouter = Router();

authRouter.post("/login", loginLimiter, validate({ body: loginSchema }), authController.loginUser);
authRouter.post("/refresh", authController.refresh);
authRouter.post("/logout", authController.logoutUser);
authRouter.post("/accept-invitation", sensitiveLimiter(), validate({ body: acceptInvitationSchema }), authController.acceptInvite);
authRouter.post("/forgot-password", sensitiveLimiter(), validate({ body: forgotPasswordSchema }), authController.forgotPassword);
authRouter.post("/reset-password", sensitiveLimiter(), validate({ body: resetPasswordSchema }), authController.resetUserPassword);
authRouter.get("/me", authenticate, authController.me);
