import { Module } from '@nestjs/common';
import { PrismaService } from "../../../../prisma/prisma.service";
import { AdminMaterialsController } from "./admin.materials.controller";
import { AdminMaterialsService } from "./admin.materials.service";

@Module({
  controllers: [AdminMaterialsController],
  providers: [AdminMaterialsService, PrismaService],
  exports: [AdminMaterialsService],
})
export class AdminMaterialsModule {}