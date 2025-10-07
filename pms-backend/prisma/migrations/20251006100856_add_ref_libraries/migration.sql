-- CreateEnum
CREATE TYPE "Discipline" AS ENUM ('Civil', 'MEP', 'Finishes');

-- CreateTable
CREATE TABLE "RefChecklist" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "discipline" "Discipline" NOT NULL,
    "stageLabel" TEXT NOT NULL,
    "tags" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'Active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "RefChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefChecklistItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "checklistId" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "requirement" TEXT,
    "method" TEXT[],
    "risk" TEXT,
    "tags" TEXT[],

    CONSTRAINT "RefChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefChecklistItemActivityLink" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "itemId" UUID NOT NULL,
    "activityId" UUID,
    "label" TEXT NOT NULL,
    "tags" TEXT[],

    CONSTRAINT "RefChecklistItemActivityLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefChecklistItemMaterialLink" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "itemId" UUID NOT NULL,
    "materialId" UUID,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "properties" JSONB,

    CONSTRAINT "RefChecklistItemMaterialLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefActivity" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT,
    "title" TEXT NOT NULL,
    "discipline" "Discipline" NOT NULL,
    "stageLabel" TEXT,
    "system" TEXT[],
    "nature" TEXT[],
    "method" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'Active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "RefActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefMaterial" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "aliases" TEXT[],
    "properties" JSONB,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "RefMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefActivityMaterial" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "activityId" UUID NOT NULL,
    "materialId" UUID NOT NULL,
    "note" TEXT,

    CONSTRAINT "RefActivityMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefChecklist_code_key" ON "RefChecklist"("code");

-- CreateIndex
CREATE INDEX "RefChecklistItem_checklistId_idx" ON "RefChecklistItem"("checklistId");

-- CreateIndex
CREATE INDEX "RefChecklistItemActivityLink_itemId_idx" ON "RefChecklistItemActivityLink"("itemId");

-- CreateIndex
CREATE INDEX "RefChecklistItemActivityLink_activityId_idx" ON "RefChecklistItemActivityLink"("activityId");

-- CreateIndex
CREATE INDEX "RefChecklistItemMaterialLink_itemId_idx" ON "RefChecklistItemMaterialLink"("itemId");

-- CreateIndex
CREATE INDEX "RefChecklistItemMaterialLink_materialId_idx" ON "RefChecklistItemMaterialLink"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "RefActivity_code_key" ON "RefActivity"("code");

-- CreateIndex
CREATE UNIQUE INDEX "refactivity_uq_disc_stage_title" ON "RefActivity"("discipline", "stageLabel", "title");

-- CreateIndex
CREATE UNIQUE INDEX "RefMaterial_code_key" ON "RefMaterial"("code");

-- CreateIndex
CREATE INDEX "RefMaterial_name_category_idx" ON "RefMaterial"("name", "category");

-- CreateIndex
CREATE INDEX "RefActivityMaterial_activityId_idx" ON "RefActivityMaterial"("activityId");

-- CreateIndex
CREATE INDEX "RefActivityMaterial_materialId_idx" ON "RefActivityMaterial"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "refactmat_activity_material_uq" ON "RefActivityMaterial"("activityId", "materialId");

-- AddForeignKey
ALTER TABLE "RefChecklistItem" ADD CONSTRAINT "RefChecklistItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "RefChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefChecklistItemActivityLink" ADD CONSTRAINT "RefChecklistItemActivityLink_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "RefChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefChecklistItemActivityLink" ADD CONSTRAINT "RefChecklistItemActivityLink_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "RefActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefChecklistItemMaterialLink" ADD CONSTRAINT "RefChecklistItemMaterialLink_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "RefChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefChecklistItemMaterialLink" ADD CONSTRAINT "RefChecklistItemMaterialLink_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "RefMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefActivityMaterial" ADD CONSTRAINT "RefActivityMaterial_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "RefActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefActivityMaterial" ADD CONSTRAINT "RefActivityMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "RefMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
