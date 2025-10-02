import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { UpsertTemplateDto } from './dto/template.dto';

// API <-> DB role mapping (only the hyphenated one differs)
const OUT = { IH_PMT: 'IH-PMT' } as const;         // DB -> API
const IN  = { 'IH-PMT': 'IH_PMT' } as const;       // API -> DB

@Injectable()
export class AdminPermissionsService {
  constructor(private prisma: PrismaService) {}

  async listTemplates() {
    const rows = await this.prisma.permissionTemplate.findMany({ orderBy: { role: 'asc' } });
    return rows.map((r) => ({
      id: r.id,
      role: (OUT as any)[r.role] ?? r.role,   // "IH_PMT" -> "IH-PMT"
      matrix: r.matrix,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async getByRole(roleParam: string) {
    const dbRole = (IN as any)[roleParam] ?? roleParam; // "IH-PMT" -> "IH_PMT"
    const row = await this.prisma.permissionTemplate.findUnique({ where: { role: dbRole as any } });
    if (!row) throw new NotFoundException(`Template for role ${roleParam} not found`);
    return {
      id: row.id,
      role: (OUT as any)[row.role] ?? row.role,
      matrix: row.matrix,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async upsert(dto: UpsertTemplateDto) {
    const dbRole = (IN as any)[dto.role] ?? dto.role;

    // Guardrail: Letters (LTR) cannot review/approve
    const m = dto.matrix?.['LTR'];
    if (m) { m.review = false; m.approve = false; }

    const row = await this.prisma.permissionTemplate.upsert({
      where: { role: dbRole as any },
      update: { matrix: dto.matrix },
      create: { role: dbRole as any, matrix: dto.matrix },
    });

    return {
      id: row.id,
      role: (OUT as any)[row.role] ?? row.role,
      matrix: row.matrix,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
