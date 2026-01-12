// pms-backend/src/common/storage/local-files.service.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import {
  FilesServiceInterface,
  SavedFileInfo,
  SaveOpts,
} from './files.interface'; // keep your filename spelling as-is

@Injectable()
export class LocalFilesService implements FilesServiceInterface {
  /** Where we store files on disk (uploads root) */
  private readonly defaultRoot = path.join(process.cwd(), 'uploads');

  /** Public base URL (assuming you serve /uploads statically) */
  private readonly publicBase = '/uploads';

  /**
   * Save an uploaded file (from Multer) to disk and return a SavedFileInfo.
   * Expects Multer to use memory storage so `file.buffer` is available.
   */
  async saveMulterFile(
    file: Express.Multer.File,
    opts: SaveOpts = {},
  ): Promise<SavedFileInfo> {
    try {
      const root = this.defaultRoot; // no rootDir in SaveOpts, use internal default

      const safeSubdir = sanitizePathPart(opts.subdir ?? '');
      const dir = path.join(root, safeSubdir);
      await fs.promises.mkdir(dir, { recursive: true });

      const { finalName, ext } = buildFinalName(
        opts.baseName ?? baseFrom(file.originalname),
        file.originalname,
      );

      const relPath = path.join(safeSubdir, finalName).replace(/\\/g, '/');
      const absPath = path.join(dir, finalName);

      // write file to disk
      await fs.promises.writeFile(absPath, file.buffer);

      const info: SavedFileInfo = {
        originalName: file.originalname,
        fileName: finalName,
        ext,
        size: file.size,
        mimeType: file.mimetype,
        relPath,
        url: path.posix.join(this.publicBase, relPath),
        thumbUrl: null, // local impl: no thumbs for now
      };

      return info;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      throw new InternalServerErrorException('Failed to save file');
    }
  }

  /**
   * Save multiple files; thin wrapper over saveMulterFile.
   */
  async saveMany(
    files: Express.Multer.File[],
    opts: SaveOpts = {},
  ): Promise<SavedFileInfo[]> {
    if (!files || !files.length) {
      return [];
    }

    const results: SavedFileInfo[] = [];
    for (const f of files) {
      results.push(await this.saveMulterFile(f, opts));
    }
    return results;
  }

  /**
   * Optional convenience wrapper (not part of FilesServiceInterface, but harmless).
   */
  async save(
    f: Express.Multer.File,
    opts: { subdir?: string; makeThumbs?: boolean } = {},
  ): Promise<SavedFileInfo> {
    return this.saveMulterFile(f, opts);
  }

  /**
   * Remove a previously saved file (best-effort).
   * Signature MUST match FilesServiceInterface.
   */
  async deleteByRelPath(relPath: string): Promise<void> {
    const abs = path.join(this.defaultRoot, relPath);
    try {
      await fs.promises.unlink(abs);
    } catch {
      // ignore: file might already be gone
    }
  }

  /**
   * Optional: for local, just return the public URL.
   * This satisfies the optional getSignedUrl? in the interface.
   */
  async getSignedUrl(key: string, _expiresInSeconds = 300): Promise<string> {
    const rel = key.replace(/\\/g, '/');
    return path.posix.join(this.publicBase, rel);
  }
}

/* ====================== small helpers ====================== */

function sanitizePathPart(p: string): string {
  // Remove leading ../ or absolute roots, collapse slashes
  const cleaned = p
    .replace(/(\.\.[/\\])/g, '')
    .replace(/^[/\\]+/, '')
    .replace(/[/\\]+/g, '/');
  return cleaned;
}

function baseFrom(filename: string): string {
  const b = path.parse(filename).name;
  // reduce weird characters
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
