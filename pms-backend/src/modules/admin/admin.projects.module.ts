// src/modules/admin/admin.projects.module.ts
import { Module } from '@nestjs/common';
import { AdminProjectsController } from './controllers/admin.projects.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { AdminUsersController } from './controllers/admin.users.controller';
import { AdminRefsController } from './controllers/admin.refs.controller';
import { AdminCodeService } from './admin-code.service';

@Module({
  controllers: [AdminProjectsController, AdminRefsController],
    providers: [PrismaService, AdminCodeService],
  exports: [],
})
export class AdminProjectsModule {}
