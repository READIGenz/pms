//src/modules/admin/admin.module.ts
import { Module } from '@nestjs/common';
import { AdminUsersModule } from './admin.users.module';
import { AdminProjectsModule } from './admin.projects.module';
import { AdminCompaniesModule } from './admin.companies.module';
import { AdminAssignmentsModule } from './admin.assignments.module';
import { AdminPermissionsModule } from './permissions/permissions.module';
import { AdminPermissionsExplorerModule } from './permissions-explorer/user-overrides.module';
import { AdminActivitiesModule } from './ref/activity/admin.activities.module';
import { AdminMaterialsModule } from './ref/material/admin.materials.module';
import { AdminChecklistsModule } from './ref/checklist/admin.checklists.module';
import { AdminModuleSettingsModule } from './module-settings/module-settings.module';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [AdminUsersModule, AdminProjectsModule,AdminCompaniesModule, 
    AdminAssignmentsModule,AdminPermissionsModule, 
    AdminPermissionsExplorerModule, AdminActivitiesModule, AdminMaterialsModule,AdminChecklistsModule, AdminModuleSettingsModule, AuditModule],
})
export class AdminModule {}
