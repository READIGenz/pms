// src/modules/admin/controllers/admin.companies.controller.ts
import {
  Body, Controller, Get, Param, Patch, Post, Query,
  UseGuards, HttpException, HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { Prisma, CompanyStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@UseGuards(JwtAuthGuard)
@Controller('admin/companies')
export class AdminCompaniesController {
  constructor(private readonly prisma: PrismaService) {}

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
  ) {
    const _skip = Math.max(0, Number.isFinite(Number(skip)) ? Number(skip) : 0);
    const _takeNum = Number.isFinite(Number(take)) ? Number(take) : 0;
    const _take = _takeNum ? Math.max(1, Math.min(200, _takeNum)) : undefined;

    const where: Prisma.CompanyWhereInput = {};
    if (q?.trim()) {
      const needle = q.trim();
      Object.assign(where, {
        OR: [
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
        ],
      } as Prisma.CompanyWhereInput);
    }
    if (status && Object.values(CompanyStatus as any).includes(status as any)) (where as any).status = status as CompanyStatus;
    if (role?.trim()) (where as any).companyRole = role.trim();
    if (stateId) (where as any).stateId = stateId;
    if (districtId) (where as any).districtId = districtId;

    const allowedSort = new Set<string>([
      'createdAt','updatedAt','name','status','companyRole','website',
      'gstin','pan','cin','primaryContact','contactMobile','contactEmail','pin',
    ]);
    const by = allowedSort.has(String(sortBy)) ? String(sortBy) : 'createdAt';
    const dir: Prisma.SortOrder = sortDir === 'desc' ? 'desc' : 'asc';
    const orderBy: Prisma.CompanyOrderByWithRelationInput = { [by]: dir } as any;

    // ⬇️ no "select" — all scalar columns of Company are returned
    const companies = await this.prisma.company.findMany({
      where, skip: _skip || undefined, take: _take, orderBy,
      include: {
        state: { select: { stateId: true, code: true, name: true, type: true } },
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
      },
    });

    const total = await this.prisma.company.count({ where });
    return { ok: true, total, companies, __source: 'AdminCompaniesController.findMany' };
  }

  // GET /admin/companies/:id
  @Get(':id')
  async getCompany(@Param('id') companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { companyId },
      include: {
        state: { select: { stateId: true, code: true, name: true, type: true } },
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
      },
    });
    if (!company) throw new HttpException('Not found', HttpStatus.NOT_FOUND);
    return { ok: true, company, __source: 'AdminCompaniesController.findUnique' };
  }

  @Post()
  async createCompany(@Body() body: any) {
    if (!body?.name?.trim()) return { ok: false, error: 'name is required.' };

    const data: Prisma.CompanyCreateInput = {
      name: body.name.trim(),
      status: (body.status as CompanyStatus) || 'Active',
      website: body.website || undefined,
      companyRole: body.companyRole || undefined,

      gstin: body.gstin || undefined,
      pan: body.pan || undefined,
      cin: body.cin || undefined,

      primaryContact: body.primaryContact || undefined,
      contactMobile: body.contactMobile || undefined,
      contactEmail: body.contactEmail || undefined,

      address: body.address || undefined,
      pin: body.pin || undefined,
      notes: body.notes || undefined,

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

  @Patch(':id')
  async updateCompany(@Param('id') companyId: string, @Body() body: any) {
    const data: Prisma.CompanyUpdateInput = {
      name: body.name,
      status: (body.status as CompanyStatus) ?? undefined,
      website: body.website ?? null,
      companyRole: body.companyRole ?? null,

      gstin: body.gstin ?? null,
      pan: body.pan ?? null,
      cin: body.cin ?? null,

      primaryContact: body.primaryContact ?? null,
      contactMobile: body.contactMobile ?? null,
      contactEmail: body.contactEmail ?? null,

      address: body.address ?? null,
      pin: body.pin ?? null,
      notes: body.notes ?? null,

      state:
        body.stateId !== undefined
          ? body.stateId ? { connect: { stateId: body.stateId } } : { disconnect: true }
          : undefined,
      district:
        body.districtId !== undefined
          ? body.districtId ? { connect: { districtId: body.districtId } } : { disconnect: true }
          : undefined,
      serviceProvider:
        body.userId !== undefined
          ? body.userId ? { connect: { userId: body.userId } } : { disconnect: true }
          : undefined,
    };

    if (!data.name) return { ok: false, error: 'name is required' };

    const updated = await this.prisma.company.update({
      where: { companyId },
      data,
      select: { companyId: true, updatedAt: true },
    });
    return { ok: true, company: updated };
  }
}
