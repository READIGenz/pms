-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('AssignAdded', 'AssignRemoved', 'AssignReplaced');

-- CreateTable
CREATE TABLE "AdminAuditSetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "assignmentsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedByUserId" UUID,
    "updatedByName" TEXT,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

    CONSTRAINT "AdminAuditSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actorUserId" UUID NOT NULL,
    "actorName" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "module" TEXT NOT NULL DEFAULT 'Assignments',
    "targetUserId" UUID NOT NULL,
    "role" "UserRole",
    "scopeType" "RoleScope",
    "companyId" UUID,
    "projectId" UUID,
    "ip" TEXT,
    "userAgent" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetUserId_createdAt_idx" ON "AdminAuditLog"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_companyId_idx" ON "AdminAuditLog"("companyId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_projectId_idx" ON "AdminAuditLog"("projectId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_action_idx" ON "AdminAuditLog"("action");
INSERT INTO "AdminAuditSetting" ("id","assignmentsEnabled")
VALUES (1, TRUE)
ON CONFLICT ("id") DO NOTHING;