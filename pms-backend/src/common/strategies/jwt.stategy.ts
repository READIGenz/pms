// src/common/strategies/jwt.strategy.ts
import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

type JwtPayload = {
  sub: string;
  isSuperAdmin?: boolean;
  name?: string;
  email?: string;
};

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (v?: string) => !!v && UUID_RX.test(v || '');

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);
  private readonly debug = process.env.DEBUG_JWT === '1';

  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'dev-secret',
    });
  }

  async validate(payload: JwtPayload) {
    // Debug: raw claims seen
    if (this.debug) {
      this.logger.debug(
        `[JWT] validate(): sub=${payload.sub} isSuperAdmin=${!!payload.isSuperAdmin} name=${payload.name ?? ''} email=${payload.email ?? ''}`,
      );
    }

    let firstName: string | undefined;
    let middleName: string | undefined;
    let lastName: string | undefined;

    const materializeName = (raw?: string | null) => {
      const n = (raw || '').trim();
      if (!n) return;
      const parts = n.split(/\s+/);
      firstName = parts[0];
      if (parts.length > 2) {
        middleName = parts.slice(1, -1).join(' ');
        lastName = parts[parts.length - 1];
      } else if (parts.length === 2) {
        lastName = parts[1];
      }
    };

    // Start with whatever the token provides
    materializeName(payload.name);

    let email = payload.email;
    let userId: string | undefined = isUuid(payload.sub) ? payload.sub : undefined;

    // Fallback: if name/email missing but we have a UUID sub, fetch user from DB.
    if (userId && (!firstName || !email)) {
      try {
        const u = await this.prisma.user.findUnique({
          where: { userId },
          select: { firstName: true, middleName: true, lastName: true, email: true },
        });
        if (u) {
          if (!firstName) {
            const full = [u.firstName, u.middleName, u.lastName].filter(Boolean).join(' ').trim() || undefined;
            materializeName(full);
          }
          if (!email) email = u.email ?? undefined;
        }
      } catch {
        // keep going with whatever we had
      }
    }

    // Final object becomes req.user
    const resolved = {
      sub: payload.sub,
      isSuperAdmin: !!payload.isSuperAdmin,
      email,
      userId, // UUID from sub (preferred)
      firstName,
      middleName,
      lastName,
      name: [firstName, middleName, lastName].filter(Boolean).join(' ').trim() || (payload.name || undefined),
    };

    if (this.debug) {
      this.logger.debug(
        `[JWT] validate(): resolved user -> userId=${resolved.userId ?? ''} name=${resolved.name ?? ''}`,
      );
    }

    return resolved;
  }
}
