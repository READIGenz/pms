// src/modules/admin/controllers/admin.assignments.controller.ts
import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Delete,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Prisma, RoleScope, UserRole, AuditAction } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from './../audit/audit.service';
import { JwtAuthGuard } from 'src/main';

type BulkItem = {
  userId: string;
  role: UserRole;
  scopeType: RoleScope;        // "Project" | "Company"
  projectId?: string | null;
  companyId?: string | null;
  validFrom?: string | null;   // "YYYY-MM-DD" (IST)
  validTo?: string | null;     // "YYYY-MM-DD" (IST)
  isDefault?: boolean;
};
type BulkPayload = { items: BulkItem[] };

// ===== IST helpers =====
const IST_OFFSET_MIN = 330; // UTC+05:30

/** Parse YYYY-MM-DD as IST midnight and return the corresponding UTC instant. */
function istDateOnlyToUtcMidnight(v?: string | null): Date | undefined {
  if (!v) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return undefined;
  const y = +m[1], mon = +m[2] - 1, d = +m[3];
  const t = Date.UTC(y, mon, d) - IST_OFFSET_MIN * 60_000; // IST 00:00 -> UTC
  const dt = new Date(t);
  return Number.isNaN(dt.getTime()) ? undefined : dt;
}

/** Today 00:00 IST as a UTC instant. */
function todayIstMidnightUtc(): Date {
  const nowIst = new Date(Date.now() + IST_OFFSET_MIN * 60_000);
  const y = nowIst.getUTCFullYear(), m = nowIst.getUTCMonth(), d = nowIst.getUTCDate();
  return new Date(Date.UTC(y, m, d) - IST_OFFSET_MIN * 60_000);
}

// ===== Actor UUID resolver =====
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (v?: string | null): v is string => !!v && UUID_RX.test(v);

/**
 * Resolve the internal actor UUID suitable for writing to @db.Uuid columns.
 * Prefers any UUID already present on the JWT (userId/id/uuid/sub).
 * Falls back to an email lookup in your users table.
 */
async function resolveActorUserId(prisma: PrismaService, req: any): Promise<string | null> {
  const u = req?.user || {};
  const direct = [u.userId, u.id, u.uuid, u.sub].find(isUuid);
  if (direct) return direct;

  const email = (u.email || '').trim();
  if (email) {
    const found = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { userId: true }, // adjust if your PK field differs
    });
    if (found?.userId && isUuid(found.userId)) return found.userId;
  }
  return null;
}

/** Return a Map<userId, companyId> for service-provider users who own a Company row */
async function mapCompanyIdsByUser(
  prisma: PrismaService,
  userIds: string[],
): Promise<Map<string, string>> {
  if (!userIds.length) return new Map();
  const companies = await prisma.company.findMany({
    where: { userId: { in: Array.from(new Set(userIds)) } },
    select: { userId: true, companyId: true },
  });
  const map = new Map<string, string>();
  for (const c of companies) if (c.userId && c.companyId) map.set(c.userId, c.companyId);
  return map;
}

// ===== Targeted debug toggle for actor-related logs =====
const AUDIT_DEBUG =
  String(process.env.AUDIT_DEBUG || '').toLowerCase() === '1' ||
  String(process.env.AUDIT_DEBUG || '').toLowerCase() === 'true';

