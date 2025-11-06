//pms-backend/src/modules/project-modules/wir/wir.service.ts
import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma, WirStatus, WirItemStatus, ProjectHealth } from '@prisma/client';

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
  items?: Array<{
    name: string;
    spec?: string | null;
    required?: string | null;
    tolerance?: string | null;
    photoCount?: number | null;
    status?: string | null;
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
    const w = await this.prisma.wir.findFirst({ where: { wirId, projectId } });
    if (!w) throw new NotFoundException('WIR not found');
    if (String(w.status || '').toLowerCase() !== 'draft') {
      throw new BadRequestException('Only Draft WIR can be deleted');
    }
    // If you keep child tables (items, attachments), delete in a tx:
    return this.prisma.$transaction(async (tx) => {
      await tx.wirItem.deleteMany({ where: { wirId } });
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
      return tx.wir.delete({ where: { wirId } });
    });
  }

  /* ---------- Mapping to FE shape ---------- */
  private toFE(w: any) {
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
      cityTown: w.cityTown,
      stateName: w.stateName,

      contractorName: name(w.contractor),
      inspectorName: name(w.inspector),
      hodName: name(w.hod),

      // Ball-In-Court
      bicUserId: w.bicUserId ?? w.bic?.userId ?? null,
      bicName: name(w.bic),

      createdById: w.createdById ?? w.createdBy?.userId ?? null,

      items: (w.items || []).map((it: any) => ({
        id: it.id,
        name: it.name,
        spec: it.spec,
        required: it.required,
        tolerance: it.tolerance,
        photoCount: it.photoCount,
        status: it.status,
      })),
      description: w.description,
      updatedAt: w.updatedAt,
    };
  }

  private baseInclude = {
    project: { select: { projectId: true, code: true, title: true } },
    contractor: {
      select: {
        userId: true,
        firstName: true,
        middleName: true,
        lastName: true,
        email: true,
        phone: true,
        code: true
      }
    },
    inspector: {
      select: {
        userId: true,
        firstName: true,
        middleName: true,
        lastName: true,
        email: true,
        phone: true,
        code: true
      }
    },
    hod: {
      select: {
        userId: true,
        firstName: true,
        middleName: true,
        lastName: true,
        email: true,
        phone: true,
        code: true
      }
    },
    createdBy: {
      select: {
        userId: true,
        firstName: true,
        lastName: true
      }
    },
    bic: {
      select: {
        userId: true,
        firstName: true,
        lastName: true
      }
    },
    items: true,
  } as const;

  /* ---------- Project-role helpers ---------- */
  // Adjust these to your schema; assumed ProjectMember with roleName/role enum
  private async getProjectRole(userId: string, projectId: string): Promise<string | null> {
    // Example: ProjectMember(userId, projectId, roleName)
    const m = await this.prisma.userRoleMembership.findFirst({
      where: { projectId, userId },
      select: { role: true }, // or { role: true } if enum
    });
    // Normalize to canonical UI keys: 'Contractor', 'Client', 'PMC', 'IH-PMT', 'Consultant', 'Admin', etc.
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

    // Everyone sees non-drafts. Drafts are visible only to the author AND only if the viewer is a Contractor.
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
        // You can choose 404 to avoid leaking existence; spec asked 403/404.
        throw new ForbiddenException('Draft is visible only to its author (Contractor).');
      }
    }

    return this.toFE(row);
  }

  // --- Generate next WIR code inside a transaction
  private async nextWirCode(tx: Prisma.TransactionClient): Promise<string> {
    // Codes are fixed-width "WIR-0001", so lexical DESC is safe.
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

  // --- your existing create logic, now wrapped to assign code if absent
  async create(projectId: string, dto: any, createdById?: string) {
    // keep dto contract unchanged; ignore any incoming dto.code and always generate
    // (if you want to allow explicit code in future, gate this with: if (!dto.code) ...)
    const attempt = async (tx: Prisma.TransactionClient) => {
      const code = await this.nextWirCode(tx);
      return tx.wir.create({
        data: {
          // minimal, unchanged mapping
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
          code, // <-- NEW: persist generated code
          // items creation stays exactly as you already had it (if any)
          ...(Array.isArray(dto?.items) && dto.items.length
            ? {
              items: {
                create: dto.items.map((it: any) => ({
                  name: it?.name ?? 'Item',
                  spec: it?.spec ?? null,
                  required: it?.required ?? null,
                  tolerance: it?.tolerance ?? null,
                  photoCount: Number.isFinite(it?.photoCount) ? it.photoCount : null,
                  status: toWirItemStatus(it?.status) ?? WirItemStatus.Unknown,
                })),
              },
            }
            : {}),
        },
      });
    };

    // simple retry on unique race (parallel creates)
    for (let i = 0; i < 3; i++) {
      try {
        return await this.prisma.$transaction((tx) => attempt(tx));
      } catch (e: any) {
        const isUnique =
          e?.code === 'P2002' || // Prisma unique constraint
          /unique/i.test(String(e?.message || ''));
        if (!isUnique || i === 2) throw e; // rethrow if not a unique clash or after retries
        // else loop to try again and get the next code
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

    const row = await this.prisma.wir.update({
      where: { wirId },
      data,
      include: this.baseInclude,
    });
    if (row.projectId !== projectId) throw new ForbiddenException('Project mismatch');
    if (row.status === WirStatus.Draft) {
      data.bic = row.contractorId ? { connect: { userId: row.contractorId } } : { disconnect: true };
    }
    return this.toFE(row);
    // Items CRUD can be separate endpoints; kept simple for now.
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
    return this.canApprove(role, current); // same authorities can reject
  }

  async submit(projectId: string, wirId: string, roleFromBody: string, userId: string) {
    const row = await this.prisma.wir.findUnique({ where: { wirId } });
    if (!row || row.projectId !== projectId) throw new NotFoundException('WIR not found');

    const isCtr = await this.isContractorForProject(userId, projectId);
    if (!isCtr) throw new ForbiddenException('Only Contractors can submit a WIR');

    // Only author can submit their Draft
    if (row.status === WirStatus.Draft && row.createdById && row.createdById !== userId) {
      throw new ForbiddenException('Only the author can submit this Draft');
    }

    this.ensure(this.canSubmit('Contractor', row.status), 'Not allowed to submit in current status');

    const nextBicUserId = row.inspectorId ?? row.hodId ?? null;

    const updated = await this.prisma.wir.update({
      where: { wirId },
      data: { status: WirStatus.Submitted, bicUserId: nextBicUserId },
      include: this.baseInclude,
    });
    return this.toFE(updated);
  }

  async recommend(projectId: string, wirId: string, role: string) {
    const row = await this.prisma.wir.findUnique({ where: { wirId } });
    if (!row || row.projectId !== projectId) throw new NotFoundException('WIR not found');
    this.ensure(this.canRecommend(role, row.status), 'Not allowed to recommend in current status');
    const updated = await this.prisma.wir.update({
      where: { wirId },
      data: { status: WirStatus.Recommended, bicUserId: row.hodId ?? null },
      include: this.baseInclude,
    });
    return this.toFE(updated);
  }

  async approve(projectId: string, wirId: string, role: string) {
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
    return this.toFE(updated);
  }

  async reject(projectId: string, wirId: string, role: string) {
    const row = await this.prisma.wir.findUnique({ where: { wirId } });
    if (!row || row.projectId !== projectId) throw new NotFoundException('WIR not found');
    this.ensure(this.canReject(role, row.status), 'Not allowed to reject in current status');

    const updated = await this.prisma.wir.update({
      where: { wirId },
      data: {
        status: WirStatus.Rejected,
        health: ProjectHealth.Red,
        bicUserId: row.contractorId ?? null,
      },
      include: this.baseInclude,
    });
    return this.toFE(updated);
  }

}
