//pms-backend/src/modules/project-modules/wir/wir.module.ts
import { Module } from '@nestjs/common';
import { WirController } from './wir.controller';
import { WirAdminController } from './wir.admin.controller';
import { WirService } from './wir.service';
import { PrismaService } from '../../../prisma/prisma.service';

@Module({
  controllers: [WirController, WirAdminController],
  providers: [WirService, PrismaService],
  exports: [WirService],
})
export class WirModule {}
