import { z } from "zod";

export const MAX_PAGE_SIZE = 100;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
  order: z.enum(["asc", "desc"]).default("desc"),
});

// "OPEN,IN_PROGRESS" -> ["OPEN", "IN_PROGRESS"]
export function commaList<T extends z.ZodType<unknown, string>>(item: T) {
  const values = item instanceof z.ZodEnum ? `: ${item.options.join(", ")}` : "";

  return z
    .string()
    .transform((value) => value.split(",").map((part) => part.trim()))
    .pipe(z.array(item).min(1))
    .meta({ description: `One or several values separated by commas${values}` });
}

export const searchSchema = z.string().trim().min(1).max(100);

export type PaginationInput = z.infer<typeof paginationSchema>;
