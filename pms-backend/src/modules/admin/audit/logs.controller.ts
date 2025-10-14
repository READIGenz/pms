// src/modules/admin/audit/logs.controller.ts
import { Controller, Get, Query, UseGuards, ForbiddenException, Req } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtAuthGuard } from '../../../common/guards/jwt.guard';
import { AuditAction, Prisma } from '@prisma/client';
import { AuditService } from './audit.service';

@UseGuards(JwtAuthGuard)
@Controller('admin/audit/logs')
export class AuditLogsController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService, // <-- inject
  ) {}

  private ensureSuperAdmin(req: any) {
    if (!req?.user?.isSuperAdmin) throw new ForbiddenException('Super admin only');
  }

  private isUuid(v?: string) {
    return !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
  }

  @Get()
  async list(
    @Req() req: any,
    @Query('skip') skip = '0',
    @Query('take') take = '50',
    @Query('action') action?: AuditAction | string,
    @Query('targetUserId') targetUserId?: string,
    @Query('q') q?: string,
  ) {
    this.ensureSuperAdmin(req);

    const _skip = Math.max(0, Number(skip) || 0);
    const _take = Math.min(200, Math.max(1, Number(take) || 50));

    // Always restrict to Assignments module
    const where: Prisma.AdminAuditLogWhereInput = { module: 'Assignments' };

    if (action && Object.values(AuditAction).includes(action as AuditAction)) {
      where.action = action as AuditAction;
    }
    if (targetUserId && this.isUuid(targetUserId)) {
      where.targetUserId = targetUserId;
    }

    if (q?.trim()) {
      const needle = q.trim();
      const or: Prisma.AdminAuditLogWhereInput[] = [
        { actorName: { contains: needle, mode: 'insensitive' } },
        { ip: { contains: needle, mode: 'insensitive' } },
        { userAgent: { contains: needle, mode: 'insensitive' } },
      ];

      if (this.isUuid(needle)) {
        or.push(
          { id: needle as any },
          { actorUserId: needle as any },
          { targetUserId: needle as any },
          { companyId: needle as any },
          { projectId: needle as any },
        );
      }

      where.OR = or;
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.adminAuditLog.findMany({
        where,
        skip: _skip,
        take: _take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          action: true,
          actorUserId: true,
          actorName: true,
          targetUserId: true,
          ip: true,
          userAgent: true,
          before: true,
          after: true,
          role: true,
          scopeType: true,
          companyId: true,
          projectId: true,
          module: true,
        },
      }),
      this.prisma.adminAuditLog.count({ where }),
    ]);

    // Enrich with names/codes (non-persistent)
    const enriched = await this.audit.enrichAssignmentRows(rows);

    return { ok: true, total, rows: enriched };
  }
}
