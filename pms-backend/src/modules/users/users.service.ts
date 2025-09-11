import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany();
  }

  async getUserWithProjects(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      include: { memberships: { include: { project: true } } },
    });
    if (!user) return null;
    const byId: Record<string, any> = {};
    for (const m of user.memberships) {
      byId[m.projectId] = m.project;
    }
    const projects = Object.values(byId);
    return { ...user, projects };
  }

  async kpis(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      include: { memberships: { include: { project: true } } },
    });
    const projects = user?.memberships?.map((m) => m.project) ?? [];
    const total = projects.length;
    const ongoing = projects.filter((p: any) => p.status === 'Ongoing').length;
    const delayed = projects.filter((p: any) => p.health === 'Delayed').length;
    const atRisk = projects.filter((p: any) => p.health === 'At Risk').length;
    return { total, ongoing, delayed, atRisk };
  }
}
