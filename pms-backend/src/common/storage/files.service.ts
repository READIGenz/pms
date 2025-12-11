// pms-backend/src/common/storage/files.service.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

export type SavedFileInfo = {
  /** Original filename from the client */
  originalName: string;
  /** Final stored filename (without any directories) */
  fileName: string;
  /** File extension including the leading dot, e.g. ".jpg" (may be empty string) */
  ext: string;
  /** Bytes */
  size: number;
  /** MIME type reported by Multer */
  mimeType?: string;
  /** Absolute path on the server */
  absPath: string;
  /** Path relative to uploads root (good for DB) */
  relPath: string;
  /** Public URL to serve the file (assuming /uploads is static) */
  url: string;
};

export type SaveOpts = {
  /** Subdirectory inside uploads/, e.g. "wir/<wirId>/items/<itemId>" */
  subdir?: string;
  /** Preferred base name (extension will be preserved/added); uuid will be appended to avoid clashes */
  baseName?: string;
  /** Override uploads root (defaults to process.cwd()/uploads) */
  rootDir?: string;
  /** Create thumbnails if supported (noop for now) */
  makeThumbs?: boolean;
};

@Injectable()
export class FilesService {
  /** Where we store files on disk (can be overridden per call via SaveOpts.rootDir) */
  private readonly defaultRoot = path.join(process.cwd(), 'uploads');

  /** Where the static files are publicly reachable from (configurable if you mount elsewhere) */
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
      const root = opts.rootDir ?? this.defaultRoot;

      const safeSubdir = sanitizePathPart(opts.subdir ?? '');
      const dir = path.join(root, safeSubdir);
      await fs.promises.mkdir(dir, { recursive: true });

      const { finalName, ext } = buildFinalName(
        opts.baseName ?? baseFrom(file.originalname),
        file.originalname,
      );

      const relPath = path.join(safeSubdir, finalName).replace(/\\/g, '/');
      const absPath = path.join(dir, finalName);

      // write file
      await fs.promises.writeFile(absPath, file.buffer);

      const info: SavedFileInfo = {
        originalName: file.originalname,
        fileName: finalName,
        ext,
        size: file.size,
        mimeType: file.mimetype,
        absPath,
        relPath,
        url: path.posix.join(this.publicBase, relPath),
      };

      return info;
    } catch (err) {
      throw new InternalServerErrorException('Failed to save file');
    }
  }

  /**
   * Simple convenience wrapper used by WIR runner attachments code.
   * Returns a shape that your WIR service expects.
   */
  async saveMany(
    files: Array<Express.Multer.File>,
    opts: { subdir?: string; makeThumbs?: boolean } = {},
  ): Promise<Array<{ url: string; fileName?: string; mimeType?: string; size?: number; thumbUrl?: string }>> {
    const results: Array<{ url: string; fileName?: string; mimeType?: string; size?: number; thumbUrl?: string }> = [];
    for (const f of files) {
      const s = await this.save(f, opts);
      results.push({
        url: s.url,
        fileName: s.fileName,
        mimeType: s.mimeType,
        size: s.size,
        // implement real thumbnails later if needed
        thumbUrl: undefined,
      });
    }
    return results;
  }

  /** Unified single-file save used by saveMany */
  async save(
    f: Express.Multer.File,
    opts: { subdir?: string; makeThumbs?: boolean } = {},
  ): Promise<SavedFileInfo> {
    return this.saveMulterFile(f, opts);
  }

  /** Remove a previously saved file (best-effort). */
  async deleteByRelPath(relPath: string, rootDir?: string): Promise<void> {
    const root = rootDir ?? this.defaultRoot;
    const abs = path.join(root, relPath);
    try {
      await fs.promises.unlink(abs);
    } catch {
      // ignore
    }
  }
}

/* ====================== small helpers ====================== */

function sanitizePathPart(p: string): string {
  // Remove leading ../ or absolute roots, collapse slashes
  const cleaned = p.replace(/(\.\.[/\\])/g, '').replace(/^[/\\]+/, '').replace(/[/\\]+/g, '/');
  return cleaned;
}

function baseFrom(filename: string): string {
  const b = path.parse(filename).name;
  // reduce weird characters
  return b.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 60) || 'file';
}

function buildFinalName(preferredBase: string, originalName: string): { finalName: string; ext: string } {
  const ext = path.extname(originalName) || '';
  const uuid = randomUUID().slice(0, 8);
  const safeBase = preferredBase.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 60);
  return { finalName: `${safeBase}-${uuid}${ext}`, ext };
}
