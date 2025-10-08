/*
  Warnings:

  - The `discipline` column on the `RefMaterial` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "MaterialDiscipline" AS ENUM ('Civil', 'Architecture', 'MEP.ELE', 'MEP.PHE', 'MEP.HVC', 'Finishes');

-- AlterTable
ALTER TABLE "RefMaterial" DROP COLUMN "discipline",
ADD COLUMN     "discipline" "MaterialDiscipline";

-- CreateIndex
CREATE INDEX "RefMaterial_discipline_category_manufacturer_idx" ON "RefMaterial"("discipline", "category", "manufacturer");
