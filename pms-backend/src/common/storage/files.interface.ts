// src/common/storage/files.interface.ts
export const FILES_SERVICE = 'FILES_SERVICE';

export type SaveOpts = {
  subdir?: string;
  baseName?: string;
  makeThumbs?: boolean;
};

export type SavedFileInfo = {
  originalName: string;
  fileName: string;
  ext: string;
  size: number;
  mimeType?: string;
  relPath: string;
  url?: string;
  thumbUrl?: string | null;
};

export interface FilesServiceInterface {
  saveMulterFile(
    file: Express.Multer.File,
    opts?: SaveOpts,
  ): Promise<SavedFileInfo>;

  saveMany(
    files: Express.Multer.File[],
    opts?: SaveOpts,
  ): Promise<SavedFileInfo[]>;

  deleteByRelPath(relPath: string): Promise<void>;

  /** Optional for S3, noop for local */
  getSignedUrl?(
    key: string,
    expiresInSeconds?: number,
  ): Promise<string>;
}
