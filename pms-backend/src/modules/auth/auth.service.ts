// pms-backend/src/modules/auth/auth.service.ts
import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service'; // adjust path as needed

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async exists(login: string, verbose = false) {
    const user = await this.findByLogin(login);
    if (!user) return { ok: true, exists: false };
    const res: any = { ok: true, exists: true };
    if (verbose) res.user = { name: this.fullName(user), status: user.userStatus };
    return res;
  }

  async verifyOtp(login: string, code: string) {
    // TODO: replace with your real OTP validation
    if (code !== '000000') {
      throw new UnauthorizedException('Invalid OTP');
    }
    const user = await this.findByLogin(login);
    if (!user) throw new UnauthorizedException('User not found');
    if (user.userStatus !== 'Active') throw new UnauthorizedException('User is inactive');

    // Load role memberships with company/project for labels
    const memberships = await this.prisma.userRoleMembership.findMany({
      where: { userId: user.userId },
      include: {
        company: { select: { companyId: true, name: true, companyRole: true } },
        project: { select: { projectId: true, title: true, code: true } },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    return { user, memberships };
  }

  async assumeRole(userId: string, membershipId: string) {
    const m = await this.prisma.userRoleMembership.findFirst({
      where: { id: membershipId, userId },
      include: {
        company: { select: { companyId: true, name: true, companyRole: true } },
        project: { select: { projectId: true, title: true, code: true } },
      },
    });
    if (!m) throw new BadRequestException('Invalid membership');

    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: {
        userId: true, firstName: true, lastName: true,
        email: true, phone: true, countryCode: true,
        userStatus: true, isSuperAdmin: true,
      },
    });
    if (!user) throw new UnauthorizedException('User not found');

    // Final token for the chosen role
    const jwtPayload: any = {
      sub: user.userId,
      isSuperAdmin: !!user.isSuperAdmin,
      role: m.role,                    // e.g. "Client", "Ava-PMT"…
      scopeType: m.scopeType,          // Global | Company | Project
      companyId: m.companyId ?? null,
      projectId: m.projectId ?? null,
    };

    const token = await this.signJwt(jwtPayload, { expiresIn: '2h' });

    return {
      ok: true,
      token,
      jwt: jwtPayload,
      user: {
        userId: user.userId,
        name: this.fullName(user),
        email: user.email,
        phone: user.phone,
        countryCode: user.countryCode,
        status: user.userStatus,
        isSuperAdmin: !!user.isSuperAdmin,
      },
      role: {
        id: m.id,
        role: m.role,
        scopeType: m.scopeType,
        scopeId: m.companyId ?? m.projectId ?? null,
        label: this.describeMembership(m),
        company: m.companyId
          ? { id: m.companyId, name: m.company?.name, role: m.company?.companyRole }
          : undefined,
        project: m.projectId
          ? { id: m.projectId, title: m.project?.title, code: m.project?.code }
          : undefined,
      },
    };
  }

  describeMembership(m: any): string {
    switch (m.scopeType) {
      case 'Global':
        return `${m.role} — Global`;
      case 'Company':
        return `${m.role} @ ${m.company?.name ?? 'Company'}`;
      case 'Project':
        return `${m.role} — ${m.project?.title ?? 'Project'}${m.project?.code ? ` (${m.project.code})` : ''}`;
      default:
        return m.role;
    }
  }

  signJwt(payload: any, options?: { expiresIn?: string | number }) {
    return this.jwt.signAsync(payload, options);
  }

  private async findByLogin(raw: string) {
    const login = (raw || '').trim();
    if (!login) return null;

    if (login.includes('@')) {
      return this.prisma.user.findUnique({ where: { email: login.toLowerCase() } });
    }

    // phone: accept with or without +91, etc.
    const digits = login.replace(/\D/g, '');
    // if you store +91 in db, normalize here as needed
    return this.prisma.user.findFirst({
      where: {
        OR: [
          { phone: digits },
          { phone: login },
        ],
      },
    });
  }

  private fullName(u: any) {
    return [u.firstName, u.middleName, u.lastName].filter(Boolean).join(' ').trim() || 'User';
  }
}
