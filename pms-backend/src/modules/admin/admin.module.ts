import { Module } from '@nestjs/common';
import { AdminUsersModule } from './admin.users.module';
import { AdminProjectsModule } from './admin.projects.module';
import { AdminCompaniesModule } from './admin.companies.module';

@Module({
  imports: [AdminUsersModule, AdminProjectsModule,AdminCompaniesModule],
})
export class AdminModule {}
