-- AlterTable
ALTER TABLE "RefActivity" ADD COLUMN     "versionLabel" TEXT,
ADD COLUMN     "versionMajor" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "versionMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "versionPatch" INTEGER NOT NULL DEFAULT 0;
