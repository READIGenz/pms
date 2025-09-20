-- CreateEnum
CREATE TYPE "PreferredLanguage" AS ENUM ('en', 'hi', 'bn', 'ta', 'te', 'mr', 'pa', 'or', 'gu', 'kn', 'ml');

-- CreateEnum
CREATE TYPE "OperatingZone" AS ENUM ('NCR', 'North', 'South', 'East', 'West', 'Central');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('Active', 'Inactive');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('Active', 'Inactive');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('Admin', 'Client', 'Ava-PMT', 'Contractor', 'Consultant', 'PMC', 'Supplier');

-- CreateEnum
CREATE TYPE "CompanyRole" AS ENUM ('Ava-PMT', 'Contractor', 'Consultant', 'PMC', 'Supplier');

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

-- CreateTable
CREATE TABLE "State" (
    "stateId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "StateType" NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "State_pkey" PRIMARY KEY ("stateId")
);

-- CreateTable
CREATE TABLE "District" (
    "districtId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "stateId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

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
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

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
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

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
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRoleMembership_pkey" PRIMARY KEY ("id")
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
