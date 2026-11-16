-- CreateEnum
CREATE TYPE "MessageAuthorType" AS ENUM ('CUSTOMER', 'SUPPORT', 'AI');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'AI_SETTING_CHANGED';

-- AlterEnum
ALTER TYPE "AuditTargetType" ADD VALUE 'AI_SETTING';

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "needsAgent" BOOLEAN NOT NULL DEFAULT true;

-- Resolved and closed tickets are not waiting for anyone
UPDATE "Ticket" SET "needsAgent" = false WHERE "status" IN ('RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "TicketMessage" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "authorType" "MessageAuthorType" NOT NULL,
    "authorId" UUID,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiStatusSetting" (
    "id" UUID NOT NULL,
    "status" "TicketStatus" NOT NULL,
    "autoReply" BOOLEAN NOT NULL,
    "instructions" TEXT NOT NULL,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiStatusSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketMessage_ticketId_createdAt_idx" ON "TicketMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "TicketMessage_authorId_idx" ON "TicketMessage"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "AiStatusSetting_status_key" ON "AiStatusSetting"("status");

-- CreateIndex
CREATE INDEX "Ticket_needsAgent_idx" ON "Ticket"("needsAgent");

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiStatusSetting" ADD CONSTRAINT "AiStatusSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
