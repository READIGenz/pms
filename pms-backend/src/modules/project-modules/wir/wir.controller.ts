import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { WirService } from './wir.service';
import { CreateWirDto, UpdateWirHeaderDto, AttachChecklistsDto, RollForwardDto, DispatchWirDto } from './dto';
import { JwtAuthGuard } from './../../../common/guards/jwt.guard';
import { InspectorSaveDto } from './inspector-runner-save.dto';

const getAuthUserId = (req: any): string | null =>
  req?.user?.userId ?? req?.user?.id ?? req?.user?.sub ?? null;

// All routes are project-scoped to match FE calls
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/wir')
export class WirController {
  constructor(private readonly service: WirService) { }

  @Get()
  async list(@Param('projectId') projectId: string) {
    return this.service.listByProject(projectId);
  }

  @Get(':wirId')
  async get(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
  ) {
    // Service currently expects (projectId, wirId). We'll add default includes inside the service in the next step.
    return this.service.get(projectId, wirId);
  }


  @Post()
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateWirDto,
    @Req() req: any) {
    const userId = getAuthUserId(req);               // <-- use helper
    const { createdById, ...safe } = (dto as any) || {}; // <-- strip if sent from FE
    return this.service.create(projectId, userId, safe);
  }

  @Patch(':wirId')
  async updateHeader(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Body() dto: UpdateWirHeaderDto,
    @Req() req: any,
  ) {
    const actor = {
      userId: getAuthUserId(req),                   // <-- use helper
      fullName: req?.user?.fullName ?? null
    };
    const { createdById, ...safe } = (dto as any) || {}; // <-- never allow overwrite
    return this.service.updateHeader(projectId, wirId, safe, actor);
  }

  @Post(':wirId/attach-checklists')
  async attachChecklists(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Body() dto: AttachChecklistsDto,
    @Req() req: any,
  ) {
    const actor = {
      userId: getAuthUserId(req),                   // <-- use helper
      fullName: req?.user?.fullName ?? null
    };
    return this.service.attachChecklists(projectId, wirId, dto, actor);
  }

  //to update the checklists attached in saved drafts
  @Post(':wirId/sync-checklists')
  async syncChecklists(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Body() dto: AttachChecklistsDto & { replace?: boolean },
    @Req() req: any,
  ) {
    const actor = { userId: getAuthUserId(req), fullName: req?.user?.fullName ?? null };
    return this.service.syncChecklists(projectId, wirId, dto, actor);
  }

  @Post(':wirId/roll-forward')
  async rollForward(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Body() dto: RollForwardDto,
    @Req() req: any,
  ) {
    const userId = getAuthUserId(req);
    return this.service.rollForward(projectId, wirId, userId, dto);
  }

  @Delete(':wirId')
  async remove(@Param('projectId') projectId: string, @Param('wirId') wirId: string) {
    return this.service.deleteWir(projectId, wirId);
  }

  // wir.controller.ts
  @Post(':wirId/dispatch')
  async dispatchWir(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Body() body: DispatchWirDto,
    @Req() req: any,
  ) {
    const actorUserId = getAuthUserId(req);         // <-- use helper
    return this.service.dispatchWir(
      projectId,
      wirId,
      actorUserId,        // <- currentUserId
      body,               // <- dto
      {                   // <- actor (optional)
        userId: actorUserId,
        fullName: req?.user?.fullName ?? null,
      }
    );
  }

  @Post(':wirId/runner/inspector-recommend')
  async inspectorRecommend(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Body() body: { action: 'APPROVE' | 'APPROVE_WITH_COMMENTS' | 'REJECT'; comment?: string | null },
    @Req() req: any,
  ) {
    const actor = {
      userId: getAuthUserId(req),
      fullName: req?.user?.fullName ?? null,
    };

    // minimal guard
    const action = body?.action;
    if (!action || !['APPROVE', 'APPROVE_WITH_COMMENTS', 'REJECT'].includes(action)) {
      throw new Error('Invalid recommendation action');
    }

    return this.service.inspectorRecommend(projectId, wirId, { action, comment: body?.comment ?? null }, actor);
  }

  @Post(':wirId/runner/inspector-save')
  async inspectorSave(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Body() dto: InspectorSaveDto,
    @Req() req: any,
  ) {
    const user = req.user; // your existing auth guard populates this
    await this.service.inspectorSave(projectId, wirId, dto, user);
    return { ok: true };
  }
}
