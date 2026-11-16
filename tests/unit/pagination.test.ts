import { describe, expect, it } from "vitest";
import { paginated, paginationArgs } from "../../src/utils/pagination.js";

const query = { page: 3, limit: 10, order: "desc" as const };

describe("paginationArgs", () => {
  it("skips the previous pages", () => {
    expect(paginationArgs(query)).toEqual({ skip: 20, take: 10 });
    expect(paginationArgs({ ...query, page: 1 })).toEqual({ skip: 0, take: 10 });
  });
});

describe("paginated", () => {
  it("computes the number of pages", () => {
    expect(paginated([], 21, query).meta).toEqual({ page: 3, limit: 10, total: 21, totalPages: 3 });
    expect(paginated([], 20, query).meta.totalPages).toBe(2);
    expect(paginated([], 0, query).meta.totalPages).toBe(0);
  });
});
