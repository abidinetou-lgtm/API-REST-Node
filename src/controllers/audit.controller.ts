import type { Request, Response } from "express";
import { listAuditLogs } from "../services/audit.service.js";
import type { ListAuditLogsQuery } from "../schemas/audit.schema.js";

export async function list(_req: Request, res: Response) {
  const query: ListAuditLogsQuery = res.locals.query;
  res.json(await listAuditLogs(query));
}
