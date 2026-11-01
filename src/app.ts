import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { authRouter } from "./routes/auth.routes.js";
import { ticketRouter } from "./routes/ticket.routes.js";
import { userRouter } from "./routes/user.routes.js";
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
app.use(helmet());
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

app.use("/auth", authRouter);
app.use("/tickets", ticketRouter);
app.use("/users", userRouter);

app.use((_req, res) => {
  sendError(res, 404, "ROUTE_NOT_FOUND", "Route not found");
});

app.use(errorHandler);
