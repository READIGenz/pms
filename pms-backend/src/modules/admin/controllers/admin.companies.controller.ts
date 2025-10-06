// src/modules/admin/controllers/admin.companies.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { Prisma, CompanyStatus, CompanyRole } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
// --- normalizers: trim, empty => null, and uppercase when asked ---
const trimOrNull = (v: unknown): string | null => {
  if (v == null) return null;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length ? t : null;
};

const upperOrNull = (v: unknown): string | null => {
  const t = trimOrNull(v);
  return t ? t.toUpperCase() : null;
};

@UseGuards(JwtAuthGuard)
@Controller('admin/companies')
export class AdminCompaniesController {
  constructor(private readonly prisma: PrismaService) {}

  /* -------------------------------- LIST -------------------------------- */
//   @Get()
//   async listCompanies(
//       @Res() res: Response,                 // ⬅️ use raw Express response

//     @Query('skip') skip?: string,
//     @Query('take') take?: string,
//     @Query('sortBy') sortBy?: string,
//     @Query('sortDir') sortDir?: 'asc' | 'desc',
//     @Query('q') q?: string,
//     @Query('status') status?: CompanyStatus | string,
//     @Query('role') role?: string,
//     @Query('stateId') stateId?: string,
//     @Query('districtId') districtId?: string,
//   ) {
//     // pagination
//     const _skip = Math.max(0, Number.isFinite(Number(skip)) ? Number(skip) : 0);
//     const _takeNum = Number.isFinite(Number(take)) ? Number(take) : 0;
//     const _take = _takeNum ? Math.max(1, Math.min(200, _takeNum)) : undefined;

//     // filters
//     const where: Prisma.CompanyWhereInput = {};
//     if (q?.trim()) {
//       const needle = q.trim();
//       Object.assign(where, {
//         OR: [
//           { name:           { contains: needle, mode: 'insensitive' } },
//           { website:        { contains: needle, mode: 'insensitive' } },
//           { companyCode:    { contains: needle, mode: 'insensitive' } },
//           { address:        { contains: needle, mode: 'insensitive' } },
//           { pin:            { contains: needle, mode: 'insensitive' } },
//           { gstin:          { contains: needle, mode: 'insensitive' } },
//           { pan:            { contains: needle, mode: 'insensitive' } },
//           { cin:            { contains: needle, mode: 'insensitive' } },
//           { primaryContact: { contains: needle, mode: 'insensitive' } },
//           { contactMobile:  { contains: needle, mode: 'insensitive' } },
//           { contactEmail:   { contains: needle, mode: 'insensitive' } },
//           { notes:          { contains: needle, mode: 'insensitive' } },
//         ],
//       } as Prisma.CompanyWhereInput);
//     }
//     if (status && Object.values(CompanyStatus as any).includes(status as any)) {
//       (where as any).status = status as CompanyStatus;
//     }
//     if (role?.trim()) (where as any).companyRole = role.trim();
//     if (stateId) (where as any).stateId = stateId;
//     if (districtId) (where as any).districtId = districtId;

//     // sorting
//     const allowedSort = new Set<string>([
//       'createdAt',
//       'updatedAt',
//       'name',
//       'status',
//       'companyRole',
//       'companyCode',
//       'website',
//       'gstin',
//       'pan',
//       'cin',
//       'primaryContact',
//       'contactMobile',
//       'contactEmail',
//       'pin',
//     ]);
//     const by = allowedSort.has(String(sortBy)) ? String(sortBy) : 'createdAt';
//     const dir: Prisma.SortOrder = sortDir === 'desc' ? 'desc' : 'asc';
//     const orderBy: Prisma.CompanyOrderByWithRelationInput = { [by]: dir } as any;

//     // SELECT ALL SCALAR COLUMNS (avoid accidental trimming)
//     const COMPANY_SELECT_ALL: Prisma.CompanySelect = {
//       companyId: true,
//       companyCode: true,
//       name: true,
//       status: true,
//       website: true,
//       companyRole: true,
//       gstin: true,
//       pan: true,
//       cin: true,
//       primaryContact: true,
//       contactMobile: true,
//       contactEmail: true,
//       stateId: true,
//       districtId: true,
//       address: true,
//       pin: true,
//       notes: true,
//       userId: true,
//       createdAt: true,
//       updatedAt: true,
//       // If you want relation snapshots in the list, uncomment any of these:
//       // state: { select: { stateId: true, code: true, name: true, type: true } },
//       // district: { select: { districtId: true, name: true, stateId: true } },
//       // serviceProvider: { select: { userId: true, firstName: true, lastName: true, email: true, phone: true } },
//     };

//     // const [companies, total] = await this.prisma.$transaction([
//     //   this.prisma.company.findMany({
//     //     where,
//     //     skip: _skip || undefined,
//     //     take: _take,
//     //     orderBy,
//     //     select: COMPANY_SELECT_ALL,
//     //   }),
//     //   this.prisma.company.count({ where }),
//     // ]);
// const [companies, total] = await this.prisma.$transaction([
//     this.prisma.company.findMany({ where, skip: _skip || undefined, take: _take, orderBy }),
//     this.prisma.company.count({ where }),
//   ]);
//  // Debug: log the exact keys we're returning
//   if (companies?.length) {
//     console.log('LIST_COMPANY_KEYS', Object.keys(companies[0]));
//   }

//   // Bypass Nest serializers/DTOs entirely:
//   return res.json({ ok: true, total, companies, __bypass: true });
//     //return { ok: true, total, companies };
//   }

// GET /admin/companies
@Get()
async listCompanies(
  @Query('skip') skip?: string,
  @Query('take') take?: string,
  @Query('sortBy') sortBy?: string,
  @Query('sortDir') sortDir?: 'asc' | 'desc',
  @Query('q') q?: string,
  @Query('status') status?: CompanyStatus | string,
  @Query('role') role?: string,
  @Query('stateId') stateId?: string,
  @Query('districtId') districtId?: string,
  @Query('shape') shape?: 'ref' | 'full', // <— optional switch; default = full
) {
  // pagination
  const _skip = Number.isFinite(Number(skip)) ? Math.max(0, Number(skip)) : undefined;
  const _takeRaw = Number.isFinite(Number(take)) ? Number(take) : undefined;
  const _take = _takeRaw ? Math.max(1, Math.min(200, _takeRaw)) : undefined;

  // where
  const where: Prisma.CompanyWhereInput = {};
  if (q?.trim()) {
    const needle = q.trim();
    where.OR = [
      { name:           { contains: needle, mode: 'insensitive' } },
      { website:        { contains: needle, mode: 'insensitive' } },
      { address:        { contains: needle, mode: 'insensitive' } },
      { pin:            { contains: needle, mode: 'insensitive' } },
      { gstin:          { contains: needle, mode: 'insensitive' } },
      { pan:            { contains: needle, mode: 'insensitive' } },
      { cin:            { contains: needle, mode: 'insensitive' } },
      { primaryContact: { contains: needle, mode: 'insensitive' } },
      { contactMobile:  { contains: needle, mode: 'insensitive' } },
      { contactEmail:   { contains: needle, mode: 'insensitive' } },
      { notes:          { contains: needle, mode: 'insensitive' } },
      // include the generated code in search too
      { companyCode:    { contains: needle, mode: 'insensitive' } },
    ];
  }
  if (status && Object.values(CompanyStatus as any).includes(status as any)) {
    where.status = status as CompanyStatus;
  }
  if (role?.trim()) {
  const r = role.trim();
  if ((Object.values(CompanyRole) as string[]).includes(r)) {
    // Works for nullable enum columns too
    where.companyRole = { equals: r as CompanyRole };
  }
}
if (stateId) where.stateId = stateId;
  if (districtId) where.districtId = districtId;

  // sort
  const allowedSort = new Set<string>([
    'createdAt','updatedAt','name','status','companyRole','website',
    'gstin','pan','cin','primaryContact','contactMobile','contactEmail','pin','companyCode',
  ]);
  const by = allowedSort.has(String(sortBy)) ? String(sortBy) : 'createdAt';
  const dir: Prisma.SortOrder = sortDir === 'desc' ? 'desc' : 'asc';
  const orderBy: Prisma.CompanyOrderByWithRelationInput = { [by]: dir } as any;

  // shape switch: full (default) vs ref (only a few columns)
  const useRefShape = (shape || 'full') === 'ref';

  const refSelect: Prisma.CompanySelect = {
    companyId: true,
    name: true,
    companyRole: true,
    status: true,
  };

  const includeFull: Prisma.CompanyInclude = {
    // NOTE: using "include" ensures ALL scalar columns from Company are returned.
    state: {
      select: { stateId: true, code: true, name: true, type: true },
    },
    district: {
      select: {
        districtId: true, name: true, stateId: true,
        state: { select: { code: true, name: true } },
      },
    },
    serviceProvider: {
      select: {
        userId: true, firstName: true, middleName: true, lastName: true,
        email: true, phone: true, countryCode: true,
      },
    },
  };

  // Build args object explicitly (avoids TS “call signatures” confusion)
  const args: Prisma.CompanyFindManyArgs = {
    where,
    skip: _skip,
    take: _take,
    orderBy,
  };
  if (useRefShape) {
    args.select = refSelect;
  } else {
    args.include = includeFull;
  }

  const companies = await this.prisma.company.findMany(args);
  const total = await this.prisma.company.count({ where });

  // optional debug: confirm what keys went out
  // console.log('[companies.list] shape=', useRefShape ? 'ref' : 'full', 'keys=', Object.keys(companies[0] || {}));

  return {
    ok: true,
    total,
    companies,
    __shape: useRefShape ? 'ref' : 'full',
  };
}


/* ------------------------------- GET BY ID ------------------------------ */
  @Get(':id')
  async getCompany(@Param('id') companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { companyId },
      // full scalar columns + helpful relation snapshots
      select: {
        companyId: true,
        companyCode: true,
        name: true,
        status: true,
        website: true,
        companyRole: true,
        gstin: true,
        pan: true,
        cin: true,
        primaryContact: true,
        contactMobile: true,
        contactEmail: true,
        stateId: true,
        districtId: true,
        address: true,
        pin: true,
        notes: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
        state: { select: { stateId: true, code: true, name: true, type: true } },
        district: {
          select: {
            districtId: true,
            name: true,
            stateId: true,
            state: { select: { code: true, name: true } },
          },
        },
        serviceProvider: {
          select: {
            userId: true,
            firstName: true,
            middleName: true,
            lastName: true,
            email: true,
            phone: true,
            countryCode: true,
          },
        },
      },
    });
    if (!company) throw new HttpException('Not found', HttpStatus.NOT_FOUND);
    return { ok: true, company };
  }

  /* -------------------------------- CREATE ------------------------------- */
  @Post()
  async createCompany(@Body() body: any) {
    if (!body?.name?.trim()) return { ok: false, error: 'name is required.' };

    const data: Prisma.CompanyCreateInput = {
      name: body.name.trim(),
      status: (body.status as CompanyStatus) || 'Active',
      website: body.website || undefined,
      companyRole: body.companyRole || undefined,

      // ✅ normalize IDs: empty => null, uppercase
  gstin: upperOrNull(body.gstin) || undefined,
  pan:   upperOrNull(body.pan)   || undefined,
  cin:   upperOrNull(body.cin)   || undefined,

      primaryContact: body.primaryContact || undefined,
      contactMobile: body.contactMobile || undefined,
      contactEmail: body.contactEmail || undefined,

      address: body.address || undefined,
      pin: body.pin || undefined,
      notes: body.notes || undefined,

      companyCode: body.companyCode || undefined, // optional unique code (frontend generated)

      state: body.stateId ? { connect: { stateId: body.stateId } } : undefined,
      district: body.districtId ? { connect: { districtId: body.districtId } } : undefined,
      serviceProvider: body.userId ? { connect: { userId: body.userId } } : undefined,
    };

    const created = await this.prisma.company.create({
      data,
      select: { companyId: true, updatedAt: true },
    });

    return { ok: true, company: created };
  }

  /* -------------------------------- UPDATE ------------------------------- */
  @Patch(':id')
  async updateCompany(@Param('id') companyId: string, @Body() body: any) {
    const data: Prisma.CompanyUpdateInput = {
  name: body.name, // required check below
  status: (body.status as CompanyStatus) ?? undefined,
  website: trimOrNull(body.website),

  companyRole: body.companyRole ?? null,

  // ✅ empty string => null, uppercase
  gstin: upperOrNull(body.gstin),
  pan:   upperOrNull(body.pan),
  cin:   upperOrNull(body.cin),

  primaryContact: trimOrNull(body.primaryContact),
  contactMobile:  trimOrNull(body.contactMobile),
  contactEmail:   trimOrNull(body.contactEmail),

  address: trimOrNull(body.address),
  pin:     trimOrNull(body.pin),
  notes:   trimOrNull(body.notes),

  companyCode:
    body.companyCode !== undefined ? trimOrNull(body.companyCode) : undefined,

  state:
    body.stateId !== undefined
      ? body.stateId
        ? { connect: { stateId: body.stateId } }
        : { disconnect: true }
      : undefined,
  district:
    body.districtId !== undefined
      ? body.districtId
        ? { connect: { districtId: body.districtId } }
        : { disconnect: true }
      : undefined,
  serviceProvider:
    body.userId !== undefined
      ? body.userId
        ? { connect: { userId: body.userId } }
        : { disconnect: true }
      : undefined,
};

if (!data.name) return { ok: false, error: 'name is required' };

try {
  const updated = await this.prisma.company.update({
    where: { companyId },
    data,
    select: { companyId: true, updatedAt: true },
  });
  return { ok: true, company: updated };
} catch (e: any) {
  if (e?.code === 'P2002') {
    return {
      ok: false,
      statusCode: 409,
      error: `Duplicate value for unique field(s): ${e?.meta?.target || 'unknown'}`,
    };
  }
  throw e;
}
  }}