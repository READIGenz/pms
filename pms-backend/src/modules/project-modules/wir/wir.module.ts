import { Module } from '@nestjs/common';
import { WirService } from './wir.service';
import { WirController } from './wir.controller';
import { ProjectRefChecklistsController } from './project-ref-checklists.controller';
import { PrismaModule } from '../../../prisma/prisma.module';
import { FilesModule } from '../../../common/storage/files.module';

@Module({
    imports: [
    PrismaModule,     // provides PrismaService
    FilesModule,      // provides & exports FilesService
  ],
  controllers: [WirController, ProjectRefChecklistsController],
  providers: [WirService],
  exports: [WirService],
})
export class WirModule { }
