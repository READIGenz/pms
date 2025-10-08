import { Module } from '@nestjs/common';
import { AdminActivitiesController } from './admin.activities.controller';
import { AdminActivitiesService } from './admin.activities.service';
import { PrismaService } from '../../../../prisma/prisma.service';

@Module({
  controllers: [AdminActivitiesController],
  providers: [AdminActivitiesService, PrismaService],
  exports: [AdminActivitiesService],
})
export class AdminActivitiesModule {}
