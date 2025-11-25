// src/modules/admin/permissions/projects.memberships.controller.ts
import { Controller, Get, Param, Query, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt.guard';
import { PrismaService } from '../../../prisma/prisma.service';
import { AdminProjectOverridesService } from './project-overrides.service';

type Matrix = Record<string, { view: boolean; raise: boolean; review: boolean; approve: boolean; close: boolean }>;
type ActingRole = 'Contractor' | 'Inspector' | 'HOD' | 'IH-PMT' | 'Admin' | 'Observer' | 'Client';

function parseISODate(d?: string): Date {
  const dt = d ? new Date(d) : new Date();
  if (Number.isNaN(dt.getTime())) return new Date();
  dt.setHours(0, 0, 0, 0);
  return dt;
}

const ROLE_PRIORITY: ActingRole[] = ['HOD', 'Inspector', 'IH-PMT', 'Admin', 'Client', 'Observer', 'Contractor'];

const OUT = { IH_PMT: 'IH-PMT' } as const;   // DB -> API
function apiFromDbRole(role: string): ActingRole {
  return ((OUT as any)[role] ?? role) as ActingRole;
}

@Controller('projects/:projectId')
export class ProjectsMembershipsController {
  constructor(
    private prisma: PrismaService,
    private overrides: AdminProjectOverridesService,
  ) {}

  /** GET /projects/:projectId/memberships/me
   *  → { roleInProject, effectivePermissions }
   */
  @UseGuards(JwtAuthGuard)
  @Get('memberships/me')
  async whoAmI(@Param('projectId') projectId: string, @Req() req: any) {
    const userId = String(req.user?.id ?? req.user?.sub ?? '');
    if (!userId) throw new ForbiddenException('No user in request');

    const today = parseISODate();
    const memberships = await this.prisma.userRoleMembership.findMany({
      where: {
        projectId,
        userId,
        OR: [
          { validFrom: { lte: today }, validTo: null },
          { validFrom: { lte: today }, validTo: { gte: today } },
        ],
      },
      select: { role: true },
    });

    // Optional legacy fallback (if your DB still has ProjectMember)
    if (!memberships.length) {
      const pmModel = (this.prisma as any)['projectMember'];
      if (pmModel) {
        const legacy = await pmModel.findFirst({
          where: { projectId, userId },
          select: { role: true },
        });
        if (legacy) {
          const roleApi = apiFromDbRole(legacy.role as any);
          const eff = await this.overrides.getEffective(projectId, roleApi);
          return { roleInProject: roleApi, effectivePermissions: (eff as any).matrix as Matrix };
        }
      }
      throw new ForbiddenException('You are not a member of this project');
    }

    const roleApi = memberships
      .map(m => apiFromDbRole(m.role as any))
      .sort((a, b) => ROLE_PRIORITY.indexOf(a) - ROLE_PRIORITY.indexOf(b))[0];

    const eff = await this.overrides.getEffective(projectId, roleApi);
    return { roleInProject: roleApi, effectivePermissions: (eff as any).matrix as Matrix };
  }

  /** GET /projects/:projectId/roles/acting?date=YYYY-MM-DD
   *  → [{ user, actingRole }]
   */
  @UseGuards(JwtAuthGuard)
  @Get('roles/acting')
  async acting(@Param('projectId') projectId: string, @Query('date') date?: string) {
    const on = parseISODate(date);

    // 1) all active memberships for the date
    const rows = await this.prisma.userRoleMembership.findMany({
      where: {
        projectId,
        OR: [
          { validFrom: { lte: on }, validTo: null },
          { validFrom: { lte: on }, validTo: { gte: on } },
        ],
      },
      select: { userId: true, role: true },
    });

    if (!rows.length) return [];

    // Build best-acting role per user
    const byUser = new Map<string, { roles: ActingRole[] }>();
    for (const r of rows) {
      const entry = byUser.get(r.userId) ?? { roles: [] as ActingRole[] };
      entry.roles.push(apiFromDbRole(r.role as any));
      byUser.set(r.userId, entry);
    }

    // 2) Fetch user display data by `userId`
    const userIds = Array.from(byUser.keys());
    const users = await this.prisma.user.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, firstName: true, middleName: true, lastName: true, email: true },
    });

    const byId = new Map<string, any>(users.map(u => [String(u.userId), u]));

    // 3) Assemble response
    return Array.from(byUser.entries()).map(([uid, v]) => {
      const actingRole = v.roles.sort((a, b) => ROLE_PRIORITY.indexOf(a) - ROLE_PRIORITY.indexOf(b))[0];
      const u = byId.get(String(uid));
      const fullName = u
        ? [u.firstName, u.middleName, u.lastName].filter(Boolean).join(' ')
        : undefined;

      // expose `id` in payload for UI stability, but it’s actually userId
      const user = u
        ? { id: u.userId, fullName, email: u.email }
        : { id: uid };

      return { user, actingRole };
    });
  }
}
