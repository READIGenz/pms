import { Controller, Get, Query, Post, Body, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { VerifyOtpDto } from './dto/otp.dto';

// class VerifyOtpDto {
//   login!: string;   // email OR phone
//   code!: string;    // OTP; we’ll accept dev 000000
// }

type ExistsResponse = { ok: boolean; exists: boolean; user?: { name?: string; status?: 'Active'|'Inactive' } };

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // GET /auth/exists?login=...&verbose=1
  @Get('exists')
  async exists(@Query('login') login?: string, @Query('verbose') verbose?: string) {
    if (!login || !login.trim()) {
      throw new BadRequestException('login required');
    }
    const user = await this.auth.findByLogin(login);
    const exists = !!user;
    if (!exists) return { ok: true, exists: false };

    // name + status for your Login.tsx
    const fullName = [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ') || 'User';
    const res: any = { ok: true, exists: true };
    if (verbose) res.user = { name: fullName, status: user.userStatus };
    return res;
  }
  // POST /auth/otp/verify { login, code }
  @Post('otp/verify')
  async otpVerify(@Body() dto: VerifyOtpDto) {
    const { login, code } = dto;

    // dev OTP check
    if (code !== '000000') {
      return { ok: false, error: 'Invalid OTP' };
    }

    const user = await this.auth.findByLogin(login);
    if (!user) {
      return { ok: false, error: 'User not found' };
    }

    // safety: block inactive
    if (user.userStatus === 'Inactive') {
      const name = [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ') || 'User';
      return { ok: false, error: `${name} has been de-activated by Admin. Contact Admin for more information!` };
    }

    const { token, payload } = this.auth.issueToken(user);
    const uiUser = {
      userId: user.userId,
      name: [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ') || 'User',
      isSuperAdmin: !!user.isSuperAdmin,
      status: user.userStatus,
      email: user.email,
      phone: user.phone,
      countryCode: user.countryCode,
      userRole: user.userRole
    };

    return { ok: true, token, user: uiUser, jwt: payload };
  }
}
