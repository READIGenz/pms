// pms-backend/src/modules/project-modules/wir/wir.controller.ts
import { Body, Controller, Get, Param, Patch, Post, UseGuards, Req, Delete, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt.guard';
import { WirService } from './wir.service';
import { Request as ExpressRequest } from 'express';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/wir')
export class WirController {
  constructor(private svc: WirService) {}

  private getUserId(req: ExpressRequest): string {
    // supports { sub } or { userId } in JWT payload
    const u: any = (req as any)?.user || {};
    return String(u.userId ?? u.sub ?? '');
  }

  @Get()
  async list(@Param('projectId') projectId: string, @Req() req: ExpressRequest) {
    const userId = this.getUserId(req);
    const list = await this.svc.list(projectId, userId);
    return list; // FE accepts array or {records:[]}; we return array directly
  }

  @Get(':wirId')
  async get(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Req() req: ExpressRequest,
  ) {
    const userId = this.getUserId(req);
    return await this.svc.get(projectId, wirId, userId);
  }

  @Post()
  async create(
    @Param('projectId') projectId: string,
    @Body() body: any,
    @Req() req: ExpressRequest,
  ) {
    const userId = this.getUserId(req);
    return await this.svc.create(
      projectId,
      { ...(body || {}), title: body?.title || 'Inspection Request' },
      userId,
    );
  }

  @Patch(':wirId')
  async update(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Body() body: any,
    @Req() req: ExpressRequest,
  ) {
    const userId = this.getUserId(req);
    return await this.svc.update(projectId, wirId, body || {}, userId);
  }

  /* ---- Actions ---- */
  @Post(':wirId/submit')
  async submit(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Body() body: any,
    @Req() req: ExpressRequest,
  ) {
    const role = (body?.role ?? body?.userRole ?? '').toString();
    const userId = this.getUserId(req); // enforce "only author can submit Draft"
    return await this.svc.submit(projectId, wirId, role, userId);
  }

  @Post(':wirId/recommend')
  async recommend(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Body() body: any,
  ) {
    const role = (body?.role ?? body?.userRole ?? '').toString();
    return await this.svc.recommend(projectId, wirId, role);
  }

  @Post(':wirId/approve')
  async approve(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Body() body: any,
  ) {
    const role = (body?.role ?? body?.userRole ?? '').toString();
    return await this.svc.approve(projectId, wirId, role);
  }

  @Post(':wirId/reject')
  async reject(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Body() body: any,
  ) {
    const role = (body?.role ?? body?.userRole ?? '').toString();
    return await this.svc.reject(projectId, wirId, role);
  }

  @Delete(':wirId')
  async remove(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Req() req: any,
  ) {
    // Optional guard: only author (Contractor) can hard-delete when status=Draft
    const userId = String(req.user?.userId ?? req.user?.sub ?? '');
    const ok = await this.svc.canDeleteDraft(projectId, wirId, userId);
    if (!ok) throw new ForbiddenException('Only the author can delete a Draft WIR.');

    return this.svc.deleteDraft(projectId, wirId);
  }

  // pms-backend/src/modules/project-modules/wir/wir.controller.ts
@Get(':wirId/history')
async history(
  @Param('projectId') projectId: string,
  @Param('wirId') wirId: string,
) {
  return this.svc.history(projectId, wirId);
}

@Post(':wirId/reschedule')
async reschedule(
  @Param('projectId') projectId: string,
  @Param('wirId') wirId: string,
  @Body() body: any,
  @Req() req: ExpressRequest,
) {
  const userId = this.getUserId(req);
  return this.svc.reschedule(projectId, wirId, userId, body || {});
}
}
