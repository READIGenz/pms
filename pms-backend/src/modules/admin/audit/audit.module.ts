// src/modules/admin/audit/audit.module.ts
import { Module } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from './audit.service';
import { AuditLogsController } from './logs.controller';
import { AuditSettingsController } from './settings.controller';

@Module({
  controllers: [AuditSettingsController, AuditLogsController],
  providers: [PrismaService, AuditService],
  exports: [AuditService],
})
export class AuditModule {}
