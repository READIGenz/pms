import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { WirService } from './wir.service';
import { CreateWirDto, UpdateWirHeaderDto, AttachChecklistsDto, RollForwardDto, DispatchWirDto } from './dto';

// All routes are project-scoped to match FE calls
@Controller('projects/:projectId/wir')
export class WirController {
  constructor(private readonly service: WirService) { }

  @Get()
  async list(@Param('projectId') projectId: string) {
    return this.service.listByProject(projectId);
  }

  @Get(':wirId')
  async get(@Param('projectId') projectId: string, @Param('wirId') wirId: string) {
    return this.service.get(projectId, wirId);
  }

  @Post()
  async create(@Param('projectId') projectId: string, @Body() dto: CreateWirDto, @Req() req: any) {
    const userId = req?.user?.userId ?? null;
    return this.service.create(projectId, userId, dto);
  }

  @Patch(':wirId')
  async updateHeader(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Body() dto: UpdateWirHeaderDto,
    @Req() req: any,
  ) {
    const actor = { userId: req?.user?.userId ?? null, fullName: req?.user?.fullName ?? null };
    return this.service.updateHeader(projectId, wirId, dto, actor);
  }

  @Post(':wirId/attach-checklists')
  async attachChecklists(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Body() dto: AttachChecklistsDto,
    @Req() req: any,
  ) {
    const actor = { userId: req?.user?.userId ?? null, fullName: req?.user?.fullName ?? null };
    return this.service.attachChecklists(projectId, wirId, dto, actor);
  }

  @Post(':wirId/roll-forward')
  async rollForward(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Body() dto: RollForwardDto,
    @Req() req: any,
  ) {
    const userId = req?.user?.userId ?? null;
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
    const actorUserId: string | null = req?.user?.userId ?? req?.user?.sub ?? null;
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

}
