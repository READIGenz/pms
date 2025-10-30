//pms-backend/src/modules/project-modules/wir/wir.admin.controller.ts
import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt.guard';
import { WirService } from './wir.service';
import { Request as ExpressRequest } from 'express';

@UseGuards(JwtAuthGuard)
@Controller('admin/projects/:projectId/wir')
export class WirAdminController {
  constructor(private svc: WirService) {}

  @Get()
  async list(@Param('projectId') projectId: string) {
    const list = await this.svc.list(projectId);
    return { records: list };
  }

  @Get(':wirId')
  async get(@Param('projectId') projectId: string, @Param('wirId') wirId: string) {
    return await this.svc.get(projectId, wirId);
  }

 @Post()
async create(
  @Param('projectId') projectId: string,
  @Body() body: any,
  @Req() req: Request,
) {
  const userId = (req as any)?.user?.sub as string | undefined;
  return await this.svc.create(projectId, { ...(body || {}), title: body?.title || 'Inspection Request' }, userId);
}

@Patch(':wirId')
async update(@Param('projectId') projectId: string, @Param('wirId') wirId: string, @Body() body: any, @Req() req: Request) {
  return await this.svc.update(projectId, wirId, body || {}, req);
}

  @Post(':wirId/submit')
  async submit(@Param('projectId') projectId: string, @Param('wirId') wirId: string, @Body() body: any) {
    const role = (body?.role ?? body?.userRole ?? '').toString();
    return await this.svc.submit(projectId, wirId, role);
  }

  @Post(':wirId/recommend')
  async recommend(@Param('projectId') projectId: string, @Param('wirId') wirId: string, @Body() body: any) {
    const role = (body?.role ?? body?.userRole ?? '').toString();
    return await this.svc.recommend(projectId, wirId, role);
  }

  @Post(':wirId/approve')
  async approve(@Param('projectId') projectId: string, @Param('wirId') wirId: string, @Body() body: any) {
    const role = (body?.role ?? body?.userRole ?? '').toString();
    return await this.svc.approve(projectId, wirId, role);
  }

  @Post(':wirId/reject')
  async reject(@Param('projectId') projectId: string, @Param('wirId') wirId: string, @Body() body: any) {
    const role = (body?.role ?? body?.userRole ?? '').toString();
    return await this.svc.reject(projectId, wirId, role);
  }
}
