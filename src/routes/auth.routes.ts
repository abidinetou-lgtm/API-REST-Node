import { Router, type Response } from "express";
import { env } from "../config/env.js";
import { acceptInvitationSchema, loginSchema } from "../schemas/auth.schema.js";
import { acceptInvitation, login } from "../services/auth.service.js";
import { authenticate, currentUser } from "../middlewares/auth.middleware.js";
import { authLimiter } from "../middlewares/rate-limit.middleware.js";

export const authRouter = Router();

const REFRESH_COOKIE = "refresh_token";

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    // The front-end and the API are usually on different domains in production
    sameSite: env.NODE_ENV === "production" ? "none" : "lax",
    path: "/auth",
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

authRouter.post("/login", authLimiter, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const { refreshToken, ...session } = await login(email, password);

  setRefreshCookie(res, refreshToken);
  res.json(session);
});

authRouter.post("/accept-invitation", authLimiter, async (req, res) => {
  const { token, password } = acceptInvitationSchema.parse(req.body);
  await acceptInvitation(token, password);
  res.status(204).end();
});

authRouter.get("/me", authenticate, (req, res) => {
  res.json(currentUser(req));
});
