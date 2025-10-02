import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { AdminProjectOverridesService } from './project-overrides.service';

@Controller('admin/permissions/projects')
export class AdminProjectOverridesController {
  constructor(private svc: AdminProjectOverridesService) {}

  // GET /admin/permissions/projects/:projectId/overrides/:role
  @Get(':projectId/overrides/:role')
  async getEffective(
    @Param('projectId') projectId: string,
    @Param('role') role: string,
  ) {
    return this.svc.getEffective(projectId, role);
  }

  // PUT /admin/permissions/projects/:projectId/overrides/:role
  @Put(':projectId/overrides/:role')
  async upsert(
    @Param('projectId') projectId: string,
    @Param('role') role: string,
    @Body() body: { matrix: any },
  ) {
    return this.svc.upsert(projectId, role, body.matrix);
  }

  // POST /admin/permissions/projects/:projectId/overrides/:role/reset
  @Post(':projectId/overrides/:role/reset')
  async reset(
    @Param('projectId') projectId: string,
    @Param('role') role: string,
  ) {
    return this.svc.reset(projectId, role);
  }
}
