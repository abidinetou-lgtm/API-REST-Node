import { Router, type CookieOptions, type Request, type Response } from "express";
import { env } from "../config/env.js";
import {
  acceptInvitationSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from "../schemas/auth.schema.js";
import {
  acceptInvitation,
  login,
  logout,
  refreshSession,
  requestPasswordReset,
  resetPassword,
} from "../services/auth.service.js";
import { authenticate, currentUser } from "../middlewares/auth.middleware.js";
import { loginLimiter, sensitiveLimiter } from "../middlewares/rate-limit.middleware.js";
import { HttpError } from "../utils/http-error.js";

export const authRouter = Router();

const REFRESH_COOKIE = "refresh_token";

const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  // The front-end and the API are usually on different domains in production
  sameSite: env.NODE_ENV === "production" ? "none" : "lax",
  path: "/auth",
};

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    ...refreshCookieOptions,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions);
}

function readRefreshCookie(req: Request): string | null {
  const token = req.cookies?.[REFRESH_COOKIE];
  return typeof token === "string" && token.length > 0 ? token : null;
}

authRouter.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const { refreshToken, ...session } = await login(email, password);

  setRefreshCookie(res, refreshToken);
  res.json(session);
});

authRouter.post("/refresh", async (req, res) => {
  const token = readRefreshCookie(req);
  if (!token) {
    throw new HttpError(401, "Invalid refresh token");
  }

  try {
    const { refreshToken, ...session } = await refreshSession(token);
    setRefreshCookie(res, refreshToken);
    res.json(session);
  } catch (error) {
    clearRefreshCookie(res);
    throw error;
  }
});

authRouter.post("/logout", async (req, res) => {
  const token = readRefreshCookie(req);
  if (token) {
    await logout(token);
  }

  clearRefreshCookie(res);
  res.status(204).end();
});

authRouter.post("/accept-invitation", sensitiveLimiter(), async (req, res) => {
  const { token, password } = acceptInvitationSchema.parse(req.body);
  await acceptInvitation(token, password);
  res.status(204).end();
});

authRouter.post("/forgot-password", sensitiveLimiter(), async (req, res) => {
  const { email } = forgotPasswordSchema.parse(req.body);
  await requestPasswordReset(email);

  // Same answer whether the account exists or not
  res.json({ message: "If an account exists for this email, a reset link has been sent" });
});

authRouter.post("/reset-password", sensitiveLimiter(), async (req, res) => {
  const { token, password } = resetPasswordSchema.parse(req.body);
  await resetPassword(token, password);
  res.status(204).end();
});

authRouter.get("/me", authenticate, (req, res) => {
  res.json(currentUser(req));
});
