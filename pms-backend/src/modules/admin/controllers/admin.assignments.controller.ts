import {
  Body, Controller, HttpException, HttpStatus,
  Param, ParseUUIDPipe, Patch, Post,
} from '@nestjs/common';
import { Prisma, RoleScope, UserRole } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

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

@Controller('/admin/assignments')
export class AdminAssignmentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('bulk')
  async bulkCreate(@Body() body: BulkPayload) {
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

      // Build with possible undefined, then DELETE undefined keys to avoid TS widening.
      const tmp: any = {
        userId: it.userId,
        role: it.role,
        scopeType: it.scopeType,
        projectId: it.projectId ?? null,
        companyId: it.companyId ?? null,
        isDefault: !!it.isDefault,
        validFrom: vFrom,      // may be undefined
        validTo:   vTo,        // may be undefined
      };
      if (tmp.validFrom === undefined) delete tmp.validFrom;
      if (tmp.validTo   === undefined) delete tmp.validTo;

      return tmp as Prisma.UserRoleMembershipCreateManyInput;
    });

    const result = await this.prisma.userRoleMembership.createMany({
      data: rows,
      skipDuplicates: true,
    });

    return { ok: true, created: result.count };
  }

  // ===== PATCH: update only dates (IST rules) =====
  @Patch(':id')
  async updateDates(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: { validFrom?: string | null; validTo?: string | null }
  ) {
    if (!body || (!('validFrom' in body) && !('validTo' in body))) {
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

    // Non-nullable columns: only set when Dates exist (no nulls/undefined).
    const data: Prisma.UserRoleMembershipUpdateInput = {
      ...(vFrom ? { validFrom: vFrom } : {}),
      ...(vTo   ? { validTo:   vTo   } : {}),
    };

    if (Object.keys(data).length === 0) {
      throw new HttpException('Nothing to update', HttpStatus.BAD_REQUEST);
    }

    try {
      const updated = await this.prisma.userRoleMembership.update({
        where: { id },
        data,
      });
      return { ok: true, id: updated.id, validFrom: updated.validFrom, validTo: updated.validTo };
    } catch (e: any) {
      if (e?.code === 'P2025') throw new HttpException('Assignment not found', HttpStatus.NOT_FOUND);
      throw new HttpException('Failed to update assignment', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