@UseGuards(JwtAuthGuard)
@Controller('/admin/assignments')
export class AdminAssignmentsController {
  private readonly logger = new Logger(AdminAssignmentsController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Post('bulk')
  async bulkCreate(@Req() req: any, @Body() body: BulkPayload) {
    this.logger.log(`[ASSIGNMENTS] bulkCreate items=${body?.items?.length ?? 0}`);

    if (!body || !Array.isArray(body.items) || body.items.length === 0) {
      throw new HttpException('No items provided', HttpStatus.BAD_REQUEST);
    }

    const rows: Prisma.UserRoleMembershipCreateManyInput[] = body.items.map((it, idx) => {
      if (!it.userId) throw new HttpException(`items[${idx}].userId is required`, HttpStatus.BAD_REQUEST);
      if (!it.role) throw new HttpException(`items[${idx}].role is required`, HttpStatus.BAD_REQUEST);
      if (!it.scopeType) throw new HttpException(`items[${idx}].scopeType is required`, HttpStatus.BAD_REQUEST);
      if (it.scopeType === 'Project' && !it.projectId)
        throw new HttpException(`items[${idx}].projectId is required when scopeType=Project`, HttpStatus.BAD_REQUEST);
      if (it.scopeType === 'Company' && !it.companyId)
        throw new HttpException(`items[${idx}].companyId is required when scopeType=Company`, HttpStatus.BAD_REQUEST);

      const vFrom = istDateOnlyToUtcMidnight(it.validFrom ?? undefined);
      const vTo   = istDateOnlyToUtcMidnight(it.validTo ?? undefined);
      if (vFrom && vTo && vTo < vFrom) {
        throw new HttpException(`items[${idx}]: validTo must be on/after validFrom`, HttpStatus.BAD_REQUEST);
      }

        const tmp: any = {
        userId: it.userId,
        role: it.role,
        scopeType: it.scopeType,
        projectId: it.projectId ?? null,
        companyId: it.companyId,  
        isDefault: !!it.isDefault,
        validFrom: vFrom,  // may be undefined
        validTo:   vTo,    // may be undefined
      };
      if (tmp.validFrom === undefined) delete tmp.validFrom;
      if (tmp.validTo   === undefined) delete tmp.validTo;

      return tmp as Prisma.UserRoleMembershipCreateManyInput;
    });

    const result = await this.prisma.userRoleMembership.createMany({
      data: rows,
      skipDuplicates: true,
    });

    if (AUDIT_DEBUG) {
      const actorUserId = await resolveActorUserId(this.prisma, req);
      this.logger.debug(
        `[ASSIGNMENTS] actor snapshot: ${JSON.stringify({
          fromReq: req?.user,
          resolvedActorUserId: actorUserId,
        })}`,
      );
      this.logger.debug(
        `[ASSIGNMENTS] actorName computed='${[req?.user?.firstName, req?.user?.middleName, req?.user?.lastName].filter(Boolean).join(' ') || 'User'}'`,
      );
    }

    // ---- AUDIT: one row per affected target user ----
    try {
      if (!(await this.audit.isAssignmentsEnabled())) {
        return { ok: true, created: result.count };
      }

      const actor = req?.user || {};
      const actorName =
        [actor.firstName, actor.middleName, actor.lastName].filter(Boolean).join(' ').trim() || 'User';
      const actorUserId = await resolveActorUserId(this.prisma, req); // <-- use internal UUID

      // Group attempted inserts by userId
      const byUser = new Map<string, Prisma.UserRoleMembershipCreateManyInput[]>();
      for (const it of rows) {
        const list = byUser.get(it.userId) || [];
        list.push(it);
        byUser.set(it.userId, list);
      }
      if (AUDIT_DEBUG) this.logger.debug(`[ASSIGNMENTS] audit groups=${byUser.size}`);

      await Promise.all(
        Array.from(byUser.entries()).map(([userId, items]) =>
          this.audit.logAssignment({
            action: AuditAction.AssignAdded,
            targetUserId: userId,
            actorUserId,              // real UUID or null → service will default safely
            actorName,
            role: items[0].role as any,
            scopeType: items[0].scopeType as any,
            projectId: items[0].projectId ?? null,
            companyId: items[0].companyId ?? null,
            before: null,
            after: items.map(it => ({
              role: it.role,
              scopeType: it.scopeType,
              companyId: it.companyId ?? null,
              projectId: it.projectId ?? null,
              validFrom: it.validFrom ?? null,
              validTo: it.validTo ?? null,
              isDefault: !!it.isDefault,
            })) as any,
            ip: req?.ip,
            userAgent: req?.headers?.['user-agent'],
          })
        )
      );
    } catch (e: any) {
      this.logger.warn(`[ASSIGNMENTS] bulk audit failed: ${e?.message || e}`);
      // swallow so UX isn’t blocked
    }

    return { ok: true, created: result.count };
  }

  // ===== PATCH: update only dates (IST rules) =====
  @Patch(':id')
  async updateDates(
    @Req() req: any,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: { validFrom?: string | null; validTo?: string | null }
  ) {
    this.logger.log(`[ASSIGNMENTS] updateDates id=${id} body=${JSON.stringify(body)}`);

    if (body == null || (!('validFrom' in body) && !('validTo' in body))) {
      throw new HttpException('Provide validFrom and/or validTo', HttpStatus.BAD_REQUEST);
    }

    const todayIST = todayIstMidnightUtc();

    const vFrom =
      body.validFrom === undefined || body.validFrom === null
        ? undefined
        : istDateOnlyToUtcMidnight(body.validFrom);
    const vTo =
      body.validTo === undefined || body.validTo === null
        ? undefined
        : istDateOnlyToUtcMidnight(body.validTo);

    if (body.validFrom !== undefined && body.validFrom !== null && !vFrom) {
      throw new HttpException('validFrom must be YYYY-MM-DD', HttpStatus.BAD_REQUEST);
    }
    if (body.validTo !== undefined && body.validTo !== null && !vTo) {
      throw new HttpException('validTo must be YYYY-MM-DD', HttpStatus.BAD_REQUEST);
    }

    if (vFrom && vFrom < todayIST) {
      throw new HttpException('validFrom must be today (IST) or later', HttpStatus.BAD_REQUEST);
    }
    if (vFrom && vTo && vTo < vFrom) {
      throw new HttpException('validTo must be on/after validFrom', HttpStatus.BAD_REQUEST);
    }

    const data: Prisma.UserRoleMembershipUpdateInput = {
      ...(vFrom ? { validFrom: vFrom } : {}),
      ...(vTo   ? { validTo:   vTo   } : {}),
    };

    if (Object.keys(data).length === 0) {
      throw new HttpException('Nothing to update', HttpStatus.BAD_REQUEST);
    }

    try {
      const before = await this.prisma.userRoleMembership.findUnique({
        where: { id },
        select: {
          id: true,
          userId: true,
          role: true,
          scopeType: true,
          companyId: true,
          projectId: true,
          isDefault: true,
          validFrom: true,
          validTo: true,
        },
      });

      if (!before) throw new HttpException('Assignment not found', HttpStatus.NOT_FOUND);

      const updated = await this.prisma.userRoleMembership.update({
        where: { id },
        data,
      });

      if (AUDIT_DEBUG) {
        const actorUserId = await resolveActorUserId(this.prisma, req);
        this.logger.debug(
          `[ASSIGNMENTS] actor snapshot: ${JSON.stringify({
            fromReq: req?.user,
            resolvedActorUserId: actorUserId,
          })}`,
        );
      }

      this.logger.debug(`[ASSIGNMENTS] update OK membershipId=${updated.id}`);

      try {
        if (await this.audit.isAssignmentsEnabled()) {
          const actor = req?.user || {};
          const actorName =
            [actor.firstName, actor.middleName, actor.lastName].filter(Boolean).join(' ').trim() || 'User';
          const actorUserId = await resolveActorUserId(this.prisma, req); // <-- use internal UUID
          if (AUDIT_DEBUG) this.logger.debug(`[ASSIGNMENTS] calling audit for membershipId=${updated.id}`);

          await this.audit.logAssignment({
            action: AuditAction.AssignReplaced,
            targetUserId: before.userId,
            actorUserId,
            actorName,
            role: before.role as any,
            scopeType: before.scopeType as any,
            companyId: before.companyId ?? null,
            projectId: before.projectId ?? null,
            before: before as any,
            after: {
              id: updated.id,
              userId: updated.userId,
              role: updated.role,
              scopeType: updated.scopeType,
              companyId: updated.companyId,
              projectId: updated.projectId,
              isDefault: updated.isDefault,
              validFrom: updated.validFrom,
              validTo: updated.validTo,
            } as any,
            ip: req?.ip,
            userAgent: req?.headers?.['user-agent'],
          });
        }
      } catch (e: any) {
        this.logger.warn(`[ASSIGNMENTS] update audit failed: ${e?.message || e}`);
      }

      return { ok: true, id: updated.id, validFrom: updated.validFrom, validTo: updated.validTo };
    } catch (e: any) {
      if (e?.status === HttpStatus.NOT_FOUND) throw e;
      if (e?.code === 'P2025') throw new HttpException('Assignment not found', HttpStatus.NOT_FOUND);
      throw new HttpException('Failed to update assignment', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ===== DELETE: hard remove an assignment =====
@Delete(':id')
async remove(
  @Req() req: any,
  @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
) {
  this.logger.log(`[ASSIGNMENTS] remove id=${id}`);

  try {
    // Load 'before' for audit and to return meaningful 404s
    const before = await this.prisma.userRoleMembership.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        role: true,
        scopeType: true,
        companyId: true,
        projectId: true,
        isDefault: true,
        validFrom: true,
        validTo: true,
      },
    });

    if (!before) {
      throw new HttpException('Assignment not found', HttpStatus.NOT_FOUND);
    }

    // Hard delete (if you prefer soft-delete, swap this for an update)
    await this.prisma.userRoleMembership.delete({ where: { id } });

    // ---- AUDIT ----
    try {
      if (await this.audit.isAssignmentsEnabled()) {
        const actor = req?.user || {};
        const actorName =
          [actor.firstName, actor.middleName, actor.lastName].filter(Boolean).join(' ').trim() || 'User';
        const actorUserId = await resolveActorUserId(this.prisma, req);

        await this.audit.logAssignment({
          action: AuditAction.AssignRemoved,      // <-- assuming you have this; if not, create it
          targetUserId: before.userId,
          actorUserId,
          actorName,
          role: before.role as any,
          scopeType: before.scopeType as any,
          companyId: before.companyId ?? null,
          projectId: before.projectId ?? null,
          before: before as any,
          after: null,
          ip: req?.ip,
          userAgent: req?.headers?.['user-agent'],
        });
      }
    } catch (e: any) {
      this.logger.warn(`[ASSIGNMENTS] remove audit failed: ${e?.message || e}`);
      // don't block delete on audit failure
    }

    return { ok: true, id };
  } catch (e: any) {
    if (e?.status === HttpStatus.NOT_FOUND) throw e;
    if (e?.code === 'P2025') {
      // Prisma "Record to delete does not exist"
      throw new HttpException('Assignment not found', HttpStatus.NOT_FOUND);
    }
    throw new HttpException('Failed to remove assignment', HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
}
