import type { CookieOptions, Request, Response } from "express";
import { env } from "../config/env.js";
import { currentUser } from "../middlewares/auth.middleware.js";
import {
  acceptInvitation,
  login,
  logout,
  refreshSession,
  requestPasswordReset,
  resetPassword,
} from "../services/auth.service.js";
import { HttpError } from "../utils/http-error.js";
import type { ForgotPasswordInput, LoginInput, TokenPasswordInput } from "../schemas/auth.schema.js";

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

export async function loginUser(req: Request<{}, unknown, LoginInput>, res: Response) {
  const { refreshToken, ...session } = await login(req.body.email, req.body.password);
  setRefreshCookie(res, refreshToken);
  res.json(session);
}

export async function refresh(req: Request, res: Response) {
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
}

export async function logoutUser(req: Request, res: Response) {
  const token = readRefreshCookie(req);
  if (token) {
    await logout(token);
  }

  clearRefreshCookie(res);
  res.status(204).end();
}

export async function acceptInvite(req: Request<{}, unknown, TokenPasswordInput>, res: Response) {
  await acceptInvitation(req.body.token, req.body.password);
  res.status(204).end();
}

export async function forgotPassword(req: Request<{}, unknown, ForgotPasswordInput>, res: Response) {
  await requestPasswordReset(req.body.email);

  // Same answer whether the account exists or not
  res.json({ message: "If an account exists for this email, a reset link has been sent" });
}

export async function resetUserPassword(req: Request<{}, unknown, TokenPasswordInput>, res: Response) {
  await resetPassword(req.body.token, req.body.password);
  res.status(204).end();
}

export function me(req: Request, res: Response) {
  res.json(currentUser(req));
}
