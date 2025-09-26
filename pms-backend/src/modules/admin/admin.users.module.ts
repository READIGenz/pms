//src/modules/admin/admin.users.module.ts
import { Module } from '@nestjs/common';
import { AdminUsersController } from './controllers/admin.users.controller';
import { AdminRefsController } from './controllers/admin.refs.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { AdminCodeService } from './admin-code.service';

@Module({
  controllers: [AdminUsersController, AdminRefsController],
  providers: [PrismaService, AdminCodeService],
  exports: [], // export services here if other modules need them
})
export class AdminUsersModule {}
