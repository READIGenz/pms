// pms-backend/src/modules/auth/auth.controller.ts
import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt.guard';
import { AssumeRoleDto } from './dto/assume-role.dto';

function nameOf(u: any): string {
  return [u?.firstName, u?.middleName, u?.lastName].filter(Boolean).join(' ').trim() || 'User';
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('exists')
  async exists(@Req() req: any) {
    const login = req.query?.login ?? '';
    const verbose = req.query?.verbose;
    return this.auth.exists(login, verbose === '1');
  }

  // No guard here; OTP is the proof
  @Post('otp/verify')
  async verifyOtp(@Body() dto: { login: string; code: string }) {
    const { user, memberships } = await this.auth.verifyOtp(dto.login, dto.code);

    // 0 or 1 role → issue final token immediately
    if (!memberships || memberships.length <= 1) {
      const payload: any = {
        sub: user.userId,
        isSuperAdmin: !!user.isSuperAdmin,
      };
      if (memberships?.length === 1) {
        payload.role = memberships[0].role;
      }

      const token = await this.auth.signJwt(payload, { expiresIn: '2h' });

      return {
        ok: true,
        user: {
          userId: user.userId,
          name: nameOf(user), // ✅ build name
          email: user.email,
          phone: user.phone,
          countryCode: user.countryCode,
          status: user.userStatus,
          isSuperAdmin: !!user.isSuperAdmin,
        },
        token,
        jwt: payload,
        chooseRole: false,
        roles: [],
      };
    }

    // Multiple roles → short-lived bootstrap token
    const provisional = await this.auth.signJwt(
      { sub: user.userId, provisional: true },
      { expiresIn: '10m' },
    );

    const roles = memberships.map((m: any) => ({
      id: m.id,
      role: m.role,
      scopeType: m.scopeType,
      scopeId: m.companyId ?? m.projectId ?? null,
      label: this.auth.describeMembership(m),
      company: m.companyId
        ? { id: m.companyId, name: m.company?.name, role: m.company?.companyRole }
        : undefined,
      project: m.projectId
        ? { id: m.projectId, title: m.project?.title, code: m.project?.code }
        : undefined,
    }));

    return {
      ok: true,
      user: {
        userId: user.userId,
        name: nameOf(user), // ✅ build name
        email: user.email,
        phone: user.phone,
        countryCode: user.countryCode,
        status: user.userStatus,
        isSuperAdmin: !!user.isSuperAdmin,
      },
      token: provisional,   // ✅ FE uses this for /auth/assume-role
      chooseRole: true,
      roles,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('assume-role')
  async assume(@Req() req: any, @Body() dto: AssumeRoleDto) {
    return this.auth.assumeRole(req.user.sub, dto.membershipId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() req: any) {
    return { ok: true, me: req.user };
  }
}
