import { Router } from "express";
import * as auditController from "../controllers/audit.controller.js";
import { listAuditLogsSchema } from "../schemas/audit.schema.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";

export const auditRouter = Router();

auditRouter.use(authenticate);

auditRouter.get("/", authorize(["SUPER_ADMIN"]), validate({ query: listAuditLogsSchema }), auditController.list);
