import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma.service';

const STATIC_OTP = '000000';

@Controller('auth')
export class AuthController {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  // ---------- helpers (local-only, do not change external behavior) ----------
  private onlyDigits(v?: string | null) {
    return (v ?? '').replace(/\D/g, '');
  }

  /**
   * Find a user by email or phone input.
   * - Email: case-insensitive exact match
   * - Phone: accepts "9876543210" or "+<cc><10digits>" or mixed; tries (cc, phone) when available,
   *          otherwise falls back to phone-only (keeps your original logic intact).
   */
  private async findUserByLogin(rawLogin: string) {
    const raw = (rawLogin || '').trim();
    if (!raw) return null;

    if (raw.includes('@')) {
      // email lookup (exists used insensitive; keep same spirit here)
      return this.prisma.user.findFirst({
        where: { email: { equals: raw, mode: 'insensitive' } },
      });
    }

    const digits = this.onlyDigits(raw);
    if (!digits) return null;

    if (digits.length > 10) {
      // Treat as +<cc><local10>
      const local = digits.slice(-10);
      const cc = digits.slice(0, -10);
      const byPair = await this.prisma.user.findFirst({ where: { countryCode: cc, phone: local } });
      if (byPair) return byPair;
      // graceful fallback to phone-only (keeps earlier behavior)
      return this.prisma.user.findFirst({ where: { phone: local } });
    }

    if (digits.length === 10) {
      // Original behavior was phone-only; keep that, but try +91 first (common default)
      const by91 = await this.prisma.user.findFirst({ where: { countryCode: '91', phone: digits } });
      if (by91) return by91;
      return this.prisma.user.findFirst({ where: { phone: digits } });
    }

    // Any other length → no match
    return null;
  }

  // ✅ Username existence check (+ optional verbose for name/status)
  @Get('exists')
  async exists(@Query('login') login: string, @Query('verbose') verbose?: string) {
    const raw = (login || '').trim();
    if (!raw) return { ok: true, exists: false };

    // Keep your original semantics for "exists", but allow verbose detail.
    // Original code:
    //  - Email: insensitive equals
    //  - Phone: digits-only on phone column
    // We extend it minimally to handle cc+phone, without breaking the old path.
    const user = await this.findUserByLogin(raw);

    if (verbose && user) {
      // Provide minimal details so the frontend can block Inactive users at validation step.
      return { ok: true, exists: true, user: { name: user.name, status: user.status } };
    }
    return { ok: true, exists: !!user };
  }

  // (Optional) No-op stub; safe if something still calls it
  @Post('otp/request')
  async request(@Body() _body: { login: string }) {
    return { ok: true, sent: true };
  }

  // OTP verify (dev: 000000) + Inactive block
  @Post('otp/verify')
  async verify(@Body() body: { login: string; code: string }) {
    const raw = (body.login || '').trim();

    // Preserve your existing logic but centralize lookup
    const user = await this.findUserByLogin(raw);
    if (!user) return { ok: false, error: 'User does not exist' };
    if (body.code !== STATIC_OTP) return { ok: false, error: 'Invalid OTP' };

    // NEW: Block Inactive users with requested message
    if (user.status === 'Inactive') {
      const name = user.name || 'User';
      return {
        ok: false,
        error: `${name} has been de-activated by Admin. Contact Admin for more information!`,
      };
    }

    const token = this.jwt.sign({ sub: user.userId, isSuperAdmin: user.isSuperAdmin });
    return { ok: true, token, user };
  }
}
