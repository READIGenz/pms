import { Module } from '@nestjs/common';
import { AdminPermissionsController } from './permissions.controller';
import { AdminPermissionsService } from './permissions.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AdminProjectOverridesController } from './project-overrides.controller';
import { AdminProjectOverridesService } from './project-overrides.service';
import { ProjectsMembershipsController } from './projects.memberships.controller';

@Module({
  controllers: [AdminPermissionsController, AdminProjectOverridesController, ProjectsMembershipsController],
  providers: [AdminPermissionsService, PrismaService, AdminProjectOverridesService],
})
export class AdminPermissionsModule {}
