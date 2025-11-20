-- CreateEnum
CREATE TYPE "PreferredLanguage" AS ENUM ('en', 'hi', 'bn', 'ta', 'te', 'mr', 'pa', 'or', 'gu', 'kn', 'ml');

-- CreateEnum
CREATE TYPE "OperatingZone" AS ENUM ('NCR', 'North', 'South', 'East', 'West', 'Central');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('Active', 'Inactive');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('Active', 'Inactive');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('Admin', 'Client', 'IH-PMT', 'Contractor', 'Consultant', 'PMC', 'Supplier');

-- CreateEnum
CREATE TYPE "CompanyRole" AS ENUM ('IH-PMT', 'Contractor', 'Consultant', 'PMC', 'Supplier');

-- CreateEnum
CREATE TYPE "StateType" AS ENUM ('State', 'UT');

-- CreateEnum
CREATE TYPE "project_status" AS ENUM ('Draft', 'Active', 'OnHold', 'Completed', 'Archived');

-- CreateEnum
CREATE TYPE "project_stage" AS ENUM ('Planning', 'Design', 'Procurement', 'Execution', 'Handover', 'Closed');

-- CreateEnum
CREATE TYPE "project_type" AS ENUM ('Residential', 'Commercial', 'Industrial', 'Institutional', 'MixedUse', 'Infrastructure', 'Other');

-- CreateEnum
CREATE TYPE "structure_type" AS ENUM ('LowRise', 'HighRise', 'Villa', 'RowHouse', 'InteriorFitout', 'ShellCore', 'Other');

-- CreateEnum
CREATE TYPE "construction_type" AS ENUM ('New', 'Renovation', 'Retrofit', 'Repair', 'Fitout', 'Other');

-- CreateEnum
CREATE TYPE "contract_type" AS ENUM ('LumpSum', 'ItemRate', 'Turnkey', 'EPC', 'PMC', 'LabourOnly', 'Other');

-- CreateEnum
CREATE TYPE "project_health" AS ENUM ('Green', 'Amber', 'Red', 'Unknown');

