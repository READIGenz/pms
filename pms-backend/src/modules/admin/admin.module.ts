import { Module } from '@nestjs/common';
import { AdminUsersModule } from './admin.users.module';
import { AdminProjectsModule } from './admin.projects.module';
import { AdminCompaniesModule } from './admin.companies.module';
import { AdminAssignmentsModule } from './admin.assignments.module';
import { AdminPermissionsModule } from './permissions/permissions.module';

@Module({
  imports: [AdminUsersModule, AdminProjectsModule,AdminCompaniesModule, AdminAssignmentsModule,AdminPermissionsModule],
})
export class AdminModule {}
