//pms-backend/src/app.module.ts

import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { AdminModule } from './modules/admin/admin.module';
import { WirModule } from './modules/project-modules/wir/wir.module';

@Module({
  imports: [PrismaModule, AuthModule, AdminModule, WirModule],
})
export class AppModule {}
