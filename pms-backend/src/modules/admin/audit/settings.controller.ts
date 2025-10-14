// src/modules/admin/audit/settings.controller.ts

import { Controller, Get, Put, Body, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtAuthGuard } from '../../../common/guards/jwt.guard';

@Controller('admin/audit/settings')
@UseGuards(JwtAuthGuard)
export class AuditSettingsController {
  constructor(private prisma: PrismaService) {}

  private ensureSuperAdmin(req: any) {
    if (!req?.user?.isSuperAdmin) throw new ForbiddenException('Super admin only');
  }

  @Get()
  async get(@Req() req: any) {
    this.ensureSuperAdmin(req);
    const s = await this.prisma.adminAuditSetting.findUnique({ where: { id: 1 } });
    return { ok: true, settings: s };
  }

  @Put()
  async update(@Req() req: any, @Body() body: { assignmentsEnabled?: boolean }) {
    this.ensureSuperAdmin(req);
    const { assignmentsEnabled } = body || {};
    const user = req.user || {};
    const fullName =
      [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ').trim() || 'User';

    const updated = await this.prisma.adminAuditSetting.upsert({
      where: { id: 1 },
      update: {
        assignmentsEnabled: assignmentsEnabled ?? undefined,
        updatedByUserId: user.sub ?? 'system',
        updatedByName: fullName,
      },
      create: {
        id: 1,
        assignmentsEnabled: assignmentsEnabled ?? true,
        updatedByUserId: user.sub ?? 'system',
        updatedByName: fullName,
      },
    });

    return { ok: true, settings: updated };
  }
}
