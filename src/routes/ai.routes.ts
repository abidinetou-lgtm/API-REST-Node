import { Router } from "express";
import * as aiController from "../controllers/ai.controller.js";
import { aiStatusParamsSchema, updateAiSettingSchema } from "../schemas/ai.schema.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { ADMIN_ROLES } from "../utils/roles.js";

export const aiRouter = Router();

aiRouter.use(authenticate);

aiRouter.get("/settings", authorize(ADMIN_ROLES), aiController.getSettings);
// Changes what the AI says to every customer: reserved to the super admin, and logged
aiRouter.put(
  "/settings/:status",
  authorize(["SUPER_ADMIN"]),
  validate({ params: aiStatusParamsSchema, body: updateAiSettingSchema }),
  aiController.updateSetting,
);
