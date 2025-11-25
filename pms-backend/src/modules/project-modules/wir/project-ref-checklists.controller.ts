// pms-backend/src/modules/project-modules/wir/project-ref-checklists.controller.ts
import { Controller, Get, Param, Query, NotFoundException } from '@nestjs/common';
import { PrismaService } from './../../../prisma/prisma.service';

@Controller('projects/:projectId/ref/checklists')
export class ProjectRefChecklistsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /projects/:projectId/ref/checklists?status=Active&page=1&pageSize=200&discipline=Civil
   * Returns a paginated list (shape compatible with unwrapList(...)).
   */
  @Get()
  async list(
    @Param('projectId') projectId: string, // kept for scoping/consistency
    @Query('status') status?: string,
    @Query('discipline') discipline?: string,
    @Query('page') pageQ?: string,
    @Query('pageSize') pageSizeQ?: string,
  ) {
    const page = Math.max(1, parseInt(String(pageQ ?? '1'), 10) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(String(pageSizeQ ?? '50'), 10) || 50));
    const skip = (page - 1) * pageSize;

    // Optional filters
    const where: any = {};
    if (status) where.status = status as any;
    if (discipline) {
      // allow "Civil", "MEP", "Finishes" or comma-separated
      const parts = String(discipline)
        .split(/[;,/]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length === 1) {
        where.discipline = parts[0] as any;
      } else if (parts.length > 1) {
        where.OR = parts.map((p) => ({ discipline: p as any }));
      }
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.refChecklist.count({ where }),
      this.prisma.refChecklist.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { code: 'asc' }],
        skip,
        take: pageSize,
        include: { _count: { select: { items: true } } },
      }),
    ]);

    return {
      items: rows.map((c: any) => ({
        id: c.id,
        code: c.code ?? null,
        title: c.title ?? null,
        discipline: c.discipline ?? null,
        status: c.status ?? null,
        version: c.version ?? null,
        versionLabel: c.versionLabel ?? null,
        stageLabel: c.stageLabel ?? null,
        tags: c.tags ?? null,
        itemsCount: c._count?.items ?? 0,
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * GET /projects/:projectId/ref/checklists/:id?includeItems=1
   */
  @Get(':id')
  async getOne(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Query('includeItems') includeItems?: string,
  ) {
    const withItems = includeItems === '1' || includeItems === 'true';

    if (withItems) {
      const checklist = await this.prisma.refChecklist.findUnique({
        where: { id },
        include: {
          items: { orderBy: [{ seq: 'asc' as const }, { id: 'asc' as const }] },
          _count: { select: { items: true } },
        },
      });

      if (!checklist) throw new NotFoundException('Checklist not found');

      return {
        data: {
          id: checklist.id,
          code: checklist.code,
          title: checklist.title,
          discipline: (checklist as any).discipline ?? null,
          status: (checklist as any).status ?? null,
          version: (checklist as any).version ?? null,
          versionLabel: (checklist as any).versionLabel ?? null,
          stageLabel: (checklist as any).stageLabel ?? null,
          tags: (checklist as any).tags ?? null,
          itemsCount: checklist._count?.items ?? 0,
          items: (checklist.items || []).map((it: any) => ({
            id: it.id,
            checklistId: it.checklistId,
            seq: it.seq,
            text: it.text,
            requirement: (it as any).requirement ?? null,
            itemCode: (it as any).itemCode ?? null,
            critical: (it as any).critical ?? null,
            aiEnabled: (it as any).aiEnabled ?? null,
            aiConfidence: (it as any).aiConfidence ?? null,
            units: (it as any).units ?? null,
            tolerance: (it as any).tolerance ?? null, // "<=" | "+-" | "=" | null
            base: (it as any).base ?? null,
            plus: (it as any).plus ?? null,
            minus: (it as any).minus ?? null,
            tags: (it as any).tags ?? null,
            value: (it as any).value ?? null,
          })),
        },
      };
    }

    const checklist = await this.prisma.refChecklist.findUnique({
      where: { id },
      include: { _count: { select: { items: true } } },
    });

    if (!checklist) throw new NotFoundException('Checklist not found');

    return {
      data: {
        id: checklist.id,
        code: checklist.code,
        title: checklist.title,
        discipline: (checklist as any).discipline ?? null,
        status: (checklist as any).status ?? null,
        version: (checklist as any).version ?? null,
        versionLabel: (checklist as any).versionLabel ?? null,
        stageLabel: (checklist as any).stageLabel ?? null,
        tags: (checklist as any).tags ?? null,
        itemsCount: (checklist as any)._count?.items ?? 0,
      },
    };
  }
}
