//pms/pms-backend/src/modules/project-modules/wir/wir.service.ts
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateWirDto, UpdateWirHeaderDto, AttachChecklistsDto, RollForwardDto, DispatchWirDto } from './dto';
import { Prisma, WirItemStatus, WirStatus, HodOutcome, WirItemEvidenceKind, WirAction } from '@prisma/client';
import { randomUUID } from 'crypto';
import { InspectorSaveDto } from './inspector-runner-save.dto';
import { FilesService } from '../../../common/storage/files.service';

export interface SaveManyOpts extends SaveOpts {
  makeThumbs?: boolean;
}


function toHodOutcomeEnum(v?: string | null): HodOutcome | undefined {
  if (v == null) return undefined;
  const t = String(v).trim().toUpperCase();

  // Accept common UI variants
  if (t === 'ACCEPT' || t === 'APPROVE' || t === 'APPROVED') return HodOutcome.ACCEPT;
  if (t === 'REJECT' || t === 'REJECTED') return HodOutcome.REJECT;
  if (t === 'RETURN' || t === 'RETURNED') return HodOutcome.RETURN;

  return undefined;
}

function splitDateTime(iso?: string | null): { forDate?: Date; forTime?: string } {
  if (!iso) return {};
  const d = new Date(iso);
  if (isNaN(d.getTime())) return {};
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return { forDate: d, forTime: `${hh}:${mm}` };
}

function ymd(d?: Date | null): string | undefined {
  if (!d) return undefined;
  // local, TZ-safe YYYY-MM-DD (no toISOString() drift)
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  return `${Y}-${M}-${D}`;
}

type WirContract = {
  wirId: string;
  projectId: string;
  status: string;
  discipline?: string | null;
  activityRefId?: string | null;
  title?: string | null; // activity title
  cityTown?: string | null;
  description?: string | null;
  forDate?: string;      // "YYYY-MM-DD"
  forTime?: string | null; // "HH:MM"
  checklists: Array<{ checklistId: string; code?: string | null; title?: string | null; itemsCount?: number }>;
  items?: any[]; // subset ok
  histories: Array<{ action: string; meta?: any; createdAt: Date; actorUserId?: string | null; actorName?: string | null }>;
  version: number;
  prevWirId?: string | null;
  seriesId?: string | null;
};

@Injectable()
export class WirService {

  constructor(
    private prisma: PrismaService,
    private files: FilesService,
  ) { }

  // BAD statuses considered as "failed" for follow-ups
  private static readonly BAD_STATUSES = new Set(['NCR', 'FAIL', 'NOT_OK', 'REJECT', 'REWORK', 'PENDING']);

  private isFailedItem(row: {
    status?: string | null;
    inspectorStatus?: string | null;
    hodStatus?: string | null;
    runs?: Array<{ status?: string | null }>;
  }): boolean {
    // S = inspectorStatus || hodStatus || status
    const S = String(row.inspectorStatus ?? row.hodStatus ?? row.status ?? '')
      .trim()
      .toUpperCase();
    if (WirService.BAD_STATUSES.has(S)) return true;

    // RS = last run status (if any)
    const lastRun = Array.isArray(row.runs) && row.runs.length ? row.runs[0] : null; // we load take:1 DESC
    const RS = String(lastRun?.status ?? '').trim().toUpperCase();
    if (WirService.BAD_STATUSES.has(RS)) return true;

    return false;
  }

  private buildWirContract(row: any, version: number): WirContract {
    // activityId fallback from histories
    const hist = Array.isArray(row.histories) ? row.histories : [];
    const lastMetaAct = hist
      .find((h: any) => h?.meta && (h.meta as any).activityId)
      ?.meta as any | undefined;

    // title: prefer activity snapshot title if present
    const activityTitle =
      row?.activitySnapshot?.title ??
      row?.title ??
      null;

    // prevWirId: prefer row.prevWirId if present; else fall back to history meta
    const createdHist = hist.find(
      (h: any) => h?.action === 'Created' && h?.meta && (h.meta as any).fromWirId
    );
    const prevWirId =
      (row?.prevWirId as string | null | undefined) ??
      (createdHist ? (createdHist.meta as any).fromWirId : null);
    // checklist → itemsCount via currently loaded items (no extra DB hits)
    const items = Array.isArray(row.items) ? row.items : [];
    const byChecklistCount = items.reduce((acc: Record<string, number>, it: any) => {
      const cid = it.checklistId || it.sourceChecklistId;
      if (!cid) return acc;
      acc[cid] = (acc[cid] || 0) + 1;
      return acc;
    }, {});

    const checklists = (Array.isArray(row.checklists) ? row.checklists : []).map((c: any) => ({
      checklistId: c.checklistId,
      code: c.checklistCode ?? null,
      title: c.checklistTitle ?? null,
      itemsCount: byChecklistCount[c.checklistId],
    }));

    // items: return a light subset (safe for FE – optional but helpful)
    const slimItems = items.map((it: any) => ({
      id: it.id,
      checklistId: it.checklistId ?? it.sourceChecklistId ?? null,
      code: it.code ?? null,
      name: it.name ?? null,
      required: it.required ?? null,
      critical: it.critical ?? null,
      unit: it.unit ?? null,
      tolerance: it.tolerance ?? null,
      tags: it.tags ?? [],
      status: it.status ?? null,
      inspectorStatus: it.inspectorStatus ?? null,
    }));

    return {
      wirId: row.wirId,
      projectId: row.projectId,
      status: row.status,
      discipline: row.discipline ?? null,
      activityRefId: row.activityRefId ?? (lastMetaAct?.activityId ?? null),
      title: activityTitle,
      cityTown: row.cityTown ?? null,
      description: row.description ?? null,
      forDate: ymd(row.forDate),
      forTime: row.forTime ?? null,
      checklists,
      items: slimItems,
      histories: hist.map((h: any) => ({
        action: h.action,
        meta: h.meta ?? undefined,
        createdAt: h.createdAt,
        actorUserId: h.actorUserId ?? null,
        actorName: h.actorName ?? null,
      })),
      version,
      prevWirId,
      seriesId: row.seriesId ?? null,
    };
  }

  // ---------- helpers ----------
  private async resolveChecklistIds(idsOrCodes: string[]) {
    if (!idsOrCodes?.length) return [];
    const rows = await this.prisma.refChecklist.findMany({
      where: {
        OR: [
          { id: { in: idsOrCodes } },
          { code: { in: idsOrCodes } },
        ],
      },
      select: { id: true, code: true, title: true, discipline: true, versionLabel: true },
    });
    const foundIds = rows.map(r => r.id);
    const missing = idsOrCodes.filter(x => !foundIds.includes(x));
    if (missing.length && foundIds.length === 0) {
      throw new BadRequestException(`No valid refChecklistIds found.`);
    }
    return rows;
  }

  private async snapshotItemOutcomes(wirId: string) {
    const items = await this.prisma.wirItem.findMany({
      where: { wirId },
      select: {
        id: true, code: true, name: true,
        status: true, inspectorStatus: true, hodStatus: true,
      },
      orderBy: [{ seq: 'asc' }, { createdAt: 'asc' }],
    });

    const ok: any[] = [];
    const ncr: any[] = [];
    const pending: any[] = [];
    const unknown: any[] = [];

    for (const it of items) {
      const S = String(it.status ?? '').trim().toUpperCase();
      const row = { id: it.id, code: it.code ?? null, name: it.name ?? null };

      if (S === 'OK') ok.push(row);
      else if (S === 'NCR' || S === 'NOT_OK' || S === 'REJECT') ncr.push(row);
      else if (S === 'PENDING') pending.push(row);
      else unknown.push(row);
    }

    return {
      totals: {
        ok: ok.length,
        ncr: ncr.length,
        pending: pending.length,
        unknown: unknown.length,
        all: items.length,
      },
      ok: ok.map(x => x.id),
      ncr: ncr.map(x => x.id),
      pending: pending.map(x => x.id),
      unknown: unknown.map(x => x.id),
    };
  }

