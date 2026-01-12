// pms-backend/src/common/storage/s3-files.service.ts
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
import {
  FilesServiceInterface,
  SavedFileInfo,
  SaveOpts,
} from './files.interface'; // NOTE: matches your actual file name

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

/* ====================== service ====================== */

@Injectable()
export class S3FilesService implements FilesServiceInterface {
  private readonly bucket: string;
  private readonly region: string;
  private readonly s3: S3Client;

  constructor() {
    // Support either AWS_BUCKET_NAME or AWS_S3_BUCKET
    this.bucket =
      process.env.AWS_BUCKET_NAME ||
      process.env.AWS_S3_BUCKET ||
      '';

    this.region = process.env.AWS_REGION as string;

    this.s3 = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
      },
    });
  }

  /* ---------- UPLOAD: single file ---------- */

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

      const s3Key = safeSubdir
        ? path.posix.join(safeSubdir, finalName)
        : finalName;

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

        // expose for WIR code
        url: s3Key,
        thumbUrl: null,
      };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      throw new InternalServerErrorException('Failed to upload file to S3');
    }
  }

  /* ---------- UPLOAD: multiple files ---------- */

  async saveMany(
    files: Express.Multer.File[],
    opts: SaveOpts = {},
  ): Promise<SavedFileInfo[]> {
    if (!files || !files.length) {
      return [];
    }

    const results: SavedFileInfo[] = [];

    for (const file of files) {
      const saved = await this.saveMulterFile(file, opts);
      results.push(saved);
    }

    // makeThumbs is accepted for compatibility
    // Thumbnail generation can be added later if needed.
    return results;
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
      // ignore delete failures
    }
  }
}
