// src/modules/admin/admin.users.module.ts
import { Module } from '@nestjs/common';
import { AdminUsersController } from './controllers/admin.users.controller';
import { AdminRefsController } from './controllers/admin.refs.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { AdminCodeService } from './admin-code.service';
import { FilesModule } from 'src/common/storage/files.module';
@Module({
  imports: [FilesModule],                                   // 👈 pull in FILES_SERVICE binding
  controllers: [AdminUsersController, AdminRefsController],
  providers: [PrismaService, AdminCodeService],               // 👈 remove FilesService
  exports: [],                                                // add exports if needed later
})
export class AdminUsersModule {}
