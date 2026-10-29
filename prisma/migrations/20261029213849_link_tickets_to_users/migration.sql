-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "createdById" INTEGER;

-- Existing tickets are assigned to the super admin
UPDATE "Ticket" SET "createdById" = (SELECT "id" FROM "User" WHERE "role" = 'SUPER_ADMIN' ORDER BY "id" LIMIT 1);

ALTER TABLE "Ticket" ALTER COLUMN "createdById" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Ticket_createdById_idx" ON "Ticket"("createdById");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
