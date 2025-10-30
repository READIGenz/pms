//pms-backend/src/modules/project-modules/wir/wir.service.ts
import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
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
      contractorName: w.contractor?.fullName ?? w.contractor?.firstName ?? null,
      inspectorName: w.inspector?.fullName ?? w.inspector?.firstName ?? null,
      hodName: w.hod?.fullName ?? w.hod?.firstName ?? null,
      items: (w.items || []).map((it: {
        id: string; name: string; spec?: string | null; required?: string | null;
        tolerance?: string | null; photoCount?: number | null; status?: string | null;
      }) => ({
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
    items: true,
  } as const;

  /* ---------- List & Get ---------- */
  async list(projectId: string) {
    const rows = await this.prisma.wir.findMany({
      where: { projectId },
      include: this.baseInclude,
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((r) => this.toFE(r));
  }

  async get(projectId: string, wirId: string) {
    const row = await this.prisma.wir.findFirst({
      where: { wirId, projectId },
      include: this.baseInclude,
    });
    if (!row) throw new NotFoundException('WIR not found');
    return this.toFE(row);
  }

  // --- NEW: generate next WIR code inside a transaction
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

  private async ensureEditableByAuthor(projectId: string, wirId: string, req: Request) {
    const userId = (req as any).user?.sub as string;
    const row = await this.prisma.wir.findUnique({ where: { wirId } });
    if (!row || row.projectId !== projectId) throw new NotFoundException('WIR not found');
    if (row.status !== WirStatus.Draft) throw new ForbiddenException('Only Draft can be edited');
    if (row.createdById && row.createdById !== userId) throw new ForbiddenException('Only author can edit this Draft');
    return row;
  }
  async update(projectId: string, wirId: string, patch: UpdateWirInput, req: Request) {
    await this.ensureEditableByAuthor(projectId, wirId, req);
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

  async submit(projectId: string, wirId: string, role: string) {
    const row = await this.prisma.wir.findUnique({ where: { wirId } });
    if (!row || row.projectId !== projectId) throw new NotFoundException('WIR not found');
    this.ensure(this.canSubmit(role, row.status), 'Not allowed to submit in current status');
    const updated = await this.prisma.wir.update({
      where: { wirId },
      data: { status: WirStatus.Submitted },
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
      data: { status: WirStatus.Recommended },
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
      data: { status: WirStatus.Approved, health: row.health ?? ProjectHealth.Green },
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
      data: { status: WirStatus.Rejected, health: ProjectHealth.Red },
      include: this.baseInclude,
    });
    return this.toFE(updated);
  }
}
