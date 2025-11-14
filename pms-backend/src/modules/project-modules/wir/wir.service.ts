// pms-backend/src/modules/project-modules/wir/wir.service.ts
import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma, WirStatus, WirItemStatus, ProjectHealth, WirAction } from '@prisma/client';

const toWirItemStatus = (s?: string | null): WirItemStatus | undefined => {
  if (!s) return undefined;
  const n = s.trim().toLowerCase();
  if (n === 'ok') return WirItemStatus.OK;
  if (n === 'ncr') return WirItemStatus.NCR;
  if (n === 'pending') return WirItemStatus.Pending;
  if (n === 'unknown') return WirItemStatus.Unknown;
  return undefined; // unknown label -> omit
};

const name = (u?: { firstName?: string | null; lastName?: string | null } | null) => {
  if (!u) return null;
  const f = (u.firstName || '').trim();
  const l = (u.lastName || '').trim();
  return (f && l) ? `${f} ${l}` : (f || l || null);
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
    // NEW (accept if caller sends):
    critical?: boolean | null;
    value?: string | number | null;
    code?: string | null;
    unit?: string | null;
    tags?: string[] | null;
  }>;
};

type UpdateWirInput = Partial<CreateWirInput> & { status?: WirStatus | null; health?: ProjectHealth | null; };

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
    if (!row) throw new NotFoundException('WIR not found');

    if (row.status === WirStatus.Draft) {
      const isCtr = await this.isContractorForProject(userId, projectId);
      const isAuthor = !!row.createdById && row.createdById === userId;
      if (!(isCtr && isAuthor)) {
        throw new ForbiddenException('Draft is visible only to its author (Contractor).');
      }
    }

    return this.toFE(row);
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

              // NEW
              critical: typeof ri.critical === 'boolean' ? ri.critical : null,
              value: null,
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
  private canRecommend(role: string, current: WirStatus) {
    return (role === 'PMC' || role === 'IH-PMT' || role === 'Consultant') && current === WirStatus.Submitted;
  }
  private canApprove(role: string, current: WirStatus) {
    return (role === 'Admin' || role === 'Client' || role === 'IH-PMT' || role === 'PMC')
      && (current === WirStatus.Recommended || current === WirStatus.Submitted);
  }

  private canReject(role: string, current: WirStatus) {
    return this.canApprove(role, current);
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

  async recommend(projectId: string, wirId: string, role: string) {
    return await this.prisma.$transaction(async (tx) => {
      const row = await tx.wir.findUnique({ where: { wirId } });
      if (!row || row.projectId !== projectId) throw new NotFoundException('WIR not found');
      this.ensure(this.canRecommend(role, row.status), 'Not allowed to recommend in current status');

      const updated = await tx.wir.update({
        where: { wirId },
        data: { status: WirStatus.Recommended, bicUserId: row.hodId ?? null },
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
      });

      return this.toFE(updated);
    });
  }

  async approve(projectId: string, wirId: string, role: string) {
    return await this.prisma.$transaction(async (tx) => {
      const row = await this.prisma.wir.findUnique({ where: { wirId } });
      if (!row || row.projectId !== projectId) throw new NotFoundException('WIR not found');
      this.ensure(this.canApprove(role, row.status), 'Not allowed to approve in current status');

      const updated = await this.prisma.wir.update({
        where: { wirId },
        data: {
          status: WirStatus.Approved,
          health: row.health ?? ProjectHealth.Green,
          bicUserId: row.contractorId ?? null,
        },
        include: this.baseInclude,
      });

      await this.recordHistory(this.prisma, {
        projectId,
        wirId,
        action: WirAction.Approved,
        fromStatus: row.status,
        toStatus: updated.status,
        fromBicUserId: row.bicUserId ?? null,
        toBicUserId: updated.bicUserId ?? null,
      });

      return this.toFE(updated);
    });
  }

  async reject(projectId: string, wirId: string, role: string) {
    return await this.prisma.$transaction(async (tx) => {
      const row = await tx.wir.findUnique({ where: { wirId } });
      if (!row || row.projectId !== projectId) throw new NotFoundException('WIR not found');

      this.ensure(this.canReject(role, row.status), 'Not allowed to reject in current status');

      const updated = await tx.wir.update({
        where: { wirId },
        data: {
          status: WirStatus.Rejected,
          health: ProjectHealth.Red,
          bicUserId: row.contractorId ?? null,
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

}
