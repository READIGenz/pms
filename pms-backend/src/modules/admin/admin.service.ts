import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

type CreateProjectDto = {
  code: string;
  name: string;
  city: string;
  status?: string;
  stage: string;
  health?: string;
};

type CreateUserDto = {
  code?: string;              // optional; auto-generated if not provided
  role: string;
  name: string;
  city?: string | null;
  email?: string | null;
  phone?: string | null;
  isSuperAdmin?: boolean;
};

type AssignDto = {
  projectId: string;
  userId: string;
  role: string;
};

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------
  // Helpers
  // ---------------
  private normStr(v?: string | null) {
    return (v ?? '').trim();
  }

  private normEmail(v?: string | null) {
    const s = this.normStr(v);
    return s ? s.toLowerCase() : null;
  }

  private normPhone(v?: string | null) {
    const s = this.normStr(v);
    if (!s) return null;
    const digits = s.replace(/[^0-9]/g, '');
    return digits || null;
  }

  /** First 3 letters (A–Z) of role; padded to 3 if shorter. */
  private prefixFromRole(roleRaw: string): string {
    const letters = (roleRaw || '').replace(/[^A-Za-z]/g, '').toUpperCase();
    const base = letters.slice(0, 3) || 'USR';
    return base.padEnd(3, 'X');
  }

  /**
   * Next sequential user code per prefix.
   * "Customer" -> CUS001 (if none), CUS002, ... (expands > 999).
   */
  async getNextUserCode(roleRaw: string): Promise<string> {
    const prefix = this.prefixFromRole(roleRaw);

    const rows = await this.prisma.user.findMany({
      where: { code: { startsWith: prefix } },
      select: { code: true },
    });

    let maxN = 0;
    const re = new RegExp(`^${prefix}(\\d+)$`);
    for (const r of rows) {
      const m = r.code?.match(re);
      if (m) {
        const n = parseInt(m[1], 10);
        if (!Number.isNaN(n) && n > maxN) maxN = n;
      }
    }

    const next = maxN + 1;
    const width = next >= 1000 ? String(next).length : 3;
    return prefix + String(next).padStart(width, '0');
  }

  // ---------------
  // Projects
  // ---------------
  async createProject(dto: CreateProjectDto) {
    const code = this.normStr(dto.code).toUpperCase();
    const name = this.normStr(dto.name);
    const city = this.normStr(dto.city);
    const stage = this.normStr(dto.stage);
    const status = this.normStr(dto.status) || 'Ongoing';
    const health = this.normStr(dto.health) || 'Good';

    if (!code || !name || !city || !stage) {
      throw new BadRequestException('code, name, city, stage are required');
    }

    const exists = await this.prisma.project.findFirst({ where: { code } });
    if (exists) throw new BadRequestException(`Project code "${code}" already exists`);

    return this.prisma.project.create({
      data: { code, name, city, stage, status, health },
    });
  }

  listProjects(q?: string) {
    const query = this.normStr(q);
    return this.prisma.project.findMany({
      where: query
        ? {
            OR: [
              { code: { contains: query, mode: 'insensitive' } },
              { name: { contains: query, mode: 'insensitive' } },
              { city: { contains: query, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: [{ name: 'asc' }],
      take: 50,
    });
  }

  // ---------------
  // Users
  // ---------------
  async createUser(dto: CreateUserDto) {
    const role = this.normStr(dto.role);
    const name = this.normStr(dto.name);
    const city = this.normStr(dto.city);
    const email = this.normEmail(dto.email);
    const phone = this.normPhone(dto.phone);
    const isSuperAdmin = !!dto.isSuperAdmin;

    if (!role || !name) {
      throw new BadRequestException('role and name are required');
    }
    if (!email && !phone) {
      throw new BadRequestException('Either email or phone is required');
    }

    if (email) {
      const e = await this.prisma.user.findFirst({ where: { email } });
      if (e) throw new BadRequestException(`Email "${email}" already in use`);
    }
    if (phone) {
      const p = await this.prisma.user.findFirst({ where: { phone } });
      if (p) throw new BadRequestException(`Phone "${phone}" already in use`);
    }

    // Try creating with provided or generated code; retry on unique conflict.
    for (let attempt = 0; attempt < 3; attempt++) {
      const candidate = this.normStr(dto.code)?.toUpperCase() || (await this.getNextUserCode(role));
      try {
        const u = await this.prisma.user.create({
          data: {
            code: candidate,
            role,
            name,
            city: city || null,
            email,
            phone,
            isSuperAdmin,
          },
        });
        return { ok: true, userId: u.userId, code: u.code };
      } catch (e: any) {
        if (e?.code === 'P2002' && Array.isArray(e?.meta?.target) && e.meta.target.includes('code')) {
          dto.code = undefined; // regenerate on next loop
          continue;
        }
        throw e;
      }
    }

    throw new BadRequestException('Could not allocate a unique user code. Please retry.');
  }

  /** If q omitted/blank, return recent users. Otherwise search. */
  searchUsers(q?: string) {
    const query = this.normStr(q);
    if (!query) {
      return this.prisma.user.findMany({
        orderBy: [{ createdAt: 'desc' }],
        take: 50,
      });
    }
    return this.prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: query, mode: 'insensitive' } },
          { name:  { contains: query, mode: 'insensitive' } },
          { code:  { contains: query, mode: 'insensitive' } },
          { role:  { contains: query, mode: 'insensitive' } },
          { phone: { contains: query } },
        ],
      },
      orderBy: [{ name: 'asc' }],
      take: 50,
    });
  }

  // ---------------
  // Assignments (ProjectMember)
  // ---------------
  async assign(dto: AssignDto) {
    const projectId = this.normStr(dto.projectId);
    const userId = this.normStr(dto.userId);
    const role = this.normStr(dto.role);

    if (!projectId || !userId || !role) {
      throw new BadRequestException('projectId, userId, role required');
    }

    const [proj, user] = await Promise.all([
      this.prisma.project.findUnique({ where: { projectId } }),
      this.prisma.user.findUnique({ where: { userId } }),
    ]);
    if (!proj) throw new BadRequestException('Invalid projectId');
    if (!user) throw new BadRequestException('Invalid userId');

    return this.prisma.projectMember.create({
      data: { projectId, userId, role },
    });
  }

  listAssignments(projectId: string) {
    const pid = this.normStr(projectId);
    if (!pid) throw new BadRequestException('projectId required');
    return this.prisma.projectMember.findMany({
      where: { projectId: pid },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  removeAssignment(id: string) {
    const rid = this.normStr(id);
    if (!rid) throw new BadRequestException('id required');
    return this.prisma.projectMember.delete({ where: { id: rid } });
  }
}
