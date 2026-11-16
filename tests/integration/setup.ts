import { afterAll, afterEach, beforeEach, vi } from "vitest";
import { prisma } from "../../src/lib/prisma.js";

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "AuditLog", "AiStatusSetting", "TicketMessage", "Ticket", "RefreshToken", "UserToken", "User" RESTART IDENTITY CASCADE',
  );

  // Emails are printed with console.log in tests: capture them to read the links
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(async () => {
  // An AI answer still being written must not end up in the next test.
  // Imported here and not at the top: a static import would load the AI client before
  // the vi.mock of the test file, and the tests would get the real client instead of the fake one.
  const { waitForPendingReplies } = await import("../../src/services/ai.service.js");
  await waitForPendingReplies();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});
