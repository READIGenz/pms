// src/modules/admin/admin.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Patch,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import {
  Prisma,
  PrismaClient,
  UserRole,
  CompanyRole,
  ProjectStatus,
} from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';

const prisma = new PrismaClient(); // swap to DI service if you have one

/** Generate the next user code like "USR-0001", "USR-0002", ... */
async function generateNextUserCode(
  tx: PrismaClient | Prisma.TransactionClient,
): Promise<string> {
  // Zero-padded so lexicographic desc works safely.
  const latest = await tx.user.findFirst({
    where: { code: { startsWith: 'USR-' } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });

  const lastNum = (() => {
    const m = latest?.code?.match(/^USR-(\d{4,})$/);
    return m ? parseInt(m[1], 10) : 0;
  })();

  const nextNum = lastNum + 1;
  return `USR-${String(nextNum).padStart(4, '0')}`;
}

@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminController {
  // ---------------- Users list (existing) ----------------
  @Get('users')
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
    if (q && q.trim()) {
      Object.assign(where, {
        OR: [
          { firstName: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { lastName: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { email: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { phone: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { code: { contains: q, mode: Prisma.QueryMode.insensitive } },
        ],
      } as Prisma.UserWhereInput);
    }

    if (role && Object.values(UserRole).includes(role as UserRole)) {
      (where as any).userRole = role as UserRole;
    }

    const allowedSort = new Set<keyof Prisma.UserOrderByWithRelationInput>([
      'createdAt',
      'updatedAt',
      'firstName',
      'lastName',
      'email',
      'phone',
      'code',
      'userStatus',
      'isSuperAdmin',
      'userRole',
    ]);
    const by = (allowedSort.has(sortBy as any)
      ? sortBy
      : 'createdAt') as keyof Prisma.UserOrderByWithRelationInput;
    const dir: Prisma.SortOrder = sortDir === 'desc' ? 'desc' : 'asc';
    const orderBy: Prisma.UserOrderByWithRelationInput = {
      [by]: dir,
    } as Prisma.UserOrderByWithRelationInput;

    const users = await prisma.user.findMany({
      where,
      skip: _skip || undefined,
      take: _take,
      orderBy,
      select: {
        userId: true,
        code: true,
        firstName: true,
        middleName: true,
        lastName: true,
        countryCode: true,
        phone: true,
        email: true,
        preferredLanguage: true,
        profilePhoto: true,
        stateId: true,
        districtId: true,
        cityTown: true,
        pin: true,
        operatingZone: true,
        address: true,
        isClient: true,
        isServiceProvider: true,
        userStatus: true,
        isSuperAdmin: true,
        createdAt: true,
        updatedAt: true,
        userRole: true,
        state: { select: { stateId: true, code: true, name: true, type: true } },
        district: {
          select: {
            districtId: true,
            name: true,
            stateId: true,
            state: { select: { code: true, name: true } },
          },
        },
        userRoleMemberships:
          includeMemberships === '1'
            ? {
                select: {
                  id: true,
                  role: true,
                  scopeType: true,
                  companyId: true,
                  projectId: true,
                  isDefault: true,
                  createdAt: true,
                  company: { select: { companyId: true, name: true } },
                  project: { select: { projectId: true, title: true, code: true } },
                },
              }
            : false,
      },
    });

    const total = await prisma.user.count({ where });
    return { ok: true, total, users };
  }

  // ---------------- Get ONE user (NEW) ----------------
  @Get('users/:id')
  async getUser(
    @Param('id') userId: string,
    @Query('includeMemberships') includeMemberships?: '0' | '1',
  ) {
    const user = await prisma.user.findUnique({
      where: { userId },
      select: {
        userId: true,
        code: true,
        firstName: true,
        middleName: true,
        lastName: true,
        countryCode: true,
        phone: true,
        email: true,
        preferredLanguage: true,
        profilePhoto: true,
        stateId: true,
        districtId: true,
        cityTown: true,
        pin: true,
        operatingZone: true,
        address: true,
        isClient: true,
        isServiceProvider: true,
        userStatus: true,
        isSuperAdmin: true,
        createdAt: true,
        updatedAt: true,
        userRole: true,
        state: { select: { stateId: true, code: true, name: true, type: true } },
        district: {
          select: {
            districtId: true,
            name: true,
            stateId: true,
            state: { select: { code: true, name: true } },
          },
        },
        userRoleMemberships:
          includeMemberships === '1'
            ? {
                select: {
                  id: true,
                  role: true,
                  scopeType: true,
                  companyId: true,
                  projectId: true,
                  isDefault: true,
                  createdAt: true,
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

  // ---------------- Preview next code (OPTIONAL) ----------------
  @Get('users/next-code')
  async getNextUserCode() {
    const code = await generateNextUserCode(prisma);
    return { ok: true, code };
  }

  // ---------------- Create user (UPDATED: auto code + atomic) ----------------
  @Post('users')
  async createUser(@Body() body: any) {
    if (!body?.firstName || !body?.countryCode || !body?.phone) {
      return {
        ok: false,
        error: 'firstName, countryCode and phone are required.',
      };
    }

    const created = await prisma.$transaction(async (tx) => {
      const finalCode: string =
        (body.code && String(body.code).trim()) || (await generateNextUserCode(tx));

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

      const user = await tx.user.create({ data: payload, select: { userId: true } });
      return user;
    });

    return { ok: true, user: created };
  }

  // ---------------- Update user (existing) ----------------
  @Patch('users/:id')
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

    const updated = await prisma.user.update({
      where: { userId },
      data,
      select: { userId: true },
    });
    return { ok: true, user: updated };
  }

  // ---------------- Reference: States (existing) ----------------
  @Get('states')
  async listStates() {
    const states = await prisma.state.findMany({
      select: { stateId: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });
    return { ok: true, states };
  }

  // ---------------- Reference: Districts (existing) ----------------
  @Get('districts')
  async listDistricts(@Query('stateId') stateId?: string) {
    const where: Prisma.DistrictWhereInput | undefined = stateId ? { stateId } : undefined;
    const districts = await prisma.district.findMany({
      where,
      select: { districtId: true, name: true, stateId: true },
      orderBy: [{ name: 'asc' }],
    });
    return { ok: true, districts };
  }

  // ---------------- Reference: Projects (existing) ----------------
  @Get('projects')
  async listProjects(@Query('status') status?: ProjectStatus | string) {
    const where: Prisma.ProjectWhereInput = {};
    if (status && Object.values(ProjectStatus).includes(status as ProjectStatus)) {
      (where as any).status = status as ProjectStatus;
    }
    const projects = await prisma.project.findMany({
      where,
      select: { projectId: true, title: true, code: true, status: true },
      orderBy: [{ title: 'asc' }],
    });
    return { ok: true, projects };
  }

  // ---------------- Reference: Companies (existing) ----------------
  @Get('companies')
  async listCompanies() {
    const companies = await prisma.company.findMany({
      select: { companyId: true, name: true, companyRole: true, status: true },
      orderBy: [{ name: 'asc' }],
    });
    return { ok: true, companies };
  }

  // ---------------- Upload Profile Photo (existing) ----------------
  @Post('users/:id/photo')
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
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
      fileFilter: (req, file, cb) => {
        if (/^image\/(png|jpe?g|webp|gif|bmp|tiff?)$/.test(file.mimetype)) cb(null, true);
        else cb(new HttpException('Only image files are allowed', HttpStatus.BAD_REQUEST), false);
      },
    }),
  )
  async uploadPhoto(@Param('id') id: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    const relPath = `/${file.destination}/${file.filename}`.replace(/\\/g, '/'); // e.g. /uploads/xxxx.jpg

    const updated = await prisma.user.update({
      where: { userId: id },
      data: { profilePhoto: relPath },
      select: { userId: true, profilePhoto: true },
    });

    return { ok: true, user: updated };
  }

  // ---------------- Save Affiliations (existing) ----------------
  @Post('users/:id/affiliations')
  async saveAffiliations(
    @Param('id') userId: string,
    @Body()
    body: {
      isClient?: boolean;
      projectIds?: string[]; // projects where user is Client
      isServiceProvider?: boolean;
      companyIds?: string[]; // companies user works for (role inferred from companyRole)
    },
  ) {
    const isClient = !!body.isClient;
    const isServiceProvider = !!body.isServiceProvider;
    const projectIds = Array.isArray(body.projectIds) ? body.projectIds.filter(Boolean) : [];
    const companyIds = Array.isArray(body.companyIds) ? body.companyIds.filter(Boolean) : [];

    // Map CompanyRole -> UserRole (names match in your schema)
    const mapCompanyRoleToUserRole = (cr: CompanyRole | null): UserRole | null => {
      if (!cr) return null;
      switch (cr) {
        case 'Ava_PMT':
          return 'Ava_PMT';
        case 'Contractor':
          return 'Contractor';
        case 'Consultant':
          return 'Consultant';
        case 'PMC':
          return 'PMC';
        case 'Supplier':
          return 'Supplier';
        default:
          return null;
      }
    };

    // Pull companies (to know their roles)
    const companies = companyIds.length
      ? await prisma.company.findMany({
          where: { companyId: { in: companyIds } },
          select: { companyId: true, companyRole: true },
        })
      : [];

    // Build membership rows to create
    const toCreate: Prisma.UserRoleMembershipCreateManyInput[] = [];

    if (isClient) {
      for (const pid of projectIds) {
        toCreate.push({
          id: undefined as unknown as string, // ignored by createMany
          userId,
          role: 'Client',
          scopeType: 'Project',
          companyId: null,
          projectId: pid,
          isDefault: false,
          createdAt: undefined as unknown as Date, // ignored by createMany (defaults now())
        });
      }
    }

    if (isServiceProvider) {
      for (const c of companies) {
        const role = mapCompanyRoleToUserRole(c.companyRole);
        if (!role) continue;
        toCreate.push({
          id: undefined as unknown as string,
          userId,
          role,
          scopeType: 'Company',
          companyId: c.companyId,
          projectId: null,
          isDefault: false,
          createdAt: undefined as unknown as Date,
        });
      }
    }

    // Replace existing memberships of relevant scopes (clean & insert)
    await prisma.$transaction(async (tx) => {
      // Update flags on user
      await tx.user.update({
        where: { userId },
        data: {
          isClient,
          isServiceProvider,
        },
      });

      // Clean existing project-scope Client memberships
      await tx.userRoleMembership.deleteMany({
        where: { userId, scopeType: 'Project' },
      });

      // Clean existing company-scope memberships
      await tx.userRoleMembership.deleteMany({
        where: { userId, scopeType: 'Company' },
      });

      if (toCreate.length > 0) {
        await tx.userRoleMembership.createMany({ data: toCreate });
      }
    });

    return { ok: true, count: toCreate.length };
  }
}
