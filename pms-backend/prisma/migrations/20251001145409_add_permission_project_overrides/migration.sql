-- CreateTable
CREATE TABLE "PermissionProjectOverride" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "projectId" UUID NOT NULL,
    "role" "UserRole" NOT NULL,
    "matrix" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PermissionProjectOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ppo_project_role_unique" ON "PermissionProjectOverride"("projectId", "role");

-- AddForeignKey
ALTER TABLE "PermissionProjectOverride" ADD CONSTRAINT "PermissionProjectOverride_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("projectId") ON DELETE CASCADE ON UPDATE CASCADE;
