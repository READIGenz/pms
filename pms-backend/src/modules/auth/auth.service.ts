import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  /**
   * Accepts email or phone in `login`.
   * - If contains '@' -> email.
   * - Else treat as phone: normalize digits, default cc to '+91' if 10 digits.
   *   If login includes a country code (e.g. +919000000001 / 919000000001), we split it.
   */
  async findByLogin(login: string) {
    const raw = (login || '').trim();

    if (raw.includes('@')) {
      const email = raw.toLowerCase();
      return this.prisma.user.findUnique({ where: { email } });
    }

    // phone path
    const digits = raw.replace(/[^\d+]/g, '');
    // cases:
    //  - "9000000001" => cc +91, phone 9000000001
    //  - "+919000000001" or "919000000001" => cc +91, phone 9000000001
    //  - "+1xxxxxxxxxx" etc.
    let cc = '+91';
    let phone = digits;

    if (digits.startsWith('+')) {
      // +<cc><number> — try India or generic split
      if (digits.startsWith('+91') && digits.length >= 13) {
        cc = '+91';
        phone = digits.slice(3);
      } else {
        // crude split: assume first 1–3 chars after + is country code
        // adjust to your real parsing needs
        cc = '+' + digits.slice(1, 3);
        phone = digits.slice(3);
      }
    } else if (digits.length > 10) {
      // like "919000000001" => assume 91 + 10
      if (digits.startsWith('91') && digits.length >= 12) {
        cc = '+91';
        phone = digits.slice(2);
      } else {
        // fallback: last 10 as number, rest as cc (simple heuristic)
        cc = '+' + digits.slice(0, digits.length - 10);
        phone = digits.slice(-10);
      }
    } else if (digits.length === 10) {
      cc = '+91';
      phone = digits;
    }

    return this.prisma.user.findUnique({
      where: { countryCode_phone: { countryCode: cc, phone } }, // <- matches your composite unique
    });
  }

  issueToken(user: any) {
    const payload = {
      sub: user.userId,
      isSuperAdmin: !!user.isSuperAdmin,
      name: [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ') || 'User',
    };
    const token = this.jwt.sign(payload);
    return { token, payload };
  }

  // Optional: for /auth/me later
  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { userId } });
    if (!user) return { ok: false, error: 'Not found' };
    return { ok: true, user };
  }
}
