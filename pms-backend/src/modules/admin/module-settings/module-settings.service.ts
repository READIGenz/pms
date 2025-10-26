// src/modules/admin/module-settings/module-settings.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ModuleCode } from '@prisma/client';

/**
 * Only WIR is supported.
 * We store a single row per (projectId, module) in ProjectModuleSetting.
 * Only `extra` is used on the back-end, and the front-end normalizes other fields.
 */
@Injectable()
export class AdminModuleSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // Server-side defaults (mirror UI defaults)
  private static readonly DEFAULT_WIR_EXTRA = {
    transmissionType: 'Public' as 'Public' | 'Private' | 'UserSet',
    redirectAllowed: true,
    exportPdfAllowed: false,
  };

  private static sanitizeWirExtra(input: Record<string, any> = {}) {
    const out = { ...AdminModuleSettingsService.DEFAULT_WIR_EXTRA };

    // transmissionType
    const tt = input?.transmissionType;
    if (tt === 'Public' || tt === 'Private' || tt === 'UserSet') out.transmissionType = tt;

    // redirectAllowed
    if (typeof input?.redirectAllowed === 'boolean') out.redirectAllowed = input.redirectAllowed;

    // exportPdfAllowed
    if (typeof input?.exportPdfAllowed === 'boolean') out.exportPdfAllowed = input.exportPdfAllowed;

    return out;
  }

  /** Return { extra } for the module; null if not found. */
  async get(projectId: string, _mod: 'WIR') {
    const row = await this.prisma.projectModuleSetting.findUnique({
      where: { projectId_module: { projectId, module: ModuleCode.WIR } },
      select: { extra: true },
    });
    if (!row) return null;
    // Ensure the API always includes defaults (front-end also normalizes)
    return { extra: { ...AdminModuleSettingsService.DEFAULT_WIR_EXTRA, ...(row.extra as any) } };
  }

  /** Same as get() but creates a row with defaults if missing. */
  async getOrCreate(projectId: string, _mod: 'WIR') {
    const rec = await this.prisma.projectModuleSetting.upsert({
      where: { projectId_module: { projectId, module: ModuleCode.WIR } },
      create: {
        projectId,
        module: ModuleCode.WIR,
        extra: AdminModuleSettingsService.DEFAULT_WIR_EXTRA,
      },
      update: {},
      select: { extra: true },
    });
    return { extra: { ...AdminModuleSettingsService.DEFAULT_WIR_EXTRA, ...(rec.extra as any) } };
  }

  /** Upsert only the three WIR fields from `extra`. Return { extra }. */
  async save(projectId: string, _mod: 'WIR', rawExtra: Record<string, any>) {
    const extra = AdminModuleSettingsService.sanitizeWirExtra(rawExtra);
    try {
      const rec = await this.prisma.projectModuleSetting.upsert({
        where: { projectId_module: { projectId, module: ModuleCode.WIR } },
        update: { extra },
        create: { projectId, module: ModuleCode.WIR, extra },
        select: { extra: true },
      });
      return { extra: rec.extra };
    } catch (e: any) {
      // Prisma P2003 = foreign key constraint failed (likely projectId not found)
      if (e?.code === 'P2003') throw new NotFoundException('Project not found');
      throw e;
    }
  }

  /** Reset to defaults; returns { extra }. */
  async reset(projectId: string, _mod: 'WIR') {
    const extra = { ...AdminModuleSettingsService.DEFAULT_WIR_EXTRA };
    try {
      const rec = await this.prisma.projectModuleSetting.upsert({
        where: { projectId_module: { projectId, module: ModuleCode.WIR } },
        update: { extra },
        create: { projectId, module: ModuleCode.WIR, extra },
        select: { extra: true },
      });
      return { extra: rec.extra };
    } catch (e: any) {
      if (e?.code === 'P2003') throw new NotFoundException('Project not found');
      throw e;
    }
  }
}
