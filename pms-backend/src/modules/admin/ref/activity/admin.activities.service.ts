// src/modules/admin/ref/admin.activities.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CreateRefActivityDto, UpdateRefActivityDto } from './activities.dto';

type ListArgs = {
  q?: string;
  discipline?: 'Civil' | 'MEP' | 'Finishes' | '';
  stageLabel?: string;
  status?: 'Active' | 'Draft' | 'Inactive' | 'Archived' | '';
  page: number;
  pageSize: number;
};

/** Parse "1.2.3" (also accepts "1.2" or "1") into parts. Invalid/negative segments → 0. */
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
function buildVersionFields(input: { versionLabel?: string | null | undefined; version?: number | null | undefined }) {
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
export class AdminActivitiesService {
  constructor(private prisma: PrismaService) {}

  async list({ q, discipline, stageLabel, status, page, pageSize }: ListArgs) {
    const where: any = {};
    if (q) {
      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { title: { contains: q, mode: 'insensitive' } },
        { stageLabel: { contains: q, mode: 'insensitive' } },
        { versionLabel: { contains: q, mode: 'insensitive' } }, // allow searching by version label
      ];
    }
    if (discipline) where.discipline = discipline;
    if (typeof status === 'string' && status) where.status = status;
    if (stageLabel) where.stageLabel = { contains: stageLabel, mode: 'insensitive' };

    const skip = Math.max(0, (page - 1) * pageSize);
    const take = Math.max(1, Math.min(pageSize, 200));

    const [items, total] = await Promise.all([
      this.prisma.refActivity.findMany({
        where,
        // If you want semver-first sorting, swap the orderBy below with the array.
        // orderBy: [
        //   { versionMajor: 'desc' },
        //   { versionMinor: 'desc' },
        //   { versionPatch: 'desc' },
        //   { updatedAt: 'desc' },
        // ],
        orderBy: [{ updatedAt: 'desc' }],
        skip,
        take,
      }),
      this.prisma.refActivity.count({ where }),
    ]);

    return { items, total };
  }

  getOne(id: string) {
    return this.prisma.refActivity.findUnique({ where: { id } });
  }

  create(dto: CreateRefActivityDto) {
    const data = this.cleanCreate(dto);
    return this.prisma.refActivity.create({ data });
  }

  update(id: string, dto: UpdateRefActivityDto) {
    const data = this.cleanUpdate(dto);
    return this.prisma.refActivity.update({ where: { id }, data });
  }

  remove(id: string) {
    return this.prisma.refActivity.delete({ where: { id } });
  }

  /** Normalize payload for CREATE (always sets version fields). */
  private cleanCreate(d: CreateRefActivityDto) {
    const vf = buildVersionFields({ versionLabel: d.versionLabel, version: d.version });

    return {
      code: d.code ?? null,
      title: String(d.title || '').trim(),
      discipline: d.discipline, // 'Civil' | 'MEP' | 'Finishes'
      stageLabel: d.stageLabel ?? null,
      phase: Array.isArray(d.phase) ? d.phase : [],
      element: Array.isArray(d.element) ? d.element : [],
      system: Array.isArray(d.system) ? d.system : [],
      nature: Array.isArray(d.nature) ? d.nature : [],
      method: Array.isArray(d.method) ? d.method : [],

      // legacy + new semver fields
      version: vf.version,
      versionLabel: vf.versionLabel,
      versionMajor: vf.versionMajor,
      versionMinor: vf.versionMinor,
      versionPatch: vf.versionPatch,

      notes: d.notes ?? null,
      status: d.status || 'Draft',
    };
  }

  /** Normalize payload for UPDATE (only touches version fields if caller sent them). */
  private cleanUpdate(d: UpdateRefActivityDto) {
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

      phase: d.phase === undefined ? undefined : Array.isArray(d.phase) ? d.phase : [],
      element: d.element === undefined ? undefined : Array.isArray(d.element) ? d.element : [],
      system: d.system === undefined ? undefined : Array.isArray(d.system) ? d.system : [],
      nature: d.nature === undefined ? undefined : Array.isArray(d.nature) ? d.nature : [],
      method: d.method === undefined ? undefined : Array.isArray(d.method) ? d.method : [],

      // Only include version fields when touched
      ...versionData,

      notes: d.notes === undefined ? undefined : d.notes ?? null,
      status: d.status === undefined ? undefined : d.status,
    };
  }

  async stats() {
    const [total, active, draft, inactive, archived] = await Promise.all([
      this.prisma.refActivity.count(),
      this.prisma.refActivity.count({ where: { status: 'Active' } }),
      this.prisma.refActivity.count({ where: { status: 'Draft' } }),
      this.prisma.refActivity.count({ where: { status: 'Inactive' } }),
      this.prisma.refActivity.count({ where: { status: 'Archived' } }),
    ]);

    return {
      total,
      byStatus: {
        Active: active,
        Draft: draft,
        Inactive: inactive,
        Archived: archived,
      } as Record<'Active' | 'Draft' | 'Inactive' | 'Archived', number>,
    };
  }
}
