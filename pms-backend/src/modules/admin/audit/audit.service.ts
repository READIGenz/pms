// src/modules/admin/audit/audit.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditAction, Prisma, RoleScope, UserRole } from '@prisma/client';

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (v?: string | null): v is string => !!v && UUID_RX.test(v || '');

const AUDIT_DEBUG =
  String(process.env.AUDIT_DEBUG || '').toLowerCase() === '1' ||
  String(process.env.AUDIT_DEBUG || '').toLowerCase() === 'true';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  /** Read the single settings row (id=1). */
  private async readSettings() {
    return this.prisma.adminAuditSetting.findUnique({ where: { id: 1 } });
  }

  /** Whether assignment logging is enabled. */
  async isAssignmentsEnabled(): Promise<boolean> {
    const s = await this.readSettings();
    return !!s?.assignmentsEnabled;
  }

  /**
   * Write one audit log row for an assignment action.
   * NOTE: `targetUserId` must be a valid UUID; otherwise we skip writing.
   */
  async logAssignment(input: {
    // required by model:
    targetUserId: string;
    action: AuditAction;

    // actor info
    actorUserId?: string | null;
    actorName?: string | null;

    // assignment context (optional)
    role?: UserRole | null;
    scopeType?: RoleScope | null;
    companyId?: string | null;
    projectId?: string | null;

    // request context (optional)
    ip?: string | null;
    userAgent?: string | null;

    // snapshots (optional)
    before?: Prisma.InputJsonValue | null;
    after?: Prisma.InputJsonValue | null;
  }) {
    try {
      const enabled = await this.isAssignmentsEnabled();
      if (AUDIT_DEBUG) {
        this.logger.debug(
          `[AUDIT] isAssignmentsEnabled=${enabled} action=${input.action} targetUserId=${input.targetUserId}`,
        );
      }
      if (!enabled) {
        if (AUDIT_DEBUG) this.logger.verbose('[AUDIT] skipping write (feature disabled)');
        return;
      }

      // ---- quick visibility of raw actor payload (before any normalization) ----
      const rawActorId = input.actorUserId ?? null;
      const rawActorName = (input.actorName ?? '').trim();
      if (AUDIT_DEBUG) {
        this.logger.debug(
          `[AUDIT] actor(raw): id=${rawActorId ?? 'null'} name='${rawActorName}'`,
        );
      }

      // ---- validate/sanitize ids ----
      const safeTargetUserId = isUuid(input.targetUserId) ? input.targetUserId : null;
      if (!safeTargetUserId) {
        this.logger.warn(
          `[AUDIT] skip write: invalid targetUserId=${input.targetUserId}`,
        );
        return;
      }

      const safeActorUserId = isUuid(input.actorUserId) ? input.actorUserId! : ZERO_UUID;
      const safeActorName = rawActorName.length > 0 ? rawActorName : 'User';

      if (AUDIT_DEBUG) {
        const usedFallbackActorId = !isUuid(input.actorUserId);
        if (usedFallbackActorId) {
          this.logger.warn(
            `[AUDIT] actorUserId missing/invalid → using ZERO_UUID (${ZERO_UUID})`,
          );
        }
        if (rawActorName.length === 0) {
          this.logger.debug(`[AUDIT] actorName empty → defaulting to 'User'`);
        }
        this.logger.debug(
          `[AUDIT] actor(resolved): id=${safeActorUserId} name='${safeActorName}'`,
        );
      }

      // optional context uuids (write only if valid)
      const safeCompanyId = isUuid(input.companyId) ? input.companyId! : undefined;
      const safeProjectId = isUuid(input.projectId) ? input.projectId! : undefined;

      // ---- build prisma input ----
      const data: Prisma.AdminAuditLogCreateInput = {
        actorUserId: safeActorUserId,
        actorName: safeActorName,
        action: input.action,
        module: 'Assignments',
        targetUserId: safeTargetUserId,

        // enums / optional context
        ...(input.role ? { role: input.role } : {}),
        ...(input.scopeType ? { scopeType: input.scopeType } : {}),
        ...(safeCompanyId ? { companyId: safeCompanyId } : {}),
        ...(safeProjectId ? { projectId: safeProjectId } : {}),

        // request ctx
        ...(input.ip ? { ip: input.ip } : {}),
        ...(input.userAgent ? { userAgent: input.userAgent } : {}),

        // snapshots
        ...(input.before !== undefined ? { before: input.before as any } : {}),
        ...(input.after !== undefined ? { after: input.after as any } : {}),
      };

      // compact log of incoming payload (post-sanitization)
      if (AUDIT_DEBUG) {
        this.logger.log(
          `[AUDIT] incoming payload: ${JSON.stringify({
            action: input.action,
            targetUserId: safeTargetUserId,
            actorUserId: safeActorUserId,
            actorName: safeActorName,
            role: input.role,
            scopeType: input.scopeType,
            companyId: safeCompanyId ?? null,
            projectId: safeProjectId ?? null,
            ip: input.ip,
            uaLen: input.userAgent?.length ?? 0,
            hasBefore: input.before != null,
            hasAfter: input.after != null,
          })}`,
        );

        this.logger.debug(
          `[AUDIT] prisma.adminAuditLog.create(data)= ${JSON.stringify(data)}`,
        );
      }

      const row = await this.prisma.adminAuditLog.create({ data });

      // Keep success confirmation visible (info level)
      this.logger.log(
        `[AUDIT] write OK id=${row.id} createdAt=${row.createdAt.toISOString()} action=${row.action} targetUserId=${row.targetUserId}`,
      );
    } catch (e: any) {
      // Always log errors
      this.logger.error(
        `[AUDIT] write FAILED: ${e?.message || e}`,
        e?.stack || undefined,
      );
      // Do not rethrow in production; uncomment during dev if you need hard failures:
      // throw e;
    }
  }

  // ========= NEW: read-time enrichment helpers (non-breaking) =========

  private fullName(u?: { firstName?: string | null; middleName?: string | null; lastName?: string | null } | null) {
    if (!u) return '';
    const s = [u.firstName, u.middleName, u.lastName].filter(Boolean).join(' ').trim();
    return s || '';
  }

  /**
   * Enrich audit rows (Assignments module) with human labels:
   * - targetName (from User)
   * - projectTitle, projectCode (from Project)
   * - companyName (from Company)
   *
   * This does NOT mutate inputs and does NOT persist anything.
   * Call this from your controller after fetching `AdminAuditLog` rows.
   */
  async enrichAssignmentRows<T extends {
    id: string;
    createdAt: Date | string;
    action: AuditAction;
    actorUserId: string | null;
    actorName: string | null;
    targetUserId: string | null;
    ip: string | null;
    userAgent: string | null;
    before: Prisma.JsonValue | null;
    after: Prisma.JsonValue | null;
    role?: UserRole | null;
    scopeType?: RoleScope | null;
    companyId?: string | null;
    projectId?: string | null;
    module?: string | null;
  }>(rows: T[]) {
    if (!rows?.length) return [] as (T & {
      targetName: string | null;
      projectTitle: string | null;
      projectCode: string | null;
      companyName: string | null;
    })[];

    const userIds = Array.from(new Set(rows.map(r => r.targetUserId).filter((x): x is string => !!x)));
    const projectIds = Array.from(new Set(rows.map(r => r.projectId).filter((x): x is string => !!x)));
    const companyIds = Array.from(new Set(rows.map(r => r.companyId).filter((x): x is string => !!x)));

    const [users, projects, companies] = await Promise.all([
      userIds.length
        ? this.prisma.user.findMany({
            where: { userId: { in: userIds } },
            select: { userId: true, firstName: true, middleName: true, lastName: true },
          })
        : Promise.resolve([]),
      projectIds.length
        ? this.prisma.project.findMany({
            where: { projectId: { in: projectIds } },
            select: { projectId: true, title: true, code: true },
          })
        : Promise.resolve([]),
      companyIds.length
        ? this.prisma.company.findMany({
            where: { companyId: { in: companyIds } },
            select: { companyId: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    const userMap = new Map(users.map(u => [u.userId, this.fullName(u)]));
    const projMap = new Map(projects.map(p => [p.projectId, { title: p.title || '', code: p.code || null }]));
    const compMap = new Map(companies.map(c => [c.companyId, c.name || '']));

    return rows.map(r => {
      const targetName = r.targetUserId ? (userMap.get(r.targetUserId) || '') : '';
      const proj = r.projectId ? projMap.get(r.projectId) : undefined;
      const companyName = r.companyId ? (compMap.get(r.companyId) || '') : '';

      return Object.assign({}, r, {
        targetName: targetName || null,
        projectTitle: proj?.title ?? null,
        projectCode: proj?.code ?? null,
        companyName: companyName || null,
      });
    });
  }
}
