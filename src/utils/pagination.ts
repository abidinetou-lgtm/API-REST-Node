import type { PaginationInput } from "../schemas/pagination.schema.js";

export function paginationArgs({ page, limit }: PaginationInput) {
  return { skip: (page - 1) * limit, take: limit };
}

export function paginated<T>(data: T[], total: number, { page, limit }: PaginationInput) {
  return {
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
