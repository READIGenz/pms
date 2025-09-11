import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService) {}
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const hdr = req.headers['authorization'] || '';
    const token = hdr.toString().startsWith('Bearer ') ? hdr.toString().slice(7) : null;
    if (!token) throw new UnauthorizedException('Missing token');
    try {
      const payload: any = this.jwt.verify(token, { secret: process.env.JWT_SECRET || 'devsecret' });
      req.user = { id: payload.sub, isSuperAdmin: !!payload.isSuperAdmin };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
