import { Module } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { WirService } from './wir.service';
import { WirController } from './wir.controller';
import { ProjectRefChecklistsController } from './project-ref-checklists.controller';

@Module({
  controllers: [WirController,ProjectRefChecklistsController],
  providers: [PrismaService, WirService],
  exports: [WirService],
})
export class WirModule {}
