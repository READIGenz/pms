-- AlterTable
ALTER TABLE "RefActivity" ADD COLUMN     "element" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "phase" TEXT[] DEFAULT ARRAY[]::TEXT[];
