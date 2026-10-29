import express from "express";
import { ticketRouter } from "./routes/ticket.routes.js";
import { errorHandler } from "./middlewares/error.middleware.js";

export const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/tickets", ticketRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use(errorHandler);
