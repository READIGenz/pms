// src/common/storage/files.module.ts
import { Module } from '@nestjs/common';
import { FILES_SERVICE } from './files.interface';
import { LocalFilesService } from './local-files.service';
import { S3FilesService } from './s3-files.service';

@Module({
  providers: [
    {
      provide: FILES_SERVICE,
      useClass:
        process.env.STORAGE_TYPE === 's3'
          ? S3FilesService
          : LocalFilesService,
    },
  ],
  exports: [FILES_SERVICE],
})
export class FilesModule {}
 