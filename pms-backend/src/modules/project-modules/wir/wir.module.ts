//pms-backend/src/modules/project-modules/wir/wir.module.ts
import { Module } from '@nestjs/common';
import { WirController } from './wir.controller';
import { WirService } from './wir.service';
import { PrismaService } from '../../../prisma/prisma.service';

@Module({
  controllers: [WirController],
  providers: [WirService, PrismaService],
  exports: [WirService],
})
export class WirModule {}
