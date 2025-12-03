import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service'; // adjust if your path differs

@Injectable()
export class AdminDashboardService {
    constructor(private readonly prisma: PrismaService) { }

    async getKpis() {
        // === USERS ===
        const [usersTotal, usersActive, usersByStatusRaw] = await Promise.all([
            this.prisma.user.count(),
            this.prisma.user.count({ where: { userStatus: 'Active' } }),
            this.prisma.user.groupBy({ by: ['userStatus'], _count: { _all: true } }),
        ]);

        // === COMPANIES ===
        const [companiesTotal, companiesActive, companiesByStatusRaw] = await Promise.all([
            this.prisma.company.count(),
            this.prisma.company.count({ where: { status: 'Active' } }),
            this.prisma.company.groupBy({ by: ['status'], _count: { _all: true } }),
        ]);

        // === PROJECTS ===
        const [projectsTotal, projectsActive, projectsByStatus] = await Promise.all([
            this.prisma.project.count(),
            this.prisma.project.count({ where: { status: 'Active' } }),
            this.prisma.project.groupBy({ by: ['status'], _count: { _all: true } }),
        ]);

        return {
            users: { total: usersTotal, active: usersActive },
            companies: { total: companiesTotal, active: companiesActive },
            projects: { total: projectsTotal, active: projectsActive },
            projectsByStatus: projectsByStatus.map(r => ({ status: r.status, count: r._count._all })),
            usersByStatus: usersByStatusRaw.map(r => ({ status: r.userStatus, count: r._count._all })),
            companiesByStatus: companiesByStatusRaw.map(r => ({ status: r.status, count: r._count._all })),
        };
    }

}
