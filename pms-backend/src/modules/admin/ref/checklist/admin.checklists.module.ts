import { Module } from '@nestjs/common';
import { AdminChecklistsController } from './admin.checklists.controller';
import { AdminChecklistsService } from './admin.checklists.service';
import { PrismaService } from '../../../../prisma/prisma.service';

@Module({
  controllers: [AdminChecklistsController],
  providers: [AdminChecklistsService, PrismaService],
  exports: [AdminChecklistsService],
})
export class AdminChecklistsModule {}
