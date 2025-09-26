//src/modules/admin/controllers/admin.refs.controller.ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { PrismaService } from 'src/prisma/prisma.service';

@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminRefsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('states')
  async listStates() {
    const states = await this.prisma.state.findMany({
      select: { stateId: true, name: true, code: true }, orderBy: { name: 'asc' },
    });
    return { ok: true, states };
  }

  @Get('districts')
  async listDistricts(@Query('stateId') stateId?: string) {
    const where = stateId ? { stateId } : undefined;
    const districts = await this.prisma.district.findMany({
      where, select: { districtId: true, name: true, stateId: true }, orderBy: [{ name: 'asc' }],
    });
    return { ok: true, districts };
  }

  @Get('companies-brief')
  async listCompanies() {
    const companies = await this.prisma.company.findMany({
      select: { companyId: true, name: true, companyRole: true, status: true },
      orderBy: [{ name: 'asc' }],
    });
    return { ok: true, companies };
  }
}
