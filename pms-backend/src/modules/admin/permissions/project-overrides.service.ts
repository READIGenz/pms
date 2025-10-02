import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

// API <-> DB role mapping (only the hyphenated one differs)
const OUT = { IH_PMT: 'IH-PMT' } as const;   // DB -> API
const IN  = { 'IH-PMT': 'IH_PMT' } as const; // API -> DB

type Matrix = Record<string, { view:boolean; raise:boolean; review:boolean; approve:boolean; close:boolean }>;

@Injectable()
export class AdminProjectOverridesService {
  constructor(private prisma: PrismaService) {}

  /** Get override if present; else return template; else 404 */
  async getEffective(projectId: string, roleParam: string) {
    const role = (IN as any)[roleParam] ?? roleParam;

    // 1) Try override
    const override = await this.prisma.permissionProjectOverride.findUnique({
      where: { projectId_role: { projectId, role: role as any } },
    });
    if (override) {
      const matrix = this.guardrails(override.matrix as Matrix);
      return { source: 'override', projectId, role: (OUT as any)[role] ?? role, matrix };
    }

    // 2) Fallback to template
    const tpl = await this.prisma.permissionTemplate.findUnique({
      where: { role: role as any },
      select: { matrix: true },
    });
    if (tpl?.matrix) {
      const matrix = this.guardrails(tpl.matrix as Matrix);
      return { source: 'template', projectId, role: (OUT as any)[role] ?? role, matrix };
    }

    // 3) Nothing found
    throw new NotFoundException(`No override or template for role ${roleParam}`);
  }

  /** Upsert override matrix */
  async upsert(projectId: string, roleParam: string, matrix: Matrix) {
    const role = (IN as any)[roleParam] ?? roleParam;

    const final = this.guardrails(matrix);
    const row = await this.prisma.permissionProjectOverride.upsert({
      where: { projectId_role: { projectId, role: role as any } },
      update: { matrix: final },
      create: { projectId, role: role as any, matrix: final },
    });

    return {
      source: 'override',
      projectId,
      role: (OUT as any)[row.role] ?? row.role,
      matrix: row.matrix as Matrix,
    };
  }

  /** Delete override so it falls back to template; return template matrix */
  async reset(projectId: string, roleParam: string) {
    const role = (IN as any)[roleParam] ?? roleParam;

    // delete if exists
    await this.prisma.permissionProjectOverride.deleteMany({
      where: { projectId, role: role as any },
    });

    // return template (or 404 if no template)
    const tpl = await this.prisma.permissionTemplate.findUnique({
      where: { role: role as any },
      select: { matrix: true },
    });

    if (!tpl?.matrix) {
      throw new NotFoundException(`No template for role ${roleParam} to reset from`);
    }

    const matrix = this.guardrails(tpl.matrix as Matrix);
    return { source: 'template', projectId, role: (OUT as any)[role] ?? role, matrix };
  }

  /** Guardrails: enforce invariants (e.g., LTR has no review/approve) */
  private guardrails(m: Matrix): Matrix {
    const copy: Matrix = JSON.parse(JSON.stringify(m ?? {}));
    if (copy.LTR) { copy.LTR.review = false; copy.LTR.approve = false; }
    // add other invariants if needed (e.g., approve ⇒ review, close ⇒ view)
    for (const mod of Object.keys(copy)) {
      const row = copy[mod];
      if (!row) continue;
      if (row.approve && !row.review) row.review = true;
      if (row.close && !row.view) row.view = true;
    }
    return copy;
  }
}
