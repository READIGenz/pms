import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';

@UseGuards(AuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly svc: AdminService) {}

  // Keep roles catalog in a single place to align UI and backend
  private static readonly ROLE_CATALOG: readonly string[] = [
    'Admin',
    'Customer',
    'PMC',
    'Architect',
    'Designer',
    'Contractor',
    'Legal/Liasoning',
    'Ava-PMT',
    'Engineer (Contractor)',
    'DC (Contractor)',
    'DC (PMC)',
    'Inspector (PMC)',
    'HOD (PMC)',
  ];

  // --------------------
  // Projects
  // --------------------

  @Post('projects')
  async createProject(
    @Body()
    dto: {
      code: string;
      name: string;
      city: string;
      status?: string;
      stage: string;
      health?: string;
    },
  ) {
    const p = await this.svc.createProject(dto);
    return { ok: true, projectId: p.projectId };
  }

  @Get('projects')
  async listProjects(@Query('q') q?: string) {
    const items = await this.svc.listProjects(q);
    return { ok: true, items };
  }

  // --------------------
  // Users
  // --------------------

  @Post('users')
  async createUser(
    @Body()
    dto: {
      code?: string;
      role: string;
      name: string;
      city?: string;
      email?: string | null;
      phone?: string | null;
      isSuperAdmin?: boolean;
    },
  ) {
    const res = await this.svc.createUser(dto);
    return res;
  }

  @Get('users')
  async searchUsers(@Query('q') q?: string) {
    const items = await this.svc.searchUsers(q);
    return { ok: true, items };
  }

  @Get('users/next-code')
  async nextUserCode(@Query('role') role?: string) {
    if (!role?.trim()) throw new BadRequestException('role required');
    const code = await this.svc.getNextUserCode(role);
    return { ok: true, code };
  }

  // Roles catalog for "View Roles" page
  @Get('roles/catalog')
  rolesCatalog() {
    return { ok: true, roles: AdminController.ROLE_CATALOG };
  }

  // --------------------
  // Assignments (legacy single endpoints)
  // --------------------

  @Post('assignments')
  async assign(@Body() dto: { projectId: string; userId: string; role: string }) {
    const row = await this.svc.assign(dto);
    return { ok: true, id: (row as any)?.id ?? null };
  }

  @Get('assignments')
  async listAssignments(@Query('projectId') projectId: string) {
    const items = await this.svc.listAssignments(projectId);
    return { ok: true, items };
  }

  @Delete('assignments')
  async removeAssignment(@Query('id') id: string) {
    await this.svc.removeAssignment(id);
    return { ok: true };
  }

  // --------------------
  // Project Roles (read/bulk assign)
  // --------------------

  /** Map of role -> userId|null for a project. */
  @Get('projects/:id/roles')
  async getProjectRoles(@Param('id') projectId: string) {
    if (!projectId) throw new BadRequestException('projectId required');
    const current = await this.svc.listAssignments(projectId);

    const assignments: Record<string, string | null> = {};
    for (const r of AdminController.ROLE_CATALOG) assignments[r] = null;

    for (const row of current as any[]) {
      if (row?.role) assignments[row.role] = row.userId ?? null;
    }
    return { ok: true, assignments };
  }

  /**
   * Reconcile assignments to provided snapshot.
   * Body: { assignments: { [role]: userId|null } }
   */
  @Post('projects/:id/assign-roles')
  async setProjectRoles(
    @Param('id') projectId: string,
    @Body() body: { assignments: Record<string, string | null> },
  ) {
    if (!projectId) throw new BadRequestException('projectId required');
    if (!body || typeof body.assignments !== 'object') {
      throw new BadRequestException('assignments object is required');
    }

    const current = await this.svc.listAssignments(projectId);
    const currentByRole = new Map<string, { id: string; userId: string | null }>();
    for (const row of current as any[]) {
      if (row?.role && row?.id) currentByRole.set(row.role, { id: row.id, userId: row.userId ?? null });
    }

    const desired: Record<string, string | null> = {};
    for (const role of AdminController.ROLE_CATALOG) {
      desired[role] = body.assignments.hasOwnProperty(role) ? body.assignments[role] : null;
    }

    // remove roles set to null
    for (const [role, cur] of currentByRole) {
      const nextUserId = desired[role] ?? null;
      if (nextUserId === null) await this.svc.removeAssignment(cur.id);
    }

    // upsert new/changed roles
    for (const role of AdminController.ROLE_CATALOG) {
      const nextUserId = desired[role] ?? null;
      const cur = currentByRole.get(role);
      const curUserId = cur?.userId ?? null;

      if (curUserId === null && nextUserId === null) continue;
      if (curUserId && nextUserId && curUserId === nextUserId) continue;

      if (nextUserId) await this.svc.assign({ projectId, userId: nextUserId, role });
    }

    return { ok: true };
  }
}
