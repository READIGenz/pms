-- AlterTable
ALTER TABLE "RefChecklistItem" ADD COLUMN     "aiConfidence" DECIMAL(65,30),
ADD COLUMN     "aiEnabled" BOOLEAN,
ADD COLUMN     "base" DECIMAL(65,30),
ADD COLUMN     "critical" BOOLEAN,
ADD COLUMN     "itemCode" TEXT,
ADD COLUMN     "minus" DECIMAL(65,30),
ADD COLUMN     "plus" DECIMAL(65,30),
ADD COLUMN     "tolerance" TEXT,
ADD COLUMN     "units" TEXT;
