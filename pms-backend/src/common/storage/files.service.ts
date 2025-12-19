import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as path from 'path';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/* ====================== types ====================== */

export type SavedFileInfo = {
  originalName: string;
  fileName: string;
  ext: string;
  size: number;
  mimeType?: string;
  relPath: string; // S3 key (store in DB)
};

export type SaveOpts = {
  subdir?: string;
  baseName?: string;
};

/* ====================== service ====================== */

@Injectable()
export class FilesService {
  private readonly bucket = process.env.AWS_BUCKET_NAME!;
  private readonly region = process.env.AWS_REGION!;

  private readonly s3 = new S3Client({
    region: this.region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  /* ---------- UPLOAD ---------- */

  async saveMulterFile(
    file: Express.Multer.File,
    opts: SaveOpts = {},
  ): Promise<SavedFileInfo> {
    try {
      const safeSubdir = sanitizePathPart(opts.subdir ?? '');

      const { finalName, ext } = buildFinalName(
        opts.baseName ?? baseFrom(file.originalname),
        file.originalname,
      );

      const s3Key = path.posix.join(safeSubdir, finalName);

      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: s3Key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );

      return {
        originalName: file.originalname,
        fileName: finalName,
        ext,
        size: file.size,
        mimeType: file.mimetype,
        relPath: s3Key,
      };
    } catch (err) {
      console.error(err);
      throw new InternalServerErrorException('Failed to upload file to S3');
    }
  }

  /* ---------- SIGNED URL ---------- */

  async getSignedUrl(
    s3Key: string,
    expiresInSeconds = 300, // 5 minutes
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
    });

    return getSignedUrl(this.s3, command, {
      expiresIn: expiresInSeconds,
    });
  }

  /* ---------- DELETE ---------- */

  async deleteByRelPath(s3Key: string): Promise<void> {
    try {
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: s3Key,
        }),
      );
    } catch {
      // ignore
    }
  }
}

/* ====================== helpers ====================== */

function sanitizePathPart(p: string): string {
  return p
    .replace(/(\.\.[/\\])/g, '')
    .replace(/^[/\\]+/, '')
    .replace(/[/\\]+/g, '/');
}

function baseFrom(filename: string): string {
  const b = path.parse(filename).name;
  return b.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 60) || 'file';
}

function buildFinalName(
  preferredBase: string,
  originalName: string,
): { finalName: string; ext: string } {
  const ext = path.extname(originalName) || '';
  const uuid = randomUUID().slice(0, 8);
  const safeBase = preferredBase.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 60);
  return { finalName: `${safeBase}-${uuid}${ext}`, ext };
}