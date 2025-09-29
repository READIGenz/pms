/*
  Warnings:

  - Added the required column `updatedAt` to the `UserRoleMembership` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
-- Add with default to satisfy existing 17 rows
ALTER TABLE "UserRoleMembership"
  ADD COLUMN "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW();

-- (Optional but recommended) remove the default so Prisma controls updates
ALTER TABLE "UserRoleMembership"
  ALTER COLUMN "updatedAt" DROP DEFAULT;
