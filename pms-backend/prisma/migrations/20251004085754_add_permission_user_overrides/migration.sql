-- AlterTable
ALTER TABLE "UserRoleMembership" ADD COLUMN     "canApprove" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PermissionUserOverride" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matrix" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PermissionUserOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "puo_project_user" ON "PermissionUserOverride"("projectId", "userId");
