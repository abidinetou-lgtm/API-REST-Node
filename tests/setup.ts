import { afterAll, afterEach, beforeEach, vi } from "vitest";
import { prisma } from "../src/lib/prisma.js";

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Ticket", "RefreshToken", "UserToken", "User" RESTART IDENTITY CASCADE',
  );

  // Emails are printed with console.log in tests: capture them to read the links
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});
