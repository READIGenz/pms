-- AlterTable
ALTER TABLE "RefMaterial" ADD COLUMN     "discipline" "Discipline",
ADD COLUMN     "fireRating" TEXT,
ADD COLUMN     "keyProps" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "manufacturer" TEXT,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "standards" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "aliases" SET DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "RefMaterial_discipline_category_manufacturer_idx" ON "RefMaterial"("discipline", "category", "manufacturer");
