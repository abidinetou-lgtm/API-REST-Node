import type { Request, Response } from "express";
import { currentUser } from "../middlewares/auth.middleware.js";
import { listAiSettings, suggestReply, updateAiSetting } from "../services/ai.service.js";
import type { AiStatus } from "../lib/ai-prompts.js";
import type { UpdateAiSettingInput } from "../schemas/ai.schema.js";

export async function getSettings(_req: Request, res: Response) {
  res.json(await listAiSettings());
}

export async function updateSetting(req: Request<{ status: AiStatus }, unknown, UpdateAiSettingInput>, res: Response) {
  res.json(await updateAiSetting(currentUser(req), req.params.status, req.body));
}

export async function suggest(req: Request<{ id: string }>, res: Response) {
  res.json(await suggestReply(req.params.id));
}
