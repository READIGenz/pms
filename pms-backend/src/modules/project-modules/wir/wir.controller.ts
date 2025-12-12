//pms/pms-backend/src/modules/project-modules/wir/wir.controller.ts
import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { WirService } from './wir.service';
import { CreateWirDto, UpdateWirHeaderDto, AttachChecklistsDto, RollForwardDto, DispatchWirDto } from './dto';
import { JwtAuthGuard } from './../../../common/guards/jwt.guard';
import { InspectorSaveDto } from './inspector-runner-save.dto';
import { UseInterceptors, UploadedFiles } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';

const getAuthUserId = (req: any): string | null =>
  req?.user?.userId ?? req?.user?.id ?? req?.user?.sub ?? null;

// All routes are project-scoped to match FE calls
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/wir')
export class WirController {
  //  wirService: any;
  constructor(private readonly service: WirService) { }


  @Get()
  async list(@Param('projectId') projectId: string) {
    return this.service.listByProject(projectId);
  }

  @Get(':wirId')
  async get(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Query('contract') contract?: string,
  ) {
    const wantContract = contract === '1' || contract === 'true';
    return this.service.get(projectId, wirId, { contract: wantContract });
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

  // ========= Runner file attachments (multipart) =========
  // form-data:
  //   files: (multiple) binary
  //   meta:  JSON string -> [{ idx:number, itemId:string, kind?: "Photo"|"Video"|"File" }]
  @Post(':wirId/runner/attachments')
  //  @UseInterceptors(FilesInterceptor('files')) // name="files"
  @UseInterceptors(FilesInterceptor('files', 20, {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB each
    fileFilter: (_req, file, cb) => {
      const ok = /^(image\/(jpeg|png|webp)|video\/mp4|application\/pdf)$/.test(file.mimetype);
      cb(ok ? null : new BadRequestException('Unsupported file type'), ok);
    },
  }))
  async uploadRunnerAttachments(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('meta') metaJson: string,               // meta is sent as JSON string
    @Req() req: any,
  ) {
    let meta: Array<{ idx: number; itemId: string; kind?: 'Photo' | 'Video' | 'File' }> = [];
    try {
      meta = JSON.parse(metaJson || '[]');
    } catch {
      throw new BadRequestException('Invalid meta JSON');
    }
    //  return this.wirService.createRunnerAttachments(projectId, wirId, files, meta);
    return this.service.createRunnerAttachments(projectId, wirId, files, meta);

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

  // ---- Discussion: list
  @Get(':wirId/discussion')
  async listDiscussion(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Query('after') after?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listDiscussion(projectId, wirId, {
      after: after || null,
      limit: limit ? Number(limit) : undefined,
    });
  }

  // ---- Discussion: add
  @Post(':wirId/discussion')
  async addDiscussion(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Body() body: { text?: string | null; parentId?: string | null; fileUrl?: string | null; fileName?: string | null },
    @Req() req: any,
  ) {
    const actor = {
      userId: getAuthUserId(req),
      fullName: req?.user?.fullName ?? null,
    };
    return this.service.addDiscussion(projectId, wirId, body, actor);
  }

  // ---- Discussion: edit
  @Patch(':wirId/discussion/:commentId')
  async editDiscussion(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Param('commentId') commentId: string,
    @Body() body: { text?: string | null; fileUrl?: string | null; fileName?: string | null },
    @Req() req: any,
  ) {
    const actor = {
      userId: getAuthUserId(req),
      isSuperAdmin: !!req?.user?.isSuperAdmin,
    };
    return this.service.editDiscussion(projectId, wirId, commentId, body, actor);
  }

  // ---- Discussion: delete (soft)
  @Delete(':wirId/discussion/:commentId')
  async deleteDiscussion(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Param('commentId') commentId: string,
    @Req() req: any,
  ) {
    const actor = {
      userId: getAuthUserId(req),
      isSuperAdmin: !!req?.user?.isSuperAdmin,
    };
    return this.service.deleteDiscussion(projectId, wirId, commentId, actor);
  }

  // Create next WIR version strictly with provided items (no fallback)
  @Post(':wirId/followup')
  async createFollowup(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Body() body: { forDate?: string; forTime?: string; note?: string | null; includeItemIds?: string[]; title?: string | null; description?: string | null },
    @Req() req: any,
  ) {
    const userId = getAuthUserId(req);
    const plannedAt =
      body?.forDate
        ? `${body.forDate}T${(body.forTime || '00:00')}:00`
        : undefined;

    return this.service.rollForward(projectId, wirId, userId, {
      plannedAt,
      itemIds: body?.includeItemIds ?? [],                // ← strictly use what FE sends
      title: body?.title ?? undefined,
      description: (body?.description ?? body?.note) || undefined,
    });
  }

}
