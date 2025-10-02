import { Module } from '@nestjs/common';
import { AdminPermissionsController } from './permissions.controller';
import { AdminPermissionsService } from './permissions.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AdminProjectOverridesController } from './project-overrides.controller';
import { AdminProjectOverridesService } from './project-overrides.service';

@Module({
  controllers: [AdminPermissionsController, AdminProjectOverridesController],
  providers: [AdminPermissionsService, PrismaService, AdminProjectOverridesService],
})
export class AdminPermissionsModule {}
