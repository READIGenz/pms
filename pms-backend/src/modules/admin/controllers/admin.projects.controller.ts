// src/modules/admin/controllers/admin.projects.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import {
  Prisma,
  ProjectHealth,
  ProjectStage,
  ProjectStatus,
  ProjectType,
  StructureType,
  ConstructionType,
  ContractType,
  CurrencyCode,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@UseGuards(JwtAuthGuard)
@Controller('admin/projects')
export class AdminProjectsController {
  constructor(private readonly prisma: PrismaService) {}

  /* ========================= Reference: project tags =========================
     Frontend probes:
       GET  /admin/ref/project-tags   -> preferred
       GET  /admin/project-tags       -> fallback
       GET  /admin/projects/:id/tags  -> read selected
       POST /admin/projects/:id/tags  -> replace selection
     We’ll implement /admin/ref/project-tags and the :id versions here.
  */
  @Get('ref/project-tags')
  async listProjectTagsRef() {
    // Try a dedicated ref table first; fall back to distinct from projectTag
    try {
      const tags = await (this.prisma as any).projectTagRef.findMany({
        select: { tagCode: true, label: true },
        orderBy: { label: 'asc' as Prisma.SortOrder },
      });
      return { ok: true, tags };
    } catch {
      // Fallback by deriving distinct tag codes already used
      const rows = await this.prisma.projectTag.findMany({
        distinct: ['tagCode'],
        select: { tagCode: true },
        orderBy: { tagCode: 'asc' },
      });
      const tags = rows.map((r) => ({ tagCode: r.tagCode, label: r.tagCode }));
      return { ok: true, tags };
    }
  }

