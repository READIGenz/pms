//src/modules/admin/permissions-explorer/user-overrides.module.ts
import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

import { AdminUserOverridesController } from './user-overrides.controller';
import { AdminUserOverridesService } from './user-overrides.service';

@Module({
  controllers: [
    AdminUserOverridesController,
  ],
  providers: [
    PrismaService,
    AdminUserOverridesService, 
  ],
  exports: [],
})
export class AdminPermissionsExplorerModule {}