  private async materializeItemsFromRef(wirId: string, refChecklistIds: string[]) {
    if (!refChecklistIds?.length) return { created: 0 };
    const items = await this.prisma.refChecklistItem.findMany({
      where: { checklistId: { in: refChecklistIds } },
      include: { checklist: true },
      orderBy: [{ checklistId: 'asc' }, { seq: 'asc' }],
    });

    if (!items.length) return { created: 0 };

    const data: Prisma.WirItemCreateManyInput[] = items.map((it, idx) => ({
      wirId,
      checklistId: it.checklistId,
      itemId: it.id,
      seq: it.seq ?? idx + 1,
      name: it.text,
      spec: it.requirement ?? undefined,
      required: undefined, // requirement text already captured in spec; keep DB shape clean
      tolerance: it.tolerance ?? undefined,
      status: 'Unknown',
      // provenance
      sourceChecklistId: it.checklistId,
      sourceChecklistItemId: it.id,
      // denorms
      code: it.itemCode ?? undefined,
      unit: it.units ?? undefined,
      tags: it.tags ?? [],
      critical: it.critical ?? undefined,
      aiEnabled: it.aiEnabled ?? undefined,
      aiConfidence: it.aiConfidence ? new Prisma.Decimal(it.aiConfidence as any) : undefined,
      base: it.base ? new Prisma.Decimal(it.base as any) : undefined,
      plus: it.plus ? new Prisma.Decimal(it.plus as any) : undefined,
      minus: it.minus ? new Prisma.Decimal(it.minus as any) : undefined,
      createdAt: new Date(),
    }));

    const result = await this.prisma.wirItem.createMany({ data });
    return { created: result.count };
  }

  private async writeHistory(
    projectId: string,
    wirId: string,
    action: WirAction,
    notes?: string,
    meta?: Prisma.InputJsonValue,
    actor?: { userId?: string | null; fullName?: string | null }
  ) {
    await this.prisma.wirHistory.create({
      data: {
        projectId,
        wirId,
        action,
        actorUserId: actor?.userId || undefined,
        actorName: actor?.fullName || undefined,
        notes: notes || undefined,
        meta: meta || undefined,
      },
    });
  }

  private async computedVersion(wirId: string) {
    const counts = await this.prisma.wirHistory.count({
      where: {
        wirId,
        //    action: { in: ['Updated', 'ItemsChanged', 'Rescheduled', 'Submitted', 'Recommended', 'Approved', 'Rejected', 'Returned'] },
        action: { in: ['Submitted'] },

      },
    });
    return counts;
  }

