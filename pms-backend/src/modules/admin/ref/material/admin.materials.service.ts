// src/modules/admin/ref/material/admin.materials.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CreateRefMaterialDto, UpdateRefMaterialDto } from './materials.dto';

type ListArgs = {
  q?: string;
  discipline?: string | '';
  category?: string | '';
  status?: 'Active' | 'Draft' | 'Inactive' | 'Archived' | '';
  page: number;
  pageSize: number;
};

// Map UI strings (with dots) -> Prisma enum member names (no $Enums import)
const toMatDiscipline = (
  s?: string | null
): 'Civil' | 'Architecture' | 'MEP_ELE' | 'MEP_PHE' | 'MEP_HVC' | 'Finishes' | null => {
  switch (s) {
    case 'Civil': return 'Civil';
    case 'Architecture': return 'Architecture';
    case 'MEP.ELE': return 'MEP_ELE';
    case 'MEP.PHE': return 'MEP_PHE';
    case 'MEP.HVC': return 'MEP_HVC';
    case 'Finishes': return 'Finishes';
    default: return null;
  }
};

/** Parse "1.2.3" (or "1.2", "1") to parts. Non-numeric segments become 0. Negative -> 0. */
function parseSemverLabel(label?: string | null): { major: number; minor: number; patch: number; normLabel: string | null } {
  const clean = (label || '').trim();
  if (!clean) return { major: 1, minor: 0, patch: 0, normLabel: null };
  const parts = clean.split('.').slice(0, 3);
  const nums = parts.map(p => {
    const n = parseInt(p, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  });
  const [major = 0, minor = 0, patch = 0] = nums;
  const normLabel = `${major}.${minor}.${patch}`;
  return { major, minor, patch, normLabel };
}

/** Build semver fields from either a label or a legacy numeric version. */
function buildVersionFields(input: { versionLabel?: string | null; version?: number | null | undefined }) {
  // Prefer versionLabel if present (including empty string -> treated as null)
  if (input.versionLabel !== undefined) {
    const { major, minor, patch, normLabel } = parseSemverLabel(input.versionLabel);
    return {
      version: Number.isFinite(input.version) && (input.version as number) > 0 ? (input.version as number) : major || 1, // keep legacy in some sensible way
      versionLabel: normLabel,
      versionMajor: major || 1,
      versionMinor: minor,
      versionPatch: patch,
    };
  }

  // Fallback to legacy numeric version
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
export class AdminMaterialsService {
  constructor(private readonly prisma: PrismaService) {}

  async stats() {
    const [active, draft, inactive, archived, total] = await Promise.all([
      this.prisma.refMaterial.count({ where: { status: 'Active' } }),
      this.prisma.refMaterial.count({ where: { status: 'Draft' } }),
      this.prisma.refMaterial.count({ where: { status: 'Inactive' } }),
      this.prisma.refMaterial.count({ where: { status: 'Archived' } }),
      this.prisma.refMaterial.count(),
    ]);
    return {
      total,
      byStatus: { Active: active, Draft: draft, Inactive: inactive, Archived: archived },
    };
  }

  async list(args: ListArgs) {
    const { q, discipline, category, status, page, pageSize } = args;

    const where: any = {};

    if (q && q.trim()) {
      const qt = q.trim();
      where.OR = [
        { name: { contains: qt, mode: 'insensitive' } },
        { code: { contains: qt, mode: 'insensitive' } },
        { manufacturer: { contains: qt, mode: 'insensitive' } },
        { model: { contains: qt, mode: 'insensitive' } },
        { standards: { has: qt } },
        { keyProps: { has: qt } },
        { aliases: { has: qt } },
        // Optional: allow searching versionLabel
        { versionLabel: { contains: qt, mode: 'insensitive' } },
      ];
    }

    if (discipline) {
      const d = toMatDiscipline(discipline);
      if (d) where.discipline = d;
    }
    if (category) where.category = { contains: category, mode: 'insensitive' };
    if (status) where.status = status;

    const skip = Math.max(0, (page - 1) * pageSize);
    const take = Math.max(1, Math.min(pageSize, 200));

    const [items, total] = await Promise.all([
      this.prisma.refMaterial.findMany({
        where,
        // If you want semver sort by default, uncomment the array orderBy
        // orderBy: [
        //   { versionMajor: 'desc' },
        //   { versionMinor: 'desc' },
        //   { versionPatch: 'desc' },
        //   { updatedAt: 'desc' },
        // ],
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.refMaterial.count({ where }),
    ]);

    return { items, total };
  }

  async getOne(id: string) {
    return this.prisma.refMaterial.findUniqueOrThrow({ where: { id } });
  }

  async create(dto: CreateRefMaterialDto) {
    // Accept versionLabel from DTO if you add it there; otherwise we also look at (dto as any).versionLabel
    const versionLabel = (dto as any).versionLabel as string | undefined;
    const versionFields = buildVersionFields({ versionLabel, version: dto.version });

    return this.prisma.refMaterial.create({
      data: {
        code: dto.code ?? null,
        name: dto.name,
        discipline: toMatDiscipline(dto.discipline), // nullable
        category: dto.category ?? null,
        manufacturer: dto.manufacturer ?? null,
        model: dto.model ?? null,
        standards: dto.standards ?? [],
        fireRating: dto.fireRating ?? null,
        keyProps: dto.keyProps ?? [],
        aliases: dto.aliases ?? [],
        properties: dto.properties ?? undefined,

        // legacy + new semver fields
        version: versionFields.version,
        versionLabel: versionFields.versionLabel,
        versionMajor: versionFields.versionMajor,
        versionMinor: versionFields.versionMinor,
        versionPatch: versionFields.versionPatch,

        notes: dto.notes ?? null,
        status: dto.status ?? 'Active',
      },
    });
  }

  async update(id: string, dto: UpdateRefMaterialDto) {
    // Accept versionLabel if present in payload
    const hasVersionLabel = Object.prototype.hasOwnProperty.call(dto as any, 'versionLabel');
    const hasVersion = Object.prototype.hasOwnProperty.call(dto, 'version');

    let versionData: any = {};
    if (hasVersionLabel || hasVersion) {
      const versionLabel = (dto as any).versionLabel as string | undefined;
      const vf = buildVersionFields({ versionLabel, version: dto.version as any });
      versionData = {
        version: vf.version,
        versionLabel: vf.versionLabel,
        versionMajor: vf.versionMajor,
        versionMinor: vf.versionMinor,
        versionPatch: vf.versionPatch,
      };
    }

    return this.prisma.refMaterial.update({
      where: { id },
      data: {
        code: dto.code ?? undefined,
        name: dto.name ?? undefined,

        discipline:
          dto.discipline === undefined ? undefined : toMatDiscipline(dto.discipline),
        category: dto.category ?? undefined,
        manufacturer: dto.manufacturer ?? undefined,
        model: dto.model ?? undefined,
        standards: dto.standards ?? undefined,
        fireRating: dto.fireRating ?? undefined,
        keyProps: dto.keyProps ?? undefined,
        aliases: dto.aliases ?? undefined,
        properties: dto.properties ?? undefined,

        // Only touch version fields if the caller sent them
        ...versionData,

        notes: dto.notes ?? undefined,
        status: dto.status ?? undefined,
      },
    });
  }

  async remove(id: string) {
    await this.prisma.refMaterial.delete({ where: { id } });
    return { ok: true };
  }
}
