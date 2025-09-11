/**
 * users.controller.ts
 * -------------------
 * Endpoints:
 *  - GET /users      -> list of users (debug)
 *  - GET /me         -> current user with project memberships
 *  - GET /me/kpis    -> KPI counters for dashboard tiles
 */
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { AuthGuard } from '../../common/guards/auth.guard';

@Controller()
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  @Get('users')
  list() {
    return this.svc.list();
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@Req() req: any) {
    return this.svc.getUserWithProjects(req.user.id);
  }

  @UseGuards(AuthGuard)
  @Get('me/kpis')
  myKpis(@Req() req: any) {
    return this.svc.kpis(req.user.id);
  }
}
