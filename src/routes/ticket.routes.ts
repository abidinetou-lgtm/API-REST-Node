import { Router } from "express";
import * as ticketController from "../controllers/ticket.controller.js";
import * as messageController from "../controllers/ticket-message.controller.js";
import * as aiController from "../controllers/ai.controller.js";
import { createTicketSchema, listTicketsSchema, ticketIdSchema, updateStatusSchema } from "../schemas/ticket.schema.js";
import { createMessageSchema, listMessagesSchema } from "../schemas/ticket-message.schema.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import { userWriteLimiter, aiTriggerLimiter } from "../middlewares/rate-limit.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { STAFF_ROLES } from "../utils/roles.js";

export const ticketRouter = Router();

ticketRouter.use(authenticate);

ticketRouter.post("/", userWriteLimiter, aiTriggerLimiter, validate({ body: createTicketSchema }), ticketController.create);
ticketRouter.get("/", validate({ query: listTicketsSchema }), ticketController.list);
ticketRouter.get("/:id", validate({ params: ticketIdSchema }), ticketController.getById);
ticketRouter.patch(
  "/:id/status",
  authorize(STAFF_ROLES),
  validate({ params: ticketIdSchema, body: updateStatusSchema }),
  ticketController.updateStatus,
);

ticketRouter.get("/:id/messages", validate({ params: ticketIdSchema, query: listMessagesSchema }), messageController.list);
ticketRouter.post(
  "/:id/messages",
  userWriteLimiter,
  validate({ params: ticketIdSchema, body: createMessageSchema }),
  messageController.create,
);
ticketRouter.post(
  "/:id/ai-suggestion",
  authorize(STAFF_ROLES),
  userWriteLimiter,
  validate({ params: ticketIdSchema }),
  aiController.suggest,
);
