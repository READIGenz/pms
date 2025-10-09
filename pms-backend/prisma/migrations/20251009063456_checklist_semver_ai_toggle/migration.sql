-- AlterTable
ALTER TABLE "RefChecklist" ADD COLUMN     "aiDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "versionLabel" TEXT,
ADD COLUMN     "versionMajor" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "versionMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "versionPatch" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "code" DROP NOT NULL,
ALTER COLUMN "stageLabel" DROP NOT NULL,
ALTER COLUMN "tags" SET DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "RefChecklist_discipline_stageLabel_idx" ON "RefChecklist"("discipline", "stageLabel");
