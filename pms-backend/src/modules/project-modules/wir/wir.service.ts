// pms-backend/src/modules/project-modules/wir/wir.service.ts
import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  Prisma, WirStatus, ProjectHealth, WirAction, InspectorRecommendation,
  HodOutcome, InspectorItemStatus, WirRunnerActorRole, WirItemEvidenceKind, WirItemStatus,
  $Enums,
  PrismaClient
} from '@prisma/client';
import { DefaultArgs } from '@prisma/client/runtime/library';

const toWirItemStatus = (s?: string | null): WirItemStatus | undefined => {
  if (!s) return undefined;
  const n = s.trim().toLowerCase();
  if (n === 'ok') return WirItemStatus.OK;
  if (n === 'ncr') return WirItemStatus.NCR;
  if (n === 'pending') return WirItemStatus.Pending;
  if (n === 'unknown') return WirItemStatus.Unknown;
  return undefined; // unknown label -> omit
};

const toEvidenceKind = (s?: string | null): WirItemEvidenceKind => {
  if (!s) return WirItemEvidenceKind.Photo;
  const n = s.trim().toLowerCase();
  if (n === 'video') return WirItemEvidenceKind.Video;
  if (n === 'file') return WirItemEvidenceKind.File;
  if (n === 'other') return WirItemEvidenceKind.Other;
  return WirItemEvidenceKind.Photo;
};

const name = (u?: { firstName?: string | null; lastName?: string | null } | null) => {
  if (!u) return null;
  const f = (u.firstName || '').trim();
  const l = (u.lastName || '').trim();
  return (f && l) ? `${f} ${l}` : (f || l || null);
};

// Runner DTOs – kept simple, FE-friendly
export type CreateItemRunDto = {
  valueText?: string | null;
  valueNumber?: number | string | null;
  unit?: string | null;
  status?: string | null;          // 'OK' | 'NCR' | 'Pending' | 'Unknown'
  comment?: string | null;

  lat?: number | null;
  lng?: number | null;
  accuracyM?: number | string | null;
  locationNote?: string | null;

  meta?: any;                      // { deviceId, appVersion, ... }
};

export type CreateEvidenceDto = {
  itemId?: string | null;
  runId?: string | null;
  kind?: string | null;            // 'Photo' | 'Video' | 'File' | 'Other'
  url: string;

  thumbUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;

  capturedAt?: string | null;      // ISO
  lat?: number | null;
  lng?: number | null;
  accuracyM?: number | string | null;

  meta?: any;
};

type CreateWirInput = {
  projectId: string;
  title: string;
  code?: string | null;
  discipline?: string | null;
  stage?: string | null;
  forDate?: string | null;
  forTime?: string | null;
  cityTown?: string | null;
  stateName?: string | null;
  contractorId?: string | null;
  inspectorId?: string | null;
  hodId?: string | null;
  description?: string | null;
  refChecklistIds?: string[];
  materializeItemsFromRef?: boolean;
  items?: Array<{
    name: string;
    spec?: string | null;
    required?: string | null;    // 'Mandatory' | 'Optional' | null
    tolerance?: string | null;
    photoCount?: number | null;
    status?: string | null;
    critical?: boolean | null;
    value?: string | number | null;
    code?: string | null;
    unit?: string | null;
    tags?: string[] | null;
  }>;
};

type UpdateWirInput = Partial<CreateWirInput> & { status?: WirStatus | null; health?: ProjectHealth | null; };

// ---- Discussion DTOs (module-scope) ----
export type CreateDiscussionDto = {
  body: string;
  parentId?: string | null;
};
export type UpdateDiscussionDto = {
  body: string;
};

@Injectable()
export class WirService {
  constructor(private prisma: PrismaService) { }

  async canDeleteDraft(projectId: string, wirId: string, userId: string) {
    const w = await this.prisma.wir.findFirst({
      where: { wirId, projectId },
      select: { status: true, createdById: true },
    });
    if (!w) return false;
    const isDraft = String(w.status || '').toLowerCase() === 'draft';
    const isAuthor = String(w.createdById || '') === String(userId || '');
    return isDraft && isAuthor;
  }

  async deleteDraft(projectId: string, wirId: string) {
    return this.prisma.$transaction(async (tx) => {
      const w = await tx.wir.findFirst({ where: { wirId, projectId } });
      if (!w) throw new NotFoundException('WIR not found');
      if (String(w.status || '').toLowerCase() !== 'draft') {
        throw new BadRequestException('Only Draft WIR can be deleted');
      }

      await tx.wirItem.deleteMany({ where: { wirId } });
      await tx.wirChecklist.deleteMany({ where: { wirId } });
      await this.recordHistory(tx, {
        projectId,
        wirId,
        action: WirAction.Deleted,
        fromStatus: w.status,
        toStatus: null,
        fromBicUserId: w.bicUserId ?? null,
        toBicUserId: null,
      });

      return tx.wir.delete({ where: { wirId } });
    });
  }

