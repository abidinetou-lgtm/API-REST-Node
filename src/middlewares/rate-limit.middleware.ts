import { rateLimit, type Options } from "express-rate-limit";
import { sendError } from "../utils/http-error.js";

const FIFTEEN_MINUTES = 15 * 60 * 1000;

const tooManyRequests: Options["handler"] = (_req, res, _next, options) => {
  sendError(res, options.statusCode, "TOO_MANY_REQUESTS", "Too many requests, please try again later");
};

export const globalLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: tooManyRequests,
});

// Only failed attempts are counted, so normal logins are never blocked
export const loginIpLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: tooManyRequests,
});

// Same idea per account: stops an attacker who changes IP address to target one account.
// Must run after the body validation so the email is normalized.
export const loginAccountLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 5,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `login:${req.body.email}`,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: tooManyRequests,
});

// For endpoints exposed to brute force or email spam. Each call creates its own counter.
export function sensitiveLimiter() {
  return rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: tooManyRequests,
  });
}
