// pms-backend/src/modules/project-modules/wir/wir.controller.ts
import { Body, Controller, Get, Param, Patch, Post, UseGuards, Req, Delete, ForbiddenException, Put, Query, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt.guard';
import { CreateDiscussionDto, CreateEvidenceDto, CreateItemRunDto, UpdateDiscussionDto, WirService } from './wir.service';
import { Request as ExpressRequest } from 'express';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/wir')
export class WirController {
  wirService: any;
  constructor(private svc: WirService) { }

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

  //GET /projects/:projectId/wir/:wirId
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

  // Runner: create a run for an item
  @Post(':wirId/items/:itemId/runs')
  async createItemRun(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Param('itemId') itemId: string,
    @Body() dto: CreateItemRunDto,
    @Req() req: ExpressRequest,
  ) {
    const userId = this.getUserId(req);
    return this.svc.addItemRun(projectId, wirId, itemId, userId, dto);
  }

  // GET /api/projects/:projectId/wir/:wirId/runs
  @Get(':wirId/runs')
  listAllRunsForWir(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
  ) {
    return this.svc.listItemRuns(projectId, wirId);
  }

  // GET /api/projects/:projectId/wir/:wirId/items/:itemId/runs
  @Get(':wirId/items/:itemId/runs')
  listItemRuns(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.svc.listItemRuns(projectId, wirId, itemId);
  }

  // Runner: attach evidence to a WIR (optionally item/run-scoped via body)
  @Post(':wirId/evidences')
  async createEvidence(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Body() dto: CreateEvidenceDto,
    @Req() req: ExpressRequest,
  ) {
    const userId = this.getUserId(req);
    return this.svc.addEvidence(projectId, wirId, userId, dto);
  }

  // GET /api/projects/:projectId/wir/:wirId/evidences
  @Get(':wirId/evidences')
  listEvidences(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Query('itemId') itemId?: string,
    @Query('runId') runId?: string,
  ) {
    return this.svc.listEvidences(projectId, wirId, { itemId, runId });
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

  @Put(':wirId/recommend')
  async recommendWir(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Body() body: { role: string },
    @Req() req: ExpressRequest,
  ) {
    const userId = this.getUserId(req);

    const wir = await this.svc.recommend(
      projectId,
      wirId,
      body.role,
      userId,
    );
    return wir;
  }

  @Put(':wirId/approve')
  async approveWir(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Body() body: { role: string },
    @Req() req: ExpressRequest,
  ) {
    const userId = this.getUserId(req);

    const wir = await this.svc.approve(
      projectId,
      wirId,
      body.role,
      userId,
    );
    return wir;
  }

  @Put(':wirId/reject')
  async rejectWir(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Body() body: { role: string; comment: string },
    @Req() req: ExpressRequest,
  ) {
    const userId = this.getUserId(req);

    const wir = await this.svc.reject(
      projectId,
      wirId,
      body.role,
      body.comment,
      userId,
    );
    return wir;
  }

  @Put(':wirId/return')
  async returnWir(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Body() body: { role: string; comment?: string },
    @Req() req: ExpressRequest,
  ) {
    const userId = this.getUserId(req);

    const wir = await this.svc.returnWir(
      projectId,
      wirId,
      body.role,
      body.comment ?? null,
      userId,
    );
    return wir;
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

  // ----------------- History and Reschedule --------------
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

  // ---------------- Runner initialize (Contractor/Inspector) ----------------
  // POST /projects/:projectId/wir/:wirId/runner/initialize
  @Post(':wirId/runner/initialize')
  async initializeRunnerRows(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Body() body: { checklistId: string },
    @Req() req: ExpressRequest,
  ) {
    const userId = this.getUserId(req);

    if (!body?.checklistId) {
      throw new BadRequestException("checklistId is required");
    }

    return this.svc.initializeRunnerRowsFromChecklist(
      projectId,
      wirId,
      body.checklistId,
      userId,
    );
  }

  // ---------------- Runner quick-save (Inspector) ----------------
  // POST /projects/:projectId/wir/:wirId/runner/inspector-save
  @Post(':wirId/runner/inspector-save')
  async runnerInspectorSave(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Body() body: { items: { itemId: string; status: 'PASS' | 'FAIL' | null; measurement: string | null; remark: string | null; }[]; overallRecommendation?: 'APPROVE' | 'APPROVE_WITH_COMMENTS' | 'REJECT' | null; },
    @Req() req: ExpressRequest,
  ) {
    const userId = this.getUserId(req);
    return this.svc.saveRunnerInspector(projectId, wirId, userId, body || { items: [] });
  }

  // POST /projects/:projectId/wir/:wirId/runner/hod-save
  @Post(':wirId/runner/hod-save')
  async runnerHodSave(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Body() body: { items: { itemId: string; hodRemark: string | null }[]; notes?: string | null },
    @Req() req: ExpressRequest,
  ) {
    const userId = this.getUserId(req);
    return this.svc.saveRunnerHod(projectId, wirId, userId, body || { items: [] });
  }

  // ---------------- Runner finalize (HOD) ----------------
  // POST /projects/:projectId/wir/:wirId/runner/hod-finalize
  @Post(':wirId/runner/hod-finalize')
  async runnerHodFinalize(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Body() body: { outcome: 'ACCEPT' | 'RETURN' | 'REJECT'; notes?: string | null; inspectorRecommendation?: 'APPROVE' | 'APPROVE_WITH_COMMENTS' | 'REJECT' | null; items: { itemId: string; inspectorStatus: 'PASS' | 'FAIL' | null; inspectorMeasurement: string | null; inspectorRemark: string | null; hodRemark: string | null; hodLastSavedAt?: string | null; }[]; },
    @Req() req: ExpressRequest,
  ) {
    const userId = this.getUserId(req);
    return this.svc.finalizeRunnerHod(projectId, wirId, userId, body || { outcome: 'ACCEPT', items: [] });
  }
  /* ---- Discussion ---- */

  // List all comments (flat; FE can thread using parentId)
  @Get(':wirId/discussions')
  async listDiscussions(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
  ) {
    return this.svc.listDiscussions(projectId, wirId);
  }

  // Add a new comment (top-level or reply with parentId)
  @Post(':wirId/discussions')
  async addDiscussion(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Body() body: CreateDiscussionDto,
    @Req() req: ExpressRequest,
  ) {
    const userId = this.getUserId(req);
    return this.svc.addDiscussion(projectId, wirId, userId, body);
  }

  // Update your own comment
  @Patch(':wirId/discussions/:commentId')
  async updateDiscussion(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Param('commentId') commentId: string,
    @Body() body: UpdateDiscussionDto,
    @Req() req: ExpressRequest,
  ) {
    const userId = this.getUserId(req);
    return this.svc.updateDiscussion(projectId, wirId, commentId, userId, body);
  }

  // Soft-delete your own comment
  @Delete(':wirId/discussions/:commentId')
  async deleteDiscussion(
    @Param('projectId') projectId: string,
    @Param('wirId') wirId: string,
    @Param('commentId') commentId: string,
    @Req() req: ExpressRequest,
  ) {
    const userId = this.getUserId(req);
    return this.svc.deleteDiscussion(projectId, wirId, commentId, userId);
  }

}


