//src/modules/admin/admin.module.ts
import { Module } from '@nestjs/common';
import { AdminUsersModule } from './admin.users.module';
import { AdminProjectsModule } from './admin.projects.module';
import { AdminCompaniesModule } from './admin.companies.module';
import { AdminAssignmentsModule } from './admin.assignments.module';
import { AdminPermissionsModule } from './permissions/permissions.module';
import { AdminPermissionsExplorerModule } from './permissions-explorer/user-overrides.module';

@Module({
  imports: [AdminUsersModule, AdminProjectsModule,AdminCompaniesModule, AdminAssignmentsModule,AdminPermissionsModule, AdminPermissionsExplorerModule],
})
export class AdminModule {}
