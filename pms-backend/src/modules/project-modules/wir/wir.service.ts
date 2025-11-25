import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateWirDto, UpdateWirHeaderDto, AttachChecklistsDto, RollForwardDto, DispatchWirDto } from './dto';
import { Prisma, WirStatus } from '@prisma/client';
import { randomUUID } from 'crypto';

type WirActionLiteral =
  | 'Created'
  | 'Updated'
  | 'Submitted'
  | 'Recommended'
  | 'Approved'
  | 'Rejected'
  | 'Returned'
  | 'Deleted'
  | 'BicChanged'
  | 'ItemsChanged'
  | 'Rescheduled'
  | 'NoteAdded';

function splitDateTime(iso?: string | null): { forDate?: Date; forTime?: string } {
  if (!iso) return {};
  const d = new Date(iso);
  if (isNaN(d.getTime())) return {};
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return { forDate: d, forTime: `${hh}:${mm}` };
}

@Injectable()
export class WirService {
  constructor(private prisma: PrismaService) { }

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
    action: WirActionLiteral,
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
        action: { in: ['Updated', 'ItemsChanged', 'Rescheduled', 'Submitted', 'Recommended', 'Approved', 'Rejected', 'Returned'] },
      },
    });
    return 1 + counts;
  }

  // ---------- core ----------
  async listByProject(projectId: string) {
    return this.prisma.wir.findMany({
      where: { projectId },
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        wirId: true, code: true, title: true, status: true,
        createdAt: true, updatedAt: true,
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
    })));
  }

  async get(projectId: string, wirId: string) {
    const wir = await this.prisma.wir.findFirst({
      where: { wirId, projectId },
      include: {
        checklists: true,
        items: { orderBy: [{ seq: 'asc' }, { createdAt: 'asc' }] },
        histories: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!wir) throw new NotFoundException('WIR not found');

    const version = await this.computedVersion(wirId);
    return { ...wir, version };
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
          code,                          // <-- NEW
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
        },
        select: { wirId: true, code: true, title: true, status: true },
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

      // 6) Version (first row => 1)
      const version = 1;
      return { wirId: wir.wirId, code: wir.code, title: wir.title, version, status: wir.status };
    });
  }

  async updateHeader(
    projectId: string,
    wirId: string,
    dto: UpdateWirHeaderDto,
    actor?: { userId?: string | null; fullName?: string | null }
  ) {
    // Scalars (use undefined to leave unchanged; null to clear if field supports null)
    const patch: Prisma.WirUpdateInput = {
      status: dto.status as any,
      discipline: dto.discipline as any,
      title: dto.title,
      description: dto.description,
      forDate:
        dto.forDate !== undefined
          ? (dto.forDate ? new Date(dto.forDate) : null)
          : undefined,
      forTime: dto.forTime !== undefined ? dto.forTime : undefined,
      cityTown: dto.cityTown,
      stateName: dto.stateName,
      rescheduleForDate:
        dto.rescheduleForDate !== undefined
          ? (dto.rescheduleForDate ? new Date(dto.rescheduleForDate) : null)
          : undefined,
      rescheduleForTime:
        dto.rescheduleForTime !== undefined ? dto.rescheduleForTime : undefined,
      rescheduleReason:
        dto.rescheduleReason !== undefined ? dto.rescheduleReason : undefined,
    };

    // Relations (connect/disconnect instead of setting *_Id)
    const rel: Prisma.WirUpdateInput = {};
    if (dto.inspectorId !== undefined) {
      rel.inspector =
        dto.inspectorId === null
          ? { disconnect: true }
          : { connect: { userId: dto.inspectorId } };
    }
    if (dto.contractorId !== undefined) {
      rel.contractor =
        dto.contractorId === null
          ? { disconnect: true }
          : { connect: { userId: dto.contractorId } };
    }
    if (dto.hodId !== undefined) {
      rel.hod =
        dto.hodId === null
          ? { disconnect: true }
          : { connect: { userId: dto.hodId } };
    }

    const updated = await this.prisma.wir.update({
      where: { wirId },
      data: { ...patch, ...rel },
    });

    await this.writeHistory(projectId, wirId, 'Updated', undefined, undefined, actor);
    const version = await this.computedVersion(wirId);
    return { ...updated, version };
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
    const version = await this.computedVersion(wirId);
    return { added: toAdd.length, materialized: dto.materializeItemsFromRef ? 'yes' : 'no', version };
  }

  async deleteWir(projectId: string, wirId: string) {
    // cascade behavior is defined in schema; this will remove child rows
    await this.prisma.wir.delete({ where: { wirId } });
    return { deleted: true };
  }

  // Create a new WIR “version” with only failed/NCR items (true versioning via new row)
  async rollForward(projectId: string, wirId: string, currentUserId: string | null, dto: RollForwardDto) {
    const src = await this.prisma.wir.findFirst({
      where: { projectId, wirId },
      include: { items: true, checklists: true },
    });
    if (!src) throw new NotFoundException('WIR not found');

    // choose items
    let itemIds = dto.itemIds?.length ? dto.itemIds : null;
    if (!itemIds) {
      // carry forward FAIL/NCR
      const failIds = src.items
        .filter(it => (it.inspectorStatus === 'FAIL') || (it.status === 'NCR'))
        .map(it => it.id);
      itemIds = failIds;
    }

    if (!itemIds?.length) {
      throw new BadRequestException('No items to roll forward (no failures/NCR and none explicitly provided).');
    }

    const { forDate, forTime } = splitDateTime(dto.plannedAt);

    const next = await this.prisma.$transaction(async tx => {
      // create header (new WIR row)
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
          seriesId: src.seriesId,           // <-- REQUIRED: keep same series
        },
      });

      // attach same checklists (by checklistId) preserving order/meta
      if (src.checklists.length) {
        await tx.wirChecklist.createMany({
          data: src.checklists.map(c => ({
            wirId: nextWir.wirId,
            checklistId: c.checklistId,
            checklistCode: c.checklistCode ?? undefined,
            checklistTitle: c.checklistTitle ?? undefined,
            discipline: c.discipline ?? undefined,
            versionLabel: c.versionLabel ?? undefined,
            itemsTotal: c.itemsTotal ?? 0,
            itemIds: c.itemIds ?? [],
            itemsCount: c.itemsCount ?? undefined,
            order: c.order ?? 0,
          })),
        });
      }

      // clone the chosen items (provenance retained)
      const chosen = src.items.filter(it => itemIds!.includes(it.id));
      if (chosen.length) {
        await tx.wirItem.createMany({
          data: chosen.map((it, idx) => ({
            wirId: nextWir.wirId,
            checklistId: it.checklistId ?? undefined,
            itemId: it.itemId ?? undefined,
            seq: idx + 1,
            name: it.name,
            spec: it.spec ?? undefined,
            required: it.required ?? undefined,
            tolerance: it.tolerance ?? undefined,
            status: 'Unknown',
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
          })),
        });
      }

      await this.writeHistory(projectId, wirId, 'Updated', 'Rolled forward to next version.', { nextWirId: nextWir.wirId });
      await this.writeHistory(projectId, nextWir.wirId, 'Created', 'Created by roll-forward', { fromWirId: wirId });

      return nextWir;
    });

    const version = await this.computedVersion(next.wirId);
    return { wirId: next.wirId, version, title: next.title, status: next.status };
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

}