-- CreateEnum
CREATE TYPE "currency_code" AS ENUM ('INR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'SGD', 'AUD', 'Other');

-- CreateEnum
CREATE TYPE "area_unit" AS ENUM ('SQFT', 'SQM', 'SQYD', 'Acre', 'Hectare');

-- CreateEnum
CREATE TYPE "RoleScope" AS ENUM ('Global', 'Company', 'Project');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('AssignAdded', 'AssignRemoved', 'AssignReplaced');

-- CreateEnum
CREATE TYPE "ModuleCode" AS ENUM ('WIR');

-- CreateEnum
CREATE TYPE "WirStatus" AS ENUM ('Draft', 'Submitted', 'Recommended', 'Approved', 'Rejected', 'Returned');

-- CreateEnum
CREATE TYPE "WirItemStatus" AS ENUM ('OK', 'NCR', 'Pending', 'Unknown');

-- CreateEnum
CREATE TYPE "InspectorRecommendation" AS ENUM ('APPROVE', 'APPROVE_WITH_COMMENTS', 'REJECT');

-- CreateEnum
CREATE TYPE "HodOutcome" AS ENUM ('ACCEPT', 'RETURN', 'REJECT');

-- CreateEnum
CREATE TYPE "InspectorItemStatus" AS ENUM ('PASS', 'FAIL', 'NA');

-- CreateEnum
CREATE TYPE "Discipline" AS ENUM ('Civil', 'MEP', 'Finishes');

-- CreateEnum
CREATE TYPE "MaterialDiscipline" AS ENUM ('Civil', 'Architecture', 'MEP.ELE', 'MEP.PHE', 'MEP.HVC', 'Finishes');

-- CreateEnum
CREATE TYPE "WirAction" AS ENUM ('Created', 'Updated', 'Submitted', 'Recommended', 'Approved', 'Rejected', 'Returned', 'Deleted', 'BicChanged', 'ItemsChanged', 'NoteAdded', 'Rescheduled');

-- CreateEnum
CREATE TYPE "WirRunnerActorRole" AS ENUM ('Contractor', 'Inspector', 'HOD', 'Other');

-- CreateEnum
CREATE TYPE "WirItemEvidenceKind" AS ENUM ('Photo', 'Video', 'File', 'Other');

-- CreateTable
CREATE TABLE "State" (
    "stateId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "StateType" NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "State_pkey" PRIMARY KEY ("stateId")
);

-- CreateTable
CREATE TABLE "District" (
    "districtId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "stateId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "District_pkey" PRIMARY KEY ("districtId")
);

-- CreateTable
CREATE TABLE "User" (
    "userId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "lastName" TEXT,
    "countryCode" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "preferredLanguage" "PreferredLanguage",
    "profilePhoto" TEXT,
    "stateId" UUID,
    "districtId" UUID,
    "cityTown" TEXT,
    "pin" TEXT,
    "operatingZone" "OperatingZone",
    "address" TEXT,
    "isClient" BOOLEAN DEFAULT false,
    "isServiceProvider" BOOLEAN DEFAULT false,
    "userStatus" "UserStatus" NOT NULL DEFAULT 'Active',
    "passwordHash" TEXT,
    "isSuperAdmin" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "userRole" "UserRole",

    CONSTRAINT "User_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Company" (
    "companyId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "status" "CompanyStatus" NOT NULL DEFAULT 'Active',
    "website" TEXT,
    "companyRole" "CompanyRole",
    "gstin" TEXT,
    "pan" TEXT,
    "cin" TEXT,
    "primaryContact" TEXT,
    "contactMobile" TEXT,
    "contactEmail" TEXT,
    "stateId" UUID,
    "districtId" UUID,
    "address" TEXT,
    "pin" TEXT,
    "notes" TEXT,
    "userId" UUID,
    "companyCode" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "Project" (
    "projectId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "code" TEXT,
    "status" "project_status" NOT NULL DEFAULT 'Draft',
    "stage" "project_stage",
    "projectType" "project_type",
    "structureType" "structure_type",
    "constructionType" "construction_type",
    "contractType" "contract_type",
    "health" "project_health" NOT NULL DEFAULT 'Unknown',
    "clientUserId" UUID,
    "clientCompanyId" UUID,
    "address" TEXT,
    "cityTown" TEXT,
    "stateId" UUID,
    "districtId" UUID,
    "pin" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "startDate" TIMESTAMP(3),
    "plannedCompletionDate" TIMESTAMP(3),
    "currency" "currency_code" DEFAULT 'INR',
    "contractValue" DECIMAL(18,2),
    "areaUnit" "area_unit",
    "plotArea" DECIMAL(14,2),
    "builtUpArea" DECIMAL(14,2),
    "floors" INTEGER,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("projectId")
);

-- CreateTable
CREATE TABLE "ref_project_tag" (
    "tagCode" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "ref_project_tag_pkey" PRIMARY KEY ("tagCode")
);

-- CreateTable
CREATE TABLE "ProjectTag" (
    "projectId" UUID NOT NULL,
    "tagCode" TEXT NOT NULL,

    CONSTRAINT "ProjectTag_pkey" PRIMARY KEY ("projectId","tagCode")
);

-- CreateTable
CREATE TABLE "UserProject" (
    "userId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserProject_pkey" PRIMARY KEY ("userId","projectId")
);

-- CreateTable
CREATE TABLE "UserCompany" (
    "userId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCompany_pkey" PRIMARY KEY ("userId","companyId")
);

-- CreateTable
CREATE TABLE "UserRoleMembership" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "role" "UserRole" NOT NULL,
    "scopeType" "RoleScope" NOT NULL,
    "companyId" UUID,
    "projectId" UUID,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "canApprove" BOOLEAN NOT NULL DEFAULT false,
    "validFrom" TIMESTAMPTZ(6),
    "validTo" TIMESTAMPTZ(6),
    "createdBy" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "UserRoleMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionTemplate" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "role" "UserRole" NOT NULL,
    "matrix" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PermissionTemplate_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "RefChecklist" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT,
    "title" TEXT NOT NULL,
    "discipline" "Discipline" NOT NULL,
    "stageLabel" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'Active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "versionLabel" TEXT,
    "versionMajor" INTEGER NOT NULL DEFAULT 1,
    "versionMinor" INTEGER NOT NULL DEFAULT 0,
    "versionPatch" INTEGER NOT NULL DEFAULT 0,
    "aiDefault" BOOLEAN NOT NULL DEFAULT false,
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
    "itemCode" TEXT,
    "critical" BOOLEAN,
    "aiEnabled" BOOLEAN,
    "aiConfidence" DECIMAL(65,30),
    "units" TEXT,
    "tolerance" TEXT,
    "base" DECIMAL(65,30),
    "plus" DECIMAL(65,30),
    "minus" DECIMAL(65,30),

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
    "phase" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "element" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "system" TEXT[],
    "nature" TEXT[],
    "method" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'Active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "versionLabel" TEXT,
    "versionMajor" INTEGER NOT NULL DEFAULT 1,
    "versionMinor" INTEGER NOT NULL DEFAULT 0,
    "versionPatch" INTEGER NOT NULL DEFAULT 0,
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
    "discipline" "MaterialDiscipline",
    "category" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "standards" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fireRating" TEXT,
    "keyProps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "properties" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "versionLabel" TEXT,
    "versionMajor" INTEGER NOT NULL DEFAULT 1,
    "versionMinor" INTEGER NOT NULL DEFAULT 0,
    "versionPatch" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
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

-- CreateTable
CREATE TABLE "ProjectModuleSetting" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "projectId" UUID NOT NULL,
    "module" "ModuleCode" NOT NULL,
    "extra" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ProjectModuleSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditSetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "assignmentsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedByUserId" UUID,
    "updatedByName" TEXT,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

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

-- CreateTable
CREATE TABLE "Wir" (
    "wirId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT,
    "title" TEXT NOT NULL,
    "projectId" UUID NOT NULL,
    "status" "WirStatus" NOT NULL DEFAULT 'Draft',
    "health" "project_health" NOT NULL DEFAULT 'Unknown',
    "discipline" "Discipline",
    "stage" TEXT,
    "forDate" TIMESTAMPTZ(6),
    "forTime" TEXT,
    "rescheduleForDate" TIMESTAMPTZ(6),
    "rescheduleForTime" TEXT,
    "rescheduleReason" TEXT,
    "rescheduledById" UUID,
    "cityTown" TEXT,
    "stateName" TEXT,
    "contractorId" UUID,
    "inspectorId" UUID,
    "hodId" UUID,
    "bicUserId" UUID,
    "description" TEXT,
    "inspectorRecommendation" "InspectorRecommendation",
    "inspectorRemarks" TEXT,
    "inspectorReviewedAt" TIMESTAMPTZ(6),
    "hodOutcome" "HodOutcome",
    "hodRemarks" TEXT,
    "hodDecidedAt" TIMESTAMPTZ(6),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Wir_pkey" PRIMARY KEY ("wirId")
);

-- CreateTable
CREATE TABLE "WirChecklist" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "wirId" UUID NOT NULL,
    "checklistId" UUID NOT NULL,
    "checklistCode" TEXT,
    "checklistTitle" TEXT,
    "discipline" "Discipline",
    "versionLabel" TEXT,
    "itemsTotal" INTEGER NOT NULL DEFAULT 0,
    "itemIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "itemsCount" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WirChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WirItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "wirId" UUID NOT NULL,
    "checklistId" UUID,
    "itemId" UUID,
    "seq" INTEGER,
    "name" TEXT NOT NULL,
    "spec" TEXT,
    "required" TEXT,
    "tolerance" TEXT,
    "photoCount" INTEGER,
    "status" "WirItemStatus" NOT NULL DEFAULT 'Unknown',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "inspectorStatus" "InspectorItemStatus",
    "inspectorNote" TEXT,
    "hodStatus" "InspectorItemStatus",
    "hodNote" TEXT,
    "sourceChecklistId" UUID,
    "sourceChecklistItemId" UUID,
    "code" TEXT,
    "unit" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "critical" BOOLEAN,
    "aiEnabled" BOOLEAN,
    "aiConfidence" DECIMAL(8,3),
    "base" DECIMAL(18,3),
    "plus" DECIMAL(18,3),
    "minus" DECIMAL(18,3),

    CONSTRAINT "WirItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WirHistory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "projectId" UUID NOT NULL,
    "wirId" UUID NOT NULL,
    "action" "WirAction" NOT NULL,
    "actorUserId" UUID,
    "actorName" TEXT,
    "fromStatus" "WirStatus",
    "toStatus" "WirStatus",
    "fromBicUserId" UUID,
    "toBicUserId" UUID,
    "notes" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WirHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WirDiscussion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "wirId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "parentId" UUID,
    "body" TEXT NOT NULL,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WirDiscussion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WirItemRun" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "wirId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "actorUserId" UUID,
    "actorRole" "WirRunnerActorRole",
    "actorName" TEXT,
    "valueText" TEXT,
    "valueNumber" DECIMAL(18,3),
    "unit" TEXT,
    "status" "WirItemStatus",
    "comment" TEXT,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "accuracyM" DECIMAL(6,2),
    "locationNote" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WirItemRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WirItemEvidence" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "wirId" UUID NOT NULL,
    "itemId" UUID,
    "runId" UUID,
    "kind" "WirItemEvidenceKind" NOT NULL DEFAULT 'Photo',
    "url" TEXT NOT NULL,
    "thumbUrl" TEXT,
    "fileName" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "capturedAt" TIMESTAMPTZ(6),
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "accuracyM" DECIMAL(6,2),
    "meta" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WirItemEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "State_code_key" ON "State"("code");

-- CreateIndex
CREATE UNIQUE INDEX "State_name_key" ON "State"("name");

-- CreateIndex
CREATE UNIQUE INDEX "District_stateId_name_key" ON "District"("stateId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "User_code_key" ON "User"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_cc_phone_unique" ON "User"("countryCode", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Company_gstin_key" ON "Company"("gstin");

-- CreateIndex
CREATE UNIQUE INDEX "Company_pan_key" ON "Company"("pan");

-- CreateIndex
CREATE UNIQUE INDEX "Company_cin_key" ON "Company"("cin");

-- CreateIndex
CREATE UNIQUE INDEX "Company_companyCode_key" ON "Company"("companyCode");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE INDEX "UserProject_userId_idx" ON "UserProject"("userId");

-- CreateIndex
CREATE INDEX "UserProject_projectId_idx" ON "UserProject"("projectId");

-- CreateIndex
CREATE INDEX "UserCompany_userId_idx" ON "UserCompany"("userId");

-- CreateIndex
CREATE INDEX "UserCompany_companyId_idx" ON "UserCompany"("companyId");

-- CreateIndex
CREATE INDEX "UserRoleMembership_userId_role_idx" ON "UserRoleMembership"("userId", "role");

-- CreateIndex
CREATE INDEX "UserRoleMembership_companyId_idx" ON "UserRoleMembership"("companyId");

-- CreateIndex
CREATE INDEX "UserRoleMembership_projectId_idx" ON "UserRoleMembership"("projectId");

-- CreateIndex
CREATE INDEX "urm_project_role_window_idx" ON "UserRoleMembership"("projectId", "role", "validFrom", "validTo");

-- CreateIndex
CREATE INDEX "urm_user_role_window_idx" ON "UserRoleMembership"("userId", "role", "validFrom", "validTo");

-- CreateIndex
CREATE UNIQUE INDEX "urm_unique_user_project_role_window" ON "UserRoleMembership"("userId", "projectId", "role", "validFrom", "validTo");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionTemplate_role_key" ON "PermissionTemplate"("role");

-- CreateIndex
CREATE UNIQUE INDEX "ppo_project_role_unique" ON "PermissionProjectOverride"("projectId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "puo_project_user" ON "PermissionUserOverride"("projectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "RefChecklist_code_key" ON "RefChecklist"("code");

-- CreateIndex
CREATE INDEX "RefChecklist_discipline_stageLabel_idx" ON "RefChecklist"("discipline", "stageLabel");

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
CREATE INDEX "RefMaterial_discipline_category_manufacturer_idx" ON "RefMaterial"("discipline", "category", "manufacturer");

-- CreateIndex
CREATE INDEX "RefActivityMaterial_activityId_idx" ON "RefActivityMaterial"("activityId");

-- CreateIndex
CREATE INDEX "RefActivityMaterial_materialId_idx" ON "RefActivityMaterial"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "refactmat_activity_material_uq" ON "RefActivityMaterial"("activityId", "materialId");

-- CreateIndex
CREATE INDEX "ProjectModuleSetting_projectId_idx" ON "ProjectModuleSetting"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "pms_project_module_unique" ON "ProjectModuleSetting"("projectId", "module");

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetUserId_createdAt_idx" ON "AdminAuditLog"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_companyId_idx" ON "AdminAuditLog"("companyId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_projectId_idx" ON "AdminAuditLog"("projectId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_action_idx" ON "AdminAuditLog"("action");

-- CreateIndex
CREATE UNIQUE INDEX "Wir_code_key" ON "Wir"("code");

-- CreateIndex
CREATE INDEX "Wir_projectId_idx" ON "Wir"("projectId");

-- CreateIndex
CREATE INDEX "Wir_status_idx" ON "Wir"("status");

-- CreateIndex
CREATE INDEX "Wir_discipline_stage_idx" ON "Wir"("discipline", "stage");

-- CreateIndex
CREATE INDEX "Wir_bicUserId_idx" ON "Wir"("bicUserId");

-- CreateIndex
CREATE INDEX "WirChecklist_wirId_idx" ON "WirChecklist"("wirId");

-- CreateIndex
CREATE INDEX "WirChecklist_checklistId_idx" ON "WirChecklist"("checklistId");

-- CreateIndex
CREATE UNIQUE INDEX "wir_checklist_unique" ON "WirChecklist"("wirId", "checklistId");

-- CreateIndex
CREATE INDEX "WirItem_wirId_idx" ON "WirItem"("wirId");

-- CreateIndex
CREATE INDEX "WirItem_checklistId_idx" ON "WirItem"("checklistId");

-- CreateIndex
CREATE INDEX "WirItem_itemId_idx" ON "WirItem"("itemId");

-- CreateIndex
CREATE INDEX "WirItem_sourceChecklistId_idx" ON "WirItem"("sourceChecklistId");

-- CreateIndex
CREATE INDEX "WirItem_sourceChecklistItemId_idx" ON "WirItem"("sourceChecklistItemId");

-- CreateIndex
CREATE INDEX "wirhist_wir_created_idx" ON "WirHistory"("wirId", "createdAt");

-- CreateIndex
CREATE INDEX "wirhist_project_created_idx" ON "WirHistory"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "WirItemRun_wirId_idx" ON "WirItemRun"("wirId");

-- CreateIndex
CREATE INDEX "WirItemRun_itemId_idx" ON "WirItemRun"("itemId");

-- CreateIndex
CREATE INDEX "WirItemRun_actorUserId_idx" ON "WirItemRun"("actorUserId");

-- CreateIndex
CREATE INDEX "WirItemEvidence_wirId_idx" ON "WirItemEvidence"("wirId");

-- CreateIndex
CREATE INDEX "WirItemEvidence_itemId_idx" ON "WirItemEvidence"("itemId");

-- CreateIndex
CREATE INDEX "WirItemEvidence_runId_idx" ON "WirItemEvidence"("runId");

-- AddForeignKey
ALTER TABLE "District" ADD CONSTRAINT "District_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "State"("stateId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "State"("stateId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("districtId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "State"("stateId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("districtId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "User"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientCompanyId_fkey" FOREIGN KEY ("clientCompanyId") REFERENCES "Company"("companyId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "State"("stateId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("districtId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTag" ADD CONSTRAINT "ProjectTag_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("projectId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTag" ADD CONSTRAINT "ProjectTag_tagCode_fkey" FOREIGN KEY ("tagCode") REFERENCES "ref_project_tag"("tagCode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProject" ADD CONSTRAINT "UserProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProject" ADD CONSTRAINT "UserProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("projectId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCompany" ADD CONSTRAINT "UserCompany_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCompany" ADD CONSTRAINT "UserCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRoleMembership" ADD CONSTRAINT "UserRoleMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRoleMembership" ADD CONSTRAINT "UserRoleMembership_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRoleMembership" ADD CONSTRAINT "UserRoleMembership_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("projectId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionProjectOverride" ADD CONSTRAINT "PermissionProjectOverride_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("projectId") ON DELETE CASCADE ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "ProjectModuleSetting" ADD CONSTRAINT "ProjectModuleSetting_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("projectId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wir" ADD CONSTRAINT "Wir_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("projectId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wir" ADD CONSTRAINT "Wir_rescheduledById_fkey" FOREIGN KEY ("rescheduledById") REFERENCES "User"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wir" ADD CONSTRAINT "Wir_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "User"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wir" ADD CONSTRAINT "Wir_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "User"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wir" ADD CONSTRAINT "Wir_hodId_fkey" FOREIGN KEY ("hodId") REFERENCES "User"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wir" ADD CONSTRAINT "Wir_bicUserId_fkey" FOREIGN KEY ("bicUserId") REFERENCES "User"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wir" ADD CONSTRAINT "Wir_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WirChecklist" ADD CONSTRAINT "WirChecklist_wirId_fkey" FOREIGN KEY ("wirId") REFERENCES "Wir"("wirId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WirChecklist" ADD CONSTRAINT "WirChecklist_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "RefChecklist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WirItem" ADD CONSTRAINT "WirItem_wirId_fkey" FOREIGN KEY ("wirId") REFERENCES "Wir"("wirId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WirItem" ADD CONSTRAINT "WirItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "RefChecklist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WirItem" ADD CONSTRAINT "WirItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "RefChecklistItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WirItem" ADD CONSTRAINT "WirItem_sourceChecklistId_fkey" FOREIGN KEY ("sourceChecklistId") REFERENCES "RefChecklist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WirItem" ADD CONSTRAINT "WirItem_sourceChecklistItemId_fkey" FOREIGN KEY ("sourceChecklistItemId") REFERENCES "RefChecklistItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WirHistory" ADD CONSTRAINT "WirHistory_wirId_fkey" FOREIGN KEY ("wirId") REFERENCES "Wir"("wirId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WirDiscussion" ADD CONSTRAINT "WirDiscussion_wirId_fkey" FOREIGN KEY ("wirId") REFERENCES "Wir"("wirId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WirDiscussion" ADD CONSTRAINT "WirDiscussion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WirDiscussion" ADD CONSTRAINT "WirDiscussion_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WirDiscussion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WirItemRun" ADD CONSTRAINT "WirItemRun_wirId_fkey" FOREIGN KEY ("wirId") REFERENCES "Wir"("wirId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WirItemRun" ADD CONSTRAINT "WirItemRun_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "WirItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WirItemEvidence" ADD CONSTRAINT "WirItemEvidence_wirId_fkey" FOREIGN KEY ("wirId") REFERENCES "Wir"("wirId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WirItemEvidence" ADD CONSTRAINT "WirItemEvidence_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "WirItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WirItemEvidence" ADD CONSTRAINT "WirItemEvidence_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WirItemRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
