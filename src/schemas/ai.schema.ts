import { z } from "zod";
import { AI_STATUSES } from "../lib/ai-prompts.js";

export const aiStatusParamsSchema = z.object({
  status: z.enum(AI_STATUSES),
});

export const updateAiSettingSchema = z.object({
  autoReply: z.boolean().meta({ description: "true: the AI answers the customer itself. false: it only writes drafts for the team" }),
  instructions: z.string().trim().min(10).max(2000).meta({ description: "How the AI must answer for this status" }),
});

export type UpdateAiSettingInput = z.infer<typeof updateAiSettingSchema>;
