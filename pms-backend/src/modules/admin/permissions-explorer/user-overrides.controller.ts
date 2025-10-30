//src/modules/admin/permissions-explorer/user-overrides.controller.ts

import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { AdminUserOverridesService } from './user-overrides.service';

@UseGuards(JwtAuthGuard)
@Controller('admin/permissions/projects/:projectId/users/:userId/overrides')
export class AdminUserOverridesController {
  constructor(private svc: AdminUserOverridesService) {}

  @Get()
  async get(@Param('projectId') projectId: string, @Param('userId') userId: string) {
    const matrix = await this.svc.get(projectId, userId);
    return { projectId, userId, matrix };
  }

  @Put()
  async put(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Body() body: { matrix: unknown },
  ) {
    const matrix = await this.svc.upsert(projectId, userId, body?.matrix);
    return { projectId, userId, matrix };
  }

  @Post('reset')
  async reset(@Param('projectId') projectId: string, @Param('userId') userId: string) {
    await this.svc.reset(projectId, userId);
    return { ok: true, projectId, userId };
  }
}
