import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

/** Local-only types (kept in this file as requested) */
type Actions = 'view' | 'raise' | 'review' | 'approve' | 'close';
type ModuleCode =
  | 'WIR' | 'MIR' | 'CS' | 'DPR' | 'MIP' | 'DS'
  | 'RFC' | 'OBS' | 'DLP' | 'LTR' | 'FDB' | 'MAITRI' | 'DASHBOARD';
type DenyValue = 'inherit' | 'deny';
type UserOverrideMatrix = Partial<Record<ModuleCode, Partial<Record<Actions, DenyValue>>>>;

const MODULES: readonly ModuleCode[] = [
  'WIR','MIR','CS','DPR','MIP','DS','RFC','OBS','DLP','LTR','FDB','MAITRI','DASHBOARD'
] as const;
const ACTIONS: readonly Actions[] = ['view','raise','review','approve','close'] as const;

@Injectable()
export class AdminUserOverridesService {
  constructor(private prisma: PrismaService) {}

  async get(projectId: string, userId: string): Promise<UserOverrideMatrix> {
    const row = await this.prisma.permissionUserOverride.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { matrix: true },
    });
    return (row?.matrix ?? {}) as UserOverrideMatrix;
  }

  async upsert(projectId: string, userId: string, incoming: unknown): Promise<UserOverrideMatrix> {
    const matrix = normalize(incoming);
    await this.prisma.permissionUserOverride.upsert({
      where: { projectId_userId: { projectId, userId } },
      update: { matrix },
      create: { projectId, userId, matrix },
    });
    return matrix;
  }

  async reset(projectId: string, userId: string): Promise<void> {
    await this.prisma.permissionUserOverride.deleteMany({ where: { projectId, userId } });
  }
}

/** Keep only valid modules/actions; values restricted to 'inherit'|'deny'; never set LTR.review/approve */
function normalize(input: any): UserOverrideMatrix {
  const out: UserOverrideMatrix = {};
  if (!input || typeof input !== 'object') return out;

  for (const mod of MODULES) {
    const row = input[mod];
    if (!row || typeof row !== 'object') continue;

    const dst: Partial<Record<Actions, DenyValue>> = {};
    for (const act of ACTIONS) {
      const v = row[act];
      if (v === 'inherit' || v === 'deny') dst[act] = v;
    }

    // Guardrails for Letters:
    if (mod === 'LTR') {
      delete dst.review;
      delete dst.approve;
    }

    if (Object.keys(dst).length) out[mod] = dst;
  }
  return out;
}