  // ---------- core ----------
  async listByProject(projectId: string) {
    return this.prisma.wir.findMany({
      where: { projectId },
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        wirId: true, code: true, title: true, status: true,
        createdAt: true, updatedAt: true,
        forDate: true,
        forTime: true,
        bicUserId: true,
        version: true,
        createdById: true,
        rescheduleForDate: true,
        rescheduleForTime: true,
        rescheduleReason: true,
        inspectorRecommendation: true,
        hodOutcome: true,
        _count: { select: { items: true } },
      },
    }).then(rows => rows.map(r => ({
      wirId: r.wirId,
      code: r.code,
      title: r.title,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      itemsCount: r._count.items,
      // NEW: surfaced for tiles
      forDate: r.forDate ?? null,
      forTime: r.forTime ?? null,
      bicUserId: r.bicUserId ?? null,
      version: r.version ?? null,
      createdById: r.createdById ?? null,
      rescheduleForDate: r.rescheduleForDate ?? null,
      rescheduleForTime: r.rescheduleForTime ?? null,
      rescheduleReason: r.rescheduleReason ?? null,
      rescheduled: (r.rescheduleForDate != null) || (r.rescheduleForTime != null),
      inspectorRecommendation: r.inspectorRecommendation,
      hodOutcome: r.hodOutcome,
    })));
  }

  async get(projectId: string, wirId: string, opts?: { contract?: boolean }) {
    const wir = await this.prisma.wir.findFirst({
      where: { wirId, projectId },
      include: {
        checklists: true,
        items: {
          orderBy: [{ seq: 'asc' }, { createdAt: 'asc' }],
          include: {
            runs: {
              select: { valueNumber: true, unit: true, status: true, comment: true, createdAt: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
            evidences: {                                        // <-- add this block
              select: {
                id: true,
                kind: true,            // 'Photo' | 'Video' | 'File'
                url: true,
                thumbUrl: true,
                fileName: true,
                fileSize: true,
                mimeType: true,
                capturedAt: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        evidences: {                                  // <-- NEW: header-level docs
          select: {
            id: true,
            kind: true,
            url: true,
            thumbUrl: true,
            fileName: true,
            fileSize: true,
            mimeType: true,
            capturedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        histories: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!wir) throw new NotFoundException('WIR not found');

    if (opts?.contract) {
      return this.buildWirContract(wir as any, (wir as any).version ?? 1);
    }
    return wir as any; // already includes version column
  }

  // --- Generate next WIR code inside a transaction (fixed-width so lexicographic sort works)
  private async nextWirCode(tx: Prisma.TransactionClient): Promise<string> {
    const last = await tx.wir.findFirst({
      where: { code: { startsWith: 'WIR-' } },
      orderBy: { code: 'desc' },        // relies on zero-padded width
      select: { code: true },
    });

    const lastNum = (() => {
      const raw = last?.code?.split('-')?.[1] ?? '0000';
      const n = parseInt(raw, 10);
      return Number.isFinite(n) ? n : 0;
    })();

    const next = String(lastNum + 1).padStart(4, '0');
    return `WIR-${next}`;               // <- single dash format
  }

  async create(projectId: string, currentUserId: string | null, dto: CreateWirDto) {
    const status: WirStatus = (dto.status as any) || 'Draft';
    const { forDate, forTime } = splitDateTime(dto.plannedAt);

    const title = dto.title?.trim() || 'Work Inspection Request';
    const description = dto.description?.trim() || undefined;
    const cityTown = dto.cityTown?.trim() || undefined;
    const stateName = dto.stateName?.trim() || undefined;

    // Resolve ref checklists BEFORE the tx (safe; ids are stable)
    const refRows = dto.refChecklistIds?.length ? await this.resolveChecklistIds(dto.refChecklistIds) : [];

    return this.prisma.$transaction(async (tx) => {
      // 1) Generate code inside the same transaction
      const code = await this.nextWirCode(tx);

      // 2) Create WIR (now with code)
      const wir = await tx.wir.create({
        data: {
          projectId,
          code,
          title,
          status,
          discipline: dto.discipline as any,
          forDate: forDate ?? undefined,
          forTime: forTime ?? undefined,
          description,
          cityTown,
          stateName,
          createdById: currentUserId ?? undefined,
          seriesId: randomUUID(),
          activityRefId: dto.activityId ?? undefined,
        },
        // include version (will be NULL on fresh create)
        select: { wirId: true, code: true, title: true, status: true, version: true },
      });

      // 3) Attach checklists (if any)
      if (refRows.length) {
        await tx.wirChecklist.createMany({
          data: refRows.map((r, idx) => ({
            wirId: wir.wirId,
            checklistId: r.id,
            checklistCode: r.code || undefined,
            checklistTitle: r.title || undefined,
            discipline: r.discipline as any,
            versionLabel: r.versionLabel || undefined,
            order: idx + 1,
          })),
        });
      }

      // 4) Materialize items if requested
      if (dto.materializeItemsFromRef && refRows.length) {
        const items = await tx.refChecklistItem.findMany({
          where: { checklistId: { in: refRows.map(r => r.id) } },
          include: { checklist: true },
          orderBy: [{ checklistId: 'asc' }, { seq: 'asc' }],
        });

        if (items.length) {
          await tx.wirItem.createMany({
            data: items.map((it, idx) => ({
              wirId: wir.wirId,
              checklistId: it.checklistId,
              itemId: it.id,
              seq: it.seq ?? idx + 1,
              name: it.text,
              spec: it.requirement ?? undefined,
              tolerance: it.tolerance ?? undefined,
              status: 'Unknown',
              sourceChecklistId: it.checklistId,
              sourceChecklistItemId: it.id,
              code: it.itemCode ?? undefined,
              unit: it.units ?? undefined,
              tags: it.tags ?? [],
              critical: it.critical ?? undefined,
              aiEnabled: it.aiEnabled ?? undefined,
              aiConfidence: it.aiConfidence ? new Prisma.Decimal(it.aiConfidence as any) : undefined,
              base: it.base ? new Prisma.Decimal(it.base as any) : undefined,
              plus: it.plus ? new Prisma.Decimal(it.plus as any) : undefined,
              minus: it.minus ? new Prisma.Decimal(it.minus as any) : undefined,
              createdAt: new Date(),
            })),
          });
        }
      }

      // 5) History
      await tx.wirHistory.create({
        data: {
          projectId,
          wirId: wir.wirId,
          action: 'Created',
          actorUserId: currentUserId ?? undefined,
          meta: {
            activityId: dto.activityId || null,
            refChecklistIds: (dto.refChecklistIds || []),
            materialized: !!dto.materializeItemsFromRef,
            autoCode: code,
          } as any,
        },
      });

      // 6) No version yet — stays NULL until first submit/dispatch sets it to 1
      return {
        wirId: wir.wirId,
        code: wir.code,
        title: wir.title,
        status: wir.status,
        version: wir.version, // expected to be null here
      };
    });
  }

  async updateHeader(
    projectId: string,
    wirId: string,
    dto: UpdateWirHeaderDto,
    actor?: { userId?: string | null; fullName?: string | null }
  ) {
    // Never allow PATCH to mutate `version`
    const { createdById: _ignoreCreatedBy, version: _ignoreVersion, ...safeDto } = (dto as any) || {};
    // Validate HOD outcome early so we surface a clean 400 (not a Prisma error)
    if (safeDto.hodOutcome !== undefined && toHodOutcomeEnum(safeDto.hodOutcome) === undefined) {
      throw new BadRequestException(
        `Invalid hodOutcome '${safeDto.hodOutcome}'. Use ACCEPT | RETURN | REJECT (UI synonyms: Approved/Approve, Reject/Rejected, Return/Returned).`
      );
    }

    const existing = await this.prisma.wir.findFirst({
      where: { projectId, wirId },
      select: { createdById: true, status: true, hodOutcome: true },
    });

    const shouldBackfillCreator = !existing?.createdById && !!actor?.userId;

    // support PATCH with plannedAt too (split into forDate/forTime if provided)
    const { forDate: splitForDate, forTime: splitForTime } = splitDateTime(safeDto.plannedAt);

    // ---- Guard: allow APPROVE_WITH_COMMENTS only from Recommended with HOD=ACCEPT
    if ((safeDto.status as any) === 'APPROVE_WITH_COMMENTS') {
      const mappedIncomingHod = toHodOutcomeEnum(safeDto.hodOutcome);
      const effectiveHod = mappedIncomingHod ?? existing?.hodOutcome ?? undefined;

      if (existing?.status !== 'Recommended') {
        throw new BadRequestException('APPROVE_WITH_COMMENTS allowed only from Recommended status.');
      }
      if (effectiveHod !== 'ACCEPT') {
        throw new BadRequestException('HOD must Accept before APPROVE_WITH_COMMENTS.');
      }
    }

    // ---------- scalars ----------
    const patch: Prisma.WirUpdateInput = {
      status: safeDto.status as any,
      discipline: safeDto.discipline as any,
      title: safeDto.title,
      description: safeDto.description,
      forDate:
        safeDto.forDate !== undefined
          ? (safeDto.forDate ? new Date(safeDto.forDate) : null)
          : (splitForDate !== undefined ? splitForDate : undefined),
      forTime:
        safeDto.forTime !== undefined
          ? safeDto.forTime
          : (splitForTime !== undefined ? splitForTime : undefined),
      cityTown: safeDto.cityTown,
      stateName: safeDto.stateName,
      rescheduleForDate:
        safeDto.rescheduleForDate !== undefined
          ? (safeDto.rescheduleForDate ? new Date(safeDto.rescheduleForDate) : null)
          : undefined,
      rescheduleForTime:
        safeDto.rescheduleForTime !== undefined ? safeDto.rescheduleForTime : undefined,
      rescheduleReason:
        safeDto.rescheduleReason !== undefined ? safeDto.rescheduleReason : undefined,

      // activity link via scalar FK
      activityRefId:
        safeDto.activityId === null
          ? null
          : safeDto.activityId !== undefined
            ? safeDto.activityId
            : undefined,

      // allow these two scalars to flow through PATCH
      inspectorRecommendation:
        safeDto.inspectorRecommendation !== undefined
          ? (safeDto.inspectorRecommendation as any)
          : undefined,
      // NOTE: version is intentionally ignored on PATCH
      //  (optional) keep audit parity timestamp when recommendation is set via PATCH
      inspectorReviewedAt:
        safeDto.inspectorRecommendation !== undefined ? new Date() : undefined,

      // --- HOD finalization fields (map UI → Prisma enum) ---
      hodOutcome:
        safeDto.hodOutcome !== undefined
          ? toHodOutcomeEnum(safeDto.hodOutcome)
          : undefined,
      hodRemarks:
        safeDto.hodRemarks !== undefined
          ? (safeDto.hodRemarks ? safeDto.hodRemarks : null)
          : undefined,
      hodDecidedAt:
        safeDto.hodDecidedAt !== undefined
          ? (safeDto.hodDecidedAt ? new Date(safeDto.hodDecidedAt) : null)
          : undefined,

      ...(shouldBackfillCreator ? { createdBy: { connect: { userId: actor!.userId! } } } : {}),
    };

    // ---------- relations (users) ----------
    const rel: Prisma.WirUpdateInput = {};
    if (safeDto.inspectorId !== undefined) {
      rel.inspector =
        safeDto.inspectorId === null
          ? { disconnect: true }
          : { connect: { userId: safeDto.inspectorId } };
    }

    if (safeDto.bicUserId !== undefined) {
      rel.bic =
        safeDto.bicUserId === null
          ? { disconnect: true }
          : { connect: { userId: safeDto.bicUserId } };
    }

    if (safeDto.contractorId !== undefined) {
      rel.contractor =
        safeDto.contractorId === null
          ? { disconnect: true }
          : { connect: { userId: safeDto.contractorId } };
    }
    if (safeDto.hodId !== undefined) {
      rel.hod =
        safeDto.hodId === null
          ? { disconnect: true }
          : { connect: { userId: safeDto.hodId } };
    }

    // If PATCH includes refChecklistIds, we will sync them atomically here.
    const shouldSyncRefs = Array.isArray(safeDto.refChecklistIds);

    if (!shouldSyncRefs) {
      // Simple header-only update (with safe error surface)
      let updated: any;
      try {
        updated = await this.prisma.wir.update({
          where: { wirId },
          data: { ...patch, ...rel },
        });
      } catch (e: any) {
        // Make enum/constraint problems visible to FE instead of generic 500
        const msg = e?.message || 'Update failed';
        const code = e?.code || '';
        const meta = e?.meta ? JSON.stringify(e.meta) : '';
        throw new BadRequestException(`WIR update failed: ${msg}${code ? ` [${code}]` : ''}${meta ? ` :: ${meta}` : ''}`);
      }

      if (safeDto.status === 'APPROVE_WITH_COMMENTS') {
        await this.writeHistory(
          projectId,
          wirId,
          'Approved',                 // keep existing action literal
          'Approved with comments',   // clear note for UI
          { withComments: true },     // meta to distinguish in timeline
          actor
        );
      }
      if (safeDto.status === 'APPROVE_WITH_COMMENTS') {
        // 1) snapshot at approve-with-comments
        const snap = await this.snapshotItemOutcomes(wirId);
        await this.writeHistory(
          projectId,
          wirId,
          'ItemsSnapshot',
          'Snapshot at approval with comments',
          { by: 'HOD', at: new Date().toISOString(), ...snap },
          actor
        );
      }
      // History when HOD outcome is set via PATCH (use enum mapping)
      if (safeDto.hodOutcome !== undefined) {
        const mapped = toHodOutcomeEnum(safeDto.hodOutcome);
        if (mapped) {
          await this.writeHistory(
            projectId,
            wirId,
            mapped === HodOutcome.ACCEPT
              ? 'Approved'
              : mapped === HodOutcome.REJECT
                ? 'Rejected'
                : 'Returned',
            safeDto.hodRemarks || undefined,
            { via: 'PATCH' } as any,
            actor
          );
          // 2) snapshot at HOD finalization (Accept/Reject/Return)
          const snap = await this.snapshotItemOutcomes(wirId);
          await this.writeHistory(
            projectId,
            wirId,
            'ItemsSnapshot',
            'Snapshot at HOD finalization',
            { by: 'HOD', at: new Date().toISOString(), ...snap },
            actor
          );
        }
      }

      // optional audit parity when recommendation is sent via PATCH
      if (safeDto.inspectorRecommendation !== undefined) {
        await this.writeHistory(
          projectId,
          wirId,
          'Recommended',
          safeDto.inspectorRecommendation === 'APPROVE_WITH_COMMENTS'
            ? 'Inspector approved with comments'
            : safeDto.inspectorRecommendation === 'APPROVE'
              ? 'Inspector approved'
              : 'Inspector rejected',
          { recommendation: safeDto.inspectorRecommendation, via: 'PATCH' },
          actor
        );
      }

      await this.writeHistory(
        projectId,
        wirId,
        'Updated',
        undefined,
        { activityId: safeDto.activityId ?? undefined },
        actor
      );
      const current = await this.prisma.wir.findUnique({
        where: { wirId },
        select: { version: true },
      });
      return { ...updated, version: current?.version ?? null };
    }

    // ---------- Header + Checklist sync in a single transaction ----------
    const refRows = await this.resolveChecklistIds(safeDto.refChecklistIds || []);
    const wantIds = new Set(refRows.map(r => r.id));
    const materialize = !!safeDto.materializeItemsFromRef;

    const result = await this.prisma.$transaction(async (tx) => {
      // 1) Update header
      const updated = await tx.wir.update({
        where: { wirId },
        data: { ...patch, ...rel },
        select: { wirId: true, status: true },
      });

      // 2) Compute diff
      const existing = await tx.wirChecklist.findMany({ where: { wirId } });
      const haveIds = new Set(existing.map(x => x.checklistId));

      const toAdd = refRows.filter(r => !haveIds.has(r.id));
      const toRemove = existing.filter(x => !wantIds.has(x.checklistId));

      // 3) Apply removals
      if (toRemove.length) {
        await tx.wirChecklist.deleteMany({
          where: { wirId, checklistId: { in: toRemove.map(x => x.checklistId) } },
        });

        // Drop snapshot items for removed checklists while still in Draft
        if (updated.status === 'Draft') {
          await tx.wirItem.deleteMany({
            where: { wirId, sourceChecklistId: { in: toRemove.map(x => x.checklistId) } },
          });
        }
      }

      // 4) Apply additions
      if (toAdd.length) {
        // preserve order after existing
        await tx.wirChecklist.createMany({
          data: toAdd.map((r, idx) => ({
            wirId,
            checklistId: r.id,
            checklistCode: r.code || undefined,
            checklistTitle: r.title || undefined,
            discipline: r.discipline as any,
            versionLabel: r.versionLabel || undefined,
            order: (existing.length + idx + 1),
          })),
        });

        if (materialize) {
          const items = await tx.refChecklistItem.findMany({
            where: { checklistId: { in: toAdd.map(r => r.id) } },
            include: { checklist: true },
            orderBy: [{ checklistId: 'asc' }, { seq: 'asc' }],
          });

          if (items.length) {
            await tx.wirItem.createMany({
              data: items.map((it, idx) => ({
                wirId,
                checklistId: it.checklistId,
                itemId: it.id,
                seq: it.seq ?? idx + 1,
                name: it.text,
                spec: it.requirement ?? undefined,
                tolerance: it.tolerance ?? undefined,
                status: 'Unknown',
                sourceChecklistId: it.checklistId,
                sourceChecklistItemId: it.id,
                code: it.itemCode ?? undefined,
                unit: it.units ?? undefined,
                tags: it.tags ?? [],
                critical: it.critical ?? undefined,
                aiEnabled: it.aiEnabled ?? undefined,
                aiConfidence: it.aiConfidence ? new Prisma.Decimal(it.aiConfidence as any) : undefined,
                base: it.base ? new Prisma.Decimal(it.base as any) : undefined,
                plus: it.plus ? new Prisma.Decimal(it.plus as any) : undefined,
                minus: it.minus ? new Prisma.Decimal(it.minus as any) : undefined,
              })),
            });
          }
        }
      }

      return {
        added: toAdd.length,
        removed: toRemove.length,
        addedIds: toAdd.map(r => r.id),
        removedIds: toRemove.map(x => x.checklistId),
      };
    }) as { added: number; removed: number; addedIds: string[]; removedIds: string[] };

    // 5) History + return stored version
    await this.writeHistory(
      projectId,
      wirId,
      'ItemsChanged',
      `${result.added} added, ${result.removed} removed.`,
      {
        activityId: safeDto.activityId ?? undefined,
        add: result.addedIds,
        remove: result.removedIds,
      },
      actor
    );

    const updatedHeader = await this.prisma.wir.findUnique({
      where: { wirId },
      select: { wirId: true, code: true, title: true, status: true, version: true, updatedAt: true },
    });
    return { ...updatedHeader, version: updatedHeader?.version ?? null };

  }

  async attachChecklists(projectId: string, wirId: string, dto: AttachChecklistsDto, actor?: { userId?: string | null; fullName?: string | null }) {
    const refRows = await this.resolveChecklistIds(dto.refChecklistIds || []);
    if (!refRows.length) return { added: 0, materialized: 0 };

    // avoid duplicates
    const existing = await this.prisma.wirChecklist.findMany({ where: { wirId, checklistId: { in: refRows.map(r => r.id) } } });
    const existingIds = new Set(existing.map(x => x.checklistId));
    const toAdd = refRows.filter(r => !existingIds.has(r.id));
    if (!toAdd.length) return { added: 0, materialized: 0 };

    await this.prisma.$transaction(async tx => {
      await tx.wirChecklist.createMany({
        data: toAdd.map((r, idx) => ({
          wirId,
          checklistId: r.id,
          checklistCode: r.code || undefined,
          checklistTitle: r.title || undefined,
          discipline: r.discipline as any,
          versionLabel: r.versionLabel || undefined,
          order: (existing.length + idx + 1),
        })),
      });

      if (dto.materializeItemsFromRef) {
        // use the same tx client
        const items = await tx.refChecklistItem.findMany({
          where: { checklistId: { in: toAdd.map(r => r.id) } },
          include: { checklist: true },
          orderBy: [{ checklistId: 'asc' }, { seq: 'asc' }],
        });

        if (items.length) {
          await tx.wirItem.createMany({
            data: items.map((it, idx) => ({
              wirId,
              checklistId: it.checklistId,
              itemId: it.id,
              seq: it.seq ?? idx + 1,
              name: it.text,
              spec: it.requirement ?? undefined,
              tolerance: it.tolerance ?? undefined,
              status: 'Unknown',
              sourceChecklistId: it.checklistId,
              sourceChecklistItemId: it.id,
              code: it.itemCode ?? undefined,
              unit: it.units ?? undefined,
              tags: it.tags ?? [],
              critical: it.critical ?? undefined,
              aiEnabled: it.aiEnabled ?? undefined,
              aiConfidence: it.aiConfidence ? new Prisma.Decimal(it.aiConfidence as any) : undefined,
              base: it.base ? new Prisma.Decimal(it.base as any) : undefined,
              plus: it.plus ? new Prisma.Decimal(it.plus as any) : undefined,
              minus: it.minus ? new Prisma.Decimal(it.minus as any) : undefined,
            })),
          });
        }
      }
    });

    await this.writeHistory(projectId, wirId, 'ItemsChanged', `Attached ${toAdd.length} checklist(s).`, { checklistIds: toAdd.map(r => r.id) }, actor);
    const current = await this.prisma.wir.findUnique({ where: { wirId }, select: { version: true } });
    return { added: toAdd.length, materialized: dto.materializeItemsFromRef ? 'yes' : 'no', version: current?.version ?? null };
  }

  async deleteWir(projectId: string, wirId: string) {
    // cascade behavior is defined in schema; this will remove child rows
    await this.prisma.wir.delete({ where: { wirId } });
    return { deleted: true };
  }

  async syncChecklists(
    projectId: string,
    wirId: string,
    dto: AttachChecklistsDto & { replace?: boolean },
    actor?: { userId?: string | null; fullName?: string | null }
  ) {
    const refRows = await this.resolveChecklistIds(dto.refChecklistIds || []);
    const wantIds = new Set(refRows.map(r => r.id));

    const existing = await this.prisma.wirChecklist.findMany({ where: { wirId } });
    const haveIds = new Set(existing.map(x => x.checklistId));

    const toAdd = refRows.filter(r => !haveIds.has(r.id));
    const toRemove = dto.replace ? existing.filter(x => !wantIds.has(x.checklistId)) : [];

    await this.prisma.$transaction(async tx => {
      if (toRemove.length) {
        await tx.wirChecklist.deleteMany({
          where: { wirId, checklistId: { in: toRemove.map(x => x.checklistId) } },
        });

        // Optional clean-up: if still in Draft, drop snapshot items for removed checklists
        const header = await tx.wir.findUnique({ where: { wirId }, select: { status: true } });
        if (header?.status === 'Draft') {
          await tx.wirItem.deleteMany({
            where: { wirId, sourceChecklistId: { in: toRemove.map(x => x.checklistId) } },
          });
        }
      }

      if (toAdd.length) {
        await tx.wirChecklist.createMany({
          data: toAdd.map((r, idx) => ({
            wirId,
            checklistId: r.id,
            checklistCode: r.code || undefined,
            checklistTitle: r.title || undefined,
            discipline: r.discipline as any,
            versionLabel: r.versionLabel || undefined,
            order: (existing.length + idx + 1),
          })),
        });

        if (dto.materializeItemsFromRef) {
          const items = await tx.refChecklistItem.findMany({
            where: { checklistId: { in: toAdd.map(r => r.id) } },
            include: { checklist: true },
            orderBy: [{ checklistId: 'asc' }, { seq: 'asc' }],
          });
          if (items.length) {
            await tx.wirItem.createMany({
              data: items.map((it, idx) => ({
                wirId,
                checklistId: it.checklistId,
                itemId: it.id,
                seq: it.seq ?? idx + 1,
                name: it.text,
                spec: it.requirement ?? undefined,
                tolerance: it.tolerance ?? undefined,
                status: 'Unknown',
                sourceChecklistId: it.checklistId,
                sourceChecklistItemId: it.id,
                code: it.itemCode ?? undefined,
                unit: it.units ?? undefined,
                tags: it.tags ?? [],
                critical: it.critical ?? undefined,
                aiEnabled: it.aiEnabled ?? undefined,
                aiConfidence: it.aiConfidence ? new Prisma.Decimal(it.aiConfidence as any) : undefined,
                base: it.base ? new Prisma.Decimal(it.base as any) : undefined,
                plus: it.plus ? new Prisma.Decimal(it.plus as any) : undefined,
                minus: it.minus ? new Prisma.Decimal(it.minus as any) : undefined,
              })),
            });
          }
        }
      }
    });

    await this.writeHistory(
      projectId, wirId, 'ItemsChanged',
      `${toAdd.length} added, ${toRemove.length} removed.`,
      { add: toAdd.map(r => r.id), remove: toRemove.map(x => x.checklistId) },
      actor
    );

    const current = await this.prisma.wir.findUnique({ where: { wirId }, select: { version: true } });
    return { added: toAdd.length, removed: toRemove.length, version: current?.version ?? null };

  }

  /**
 * Save uploaded files as header-level WIR documents (not tied to any item/run).
 * Returns: [{ itemId: null, evidenceId, url, fileName, kind }]
 */
  async createWirDocuments(
    projectId: string,
    wirId: string,
    files: Array<Express.Multer.File>,
    actor?: { userId?: string | null; fullName?: string | null },
  ) {
    // Ensure WIR belongs to project
    await this.ensureWir(projectId, wirId);

    if (!files || !files.length) {
      throw new BadRequestException('No files uploaded');
    }

    // Reuse same storage layout as runner attachments
    const saved = await this.files.saveMany(files, {
      subdir: `projects/${projectId}/wir/${wirId}`,
      makeThumbs: true,
    });

    const results: Array<{
      itemId: string | null;
      evidenceId: string;
      url: string;
      fileName?: string | null;
      kind: WirItemEvidenceKind;
    }> = [];

    await this.prisma.$transaction(async (tx) => {
      for (const s of saved) {
        // Infer kind from mime-type (image => Photo, video => Video, else File)
        const mime = s.mimeType || '';
        const kind: WirItemEvidenceKind =
          mime.startsWith('image/')
            ? 'Photo'
            : mime === 'video/mp4'
              ? 'Video'
              : 'File';

        const row = await tx.wirItemEvidence.create({
          data: {
            wirId,
            itemId: null, // header-level (not tied to any item)
            runId: null,
            kind,
            url: s.url,
            thumbUrl: s.thumbUrl || undefined,
            fileName: s.fileName || undefined,
            fileSize: s.size ?? undefined,
            mimeType: s.mimeType || undefined,
            capturedAt: new Date(),
          },
          select: { id: true, url: true, fileName: true, kind: true },
        });

        results.push({
          itemId: null,
          evidenceId: row.id,
          url: row.url,
          fileName: row.fileName ?? null,
          kind: row.kind,
        });
      }

      // NOTE: No history write here to avoid messing with existing timeline semantics.
      // If you later want a timeline entry like "Documents uploaded", we can add it.
    });

    return results;
  }

  // Create a new WIR “version” keeping only failed/NCR items (auto-select if dto.itemIds omitted)
  async rollForward(
    projectId: string,
    wirId: string,
    currentUserId: string | null,
    dto: RollForwardDto
  ) {
    // Load source with minimal relations needed to evaluate failures
    const src = await this.prisma.wir.findFirst({
      where: { projectId, wirId },
      include: {
        checklists: true,
        items: {
          orderBy: [{ seq: 'asc' }, { createdAt: 'asc' }],
          include: {
            runs: {
              select: { status: true, createdAt: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });
    if (!src) throw new NotFoundException('WIR not found');

    // 1) Choose items
    const explicitIds = Array.isArray(dto.itemIds) ? dto.itemIds.filter(Boolean) : [];

    let chosen = [] as typeof src.items;
    if (explicitIds.length > 0) {
      // Back-compat: keep exactly what caller asked for (by snapshot item row id)
      const explicitSet = new Set(explicitIds);
      chosen = src.items.filter((it) => explicitSet.has(it.id));
      if (!chosen.length) {
        throw new BadRequestException('None of the provided items exist under this WIR.');
      }
    } else {
      // Auto: derive failed items by predicate
      chosen = src.items.filter((it) => this.isFailedItem(it));
      if (!chosen.length) {
        throw new BadRequestException('No failed items to roll forward from the source WIR.');
      }
    }

    const { forDate, forTime } = splitDateTime(dto.plannedAt);

    // 2) Create new WIR (child) + keep only needed checklists + copy only chosen items (reset outcomes)
    const next = await this.prisma.$transaction(async (tx) => {
      // version & code
      const parentVersion = Number(src.version) || 1;
      const nextVersion = parentVersion + 1;
      const baseCode =
        src.code && src.code.trim().length ? src.code.trim() : await this.nextWirCode(tx);
      const childCode = `${baseCode} v${nextVersion}`;

      // activity snapshot carry-forward (frozen definition)
      const snapshotId: string | undefined = (src.activitySnapshot as any)?.id;

      // 2.1 Header
      const nextWir = await tx.wir.create({
        data: {
          projectId,
          title: dto.title?.trim() || src.title || 'Work Inspection Request',
          description: dto.description?.trim() || undefined,
          discipline: src.discipline,
          status: 'Draft',
          forDate: forDate ?? undefined,
          forTime: forTime ?? undefined,
          createdById: currentUserId ?? undefined,
          seriesId: src.seriesId,
          code: childCode,
          version: nextVersion,
          prevWirId: wirId,
          activityRefId: src.activityRefId ?? snapshotId ?? undefined,
          activitySnapshot: src.activitySnapshot ?? undefined,
          activitySnapshotVersion: src.activitySnapshotVersion ?? undefined,
          cityTown: src.cityTown ?? undefined,
          stateName: src.stateName ?? undefined,
          materialized: true,           // child is effectively a materialized follow-up
          snapshotAt: new Date(),
        },
      });

      // 2.2 Checklists: only those referenced by chosen items (dedup)
      const keepChecklistIds = Array.from(
        new Set(
          chosen.map((it) => it.sourceChecklistId || it.checklistId).filter((x): x is string => !!x)
        )
      );

      // Map from src.checklists for code/title/discipline/versionLabel
      const byId = new Map(src.checklists.map((c) => [c.checklistId, c]));
      if (keepChecklistIds.length) {
        await tx.wirChecklist.createMany({
          data: keepChecklistIds.map((cid, idx) => ({
            wirId: nextWir.wirId,
            checklistId: cid,
            checklistCode: byId.get(cid)?.checklistCode ?? undefined,
            checklistTitle: byId.get(cid)?.checklistTitle ?? undefined,
            discipline: byId.get(cid)?.discipline as any,
            versionLabel: byId.get(cid)?.versionLabel ?? undefined,
            order: idx + 1,
          })),
          skipDuplicates: true,
        });
      }

      // 2.3 Items: clone ONLY chosen; reset outcome fields and DO NOT copy runs
      if (chosen.length) {
        await tx.wirItem.createMany({
          data: chosen.map((it, idx) => ({
            wirId: nextWir.wirId,
            checklistId: it.checklistId ?? undefined,
            itemId: it.itemId ?? undefined,
            seq: idx + 1,                         // fresh order within follow-up
            name: it.name,
            spec: it.spec ?? undefined,
            required: undefined,                  // keep DB clean (spec holds requirement)
            tolerance: it.tolerance ?? undefined,
            status: 'Unknown',                    // reset outcome
            inspectorStatus: null,
            inspectorNote: null,
            hodStatus: null,
            hodNote: null,
            sourceChecklistId: it.sourceChecklistId ?? undefined,
            sourceChecklistItemId: it.sourceChecklistItemId ?? undefined,
            code: it.code ?? undefined,
            unit: it.unit ?? undefined,
            tags: it.tags ?? [],
            critical: it.critical ?? undefined,
            aiEnabled: it.aiEnabled ?? undefined,
            aiConfidence: it.aiConfidence ?? undefined,
            base: it.base ?? undefined,
            plus: it.plus ?? undefined,
            minus: it.minus ?? undefined,
            createdAt: new Date(),
          })),
        });
      }

      return nextWir;
    });

    // 3) Histories (outside tx)
    await this.writeHistory(
      projectId,
      wirId,
      'Updated',
      'Rolled forward to next version.',
      { nextWirId: next.wirId }
    );

    await this.writeHistory(
      projectId,
      next.wirId,
      'Created',
      'Created by roll-forward',
      { fromWirId: wirId }
    );

    return {
      wirId: next.wirId,
      version: next.version,
      title: next.title,
      status: next.status,
    };
  }

  async dispatchWir(
    projectId: string,
    wirId: string,
    currentUserId: string | null,
    dto: DispatchWirDto,
    actor?: { userId?: string | null; fullName?: string | null }
  ) {
    if (!dto?.inspectorId) {
      throw new BadRequestException('inspectorId is required');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1) Load header (with attached checklists so we know what to materialize)
      const wir = await tx.wir.findFirst({
        where: { wirId, projectId },
        include: {
          checklists: true, // materialization source (attached libs)
        },
      });
      if (!wir) throw new NotFoundException('WIR not found');
      if (wir.status !== 'Draft') {
        throw new BadRequestException(`Only Draft WIR can be dispatched (current: ${wir.status}).`);
      }

      // 2) Autocode if missing (use your existing generator)
      let code = wir.code;
      if (!code) {
        code = await this.nextWirCode(tx);
      }

      // 3) Materialize snapshot rows, if requested and not already materialized
      const shouldMaterialize =
        (dto.materializeIfNeeded ?? true) && !wir.materialized;

      if (shouldMaterialize) {
        const refChecklistIds = wir.checklists.map((c) => c.checklistId);
        if (refChecklistIds.length) {
          // reuse your existing materializer (uses this.prisma; wrap with tx by temporarily swapping)
          // EITHER call a tx-aware variant, OR inline here. We'll inline to stay tx-safe:

          const items = await tx.refChecklistItem.findMany({
            where: { checklistId: { in: refChecklistIds } },
            include: { checklist: true },
            orderBy: [{ checklistId: 'asc' }, { seq: 'asc' }],
          });

          if (items.length) {
            await tx.wirItem.createMany({
              data: items.map((it, idx) => ({
                wirId,
                checklistId: it.checklistId,
                itemId: it.id,
                seq: it.seq ?? idx + 1,
                name: it.text,
                spec: it.requirement ?? undefined,
                required: undefined,
                tolerance: it.tolerance ?? undefined,
                status: 'Unknown',
                // provenance (keep attached + source)
                sourceChecklistId: it.checklistId,
                sourceChecklistItemId: it.id,
                // denorms
                code: it.itemCode ?? undefined,
                unit: it.units ?? undefined,
                tags: it.tags ?? [],
                critical: it.critical ?? undefined,
                aiEnabled: it.aiEnabled ?? undefined,
                aiConfidence: it.aiConfidence ? new Prisma.Decimal(it.aiConfidence as any) : undefined,
                base: it.base ? new Prisma.Decimal(it.base as any) : undefined,
                plus: it.plus ? new Prisma.Decimal(it.plus as any) : undefined,
                minus: it.minus ? new Prisma.Decimal(it.minus as any) : undefined,
                createdAt: new Date(),
              })),
            });
          }
        }
      }

      // 4) Snapshot activity (copy-on-dispatch) if not already snapped
      let activitySnapshot = wir.activitySnapshot;
      let activitySnapshotVersion = wir.activitySnapshotVersion;

      if (wir.activityRefId && !activitySnapshot) {
        const act = await tx.refActivity.findUnique({
          where: { id: wir.activityRefId },
        });
        if (act) {
          activitySnapshot = {
            id: act.id,
            code: act.code,
            title: act.title,
            discipline: act.discipline,
            stageLabel: act.stageLabel,
            phase: act.phase,
            element: act.element,
            system: act.system,
            nature: act.nature,
            method: act.method,
            version: act.version,
            versionLabel: act.versionLabel,
            versionMajor: act.versionMajor,
            versionMinor: act.versionMinor,
            versionPatch: act.versionPatch,
            notes: act.notes,
            status: act.status,
          };
          activitySnapshotVersion = act.version ?? 1;
        }
      }

      // 5) Flip header → Submitted (+ inspector/bic, version=1 is already default)
      const now = new Date();
      const updated = await tx.wir.update({
        where: { wirId },
        data: {
          code,
          status: 'Submitted',
          inspector: { connect: { userId: dto.inspectorId } },
          bic: { connect: { userId: dto.inspectorId } },
          // set version = 1 only if not set yet
          ...(wir.version == null ? { version: 1 } : {}),
          // only set createdBy if not already set
          ...(!wir.createdById && currentUserId
            ? { createdBy: { connect: { userId: currentUserId } } }
            : {}),
          // materialization flags
          materialized: shouldMaterialize ? true : wir.materialized,
          snapshotAt: shouldMaterialize ? now : wir.snapshotAt,

          // activity snapshot
          activitySnapshot: activitySnapshot ?? wir.activitySnapshot ?? undefined,
          activitySnapshotVersion:
            activitySnapshotVersion ?? wir.activitySnapshotVersion ?? undefined,
        },
        select: {
          wirId: true,
          code: true,
          title: true,
          status: true,
          version: true,
          updatedAt: true,
        },
      });

      // 6) History (Submitted)
      await tx.wirHistory.create({
        data: {
          projectId,
          wirId,
          action: 'Submitted',
          actorUserId: actor?.userId ?? currentUserId ?? undefined,
          actorName: actor?.fullName ?? undefined,
          fromStatus: 'Draft',
          toStatus: 'Submitted',
          meta: {
            materializedBefore: wir.materialized,
            materializedAfter: shouldMaterialize || wir.materialized,
            activityRefId: wir.activityRefId ?? null,
            activitySnapshotVersion: activitySnapshotVersion ?? null,
            inspectorId: dto.inspectorId,
            autoCodeIssued: !wir.code ? code : null,
          } as any,
        },
      });

      const itemsCount = await tx.wirItem.count({ where: { wirId } });
      return { ...updated, itemsCount };
    });
  }

  /**
   * Save uploaded files and create WirItemEvidence rows.
   * Returns: [{ itemId, evidenceId, url, fileName, kind }]
   */
  async createRunnerAttachments(
    projectId: string,
    wirId: string,
    files: Array<Express.Multer.File>,
    meta: Array<{ idx: number; itemId: string; kind?: 'Photo' | 'Video' | 'File' }>,
  ) {
    const wir = await this.prisma.wir.findFirst({
      where: { wirId, projectId },
      select: { wirId: true },
    });
    if (!wir) throw new NotFoundException('WIR not found for project');

    const metaByIdx = new Map<number, { itemId: string; kind?: 'Photo' | 'Video' | 'File' }>();
    for (const m of meta || []) {
      if (typeof m?.idx === 'number' && m?.itemId) metaByIdx.set(m.idx, { itemId: m.itemId, kind: m.kind });
    }

    const saved = await this.files.saveMany(files, {
      subdir: `projects/${projectId}/wir/${wirId}`,
      makeThumbs: true,
    });

    const results: Array<{ itemId: string; evidenceId: string; url: string; fileName?: string | null; kind: WirItemEvidenceKind }> = [];
    const touchedItemIds = new Set<string>();

    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < saved.length; i++) {
        const s = saved[i];
        const m = metaByIdx.get(i);
        if (!m?.itemId) continue;

        const exists = await tx.wirItem.findFirst({
          where: { id: m.itemId, wirId },
          select: { id: true },
        });
        if (!exists) continue;

        const kind: WirItemEvidenceKind =
          m.kind === 'Video' ? 'Video' :
            m.kind === 'File' ? 'File' : 'Photo';

        const row = await tx.wirItemEvidence.create({
          data: {
            wirId,
            itemId: m.itemId,
            kind,
            url: s.url,
            thumbUrl: s.thumbUrl || undefined,
            fileName: s.fileName || undefined,
            fileSize: s.size ?? undefined,
            mimeType: s.mimeType || undefined,
            capturedAt: new Date(),
          },
          select: { id: true, url: true, fileName: true, kind: true, itemId: true },
        });

        results.push({
          itemId: row.itemId!,
          evidenceId: row.id,
          url: row.url,
          fileName: row.fileName ?? null,
          kind: row.kind,
        });

        touchedItemIds.add(m.itemId);
      }

      // Recompute photoCount for each touched item (exact count from DB)
      for (const itemId of touchedItemIds) {
        const photos = await tx.wirItemEvidence.count({
          where: { wirId, itemId, kind: 'Photo' },
        });
        await tx.wirItem.update({
          where: { id: itemId },
          data: { photoCount: photos },
        });
      }
    });

    return results;
  }

  async deleteRunnerAttachment(
    projectId: string,
    wirId: string,
    evidenceId: string,
  ) {
    // Ensure the WIR belongs to this project
    await this.ensureWir(projectId, wirId);

    // Find evidence under this WIR
    const evidence = await this.prisma.wirItemEvidence.findFirst({
      where: { id: evidenceId, wirId },
      select: { id: true, itemId: true },
    });

    // Idempotent: if not found, treat as deleted
    if (!evidence) return { ok: true };

    // Delete evidence row
    await this.prisma.wirItemEvidence.delete({
      where: { id: evidenceId },
    });

    // Recompute photoCount for the item (count only Photos)
    const photos = await this.prisma.wirItemEvidence.count({
      where: { wirId, itemId: evidence.itemId, kind: 'Photo' },
    });

    // Guard the update so id is a string (not null/undefined)
    if (evidence.itemId) {
      await this.prisma.wirItem.update({
        where: { id: evidence.itemId },
        data: { photoCount: photos },
      });
    }

    return { ok: true, removedId: evidenceId, itemId: evidence.itemId, photoCount: photos };
  }

  async inspectorSave(projectId: string, wirId: string, dto: InspectorSaveDto, user: any) {
    // (optional) verify the WIR belongs to projectId and user can act
    await this.prisma.$transaction(async (tx) => {
      for (const it of dto.items) {
        // ensure the item exists under the same WIR
        const item = await tx.wirItem.findFirst({
          where: { id: it.itemId, wirId },
          select: { id: true, unit: true },
        });
        if (!item) continue;

        const derivedStatus: WirItemStatus | null =
          it.inspectorStatus === 'PASS' ? 'OK' :
            it.inspectorStatus === 'FAIL' ? 'NCR' :
              it.inspectorStatus === 'NA' ? 'Pending' : null;

        // 1) create a run row (history of runner inputs)
        await tx.wirItemRun.create({
          data: {
            wirId,
            itemId: it.itemId,
            actorUserId: user?.userId ?? null,
            actorRole: 'Inspector',
            actorName: user?.fullName || user?.name || null,
            valueText: null,
            valueNumber: it.valueNumber != null ? new Prisma.Decimal(it.valueNumber) : null,
            unit: it.unit ?? item.unit ?? null,
            status: derivedStatus,            // OK / NCR / Pending
            comment: it.note ?? null,
          },
        });

        // 2) mirror latest inspector fields onto WirItem (for fast reads)
        await tx.wirItem.update({
          where: { id: it.itemId },
          data: {
            inspectorStatus: it.inspectorStatus ?? null, // PASS / FAIL / NA (enum InspectorItemStatus)
            inspectorNote: it.note ?? null,
            ...(derivedStatus ? { status: derivedStatus } : {}),
          },
        });
      }
    });
  }

  async inspectorRecommend(
    projectId: string,
    wirId: string,
    payload: { action: 'APPROVE' | 'APPROVE_WITH_COMMENTS' | 'REJECT'; comment?: string | null },
    actor?: { userId?: string | null; fullName?: string | null },
  ) {
    const now = new Date();

    // write the 3 header fields ONLY; do not change status here
    const updated = await this.prisma.wir.update({
      where: { wirId },
      data: {
        inspectorRecommendation: payload.action,
        inspectorRemarks: (payload.comment ?? '').trim() || null,
        inspectorReviewedAt: now,
      },
      select: {
        wirId: true, code: true, title: true, status: true,
        inspectorRecommendation: true, inspectorRemarks: true, inspectorReviewedAt: true,
        updatedAt: true,
      },
    });

    await this.writeHistory(
      projectId,
      wirId,
      'Recommended',
      payload.action === 'APPROVE_WITH_COMMENTS'
        ? 'Inspector approved with comments'
        : payload.action === 'APPROVE'
          ? 'Inspector approved'
          : 'Inspector rejected',
      { recommendation: payload.action, comment: payload.comment ?? null },
      actor,
    );

    const current = await this.prisma.wir.findUnique({ where: { wirId }, select: { version: true } });
    return { ...updated, version: current?.version ?? null };

  }

  // ---------- discussion helpers ----------
  private async ensureWir(projectId: string, wirId: string) {
    const wir = await this.prisma.wir.findFirst({ where: { wirId, projectId }, select: { wirId: true } });
    if (!wir) throw new NotFoundException('WIR not found for project');
    return wir;
  }

  private async writeHistoryNote(
    projectId: string,
    wirId: string,
    text: string,
    actor?: { userId?: string | null; fullName?: string | null }
  ) {
    // Optional mirror to timeline
    await this.prisma.wirHistory.create({
      data: {
        projectId,
        wirId,
        action: 'NoteAdded',
        notes: text,
        actorUserId: actor?.userId || undefined,
        actorName: actor?.fullName || undefined,
      },
    });
  }

  // ---------- discussion CRUD ----------
  async deleteDiscussion(
    projectId: string,
    wirId: string,
    commentId: string,
    actor?: { userId?: string | null; isSuperAdmin?: boolean | null }
  ) {
    await this.ensureWir(projectId, wirId);

    const existing = await this.prisma.wirDiscussion.findFirst({
      where: { id: commentId, wirId, deletedAt: null },
      select: { id: true, authorId: true },
    });
    if (!existing) return { ok: true }; // idempotent

    const isAuthor = actor?.userId && actor.userId === existing.authorId;
    if (!isAuthor && !actor?.isSuperAdmin) throw new BadRequestException('Not allowed to delete this comment');

    await this.prisma.wirDiscussion.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });

    return { ok: true };
  }
  private toCommentRow(r: any) {
    return {
      id: r.id,
      wirId: r.wirId,
      text: r.body,                                  // <- FE wants `text`
      authorUserId: r.authorId ?? r.author?.userId ?? null,
      authorName:
        (r.author?.firstName || r.author?.lastName)
          ? [r.author?.firstName, r.author?.lastName].filter(Boolean).join(" ")
          : r.authorName ?? null,                    // fallback if you ever pass actorName
      createdAt: r.createdAt,
      editedAt: r.updatedAt ?? null,                 // <- FE wants `editedAt`
      // keep optional file fields if you later show attachments:
      fileUrl: r.fileUrl ?? null,
      fileName: r.fileName ?? null,
    };
  }
  // ---------- discussion CRUD (mapped to FE shape) ----------
  async listDiscussion(
    projectId: string,
    wirId: string,
    opts?: { after?: string | null; limit?: number | null }
  ) {
    await this.ensureWir(projectId, wirId);

    const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 500);
    const after = opts?.after ? new Date(opts.after) : null;

    const rows = await this.prisma.wirDiscussion.findMany({
      where: {
        wirId,
        deletedAt: null,
        ...(after ? { createdAt: { gt: after } } : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true, wirId: true, authorId: true, parentId: true,
        body: true, fileUrl: true, fileName: true,
        createdAt: true, updatedAt: true,
        author: { select: { userId: true, firstName: true, lastName: true } },
      },
      take: limit,
    });

    return { items: rows.map(r => this.toCommentRow(r)) };
  }

  async addDiscussion(
    projectId: string,
    wirId: string,
    body: { text?: string | null; parentId?: string | null; fileUrl?: string | null; fileName?: string | null },
    actor?: { userId?: string | null; fullName?: string | null }
  ) {
    await this.ensureWir(projectId, wirId);

    const text = (body?.text || '').trim();
    if (!text) throw new BadRequestException('Comment text is required.');
    if (text.length > 5000) throw new BadRequestException('Comment too long (max 5000 chars).');

    if (body?.parentId) {
      const parent = await this.prisma.wirDiscussion.findFirst({
        where: { id: body.parentId, wirId, deletedAt: null },
        select: { id: true },
      });
      if (!parent) throw new BadRequestException('Invalid parent comment.');
    }

    const row = await this.prisma.wirDiscussion.create({
      data: {
        wirId,
        authorId: actor?.userId || (() => { throw new BadRequestException('Actor required'); })(),
        parentId: body?.parentId || undefined,
        body: text,
        fileUrl: body?.fileUrl || undefined,
        fileName: body?.fileName || undefined,
      },
      select: {
        id: true, wirId: true, authorId: true, parentId: true,
        body: true, fileUrl: true, fileName: true, createdAt: true, updatedAt: true,
        author: { select: { userId: true, firstName: true, lastName: true } },
      },
    });

    await this.writeHistoryNote(projectId, wirId, text, actor);

    return { item: this.toCommentRow(row) };
  }

  async editDiscussion(
    projectId: string,
    wirId: string,
    commentId: string,
    body: { text?: string | null; fileUrl?: string | null; fileName?: string | null },
    actor?: { userId?: string | null; isSuperAdmin?: boolean | null }
  ) {
    await this.ensureWir(projectId, wirId);

    const existing = await this.prisma.wirDiscussion.findFirst({
      where: { id: commentId, wirId, deletedAt: null },
      select: { id: true, authorId: true },
    });
    if (!existing) throw new NotFoundException('Comment not found');

    const isAuthor = actor?.userId && actor.userId === existing.authorId;
    if (!isAuthor && !actor?.isSuperAdmin) {
      throw new BadRequestException('Not allowed to edit this comment');
    }

    const text = (body?.text ?? '').trim();
    if (!text) throw new BadRequestException('Comment text is required.');
    if (text.length > 5000) throw new BadRequestException('Comment too long (max 5000 chars).');

    const updated = await this.prisma.wirDiscussion.update({
      where: { id: commentId },
      data: {
        body: text,
        fileUrl: body?.fileUrl ?? null,
        fileName: body?.fileName ?? null,
      },
      select: {
        id: true, wirId: true, authorId: true, parentId: true,
        body: true, fileUrl: true, fileName: true, createdAt: true, updatedAt: true,
        author: { select: { userId: true, firstName: true, lastName: true } },
      },
    });

    return { item: this.toCommentRow(updated) };
  }

}
