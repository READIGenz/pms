import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

type CreateProjectDto = {
  code: string;
  name: string;
  city: string;
  status?: string;
  stage: string;
  health?: string;
};

type AssignDto = {
  projectId: string;
  userId: string;
  role: string;
};

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // -----------------
  // Common helpers
  // -----------------
  private normStr(v?: string | null) {
    return (v ?? '').trim();
  }

  private normEmail(v?: string | null) {
    const s = this.normStr(v).toLowerCase();
    return s || null;
  }

  private onlyDigits(v?: string | null) {
    return this.normStr(v).replace(/\D/g, '');
  }

  /** Local phone must be exactly 10 digits and not start with '0'. */
  private normLocalPhone(v?: string | null): string | null {
    const d = this.onlyDigits(v);
    if (!d) return null;
    if (!/^[1-9][0-9]{9}$/.test(d)) return null;
    return d;
  }

  /** First 3 letters (A–Z) of role → uppercase; pad to 3 with 'X' if shorter. */
  private prefixFromRole(roleRaw: string): string {
    const letters = (roleRaw || '').replace(/[^A-Za-z]/g, '').toUpperCase();
    const base = letters.slice(0, 3) || 'USR';
    return base.padEnd(3, 'X');
  }

  /**
   * Compute next user code for a role.
   * e.g., "Customer" → "CUS001", "CUS002", … (expands >999).
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

  // -----------------
  // Projects
  // -----------------
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

  // -----------------
  // Users
  // -----------------
  /**
   * Create user with:
   * - optional manual `code`, or auto from role
   * - unique email / (countryCode, phone)
   * - `countryCode` (digits) and `phone` (10-digit local)
   */
  async createUser(dto: CreateUserDto) {
    const role = this.normStr(dto.role);
    const name = this.normStr(dto.name);
    const city = this.normStr(dto.city);
    const email = this.normEmail(dto.email);
    const countryCode = this.onlyDigits((dto as any).countryCode) || null;
    const localPhone  = this.normLocalPhone(dto.phone);
    const isSuperAdmin = !!dto.isSuperAdmin;

    // 👇 status (default Active)
    const status = (this.normStr(dto.status) as 'Active'|'Inactive') || 'Active';

    if (!role || !name) throw new BadRequestException('role and name are required');
    if (!email && !localPhone) throw new BadRequestException('Either email or phone is required');

    if (email) {
      const e = await this.prisma.user.findFirst({ where: { email } });
      if (e) throw new BadRequestException(`Email "${email}" already in use`);
    }
    if (countryCode && localPhone) {
      const exists = await this.prisma.user.findFirst({ where: { countryCode, phone: localPhone } });
      if (exists) throw new BadRequestException(`Phone +${countryCode}${localPhone} already in use`);
    }

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
            countryCode: countryCode ?? '91',
            phone: localPhone || null,
            isSuperAdmin,
            status, // 👈 NEW
          },
        });
        return { ok: true, userId: u.userId, code: u.code };
      } catch (e: any) {
        if (e?.code === 'P2002' && Array.isArray(e?.meta?.target) && e.meta.target.includes('code')) {
          (dto as any).code = undefined;
          continue;
        }
        throw e;
      }
    }
    throw new BadRequestException('Could not allocate a unique user code. Please retry.');
  }

  async updateUserStatus(userId: string, status: 'Active'|'Inactive') {
    const uid = this.normStr(userId);
    if (!uid) throw new BadRequestException('userId required');
    if (status !== 'Active' && status !== 'Inactive') {
      throw new BadRequestException('status must be Active or Inactive');
    }
    const u = await this.prisma.user.update({
      where: { userId: uid },
      data: { status },
      select: { userId: true, status: true },
    });
    return { ok: true, ...u };
  }

  /** If q omitted/blank, return recent users; else search across common fields. */
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
          { countryCode: { contains: query } },
        ],
      },
      orderBy: [{ name: 'asc' }],
      take: 50,
    });
  }

  // -----------------
  // Project assignments
  // -----------------
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

  async userProjects(userId: string) {
  if (!userId) throw new BadRequestException('userId required');
  const memberships = await this.prisma.projectMember.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      project: true,
    },
  });
  const projects = memberships.map(m => ({
    projectId: m.projectId,
    code: m.project.code,
    name: m.project.name,
    city: m.project.city,
    status: m.project.status,
    stage: m.project.stage,
    health: m.project.health,
    role: m.role,
    assignedAt: m.createdAt,
  }));
  return { ok: true, projects };
}

}