  async delete(projectId: string, wirId: string, userId: string) {
    const ok = await this.canDeleteDraft(projectId, wirId, userId);
    if (!ok) {
      throw new ForbiddenException('Only the author can delete a Draft WIR');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.wirItem.deleteMany({ where: { wirId } });
      await tx.wirChecklist.deleteMany({ where: { wirId } });
      return tx.wir.delete({ where: { wirId } });
    });
  }

  async addChecklist(projectId: string, wirId: string, refChecklistId: string, materialize = true) {
    return this.prisma.$transaction(async (tx) => {
      const w = await tx.wir.findUnique({ where: { wirId }, select: { projectId: true } });
      if (!w || w.projectId !== projectId) throw new NotFoundException('WIR not found');

      const ref = await tx.refChecklist.findUnique({
        where: { id: refChecklistId },
        include: { items: { orderBy: { seq: 'asc' } } },
      });
      if (!ref) throw new NotFoundException('RefChecklist not found');

      const order = await tx.wirChecklist.count({ where: { wirId } });
      await tx.wirChecklist.create({
        data: {
          wirId,
          checklistId: ref.id,
          checklistCode: ref.code ?? null,
          checklistTitle: ref.title,
          discipline: ref.discipline,
          versionLabel: ref.versionLabel ?? null,
          itemsCount: ref.items.length,
          itemIds: ref.items.map(i => i.id),
          order,
        },
      });

      if (materialize && ref.items.length) {
        // ✅ Correct mapping:
        // required  <- requirement ('Mandatory' | 'Optional' | null)
        // critical  <- critical (boolean | null)
        // value     <- value (string | number | null)   // no guesses
        // spec      remains free-text (not requirement)
        await tx.wirItem.createMany({
          data: ref.items.map((ri, i) => ({
            wirId,
            checklistId: ref.id,
            itemId: ri.id,
            sourceChecklistId: ref.id,
            sourceChecklistItemId: ri.id,
            seq: ri.seq ?? i + 1,

            name: ri.text,
            spec: null, // do NOT stuff requirement here; keep spec as free text
            required: ri.requirement ?? null,
            tolerance: ri.tolerance ?? null,
            photoCount: 0,
            status: WirItemStatus.Unknown,

            // denorms & extras
            code: ri.itemCode ?? null,
            unit: ri.units ?? null,
            tags: ri.tags ?? [],

            // NEW
            critical: typeof ri.critical === 'boolean' ? ri.critical : null,
             aiEnabled: typeof ri.aiEnabled === 'boolean' ? ri.aiEnabled : null,
            aiConfidence: ri.aiConfidence ?? null,
            base: ri.base ?? null,
            plus: ri.plus ?? null,
            minus: ri.minus ?? null,
            value: null,
          })),
        });
      }

      const out = await tx.wir.findUnique({ where: { wirId }, include: this.baseInclude });
      return this.toFE(out);
    });
  }

  async removeChecklist(projectId: string, wirChecklistId: string, deleteItemsToo = true) {
    return this.prisma.$transaction(async (tx) => {
      const wc = await tx.wirChecklist.findUnique({
        where: { id: wirChecklistId },
        select: { id: true, wirId: true, checklistId: true, wir: { select: { projectId: true } } },
      });
      if (!wc || wc.wir.projectId !== projectId) throw new NotFoundException('WIR checklist not found');

      if (deleteItemsToo) {
        await tx.wirItem.deleteMany({ where: { wirId: wc.wirId, checklistId: wc.checklistId } });
      }
      await tx.wirChecklist.delete({ where: { id: wirChecklistId } });

      const out = await tx.wir.findUnique({ where: { wirId: wc.wirId }, include: this.baseInclude });
      return this.toFE(out);
    });
  }

  async initializeRunnerRowsFromChecklist(
    projectId: string,
    wirId: string,
    checklistId: string,
    userId: string,
  ) {
    await this.ensureWirInProject(projectId, wirId);

    const checklist = await this.prisma.refChecklist.findUnique({
      where: { id: checklistId },
      include: { items: { orderBy: { seq: 'asc' } } },
    });
    if (!checklist) throw new NotFoundException('Checklist not found');

    const existing = await this.prisma.wirItem.findMany({
      where: { wirId, checklistId },
      select: { id: true },
      take: 1,
    });
    if (existing.length > 0) {
      throw new BadRequestException('Runner rows already exist for this checklist');
    }

    const items = checklist.items || [];
    const payload = items.map((it, idx) => ({
      wirId,
      checklistId,
      itemId: it.id,
      sourceChecklistId: checklist.id,
      sourceChecklistItemId: it.id,

      seq: it.seq ?? idx + 1,
      name: it.text,
      spec: null,
      required: it.requirement ?? null,
      tolerance: it.tolerance ?? null,
      photoCount: 0,
      status: WirItemStatus.Unknown,

      code: it.itemCode ?? null,
      unit: it.units ?? null,
      tags: it.tags ?? [],
      critical: typeof it.critical === 'boolean' ? it.critical : null,
      aiEnabled: typeof it.aiEnabled === 'boolean' ? it.aiEnabled : null,
      aiConfidence: it.aiConfidence ?? null,
      base: it.base ?? null,
      plus: it.plus ?? null,
      minus: it.minus ?? null,
      value: null,
    }));

    if (!payload.length) {
      throw new BadRequestException('Checklist has no items');
    }

    await this.prisma.wirItem.createMany({ data: payload });

    return { ok: true, count: payload.length };
  }

  /* ---------- Mapping to FE shape ---------- */
  private toFE(w: any) {
    const items = (w.items || []) as Array<any>;

    // Build a fast per-checklist aggregation for counts
    const perChecklistAgg = new Map<string, { mandatory: number; critical: number }>();
    for (const it of items) {
      const key = it.checklistId ?? '__none__';
      if (!perChecklistAgg.has(key)) perChecklistAgg.set(key, { mandatory: 0, critical: 0 });
      const agg = perChecklistAgg.get(key)!;
      if ((it.required || '').toString().trim() === 'Mandatory') agg.mandatory += 1;
      if (typeof it.critical === 'boolean' && it.critical) agg.critical += 1;
    }

    return {
      wirId: w.wirId,
      code: w.code,
      title: w.title,

      projectId: w.projectId,
      projectCode: w.project?.code ?? null,
      projectTitle: w.project?.title ?? null,

      status: w.status,
      health: w.health,
      discipline: w.discipline,
      stage: w.stage,

      forDate: w.forDate,
      forTime: w.forTime,

      rescheduleForDate: w.rescheduleForDate ?? null,
      rescheduleForTime: w.rescheduleForTime ?? null,
      rescheduleReason: w.rescheduleReason ?? null,
      rescheduledById: w.rescheduledById ?? null,
      rescheduledByName: name(w.rescheduledBy),

      cityTown: w.cityTown,
      stateName: w.stateName,

      contractorName: name(w.contractor),
      inspectorName: name(w.inspector),
      hodName: name(w.hod),

      // Ball-In-Court
      bicUserId: w.bicUserId ?? w.bic?.userId ?? null,
      bicName: name(w.bic),

      createdById: w.createdById ?? w.createdBy?.userId ?? null,

      // NEW: header-level inspector & HOD decision fields
      inspectorRecommendation: w.inspectorRecommendation ?? null,
      inspectorRemarks: w.inspectorRemarks ?? null,
      inspectorReviewedAt: w.inspectorReviewedAt ?? null,

      hodOutcome: w.hodOutcome ?? null,
      hodRemarks: w.hodRemarks ?? null,
      hodDecidedAt: w.hodDecidedAt ?? null,

      items: items.map((it: any) => ({
        id: it.id,
        checklistId: it.checklistId ?? null,
        itemId: it.itemId ?? null,
        seq: it.seq ?? null,

        name: it.name,
        spec: it.spec,
        required: it.required,         // 'Mandatory' | 'Optional' | null
        tolerance: it.tolerance,
        photoCount: it.photoCount,
        status: it.status,

        code: it.code ?? null,
        unit: it.unit ?? null,
        tags: it.tags ?? [],

        // NEW
        critical: typeof it.critical === 'boolean' ? it.critical : null,
        value: (typeof it.value === 'number' || typeof it.value === 'string') ? it.value : null,

        // NEW: per-role item review tiles
        inspectorStatus: (it.inspectorStatus as InspectorItemStatus | null) ?? null,
        inspectorNote: it.inspectorNote ?? null,
        hodStatus: (it.hodStatus as InspectorItemStatus | null) ?? null,
        hodNote: it.hodNote ?? null,

        updatedAt: it.updatedAt ?? w.updatedAt,
      })),

      checklists: (w.checklists || []).map((c: any) => {
        const agg = perChecklistAgg.get(c.checklistId) || { mandatory: 0, critical: 0 };
        return {
          id: c.id,
          checklistId: c.checklistId,
          code: c.checklistCode ?? null,
          title: c.checklistTitle ?? null,
          discipline: c.discipline ?? null,
          versionLabel: c.versionLabel ?? null,
          itemsCount: c.itemsCount ?? 0,
          order: c.order ?? 0,
          // NEW — for Document > Overview > Checklist section
          mandatoryCount: agg.mandatory,
          criticalCount: agg.critical,
        };
      }),

      description: w.description,
      updatedAt: w.updatedAt,
    };

  }

  private baseInclude: Prisma.WirInclude = {
    project: { select: { projectId: true, code: true, title: true } },
    contractor: { select: { userId: true, firstName: true, middleName: true, lastName: true, email: true, phone: true, code: true } },
    inspector: { select: { userId: true, firstName: true, middleName: true, lastName: true, email: true, phone: true, code: true } },
    hod: { select: { userId: true, firstName: true, middleName: true, lastName: true, email: true, phone: true, code: true } },
    createdBy: { select: { userId: true, firstName: true, lastName: true } },
    bic: { select: { userId: true, firstName: true, lastName: true } },
    rescheduledBy: { select: { userId: true, firstName: true, lastName: true } },
    checklists: {
      orderBy: { order: 'asc' },
      select: {
        id: true, checklistId: true, checklistCode: true, checklistTitle: true,
        discipline: true, versionLabel: true, itemsCount: true, order: true,
      },
    },
    items: { orderBy: [{ seq: 'asc' }, { createdAt: 'asc' }] },
  };

  /* ---------- Project-role helpers ---------- */
  private async getProjectRole(userId: string, projectId: string): Promise<string | null> {
    const m = await this.prisma.userRoleMembership.findFirst({
      where: { projectId, userId },
      select: { role: true },
    });
    const raw = (m?.role || '').toString().trim().toLowerCase().replace(/[_\s-]+/g, '');
    switch (raw) {
      case 'contractor': return 'Contractor';
      case 'client': return 'Client';
      case 'pmc': return 'PMC';
      case 'ihpmt': return 'IH-PMT';
      case 'consultant': return 'Consultant';
      case 'admin': return 'Admin';
      case 'supplier': return 'Supplier';
      default: return m?.role || null;
    }
  }

  private async isContractorForProject(userId: string, projectId: string): Promise<boolean> {
    const role = await this.getProjectRole(userId, projectId);
    return role === 'Contractor';
  }

  /* ---------- List & Get ---------- */
  async list(projectId: string, userId: string) {
    const isCtr = await this.isContractorForProject(userId, projectId);

    const where: Prisma.WirWhereInput = isCtr
      ? {
        projectId,
        OR: [
          { status: { not: WirStatus.Draft } },
          { AND: [{ status: WirStatus.Draft }, { createdById: userId }] },
        ],
      }
      : {
        projectId,
        status: { not: WirStatus.Draft },
      };

    const rows = await this.prisma.wir.findMany({
      where,
      include: this.baseInclude,
      orderBy: { updatedAt: 'desc' },
    });

    return rows.map(r => this.toFE(r));
  }

  // before: async get(projectId: string, wirId: string)
  async get(projectId: string, wirId: string, userId: string) {
    const row = await this.prisma.wir.findFirst({
      where: { wirId, projectId },
      include: this.baseInclude,
    });
    if (!row || row.projectId !== projectId) throw new NotFoundException('WIR not found');

    if (row.status === WirStatus.Draft) {
      const isCtr = await this.isContractorForProject(userId, projectId);
      const isAuthor = !!row.createdById && row.createdById === userId;
      if (!(isCtr && isAuthor)) {
        throw new ForbiddenException('Draft is visible only to its author (Contractor).');
      }
    }

    // ---------- Build snapshots for Runner panels ----------
    /**
     * Inspector snapshot:
     * For each item, show the latest Inspector run (measurement/status/remark) and
     * the mirrored quick fields on WirItem (inspectorStatus/inspectorNote).
     */
    const inspRuns = await this.prisma.wirItemRun.findMany({
      where: { wirId, actorRole: WirRunnerActorRole.Inspector },
      orderBy: [{ itemId: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        itemId: true,
        valueText: true,
        valueNumber: true,
        status: true,
        comment: true,
        createdAt: true,
      },
    });
    const inspLatestByItem: Record<string, (typeof inspRuns)[number]> = {};
    for (const r of inspRuns) {
      // first per item (due to DESC) = latest
      if (!inspLatestByItem[r.itemId]) inspLatestByItem[r.itemId] = r;
    }

    const payload = this.toFE(row);
    (payload as any).runnerInspector = {
      overallRecommendation: row.inspectorRecommendation ?? null,
      items: (row.items || []).map((it) => {
        const r = inspLatestByItem[it.id];
        return {
          itemId: it.id,
          checklistItemId: it.itemId, // link to RefChecklistItem
          status:
            it.inspectorStatus === InspectorItemStatus.PASS ? 'PASS'
              : it.inspectorStatus === InspectorItemStatus.FAIL ? 'FAIL'
                : null,
          measurement:
            r?.valueNumber != null ? String(r.valueNumber)
              : (r?.valueText ?? ''),
          remark: it.inspectorNote ?? r?.comment ?? '',
          lastSavedAt: r?.createdAt ?? null,
        };
      }),
    };

    /**
     * HOD snapshot:
     * For each item, show the latest HOD quick-save comment (hodRemark) and
     * its lastSavedAt; header-level draft note lives in hodRemarks.
     */
    const hodRuns = await this.prisma.wirItemRun.findMany({
      where: { wirId, actorRole: WirRunnerActorRole.HOD },
      orderBy: [{ itemId: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        itemId: true,
        comment: true,
        createdAt: true,
      },
    });
    const hodLatestByItem: Record<string, (typeof hodRuns)[number]> = {};
    for (const r of hodRuns) {
      if (!hodLatestByItem[r.itemId]) hodLatestByItem[r.itemId] = r;
    }

    (payload as any).runnerHod = {
      notes: row.hodRemarks ?? null, // header draft note (from HOD Save)
      items: (row.items || []).map((it) => {
        const r = hodLatestByItem[it.id];
        return {
          itemId: it.id,
          hodRemark: it.hodNote ?? r?.comment ?? '',
          lastSavedAt: r?.createdAt ?? null,
        };
      }),
    };
    return payload;
  }

  // --- Generate next WIR code inside a transaction
  private async nextWirCode(tx: Prisma.TransactionClient): Promise<string> {
    const last = await tx.wir.findFirst({
      where: { code: { startsWith: 'WIR-' } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });

    const lastNum = (() => {
      const raw = last?.code?.split('-')?.[1] ?? '0000';
      const n = parseInt(raw, 10);
      return Number.isFinite(n) ? n : 0;
    })();

    const next = (lastNum + 1).toString().padStart(4, '0');
    return `WIR-${next}`;
  }

  // Map project role + header context → runner actor role
  private mapRunnerActorRoleForWir(
    projectRole: string | null,
    wir: { contractorId: string | null; inspectorId: string | null; hodId: string | null },
    actorUserId: string,
  ): WirRunnerActorRole {
    if (wir.contractorId && wir.contractorId === actorUserId) {
      return WirRunnerActorRole.Contractor;
    }
    if (wir.inspectorId && wir.inspectorId === actorUserId) {
      return WirRunnerActorRole.Inspector;
    }
    if (wir.hodId && wir.hodId === actorUserId) {
      return WirRunnerActorRole.HOD;
    }

    const raw = (projectRole || '').toString().trim().toLowerCase().replace(/[_\s-]+/g, '');
    switch (raw) {
      case 'contractor':
        return WirRunnerActorRole.Contractor;
      case 'pmc':
      case 'ihpmt':
      case 'consultant':
        return WirRunnerActorRole.Inspector;
      default:
        return WirRunnerActorRole.Other;
    }
  }

  async create(projectId: string, dto: any, createdById?: string) {
    const attempt = async (tx: Prisma.TransactionClient) => {
      const code = await this.nextWirCode(tx);

      const created = await tx.wir.create({
        data: {
          projectId,
          title: dto?.title ?? 'Inspection Request',
          discipline: dto?.discipline ?? null,
          stage: dto?.stage ?? null,
          forDate: dto?.forDate ? new Date(dto.forDate) : null,
          forTime: dto?.forTime ?? null,
          cityTown: dto?.cityTown ?? null,
          stateName: dto?.stateName ?? null,
          description: dto?.description ?? null,
          createdById: createdById ?? null,
          code,
          ...(Array.isArray(dto?.items) && dto.items.length
            ? {
              items: {
                create: dto.items.map((it: any, idx: number) => ({
                  seq: idx + 1,
                  name: it?.name ?? 'Item',
                  spec: it?.spec ?? null,
                  required: it?.required ?? null, // 'Mandatory' | 'Optional' | null
                  tolerance: it?.tolerance ?? null,
                  photoCount: Number.isFinite(it?.photoCount) ? it.photoCount : 0,
                  status: toWirItemStatus(it?.status) ?? WirItemStatus.Unknown,

                  //   // NEW passthroughs if caller provides
                  //   code: it?.code ?? null,
                  //   unit: it?.unit ?? null,
                  //   tags: Array.isArray(it?.tags) ? it.tags : [],
                  //   critical: typeof it?.critical === 'boolean' ? it.critical : null,
                  //   value: (typeof it?.value === 'number' || typeof it?.value === 'string') ? it.value : null,
                })),
              },
            }
            : {}),
        },
        include: this.baseInclude,
      });

      const refIds: string[] = Array.isArray(dto?.refChecklistIds) ? dto.refChecklistIds : [];
      const shouldMaterialize = dto?.materializeItemsFromRef !== false; // default true

      if (refIds.length) {
        const refs = await tx.refChecklist.findMany({
          where: { id: { in: refIds } },
          include: { items: { orderBy: { seq: 'asc' } } },
        });

        await Promise.all(
          refs.map((ref, idx) =>
            tx.wirChecklist.create({
              data: {
                wirId: created.wirId,
                checklistId: ref.id,
                checklistCode: ref.code ?? null,
                checklistTitle: ref.title,
                discipline: ref.discipline,
                versionLabel: ref.versionLabel ?? null,
                itemsCount: ref.items.length,
                itemIds: ref.items.map((i) => i.id),
                order: idx,
              },
            })
          )
        );

        if (shouldMaterialize) {
          const materialItems = refs.flatMap((ref) =>
            ref.items.map((ri, i) => ({
              wirId: created.wirId,

              checklistId: ref.id,
              itemId: ri.id,
              sourceChecklistId: ref.id,
              sourceChecklistItemId: ri.id,

              seq: ri.seq ?? i + 1,

              name: ri.text,
              spec: null, // free text only
              required: ri.requirement ?? null,
              tolerance: ri.tolerance ?? null,
              photoCount: 0,
              status: WirItemStatus.Unknown,

              code: ri.itemCode ?? null,
              unit: ri.units ?? null,
              tags: ri.tags ?? [],
              critical: typeof ri.critical === 'boolean' ? ri.critical : null,
              aiEnabled: typeof ri.aiEnabled === 'boolean' ? ri.aiEnabled : null,
              aiConfidence: ri.aiConfidence ?? null,
              base: ri.base ?? null,
              plus: ri.plus ?? null,
              minus: ri.minus ?? null,
            }))
          );

          if (materialItems.length) {
            await tx.wirItem.createMany({ data: materialItems });
          }
        }
      }

      const actorName = await this.resolveActorName(createdById);
      await this.recordHistory(tx, {
        projectId,
        wirId: created.wirId,
        action: WirAction.Created,
        actorUserId: createdById ?? null,
        actorName,
        toStatus: created.status,
        toBicUserId: created.bicUserId ?? null,
        notes: dto?.__note || null,
        meta: { code: created.code, refChecklistIds: refIds, materialized: !!shouldMaterialize },
      });

      return tx.wir.findUnique({
        where: { wirId: created.wirId },
        include: this.baseInclude,
      });
    };

    for (let i = 0; i < 3; i++) {
      try {
        const created = await this.prisma.$transaction((tx) => attempt(tx));
        return this.toFE(created);
      } catch (e: any) {
        const isUnique = e?.code === 'P2002' || /unique/i.test(String(e?.message || ''));
        if (!isUnique || i === 2) throw e;
      }
    }
  }

  private async ensureEditableByAuthor(projectId: string, wirId: string, userId: string) {
    const row = await this.prisma.wir.findUnique({ where: { wirId } });
    if (!row || row.projectId !== projectId) throw new NotFoundException('WIR not found');
    if (row.status !== WirStatus.Draft) throw new ForbiddenException('Only Draft can be edited');

    const isCtr = await this.isContractorForProject(userId, projectId);
    if (!isCtr) throw new ForbiddenException('Only Contractors can edit Draft WIRs');

    if (row.createdById && row.createdById !== userId) {
      throw new ForbiddenException('Only author can edit this Draft');
    }
    return row;
  }

  async update(projectId: string, wirId: string, patch: UpdateWirInput, userId: string) {
    await this.ensureEditableByAuthor(projectId, wirId, userId);

    return await this.prisma.$transaction(async (tx) => {
      const before = await tx.wir.findUnique({
        where: { wirId },
        select: { status: true, bicUserId: true }
      });

      const { status, ...rest } = patch || {};
      const data: Prisma.WirUpdateInput = {
        code: rest.code ?? undefined,
        title: rest.title ?? undefined,
        discipline: (rest.discipline as any) ?? undefined,
        stage: rest.stage ?? undefined,
        forDate: rest.forDate ? new Date(rest.forDate) : undefined,
        forTime: rest.forTime ?? undefined,
        cityTown: rest.cityTown ?? undefined,
        stateName: rest.stateName ?? undefined,
        contractor: rest.contractorId
          ? { connect: { userId: rest.contractorId } }
          : rest.contractorId === null
            ? { disconnect: true }
            : undefined,
        inspector: rest.inspectorId
          ? { connect: { userId: rest.inspectorId } }
          : rest.inspectorId === null
            ? { disconnect: true }
            : undefined,
        hod: rest.hodId
          ? { connect: { userId: rest.hodId } }
          : rest.hodId === null
            ? { disconnect: true }
            : undefined,
        description: rest.description ?? undefined,
        health: (rest.health as any) ?? undefined,
      };

      const updated = await tx.wir.update({
        where: { wirId },
        data,
        include: this.baseInclude,
      });
      if (updated.projectId !== projectId) throw new ForbiddenException('Project mismatch');

      const actorName = await this.resolveActorName(userId);
      await this.recordHistory(tx, {
        projectId,
        wirId,
        action: WirAction.Updated,
        actorUserId: userId,
        actorName,
        fromStatus: before?.status ?? null,
        toStatus: updated.status ?? null,
        fromBicUserId: before?.bicUserId ?? null,
        toBicUserId: updated.bicUserId ?? null,
        meta: { patch: { ...rest } }
      });

      return this.toFE(updated);
    });
  }

  /* ---------- Actions (status machine) ---------- */
  private ensure(can: boolean, msg: string) {
    if (!can) throw new ForbiddenException(msg);
  }

  private canSubmit(role: string, current: WirStatus) {
    return role === 'Contractor' && current === WirStatus.Draft;
  }
  /** Inspector → "Send to HOD" */
  private canRecommend(role: string, current: WirStatus) {
    // Only from Submitted
    if (current !== WirStatus.Submitted) return false;
    if (!role) return false;

    // Inspector is derived from PMC family
    const allowed = ['PMC', 'IH-PMT', 'Consultant'];
    return allowed.includes(role);
  }

  async submit(projectId: string, wirId: string, roleFromBody: string, userId: string) {
    return await this.prisma.$transaction(async (tx) => {
      const row = await tx.wir.findUnique({ where: { wirId } });
      if (!row || row.projectId !== projectId) throw new NotFoundException('WIR not found');

      const isCtr = await this.isContractorForProject(userId, projectId);
      if (!isCtr) throw new ForbiddenException('Only Contractors can submit a WIR');

      if (row.status === WirStatus.Draft && row.createdById && row.createdById !== userId) {
        throw new ForbiddenException('Only the author can submit this Draft');
      }
      this.ensure(this.canSubmit('Contractor', row.status), 'Not allowed to submit in current status');

      const nextBicUserId = row.inspectorId ?? row.hodId ?? null;
      const updated = await tx.wir.update({
        where: { wirId },
        data: { status: WirStatus.Submitted, bicUserId: nextBicUserId },
        include: this.baseInclude,
      });

      const actorName = await this.resolveActorName(userId);
      await this.recordHistory(tx, {
        projectId,
        wirId,
        action: WirAction.Submitted,
        actorUserId: userId,
        actorName,
        fromStatus: row.status,
        toStatus: updated.status,
        fromBicUserId: row.bicUserId ?? null,
        toBicUserId: updated.bicUserId ?? null,
      });

      return this.toFE(updated);
    });
  }

  async recommend(projectId: string, wirId: string, role: string, actorUserId: string,) {
    return await this.prisma.$transaction(async (tx) => {
      const row = await tx.wir.findUnique({ where: { wirId } });
      if (!row || row.projectId !== projectId) throw new NotFoundException('WIR not found');
      this.ensure(this.canRecommend(role, row.status), 'Not allowed to recommend in current status');

      const now = new Date();

      const updated = await tx.wir.update({
        where: { wirId },
        data: {
          status: WirStatus.Recommended,
          bicUserId: row.hodId ?? null,
          // NEW: mark inspector header decision when recommending
          inspectorRecommendation: InspectorRecommendation.APPROVE,
          inspectorReviewedAt: now,
          // do not touch inspectorRemarks here (no comment param yet)
        },
        include: this.baseInclude,
      });

      await this.recordHistory(tx, {
        projectId,
        wirId,
        action: WirAction.Recommended,
        fromStatus: row.status,
        toStatus: updated.status,
        fromBicUserId: row.bicUserId ?? null,
        toBicUserId: updated.bicUserId ?? null,
        actorUserId,
        // actorName we’ll wire later once we decide source (ProjectMember vs User)
      });

      return this.toFE(updated);
    });
  }

  async approve(projectId: string, wirId: string, role: string, actorUserId: string,) {
    return await this.prisma.$transaction(async (tx) => {
      const row = await tx.wir.findUnique({ where: { wirId } });
      if (!row || row.projectId !== projectId) throw new NotFoundException('WIR not found');
      this.ensure(this.canApprove(role, row.status), 'Not allowed to approve in current status');

      const now = new Date();

      const updated = await tx.wir.update({
        where: { wirId },
        data: {
          status: WirStatus.Approved,
          health: row.health ?? ProjectHealth.Green,
          bicUserId: null,
          // NEW: mark HOD header decision as ACCEPT
          hodOutcome: HodOutcome.ACCEPT,
          hodDecidedAt: now,
        },
        include: this.baseInclude,
      });

      await this.recordHistory(tx, {
        projectId,
        wirId,
        action: WirAction.Approved,
        fromStatus: row.status,
        toStatus: updated.status,
        fromBicUserId: row.bicUserId ?? null,
        toBicUserId: updated.bicUserId ?? null,
        actorUserId,
      });

      return this.toFE(updated);
    });
  }

  async reject(
    projectId: string,
    wirId: string,
    role: string,
    comment: string,
    actorUserId: string,
  ) {
    return await this.prisma.$transaction(async (tx) => {
      const row = await tx.wir.findUnique({ where: { wirId } });
      if (!row || row.projectId !== projectId) {
        throw new NotFoundException('WIR not found');
      }

      this.ensure(this.canReject(role, row.status), 'Not allowed to reject in current status');
      const now = new Date();

      const updated = await tx.wir.update({
        where: { wirId },
        data: {
          status: WirStatus.Rejected,
          health: ProjectHealth.Red,
          // HOD REJECT → WIR also closes; no further ball-in-court
          bicUserId: null,
          // NEW: header decision
          hodOutcome: HodOutcome.REJECT,
          hodDecidedAt: now,
          hodRemarks: comment || null,
        },
        include: this.baseInclude,
      });

      await this.recordHistory(tx, {
        projectId,
        wirId,
        action: WirAction.Rejected,
        fromStatus: row.status,
        toStatus: updated.status,
        fromBicUserId: row.bicUserId ?? null,
        toBicUserId: updated.bicUserId ?? null,
        actorUserId,
        // keep the rejection note here
        notes: comment || null,
      });

      return this.toFE(updated);
    });
  }

  async returnWir(
    projectId: string,
    wirId: string,
    role: string,
    comment: string | null,
    actorUserId: string,
  ) {
    return await this.prisma.$transaction(async (tx) => {
      const row = await tx.wir.findUnique({ where: { wirId } });
      if (!row || row.projectId !== projectId) {
        throw new NotFoundException('WIR not found');
      }

      // Same gate as APPROVE/REJECT: HOD from PMC-family on Recommended WIR
      this.ensure(
        this.canApprove(role, row.status),
        'Not allowed to return in current status',
      );

      const now = new Date();

      // HOD RETURN -> send back to Contractor (author) and reopen as Draft
      const updated = await tx.wir.update({
        where: { wirId },
        data: {
          status: WirStatus.Draft,
          bicUserId: row.createdById ?? row.contractorId ?? null,
          // NEW: header decision for RETURN
          hodOutcome: HodOutcome.RETURN,
          hodDecidedAt: now,
          hodRemarks: comment || null,
        },
        include: this.baseInclude,
      });

      const actorName = await this.resolveActorName(actorUserId);

      await this.recordHistory(tx, {
        projectId,
        wirId,
        action: WirAction.Updated, // we tag this in meta as a "Returned" event
        actorUserId,
        actorName,
        fromStatus: row.status,
        toStatus: updated.status,
        fromBicUserId: row.bicUserId ?? null,
        toBicUserId: updated.bicUserId ?? null,
        notes: comment,
        meta: {
          kind: 'Returned',
          comment,
        },
      });

      return this.toFE(updated);
    });
  }

  private async recordHistory(
    tx: Prisma.TransactionClient,
    args: {
      projectId: string;
      wirId: string;
      action: WirAction;
      actorUserId?: string | null;
      actorName?: string | null;
      fromStatus?: WirStatus | null;
      toStatus?: WirStatus | null;
      fromBicUserId?: string | null;
      toBicUserId?: string | null;
      notes?: string | null;
      meta?: any;
    }
  ) {
    const payload: Prisma.WirHistoryUncheckedCreateInput = {
      projectId: args.projectId,
      wirId: args.wirId,
      action: args.action,
      actorUserId: args.actorUserId ?? null,
      actorName: args.actorName ?? null,
      fromStatus: args.fromStatus ?? null,
      toStatus: args.toStatus ?? null,
      fromBicUserId: args.fromBicUserId ?? null,
      toBicUserId: args.toBicUserId ?? null,
      notes: args.notes ?? null,
      meta: args.meta ?? undefined,
    };

    await tx.wirHistory.create({ data: payload });
  }

  private async resolveActorName(userId?: string | null): Promise<string | null> {
    if (!userId) return null;
    const u = await this.prisma.user.findUnique({
      where: { userId },
      select: { firstName: true, lastName: true }
    });
    if (!u) return null;
    const f = (u.firstName || '').trim();
    const l = (u.lastName || '').trim();
    return (f && l) ? `${f} ${l}` : (f || l || null);
  }

  // Create one runner entry for a given item
  async addItemRun(
    projectId: string,
    wirId: string,
    itemId: string,
    actorUserId: string,
    dto: CreateItemRunDto,
  ) {
    // Ensure WIR belongs to this project and fetch role context
    const wir = await this.prisma.wir.findFirst({
      where: { wirId, projectId },
      select: {
        wirId: true,
        contractorId: true,
        inspectorId: true,
        hodId: true,
      },
    });
    if (!wir) throw new NotFoundException('WIR not found for this project');

    const item = await this.prisma.wirItem.findFirst({
      where: { id: itemId, wirId },
      select: { id: true },
    });
    if (!item) throw new NotFoundException('WIR item not found for this WIR');

    const projectRole = await this.getProjectRole(actorUserId, projectId);
    const actorRole = this.mapRunnerActorRoleForWir(projectRole, wir, actorUserId);
    const actorName = await this.resolveActorName(actorUserId);

    const statusEnum = dto.status ? toWirItemStatus(dto.status) : undefined;

    const valueNumber =
      typeof dto.valueNumber === 'number' || typeof dto.valueNumber === 'string'
        ? dto.valueNumber
        : null;

    const accuracyM =
      typeof dto.accuracyM === 'number' || typeof dto.accuracyM === 'string'
        ? Number(dto.accuracyM)
        : null;

    const created = await this.prisma.wirItemRun.create({
      data: {
        wirId,
        itemId,

        actorUserId,
        actorRole,
        actorName: actorName ?? null,

        valueText: dto.valueText ?? null,
        valueNumber,
        unit: dto.unit ?? null,
        status: statusEnum ?? null,
        comment: dto.comment ?? null,

        lat: typeof dto.lat === 'number' ? dto.lat : null,
        lng: typeof dto.lng === 'number' ? dto.lng : null,
        accuracyM,
        locationNote: dto.locationNote ?? null,

        meta: dto.meta ?? undefined,
      },
    });

    return {
      id: created.id,
      wirId: created.wirId,
      itemId: created.itemId,
      actorUserId: created.actorUserId,
      actorRole: created.actorRole,
      actorName: created.actorName,
      valueText: created.valueText,
      valueNumber: created.valueNumber,
      unit: created.unit,
      status: created.status,
      comment: created.comment,
      lat: created.lat,
      lng: created.lng,
      accuracyM: created.accuracyM,
      locationNote: created.locationNote,
      createdAt: created.createdAt,
    };
  }

  // Fetch all runs for an item (or for the whole WIR if itemId omitted)
  async listItemRuns(
    projectId: string,
    wirId: string,
    itemId?: string,
  ) {
    await this.ensureWirInProject(projectId, wirId);

    const where: Prisma.WirItemRunWhereInput = {
      wirId,
      ...(itemId ? { itemId } : {}),
    };

    const rows = await this.prisma.wirItemRun.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    return rows.map((r) => ({
      id: r.id,
      wirId: r.wirId,
      itemId: r.itemId,
      actorUserId: r.actorUserId,
      actorRole: r.actorRole,
      actorName: r.actorName,
      valueText: r.valueText,
      valueNumber: r.valueNumber,
      unit: r.unit,
      status: r.status,
      comment: r.comment,
      lat: r.lat,
      lng: r.lng,
      accuracyM: r.accuracyM,
      locationNote: r.locationNote,
      createdAt: r.createdAt,
    }));
  }

  async history(projectId: string, wirId: string) {
    const rows = await this.prisma.wirHistory.findMany({
      where: { projectId, wirId },
      orderBy: { createdAt: 'asc' }
    });

    return rows.map((r, idx) => ({
      sNo: idx + 1,
      id: r.id,
      date: r.createdAt,
      action: r.action,
      by: r.actorName || r.actorUserId || null,
      fromStatus: r.fromStatus || null,
      toStatus: r.toStatus || null,
      notes: r.notes || null,
    }));
  }

  async reschedule(
    projectId: string,
    wirId: string,
    userId: string,
    body: {
      role?: string;
      currentDateISO?: string;
      currentTime12h?: string;
      newDateISO: string;
      newTime12h: string;
      notes?: string | null;
    }
  ) {
    const newDateISO = (body?.newDateISO || '').trim();
    const newTime12h = (body?.newTime12h || '').trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDateISO)) {
      throw new BadRequestException('newDateISO must be YYYY-MM-DD');
    }
    if (!/^\d{1,2}:\d{2}\s?(AM|PM)$/i.test(newTime12h)) {
      throw new BadRequestException('newTime12h must be HH:MM AM/PM');
    }

    return await this.prisma.$transaction(async (tx) => {
      const row = await tx.wir.findUnique({
        where: { wirId },
        include: this.baseInclude,
      });
      if (!row || row.projectId !== projectId) throw new NotFoundException('WIR not found');

      if (row.status === WirStatus.Draft) {
        throw new ForbiddenException('Cannot reschedule a Draft WIR');
      }

      const actorRole = await this.getProjectRole(userId, projectId);
      const isContractor = actorRole === 'Contractor';
      const isPrivileged =
        actorRole === 'PMC' ||
        actorRole === 'IH-PMT' ||
        actorRole === 'Consultant' ||
        actorRole === 'Admin' ||
        actorRole === 'Client';

      if (isContractor) {
        const isAuthor = !!row.createdById && row.createdById === userId;
        const isBIC = !!row.bicUserId && row.bicUserId === userId;
        if (!isAuthor && !isBIC) {
          throw new ForbiddenException('Contractor can reschedule only own/BIC WIR');
        }
      } else if (!isPrivileged) {
        throw new ForbiddenException('Not allowed to reschedule');
      }

      const newForDate = new Date(`${newDateISO}T00:00:00.000Z`);
      const newForTime = newTime12h.toUpperCase();

      const before = { forDate: row.forDate, forTime: row.forTime };

      const actorName = await this.resolveActorName(userId);

      const updated = await tx.wir.update({
        where: { wirId },
        data: {
          forDate: newForDate,
          forTime: newForTime,

          rescheduleForDate: newForDate,
          rescheduleForTime: newForTime,
          rescheduleReason: body?.notes ?? null,
          rescheduledById: userId,
        },
        include: this.baseInclude,
      });

      await this.recordHistory(tx, {
        projectId,
        wirId,
        action: WirAction.Rescheduled,
        actorUserId: userId,
        actorName,
        fromStatus: row.status,
        toStatus: updated.status,
        fromBicUserId: row.bicUserId ?? null,
        toBicUserId: updated.bicUserId ?? null,
        notes: body?.notes ?? null,
        meta: {
          schedule: {
            from: { date: before.forDate, time: before.forTime },
            to: { date: updated.forDate, time: updated.forTime },
            clientSent: {
              currentDateISO: body?.currentDateISO ?? null,
              currentTime12h: body?.currentTime12h ?? null,
              newDateISO,
              newTime12h,
            },
          },
        },
      });

      return this.toFE(updated);
    });

  }

  // Create one evidence row for a WIR (optionally linked to item/run)
  async addEvidence(
    projectId: string,
    wirId: string,
    actorUserId: string,       // for auth / later audit if needed
    dto: CreateEvidenceDto,
  ) {
    await this.ensureWirInProject(projectId, wirId);

    if (!dto.url || !dto.url.trim()) {
      throw new BadRequestException('url is required');
    }

    // Optional consistency checks
    if (dto.itemId) {
      const item = await this.prisma.wirItem.findFirst({
        where: { id: dto.itemId, wirId },
        select: { id: true },
      });
      if (!item) throw new BadRequestException('Invalid itemId for this WIR');
    }

    if (dto.runId) {
      const run = await this.prisma.wirItemRun.findFirst({
        where: { id: dto.runId, wirId },
        select: { id: true },
      });
      if (!run) throw new BadRequestException('Invalid runId for this WIR');
    }

    const accuracyM =
      typeof dto.accuracyM === 'number' || typeof dto.accuracyM === 'string'
        ? Number(dto.accuracyM)
        : null;

    const capturedAt =
      dto.capturedAt && dto.capturedAt.trim()
        ? new Date(dto.capturedAt)
        : null;

    const created = await this.prisma.wirItemEvidence.create({
      data: {
        wirId,
        itemId: dto.itemId || null,
        runId: dto.runId || null,
        kind: toEvidenceKind(dto.kind),

        url: dto.url.trim(),
        thumbUrl: dto.thumbUrl ?? null,
        fileName: dto.fileName ?? null,
        fileSize: dto.fileSize ?? null,
        mimeType: dto.mimeType ?? null,

        capturedAt,
        lat: typeof dto.lat === 'number' ? dto.lat : null,
        lng: typeof dto.lng === 'number' ? dto.lng : null,
        accuracyM,
        meta: dto.meta ?? undefined,
      },
    });

    return {
      id: created.id,
      wirId: created.wirId,
      itemId: created.itemId,
      runId: created.runId,
      kind: created.kind,
      url: created.url,
      thumbUrl: created.thumbUrl,
      fileName: created.fileName,
      fileSize: created.fileSize,
      mimeType: created.mimeType,
      capturedAt: created.capturedAt,
      lat: created.lat,
      lng: created.lng,
      accuracyM: created.accuracyM,
      createdAt: created.createdAt,
    };
  }

  // ---------------- NEW: Runner – Inspector quick-save ----------------
  async saveRunnerInspector(
    projectId: string,
    wirId: string,
    userId: string,
    body: {
      items: { itemId: string; status: 'PASS' | 'FAIL' | null; measurement: string | null; remark: string | null; }[];
      overallRecommendation?: 'APPROVE' | 'APPROVE_WITH_COMMENTS' | 'REJECT' | null;
    },
  ) {
    await this.ensureWirInProject(projectId, wirId);

    const items = Array.isArray(body?.items) ? body.items : [];
    const now = new Date();
    const actorName = await this.resolveActorName(userId);

    for (const it of items) {
      const targetItemId = await this.resolveWirItemId(wirId, it.itemId);

      const rawMeasurement = (it?.measurement ?? '');
      const measurementTrim = typeof rawMeasurement === 'string' ? rawMeasurement.trim() : '';
      const valueNumber = measurementTrim !== '' && !isNaN(Number(measurementTrim)) ? Number(measurementTrim) : null;
      const valueText = valueNumber === null ? (measurementTrim || null) : null;

      const statusProvided = it?.status === 'PASS' || it?.status === 'FAIL';
      const remarkTrim = (it?.remark ?? '').toString().trim();
      const remarkProvided = remarkTrim.length > 0;
      const measurementProvided = valueNumber !== null || (valueText !== null && valueText !== '');

      // If nothing meaningful was provided, skip this row entirely
      if (!statusProvided && !remarkProvided && !measurementProvided) {
        continue;
      }

      // Create a run row capturing only what was provided
      await this.prisma.wirItemRun.create({
        data: {
          wirId,
          itemId: targetItemId,
          actorUserId: userId,
          actorRole: WirRunnerActorRole.Inspector,
          actorName: actorName ?? null,
          valueText: measurementProvided ? valueText : null,
          valueNumber: measurementProvided ? valueNumber : null,
          unit: null,
          status: statusProvided
            ? (it.status === 'PASS' ? WirItemStatus.OK : WirItemStatus.NCR)
            : null,
          comment: remarkProvided ? remarkTrim : null,
          createdAt: now,
        },
      });

      // Mirror only the fields actually provided (avoid wiping with nulls)
      const mirror: Prisma.WirItemUpdateInput = {};
      if (statusProvided) {
        mirror.inspectorStatus = it.status === 'PASS'
          ? InspectorItemStatus.PASS
          : InspectorItemStatus.FAIL;
      }
      if (remarkProvided) {
        mirror.inspectorNote = remarkTrim;
      }
      if (Object.keys(mirror).length > 0) {
        (mirror as any).updatedAt = now;
        await this.prisma.wirItem.update({
          where: { id: targetItemId },
          data: mirror,
        });
      }
    }

    if (body?.overallRecommendation) {
      await this.prisma.wir.update({
        where: { wirId },
        data: {
          inspectorRecommendation: body.overallRecommendation as InspectorRecommendation,
          inspectorReviewedAt: now,
        },
      });
    }

    // Return fresh payload with runner snapshots hydrated
    return this.get(projectId, wirId, userId);
  }

  /** HOD → Finalize (ACCEPT / REJECT) */
  private canApprove(role: string, current: WirStatus) {
    // Only after Inspector has recommended
    if (current !== WirStatus.Recommended) return false;
    if (!role) return false;

    // HOD is also derived from PMC family (NOT Admin/Client)
    const allowed = ['PMC', 'IH-PMT', 'Consultant'];
    return allowed.includes(role);
  }

  /** HOD → Finalize with REJECT (closed) */
  private canReject(role: string, current: WirStatus) {
    // Same gate as approve: final decision by PMC-family HOD
    return this.canApprove(role, current);
  }

  // ----------------Runner – HOD finalize (store notes/outcome only) ----------------
  async finalizeRunnerHod(
    projectId: string,
    wirId: string,
    userId: string,
    body: {
      outcome: 'ACCEPT' | 'RETURN' | 'REJECT';
      notes?: string | null;
      inspectorRecommendation?: 'APPROVE' | 'APPROVE_WITH_COMMENTS' | 'REJECT' | null;
    },
  ) {
    await this.ensureWirInProject(projectId, wirId);

    // Only persist HOD notes / header outcome here; do NOT change main WIR status
    const now = new Date();

    await this.prisma.wir.update({
      where: { wirId },
      data: {
        hodOutcome: (body?.outcome ?? null) as any,
        hodRemarks: body?.notes ?? null,
        hodDecidedAt: now,
        // optionally persist inspectorRecommendation snapshot from this finalize
        ...(body?.inspectorRecommendation ? { inspectorRecommendation: body.inspectorRecommendation as InspectorRecommendation, inspectorReviewedAt: now } : {}),
      },
    });

    return this.get(projectId, wirId, userId);
  }

  async saveRunnerHod(
    projectId: string,
    wirId: string,
    userId: string,
    body: {
      items: { itemId: string; hodRemark: string | null }[];
      notes?: string | null; // optional header draft note (stored to hodRemarks but w/o outcome/decidedAt)
    },
  ) {
    await this.ensureWirInProject(projectId, wirId);

    const now = new Date();
    const items = Array.isArray(body?.items) ? body.items : [];

    // For history/audit, write a WirItemRun row with actorRole=HOD (comment only)
    // and mirror to WirItem.hodNote for fast readback.
    for (const it of items) {
      const targetItemId = await this.resolveWirItemId(wirId, it.itemId);

      await this.prisma.wirItemRun.create({
        data: {
          wirId,
          itemId: targetItemId,
          actorUserId: userId,
          actorRole: WirRunnerActorRole.HOD,
          actorName: await this.resolveActorName(userId),
          valueText: null,
          valueNumber: null,
          unit: null,
          status: null,                 // HOD quick-save does not alter pass/fail
          comment: it?.hodRemark ?? null,
          createdAt: now,
        },
      });

      await this.prisma.wirItem.update({
        where: { id: targetItemId },
        data: {
          hodNote: it?.hodRemark ?? null,
          // (updatedAt auto-bumps; FE can use this for “just saved” highlight)
        },
      });
    }

    // Optional: persist a header-level *draft* note without setting outcome/decidedAt
    if (typeof body?.notes !== 'undefined') {
      await this.prisma.wir.update({
        where: { wirId },
        data: {
          // store as hodRemarks (draft text) but do NOT set hodOutcome/hodDecidedAt here
          hodRemarks: body.notes,
        },
      });
    }

    // Return fresh payload
    return this.get(projectId, wirId, userId);
  }

  // List evidences for a WIR (optionally filtered by item/run)
  async listEvidences(
    projectId: string,
    wirId: string,
    filters?: { itemId?: string; runId?: string },
  ) {
    await this.ensureWirInProject(projectId, wirId);

    const where: Prisma.WirItemEvidenceWhereInput = {
      wirId,
      ...(filters?.itemId ? { itemId: filters.itemId } : {}),
      ...(filters?.runId ? { runId: filters.runId } : {}),
    };

    const rows = await this.prisma.wirItemEvidence.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    return rows.map((r) => ({
      id: r.id,
      wirId: r.wirId,
      itemId: r.itemId,
      runId: r.runId,
      kind: r.kind,
      url: r.url,
      thumbUrl: r.thumbUrl,
      fileName: r.fileName,
      fileSize: r.fileSize,
      mimeType: r.mimeType,
      capturedAt: r.capturedAt,
      lat: r.lat,
      lng: r.lng,
      accuracyM: r.accuracyM,
      createdAt: r.createdAt,
    }));
  }

  // Minimal guard to ensure the WIR exists in the given project
  private async ensureWirInProject(projectId: string, wirId: string) {
    const w = await this.prisma.wir.findFirst({ where: { wirId, projectId }, select: { wirId: true } });
    if (!w) throw new NotFoundException('WIR not found for this project');
  }

  // Resolve a candidate id (which may be WirItem.id OR RefChecklistItem id)
  // to the actual WirItem.id for this WIR.
  private async resolveWirItemId(wirId: string, candidateId: string): Promise<string> {
    // 1) Exact WirItem.id
    const direct = await this.prisma.wirItem.findFirst({
      where: { id: candidateId, wirId },
      select: { id: true },
    });
    if (direct) return direct.id;

    // 2) Attached RefChecklistItem id -> WirItem.itemId
    const byAttached = await this.prisma.wirItem.findFirst({
      where: { wirId, itemId: candidateId },
      select: { id: true },
    });
    if (byAttached) return byAttached.id;

    // 3) Provenance RefChecklistItem id -> WirItem.sourceChecklistItemId
    const bySource = await this.prisma.wirItem.findFirst({
      where: { wirId, sourceChecklistItemId: candidateId },
      select: { id: true },
    });
    if (bySource) return bySource.id;

    throw new BadRequestException('Invalid itemId for this WIR');
  }

  // Create a new discussion comment (top-level or reply)
  async addDiscussion(projectId: string, wirId: string, authorId: string, dto: CreateDiscussionDto) {
    await this.ensureWirInProject(projectId, wirId);

    if (dto.parentId) {
      const p = await this.prisma.wirDiscussion.findFirst({
        where: { id: dto.parentId, wirId, deletedAt: null },
        select: { id: true },
      });
      if (!p) throw new BadRequestException('Invalid parentId for this WIR');
    }

    return this.prisma.wirDiscussion.create({
      data: {
        wirId,
        authorId,
        body: (dto.body || '').trim(),
        parentId: dto.parentId || null,
      },
      include: {
        author: { select: { userId: true, firstName: true, lastName: true, code: true } },
      },
    });
  }

  // List flat discussion for a WIR (client can thread by parentId)
  async listDiscussions(projectId: string, wirId: string) {
    await this.ensureWirInProject(projectId, wirId);

    return this.prisma.wirDiscussion.findMany({
      where: { wirId, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }],
      include: {
        author: { select: { userId: true, firstName: true, lastName: true, code: true } },
      },
    });
  }

  // Update a comment (author-only)
  async updateDiscussion(projectId: string, wirId: string, commentId: string, actorUserId: string, dto: UpdateDiscussionDto) {
    await this.ensureWirInProject(projectId, wirId);

    const row = await this.prisma.wirDiscussion.findFirst({
      where: { id: commentId, wirId, deletedAt: null },
      select: { id: true, authorId: true },
    });
    if (!row) throw new NotFoundException('Comment not found');
    if (String(row.authorId) !== String(actorUserId)) throw new ForbiddenException('Only author can edit');

    return this.prisma.wirDiscussion.update({
      where: { id: commentId },
      data: { body: (dto.body || '').trim() },
      include: {
        author: { select: { userId: true, firstName: true, lastName: true, code: true } },
      },
    });
  }

  // Soft-delete a comment (author-only)
  async deleteDiscussion(projectId: string, wirId: string, commentId: string, actorUserId: string) {
    await this.ensureWirInProject(projectId, wirId);

    const row = await this.prisma.wirDiscussion.findFirst({
      where: { id: commentId, wirId, deletedAt: null },
      select: { id: true, authorId: true },
    });
    if (!row) throw new NotFoundException('Comment not found');
    if (String(row.authorId) !== String(actorUserId)) throw new ForbiddenException('Only author can delete');

    await this.prisma.wirDiscussion.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }

}
