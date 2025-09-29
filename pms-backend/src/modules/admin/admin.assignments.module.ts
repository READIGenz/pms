import { Module } from '@nestjs/common';
import { AdminAssignmentsController } from './controllers/admin.assignments.controller';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [AdminAssignmentsController],
  providers: [PrismaService],
  exports: [],
})
export class AdminAssignmentsModule {}
