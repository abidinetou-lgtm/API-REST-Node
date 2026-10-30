import { Router } from "express";
import * as ticketController from "../controllers/ticket.controller.js";
import { createTicketSchema, ticketIdSchema, updateStatusSchema } from "../schemas/ticket.schema.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { STAFF_ROLES } from "../utils/roles.js";

export const ticketRouter = Router();

ticketRouter.use(authenticate);

ticketRouter.post("/", validate({ body: createTicketSchema }), ticketController.create);
ticketRouter.get("/", ticketController.list);
ticketRouter.get("/:id", validate({ params: ticketIdSchema }), ticketController.getById);
ticketRouter.patch(
  "/:id/status",
  authorize(STAFF_ROLES),
  validate({ params: ticketIdSchema, body: updateStatusSchema }),
  ticketController.updateStatus,
);
