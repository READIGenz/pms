// src/modules/admin/ref/checklist/admin.checklists.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CreateRefChecklistDto, UpdateRefChecklistDto } from './checklists.dto';

type Discipline = 'Civil' | 'MEP' | 'Finishes' | 'Architecture';
type Status = 'Active' | 'Draft' | 'Inactive' | 'Archived';

type ListArgs = {
  q?: string;
  discipline?: Discipline | '';
  stageLabel?: string;
  status?: Status | '';
  aiDefault?: boolean | undefined; // optional filter (when defined, filter by exact value)
  page: number;
  pageSize: number;
};

/** Parse "1.2.3" (accepts "1.2" or "1") into parts. Invalid/negative segments → 0. */
function parseSemverLabel(
  label?: string | null,
): { major: number; minor: number; patch: number; normLabel: string | null } {
  const clean = (label || '').trim();
  if (!clean) return { major: 1, minor: 0, patch: 0, normLabel: null };

  const parts = clean.split('.').slice(0, 3);
  const nums = parts.map((p) => {
    const n = parseInt(p, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  });
  const [major = 0, minor = 0, patch = 0] = nums;
  const normLabel = `${major}.${minor}.${patch}`;
  return { major, minor, patch, normLabel };
}

/** Build semver fields from either a label or a legacy numeric version. */
function buildVersionFields(input: {
  versionLabel?: string | null | undefined;
  version?: number | null | undefined;
}) {
  if (input.versionLabel !== undefined) {
    const { major, minor, patch, normLabel } = parseSemverLabel(input.versionLabel);
    // keep legacy numeric "version" aligned to major (min 1)
    const legacy = major > 0 ? major : 1;
    return {
      version: legacy,
      versionLabel: normLabel,
      versionMajor: major || 1,
      versionMinor: minor,
      versionPatch: patch,
    };
  }

  // fallback to legacy numeric "version"
  const v = Number(input.version ?? 1);
  const legacy = Number.isFinite(v) && v > 0 ? Math.floor(v) : 1;
  return {
    version: legacy,
    versionLabel: `${legacy}.0.0`,
    versionMajor: legacy,
    versionMinor: 0,
    versionPatch: 0,
  };
}

@Injectable()
export class AdminChecklistsService {
  constructor(private prisma: PrismaService) {}

  async list({ q, discipline, stageLabel, status, aiDefault, page, pageSize }: ListArgs) {
    const where: any = {};

    if (q) {
      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { title: { contains: q, mode: 'insensitive' } },
        { stageLabel: { contains: q, mode: 'insensitive' } },
        { versionLabel: { contains: q, mode: 'insensitive' } }, // allow search by "1.2.3"
      ];
    }
    if (discipline) where.discipline = discipline;
    if (typeof status === 'string' && status) where.status = status;
    if (stageLabel) where.stageLabel = { contains: stageLabel, mode: 'insensitive' };
    if (typeof aiDefault === 'boolean') where.aiDefault = aiDefault;

    const skip = Math.max(0, (page - 1) * pageSize);
    const take = Math.max(1, Math.min(pageSize, 200));

    const [rawItems, total] = await Promise.all([
      this.prisma.refChecklist.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        skip,
        take,
        include: {
          _count: { select: { items: true } },
        },
      }),
      this.prisma.refChecklist.count({ where }),
    ]);

    // Flatten _count.items → itemsCount for the FE (ChecklistLib.tsx reads either itemsCount or items.length)
    const items = rawItems.map((r: any) => {
      const { _count, ...rest } = r;
      return { ...rest, itemsCount: _count?.items ?? 0 };
    });

    return { items, total };
  }

  async getOne(id: string) {
    const r = await this.prisma.refChecklist.findUnique({
      where: { id },
      include: {
        _count: { select: { items: true } },
        // If you also want to return the actual items, uncomment:
        // items: true,
      },
    });
    if (!r) return null;
    const { _count, ...rest } = r as any;
    return { ...rest, itemsCount: _count?.items ?? 0 };
  }

  create(dto: CreateRefChecklistDto) {
    const data = this.cleanCreate(dto);
    return this.prisma.refChecklist.create({ data });
  }

  update(id: string, dto: UpdateRefChecklistDto) {
    const data = this.cleanUpdate(dto);
    return this.prisma.refChecklist.update({ where: { id }, data });
  }

  remove(id: string) {
    return this.prisma.refChecklist.delete({ where: { id } });
  }

  /** Normalize payload for CREATE (always sets version fields). */
  private cleanCreate(d: CreateRefChecklistDto) {
    const vf = buildVersionFields({ versionLabel: d.versionLabel, version: d.version });

    return {
      code: d.code ?? null, // FE may send ""; coerce to null at controller if needed
      title: String(d.title || '').trim(),
      discipline: d.discipline, // 'Civil' | 'MEP' | 'Finishes' | 'Architecture'
      stageLabel: d.stageLabel ?? null,

      tags: Array.isArray(d.tags) ? d.tags : [],

      // legacy + new semver fields
      version: vf.version,
      versionLabel: vf.versionLabel,
      versionMajor: vf.versionMajor,
      versionMinor: vf.versionMinor,
      versionPatch: vf.versionPatch,

      aiDefault: typeof d.aiDefault === 'boolean' ? d.aiDefault : false,

      status: d.status || 'Draft',
    };
  }

  /**
   * Normalize payload for UPDATE.
   * Only touches version fields if caller sent `version` or `versionLabel`.
   * For other fields, preserve "undefined" (meaning: do not update).
   */
  private cleanUpdate(d: UpdateRefChecklistDto) {
    const touchesVersion =
      Object.prototype.hasOwnProperty.call(d, 'version') ||
      Object.prototype.hasOwnProperty.call(d, 'versionLabel');

    const versionData = touchesVersion
      ? (() => {
          const vf = buildVersionFields({ versionLabel: d.versionLabel, version: d.version });
          return {
            version: vf.version,
            versionLabel: vf.versionLabel,
            versionMajor: vf.versionMajor,
            versionMinor: vf.versionMinor,
            versionPatch: vf.versionPatch,
          };
        })()
      : {};

    return {
      code: d.code === undefined ? undefined : d.code ?? null,
      title: d.title === undefined ? undefined : String(d.title || '').trim(),
      discipline: d.discipline === undefined ? undefined : d.discipline,
      stageLabel: d.stageLabel === undefined ? undefined : d.stageLabel ?? null,

      tags: d.tags === undefined ? undefined : Array.isArray(d.tags) ? d.tags : [],

      // Only include version fields when touched
      ...versionData,

      aiDefault: d.aiDefault === undefined ? undefined : !!d.aiDefault,

      status: d.status === undefined ? undefined : d.status,
    };
  }

  async stats() {
    const [total, active, draft, inactive, archived] = await Promise.all([
      this.prisma.refChecklist.count(),
      this.prisma.refChecklist.count({ where: { status: 'Active' } }),
      this.prisma.refChecklist.count({ where: { status: 'Draft' } }),
      this.prisma.refChecklist.count({ where: { status: 'Inactive' } }),
      this.prisma.refChecklist.count({ where: { status: 'Archived' } }),
    ]);

    return {
      total,
      byStatus: {
        Active: active,
        Draft: draft,
        Inactive: inactive,
        Archived: archived,
      } as Record<Status, number>,
    };
  }
}
