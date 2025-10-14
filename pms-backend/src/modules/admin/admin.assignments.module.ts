import { Module } from '@nestjs/common';
import { AdminAssignmentsController } from './controllers/admin.assignments.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [AdminAssignmentsController],
  providers: [PrismaService]
})
export class AdminAssignmentsModule {}
