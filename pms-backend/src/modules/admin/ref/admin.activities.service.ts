// src/modules/admin/ref/admin.activities.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService} from '../../../prisma/prisma.service';

type ListArgs = {
  q?: string;
  discipline?: 'Civil' | 'MEP' | 'Finishes' | '';
  stageLabel?: string;
  status?: 'Active' | 'Draft' | 'Inactive' | 'Archived' | '';
  page: number;
  pageSize: number;
};

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
      ];
    }
    if (discipline) where.discipline = discipline;
    if (typeof status === 'string' && status) where.status = status;
    if (stageLabel) where.stageLabel = { contains: stageLabel, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      this.prisma.refActivity.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.refActivity.count({ where }),
    ]);

    return { items, total };
  }

  getOne(id: string) {
    return this.prisma.refActivity.findUnique({ where: { id } });
  }

  create(dto: any) {
    const data = this.clean(dto);
    return this.prisma.refActivity.create({ data });
  }

  update(id: string, dto: any) {
    const data = this.clean(dto);
    return this.prisma.refActivity.update({ where: { id }, data });
  }

  remove(id: string) {
    return this.prisma.refActivity.delete({ where: { id } });
  }

  private clean(d: any) {
    return {
      code: d.code ?? null, // optional unique
      title: String(d.title || '').trim(),
      discipline: d.discipline, // 'Civil' | 'MEP' | 'Finishes'
      stageLabel: d.stageLabel ?? null,
      phase: Array.isArray(d.phase) ? d.phase : [],
     element: Array.isArray(d.element) ? d.element : [],
      system: Array.isArray(d.system) ? d.system : [],
      nature: Array.isArray(d.nature) ? d.nature : [],
      method: Array.isArray(d.method) ? d.method : [],
      version: Number.isFinite(+d.version) ? +d.version : 1,
      notes: d.notes ?? null,
      status: d.status || 'Draft',
    };
  }
}
