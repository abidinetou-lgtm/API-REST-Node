import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { authRouter } from "./routes/auth.routes.js";
import { ticketRouter } from "./routes/ticket.routes.js";
import { userRouter } from "./routes/user.routes.js";
import { auditRouter } from "./routes/audit.routes.js";
import { docsRouter } from "./routes/docs.routes.js";
import { globalLimiter } from "./middlewares/rate-limit.middleware.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import { requestId } from "./middlewares/request-id.middleware.js";
import { sendError } from "./utils/http-error.js";

export const app = express();

// Hosting platforms put a reverse proxy in front of the app: trust it to get the real client IP
if (env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(requestId);
app.use(
  helmet({
    contentSecurityPolicy: {
      // Forcing HTTPS would break the documentation page on http://localhost
      directives: { upgradeInsecureRequests: env.NODE_ENV === "production" ? [] : null },
    },
  }),
);
app.use(
  cors({
    origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
    credentials: true,
    exposedHeaders: ["X-Request-Id"],
  }),
);
app.use(globalLimiter);
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Exported so the tests can check that every route is documented
export const apiRouters = {
  "/auth": authRouter,
  "/tickets": ticketRouter,
  "/users": userRouter,
  "/audit-logs": auditRouter,
};

for (const [path, router] of Object.entries(apiRouters)) {
  app.use(path, router);
}

if (env.DOCS_ENABLED) {
  app.use("/docs", docsRouter);
}

app.use((_req, res) => {
  sendError(res, 404, "ROUTE_NOT_FOUND", "Route not found");
});

app.use(errorHandler);
