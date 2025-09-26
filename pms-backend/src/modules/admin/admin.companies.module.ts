import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AdminRefsController } from './controllers/admin.refs.controller';
import { AdminCodeService } from './admin-code.service';
import { AdminCompaniesController } from './controllers/admin.companies.controller';

@Module({
  controllers: [AdminCompaniesController, AdminRefsController],
    providers: [PrismaService, AdminCodeService],
  exports: [],
})
export class AdminCompaniesModule {}
