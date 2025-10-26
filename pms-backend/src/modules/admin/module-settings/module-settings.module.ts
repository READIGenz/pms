//src/modules/admin/module-settings/module-settings.module.ts
import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AdminModuleSettingsController } from './module-settings.controller';
import { AdminModuleSettingsService } from './module-settings.service';

@Module({
  controllers: [AdminModuleSettingsController],
  providers: [PrismaService, AdminModuleSettingsService],
  exports: [],
})
export class AdminModuleSettingsModule {}
