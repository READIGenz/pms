import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminDashboardService } from './admin.dashboard.service';
import { JwtAuthGuard } from './../../../common/guards/jwt.guard'; // adjust path to your guard

@UseGuards(JwtAuthGuard)
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly svc: AdminDashboardService) {}

  @Get('kpis')
  async getKpis() {
    return await this.svc.getKpis();
  }
}
