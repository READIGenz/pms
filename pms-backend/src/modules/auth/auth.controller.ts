import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma.service'; // <-- adjust if needed

const STATIC_OTP = '000000';

@Controller('auth')
export class AuthController {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  // ✅ Username existence check
  @Get('exists')
  async exists(@Query('login') login: string) {
    const raw = (login || '').trim();
    if (!raw) return { ok: true, exists: false };

    const isEmail = raw.includes('@');
    const phoneDigits = raw.replace(/[^\d]/g, '');

    const user = await this.prisma.user.findFirst({
      where: isEmail
        ? { email: { equals: raw, mode: 'insensitive' } }
        : { phone: phoneDigits },
      select: { userId: true },
    });

    return { ok: true, exists: !!user };
  }

  // (Optional) No-op stub; safe if something still calls it
  @Post('otp/request')
  async request(@Body() _body: { login: string }) {
    return { ok: true, sent: true };
  }

  // OTP verify (dev: 000000)
  @Post('otp/verify')
  async verify(@Body() body: { login: string; code: string }) {
    const raw = (body.login || '').trim();
    const isEmail = raw.includes('@');
    const phoneDigits = raw.replace(/[^\d]/g, '');

    const user = await this.prisma.user.findFirst({
      where: isEmail ? { email: raw } : { phone: phoneDigits },
    });
    if (!user) return { ok: false, error: 'User does not exist' };
    if (body.code !== STATIC_OTP) return { ok: false, error: 'Invalid OTP' };

    const token = this.jwt.sign({ sub: user.userId, isSuperAdmin: user.isSuperAdmin });
    return { ok: true, token, user };
  }
}
