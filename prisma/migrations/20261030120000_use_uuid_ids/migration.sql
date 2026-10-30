-- Switch User and Ticket ids from integers to UUIDs while keeping existing rows and their links.
-- New rows get a UUID v7 from Prisma, existing rows get a random UUID.

-- DropForeignKey
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_createdById_fkey";
ALTER TABLE "RefreshToken" DROP CONSTRAINT "RefreshToken_userId_fkey";
ALTER TABLE "UserToken" DROP CONSTRAINT "UserToken_userId_fkey";

-- New user ids
ALTER TABLE "User" ADD COLUMN "newId" UUID NOT NULL DEFAULT gen_random_uuid();

-- Point the foreign keys to the new user ids
ALTER TABLE "Ticket" ADD COLUMN "newCreatedById" UUID;
UPDATE "Ticket" SET "newCreatedById" = "User"."newId" FROM "User" WHERE "Ticket"."createdById" = "User"."id";
ALTER TABLE "Ticket" DROP COLUMN "createdById";
ALTER TABLE "Ticket" RENAME COLUMN "newCreatedById" TO "createdById";
ALTER TABLE "Ticket" ALTER COLUMN "createdById" SET NOT NULL;

ALTER TABLE "RefreshToken" ADD COLUMN "newUserId" UUID;
UPDATE "RefreshToken" SET "newUserId" = "User"."newId" FROM "User" WHERE "RefreshToken"."userId" = "User"."id";
ALTER TABLE "RefreshToken" DROP COLUMN "userId";
ALTER TABLE "RefreshToken" RENAME COLUMN "newUserId" TO "userId";
ALTER TABLE "RefreshToken" ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "UserToken" ADD COLUMN "newUserId" UUID;
UPDATE "UserToken" SET "newUserId" = "User"."newId" FROM "User" WHERE "UserToken"."userId" = "User"."id";
ALTER TABLE "UserToken" DROP COLUMN "userId";
ALTER TABLE "UserToken" RENAME COLUMN "newUserId" TO "userId";
ALTER TABLE "UserToken" ALTER COLUMN "userId" SET NOT NULL;

-- Replace the user primary key
ALTER TABLE "User" DROP CONSTRAINT "User_pkey";
ALTER TABLE "User" DROP COLUMN "id";
ALTER TABLE "User" RENAME COLUMN "newId" TO "id";
ALTER TABLE "User" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "User" ADD CONSTRAINT "User_pkey" PRIMARY KEY ("id");

-- Replace the ticket primary key
ALTER TABLE "Ticket" ADD COLUMN "newId" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_pkey";
ALTER TABLE "Ticket" DROP COLUMN "id";
ALTER TABLE "Ticket" RENAME COLUMN "newId" TO "id";
ALTER TABLE "Ticket" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE INDEX "Ticket_createdById_idx" ON "Ticket"("createdById");
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");
CREATE INDEX "UserToken_userId_idx" ON "UserToken"("userId");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserToken" ADD CONSTRAINT "UserToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
