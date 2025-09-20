import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

type JwtPayload = {
  sub: string;
  isSuperAdmin?: boolean;
  name?: string;
  // add any extra claims you include when signing
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Prefer process.env.JWT_SECRET; fall back to a dev value if unset
      secretOrKey: process.env.JWT_SECRET || 'dev-secret',
    });
  }

  async validate(payload: JwtPayload) {
    // whatever you return here ends up as req.user
    return {
      sub: payload.sub,
      isSuperAdmin: !!payload.isSuperAdmin,
      name: payload.name,
    };
  }
}