  /* ========================= List ========================= */
  @Get()
  async listProjects(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
    @Query('q') q?: string,

    // Optional filters aligned with UI
    @Query('status') status?: ProjectStatus | string,
    @Query('stage') stage?: ProjectStage | string,
    @Query('health') health?: ProjectHealth | string,
    @Query('stateId') stateId?: string,
    @Query('districtId') districtId?: string,
    @Query('clientCompanyId') clientCompanyId?: string,
  ) {
    const _skip = Math.max(0, Number.isFinite(Number(skip)) ? Number(skip) : 0);
    const _takeNum = Number.isFinite(Number(take)) ? Number(take) : 0;
    const _take = _takeNum ? Math.max(1, Math.min(200, _takeNum)) : undefined;

    const where: Prisma.ProjectWhereInput = {};

    if (q?.trim()) {
      const needle = q.trim();
      Object.assign(where, {
        OR: [
          { title: { contains: needle, mode: Prisma.QueryMode.insensitive } },
          { code: { contains: needle, mode: Prisma.QueryMode.insensitive } },
          { address: { contains: needle, mode: Prisma.QueryMode.insensitive } },
          { cityTown: { contains: needle, mode: Prisma.QueryMode.insensitive } },
          { pin: { contains: needle, mode: Prisma.QueryMode.insensitive } },
          { description: { contains: needle, mode: Prisma.QueryMode.insensitive } },
        ],
      } as Prisma.ProjectWhereInput);
    }

    if (status && Object.values(ProjectStatus).includes(status as ProjectStatus)) {
      (where as any).status = status as ProjectStatus;
    }
    if (stage && Object.values(ProjectStage).includes(stage as ProjectStage)) {
      (where as any).stage = stage as ProjectStage;
    }
    if (health && Object.values(ProjectHealth).includes(health as ProjectHealth)) {
      (where as any).health = health as ProjectHealth;
    }
    if (stateId) (where as any).stateId = stateId;
    if (districtId) (where as any).districtId = districtId;
    if (clientCompanyId) (where as any).clientCompanyId = clientCompanyId;

    const allowedSort = new Set<keyof Prisma.ProjectOrderByWithRelationInput>([
      'createdAt',
      'updatedAt',
      'title',
      'code',
      'status',
      'stage',
      'health',
      'startDate',
      'plannedCompletionDate',
      'contractValue',
    ]);
    const by = (allowedSort.has(sortBy as any) ? sortBy : 'createdAt') as keyof Prisma.ProjectOrderByWithRelationInput;
    const dir: Prisma.SortOrder = sortDir === 'desc' ? 'desc' : 'asc';
    const orderBy: Prisma.ProjectOrderByWithRelationInput = { [by]: dir };

    const projects = await this.prisma.project.findMany({
      where,
      skip: _skip || undefined,
      take: _take,
      orderBy,
      select: {
        projectId: true,
        title: true,
        code: true,
        status: true,
        stage: true,
        projectType: true,
        structureType: true,
        constructionType: true,
        contractType: true,
        health: true,

        // Location
        address: true,
        stateId: true,
        districtId: true,
        cityTown: true,
        pin: true,
        latitude: true,
        longitude: true,

        // Dates & cost
        startDate: true,
        plannedCompletionDate: true,
        currency: true,
        contractValue: true,

        // Attributes
        areaUnit: true,
        plotArea: true,
        builtUpArea: true,
        floors: true,

        description: true,

        // relations used by UI
        clientCompanyId: true,
        clientCompany: { select: { companyId: true, name: true } },
        state: { select: { stateId: true, code: true, name: true, type: true } },
        district: {
          select: {
            districtId: true,
            name: true,
            stateId: true,
            state: { select: { code: true, name: true } },
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    const total = await this.prisma.project.count({ where });
    return { ok: true, total, projects };
  }

  /* ========================= Get one ========================= */
  @Get(':id')
  async getProject(@Param('id') projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { projectId },
      select: {
        projectId: true,
        title: true,
        code: true,
        status: true,
        stage: true,
        projectType: true,
        structureType: true,
        constructionType: true,
        contractType: true,
        health: true,

        address: true,
        stateId: true,
        districtId: true,
        cityTown: true,
        pin: true,
        latitude: true,
        longitude: true,

        startDate: true,
        plannedCompletionDate: true,
        currency: true,
        contractValue: true,

        areaUnit: true,
        plotArea: true,
        builtUpArea: true,
        floors: true,

        description: true,

        clientCompanyId: true,
        clientCompany: { select: { companyId: true, name: true } },
        state: { select: { stateId: true, code: true, name: true, type: true } },
        district: {
          select: {
            districtId: true,
            name: true,
            stateId: true,
            state: { select: { code: true, name: true } },
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!project) throw new HttpException('Not found', HttpStatus.NOT_FOUND);
    return { ok: true, project };
  }

  /* ========================= Create ========================= */
  @Post()
  async createProject(@Body() body: any) {
    if (!body?.title || !body?.status) {
      return { ok: false, error: 'title and status are required.' };
    }

    const payload: Prisma.ProjectCreateInput = {
      title: body.title,
      code: body.code || undefined,
      status: (body.status as ProjectStatus) || 'Draft',
      stage: (body.stage as ProjectStage) || null,
      projectType: (body.projectType as ProjectType) || null,
      structureType: (body.structureType as StructureType) || null,
      constructionType: (body.constructionType as ConstructionType) || null,
      contractType: (body.contractType as ContractType) || null,
      health: (body.health as ProjectHealth) || 'Unknown',

      address: body.address || null,
      cityTown: body.cityTown || null,
      pin: body.pin || null,
      latitude: body.latitude || null,
      longitude: body.longitude || null,

      startDate: body.startDate ? new Date(body.startDate) : null,
      plannedCompletionDate: body.plannedCompletionDate ? new Date(body.plannedCompletionDate) : null,
      currency: (body.currency as CurrencyCode) || 'INR',
      contractValue: body.contractValue ?? null,

      areaUnit: body.areaUnit || null,
      plotArea: body.plotArea ?? null,
      builtUpArea: body.builtUpArea ?? null,
      floors: Number.isFinite(Number(body.floors)) ? Number(body.floors) : null,

      description: body.description || null,

      clientCompany: body.clientCompanyId ? { connect: { companyId: body.clientCompanyId } } : undefined,
      state: body.stateId ? { connect: { stateId: body.stateId } } : undefined,
      district: body.districtId ? { connect: { districtId: body.districtId } } : undefined,
    };

    const created = await this.prisma.project.create({
      data: payload,
      select: { projectId: true, updatedAt: true },
    });

    return { ok: true, project: created };
  }

  /* ========================= Update ========================= */
  @Patch(':id')
  async updateProject(@Param('id') projectId: string, @Body() body: any) {
    const data: Prisma.ProjectUpdateInput = {
      title: body.title,
      code: body.code ?? null,
      status: (body.status as ProjectStatus) ?? undefined,
      stage: body.stage !== undefined ? ((body.stage as ProjectStage) || null) : undefined,
      projectType: body.projectType !== undefined ? ((body.projectType as ProjectType) || null) : undefined,
      structureType: body.structureType !== undefined ? ((body.structureType as StructureType) || null) : undefined,
      constructionType: body.constructionType !== undefined ? ((body.constructionType as ConstructionType) || null) : undefined,
      contractType: body.contractType !== undefined ? ((body.contractType as ContractType) || null) : undefined,
      health: body.health !== undefined ? ((body.health as ProjectHealth) || null) : undefined,

      address: body.address ?? null,
      cityTown: body.cityTown ?? null,
      pin: body.pin ?? null,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,

      startDate: body.startDate !== undefined ? (body.startDate ? new Date(body.startDate) : null) : undefined,
      plannedCompletionDate:
        body.plannedCompletionDate !== undefined
          ? (body.plannedCompletionDate ? new Date(body.plannedCompletionDate) : null)
          : undefined,
      currency: (body.currency as CurrencyCode) ?? undefined,
      contractValue: body.contractValue ?? null,

      areaUnit: body.areaUnit ?? null,
      plotArea: body.plotArea ?? null,
      builtUpArea: body.builtUpArea ?? null,
      floors: body.floors !== undefined ? (Number.isFinite(Number(body.floors)) ? Number(body.floors) : null) : undefined,

      description: body.description ?? null,

      clientCompany:
        body.clientCompanyId !== undefined
          ? body.clientCompanyId
            ? { connect: { companyId: body.clientCompanyId } }
            : { disconnect: true }
          : undefined,
      state:
        body.stateId !== undefined
          ? body.stateId
            ? { connect: { stateId: body.stateId } }
            : { disconnect: true }
          : undefined,
      district:
        body.districtId !== undefined
          ? body.districtId
            ? { connect: { districtId: body.districtId } }
            : { disconnect: true }
          : undefined,
    };

    if (!data.title) return { ok: false, error: 'title is required' };

    const updated = await this.prisma.project.update({
      where: { projectId },
      data,
      select: { projectId: true, updatedAt: true },
    });
    return { ok: true, project: updated };
  }

  /* ========================= Project tags ========================= */
  @Get(':id/tags')
  async getProjectTags(@Param('id') projectId: string) {
    const tags = await this.prisma.projectTag.findMany({
      where: { projectId },
      select: { tagCode: true },
      orderBy: { tagCode: 'asc' },
    });
    return { ok: true, tags };
  }

  @Post(':id/tags')
  async replaceProjectTags(
    @Param('id') projectId: string,
    @Body() body: { tagCodes?: string[] },
  ) {
    const tagCodes = Array.isArray(body.tagCodes)
      ? body.tagCodes.filter((t) => !!t && typeof t === 'string')
      : [];

    // Make sure project exists
    const exists = await this.prisma.project.findUnique({ where: { projectId }, select: { projectId: true } });
    if (!exists) throw new HttpException('Not found', HttpStatus.NOT_FOUND);

    await this.prisma.$transaction(async (tx) => {
      await tx.projectTag.deleteMany({ where: { projectId } });
      if (tagCodes.length) {
        await tx.projectTag.createMany({
          data: tagCodes.map((tagCode) => ({ projectId, tagCode })),
          skipDuplicates: true,
        });
      }
    });

    const tags = await this.prisma.projectTag.findMany({
      where: { projectId },
      select: { tagCode: true },
      orderBy: { tagCode: 'asc' },
    });

    return { ok: true, count: tags.length, tags };
  }
}
