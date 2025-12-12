-- AlterEnum
ALTER TYPE "WirStatus" ADD VALUE 'APPROVE_WITH_COMMENTS';

-- AlterTable
ALTER TABLE "Wir" ADD COLUMN     "activityRefId" UUID,
ADD COLUMN     "activitySnapshot" JSONB,
ADD COLUMN     "activitySnapshotVersion" INTEGER,
ADD COLUMN     "materialized" BOOLEAN DEFAULT false,
ADD COLUMN     "prevWirId" UUID,
ADD COLUMN     "seriesId" UUID,
ADD COLUMN     "snapshotAt" TIMESTAMPTZ(6),
ADD COLUMN     "version" INTEGER DEFAULT 1;

-- CreateIndex
CREATE INDEX "Wir_activityRefId_idx" ON "Wir"("activityRefId");

-- CreateIndex
CREATE INDEX "Wir_seriesId_version_idx" ON "Wir"("seriesId", "version");
