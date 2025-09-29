import {
  Body, Controller, Get, Param, Patch, Post, Query,
  UploadedFile, UseGuards, UseInterceptors, HttpException, HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import {
  Prisma, UserRole, CompanyRole,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { AdminCodeService } from '../admin-code.service';

@UseGuards(JwtAuthGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codeSvc: AdminCodeService,
  ) {}

  // IMPORTANT: keep specific routes ABOVE the :id param route so they aren't shadowed.
  @Get('next-code/preview')
  async getNextUserCode() {
    const code = await this.codeSvc.nextUserCode(this.prisma);
    return { ok: true, code };
  }

  @Get()
  async listUsers(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
    @Query('q') q?: string,
    @Query('role') role?: UserRole | string,
    @Query('includeMemberships') includeMemberships?: '0' | '1',
  ) {
    const _skip = Math.max(0, Number.isFinite(Number(skip)) ? Number(skip) : 0);
    const _takeNum = Number.isFinite(Number(take)) ? Number(take) : 0;
    const _take = _takeNum ? Math.max(1, Math.min(200, _takeNum)) : undefined;

    const where: Prisma.UserWhereInput = {};
    if (q?.trim()) {
      Object.assign(where, {
        OR: [
          { firstName: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { lastName:  { contains: q, mode: Prisma.QueryMode.insensitive } },
          { email:     { contains: q, mode: Prisma.QueryMode.insensitive } },
          { phone:     { contains: q, mode: Prisma.QueryMode.insensitive } },
          { code:      { contains: q, mode: Prisma.QueryMode.insensitive } },
        ],
      } as Prisma.UserWhereInput);
    }
    if (role && Object.values(UserRole).includes(role as UserRole)) {
      (where as any).userRole = role as UserRole;
    }

    const allowedSort = new Set<keyof Prisma.UserOrderByWithRelationInput>([
      'createdAt','updatedAt','firstName','lastName','email','phone','code','userStatus','isSuperAdmin','userRole',
    ]);
    const by = (allowedSort.has(sortBy as any) ? sortBy : 'createdAt') as keyof Prisma.UserOrderByWithRelationInput;
    const dir: Prisma.SortOrder = sortDir === 'desc' ? 'desc' : 'asc';
    const orderBy: Prisma.UserOrderByWithRelationInput = { [by]: dir };

    const users = await this.prisma.user.findMany({
      where, skip: _skip || undefined, take: _take, orderBy,
      select: {
        userId: true, code: true, firstName: true, middleName: true, lastName: true,
        countryCode: true, phone: true, email: true, preferredLanguage: true,
        profilePhoto: true, stateId: true, districtId: true, cityTown: true, pin: true,
        operatingZone: true, address: true, isClient: true, isServiceProvider: true,
        userStatus: true, isSuperAdmin: true, createdAt: true, updatedAt: true, userRole: true,
        state: { select: { stateId: true, code: true, name: true, type: true } },
        district: {
          select: {
            districtId: true, name: true, stateId: true,
            state: { select: { code: true, name: true } },
          },
        },
        userRoleMemberships: includeMemberships === '1'
          ? {
              select: {
                id: true,
                role: true,
                scopeType: true,
                companyId: true,
                projectId: true,
                isDefault: true,
                createdAt: true,
                updatedAt: true,      // now available in schema
                validFrom: true,
                validTo: true,
                company: { select: { companyId: true, name: true } },
                project: { select: { projectId: true, title: true, code: true } },
              },
            }
          : false,
      },
    });

    const total = await this.prisma.user.count({ where });
    return { ok: true, total, users };
  }

  @Get(':id')
  async getUser(
    @Param('id') userId: string,
    @Query('includeMemberships') includeMemberships?: '0' | '1',
  ) {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: {
        userId: true, code: true, firstName: true, middleName: true, lastName: true,
        countryCode: true, phone: true, email: true, preferredLanguage: true,
        profilePhoto: true, stateId: true, districtId: true, cityTown: true, pin: true,
        operatingZone: true, address: true, isClient: true, isServiceProvider: true,
        userStatus: true, isSuperAdmin: true, createdAt: true, updatedAt: true, userRole: true,
        state: { select: { stateId: true, code: true, name: true, type: true } },
        district: {
          select: {
            districtId: true, name: true, stateId: true,
            state: { select: { code: true, name: true } },
          },
        },
        userRoleMemberships: includeMemberships === '1'
          ? {
              select: {
                id: true,
                role: true,
                scopeType: true,
                companyId: true,
                projectId: true,
                isDefault: true,
                createdAt: true,
                updatedAt: true,      // now available in schema
                validFrom: true,
                validTo: true,
                company: { select: { companyId: true, name: true, companyRole: true } },
                project: { select: { projectId: true, title: true, code: true } },
              },
            }
          : false,
      },
    });
    if (!user) throw new HttpException('Not found', HttpStatus.NOT_FOUND);
    return { ok: true, user };
  }

  @Post()
  async createUser(@Body() body: any) {
    if (!body?.firstName || !body?.countryCode || !body?.phone) {
      return { ok: false, error: 'firstName, countryCode and phone are required.' };
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const finalCode = (body.code?.trim()) || (await this.codeSvc.nextUserCode(tx));
      const payload: Prisma.UserCreateInput = {
        code: finalCode,
        firstName: body.firstName,
        middleName: body.middleName || undefined,
        lastName: body.lastName || undefined,
        email: body.email || undefined,
        countryCode: body.countryCode,
        phone: body.phone,
        preferredLanguage: body.preferredLanguage || undefined,
        isClient: !!body.isClient,
        isServiceProvider: !!body.isServiceProvider,
        operatingZone: body.operatingZone || undefined,
        userStatus: body.userStatus || 'Active',
        address: body.address || undefined,
        cityTown: body.cityTown || undefined,
        pin: body.pin || undefined,
        state: body.stateId ? { connect: { stateId: body.stateId } } : undefined,
        district: body.districtId ? { connect: { districtId: body.districtId } } : undefined,
      };
      return tx.user.create({ data: payload, select: { userId: true, updatedAt: true } });
    });
    return { ok: true, user: created };
  }

  @Patch(':id')
  async updateUser(@Param('id') userId: string, @Body() body: any) {
    const data: Prisma.UserUpdateInput = {
      firstName: body.firstName,
      middleName: body.middleName ?? null,
      lastName: body.lastName ?? null,
      email: body.email ?? null,
      countryCode: body.countryCode ?? '+91',
      phone: body.phone,
      preferredLanguage: body.preferredLanguage ?? null,
      userStatus: body.userStatus ?? 'Active',
      cityTown: body.cityTown ?? null,
      pin: body.pin ?? null,
      operatingZone: body.operatingZone ?? null,
      address: body.address ?? null,
      isClient: !!body.isClient,
      isServiceProvider: !!body.isServiceProvider,
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
    };
    if (!data.firstName || !body.phone) {
      return { ok: false, error: 'firstName and phone are required' };
    }
    const updated = await this.prisma.user.update({
      where: { userId },
      data,
      select: { userId: true, updatedAt: true },
    });
    return { ok: true, user: updated };
  }

  @Post(':id/photo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const dir = 'uploads';
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, unique + extname(file.originalname));
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        if (/^image\/(png|jpe?g|webp|gif|bmp|tiff?)$/.test(file.mimetype)) cb(null, true);
        else cb(new HttpException('Only image files are allowed', HttpStatus.BAD_REQUEST), false);
      },
    }),
  )
  async uploadPhoto(@Param('id') id: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    const relPath = `/${file.destination}/${file.filename}`.replace(/\\/g, '/');
    const updated = await this.prisma.user.update({
      where: { userId: id },
      data: { profilePhoto: relPath },
      select: { userId: true, profilePhoto: true, updatedAt: true },
    });
    return { ok: true, user: updated };
  }

  @Post(':id/affiliations')
  async saveAffiliations(
    @Param('id') userId: string,
    @Body() body: { isClient?: boolean; projectIds?: string[]; isServiceProvider?: boolean; companyIds?: string[]; },
  ) {
    const isClient = !!body.isClient;
    const isServiceProvider = !!body.isServiceProvider;
    const projectIds = Array.isArray(body.projectIds) ? body.projectIds.filter(Boolean) : [];
    const companyIds = Array.isArray(body.companyIds) ? body.companyIds.filter(Boolean) : [];

    const mapCompanyRoleToUserRole = (cr: CompanyRole | null): any => {
      switch (cr) {
        case 'IH_PMT': return 'IH_PMT';
        case 'Contractor': return 'Contractor';
        case 'Consultant': return 'Consultant';
        case 'PMC': return 'PMC';
        case 'Supplier': return 'Supplier';
        default: return null;
      }
    };

    const companies = companyIds.length
      ? await this.prisma.company.findMany({
          where: { companyId: { in: companyIds } },
          select: { companyId: true, companyRole: true },
        })
      : [];

    const toCreate: Prisma.UserRoleMembershipCreateManyInput[] = [];
    if (isClient) {
      for (const pid of projectIds) {
        toCreate.push({
          userId, role: 'Client', scopeType: 'Project',
          companyId: null, projectId: pid, isDefault: false,
        } as any);
      }
    }
    if (isServiceProvider) {
      for (const c of companies) {
        const role = mapCompanyRoleToUserRole(c.companyRole);
        if (!role) continue;
        toCreate.push({
          userId, role, scopeType: 'Company',
          companyId: c.companyId, projectId: null, isDefault: false,
        } as any);
      }
    }

    // This update bumps updatedAt via @updatedAt
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { userId }, data: { isClient, isServiceProvider } });
      await tx.userRoleMembership.deleteMany({ where: { userId, scopeType: 'Project' } });
      await tx.userRoleMembership.deleteMany({ where: { userId, scopeType: 'Company' } });
      if (toCreate.length) await tx.userRoleMembership.createMany({ data: toCreate });
    });

    // (Optional) return the fresh timestamp if you want the client to read it
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: { userId: true, updatedAt: true },
    });

    return { ok: true, count: toCreate.length, user };
  }
}
