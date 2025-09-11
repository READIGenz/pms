import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

const ROLE_MODULE_MAP: Record<string, string[]> = {
  'Customer':['Progress Dashboard','Stakeholder Directory','Handover','Warranty','DLP Tracker','Incident Reporting'],
  'PMC':['Progress Dashboard','Stakeholder Directory','Inspection Request (WIR/MIR)','Site Observation','Incident Reporting','Corrective Actions Task','Instructions by PMC','Request for Clarification','Daily Progress Reporting','DLP Tracker'],
  'Inspector (PMC)':['Inspection Request (WIR/MIR)','Site Observation','Incident Reporting'],
  'HOD (PMC)':['Inspection Request (WIR/MIR)','Incident Reporting'],
  'Architect':['Consultant Drawings and Submitter','Request for Clarification','Progress Dashboard'],
  'Designer':['Consultant Drawings and Submitter','Request for Clarification','Progress Dashboard'],
  'Contractor':["Contractor's Submittal",'Inspection Request (WIR/MIR)','Daily Progress Reporting','Request for Clarification','Site Observation','Incident Reporting'],
  'Legal/Liaisoning':['Support','Progress Dashboard'],
  'Ava-PMT':['Progress Dashboard','Stakeholder Directory','Corrective Actions Task','Implementation Plan'],
  'DC (Contractor)':["Contractor's Submittal",'Consultant Drawings and Submitter'],
  'DC (PMC)':['Consultant Drawings and Submitter','Instructions by PMC'],
  'Engineer (Contractor)':['Daily Progress Reporting','Inspection Request (WIR/MIR)'],
};

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async myProjects(userId: string) {
    const memberships = await this.prisma.projectMember.findMany({
      where: { userId },
      include: { project: true },
    });
    const byProject: Record<string, { project: any; roles: string[] }> = {};
    for (const m of memberships) {
      if (!byProject[m.projectId]) byProject[m.projectId] = { project: m.project, roles: [] };
      byProject[m.projectId].roles.push(m.role);
    }
    return Object.values(byProject).map(({ project, roles }) => ({
      projectId: project.projectId,
      code: project.code,
      name: project.name,
      city: project.city,
      status: project.status,
      stage: project.stage,
      health: project.health,
      roles: Array.from(new Set(roles)),
    }));
  }

  async myModulesForProject(userId: string, projectId: string) {
    const memberships = await this.prisma.projectMember.findMany({ where: { userId, projectId } });
    const roles = memberships.map((m) => m.role);
    const mods = new Set<string>();
    for (const r of roles) {
      (ROLE_MODULE_MAP[r] || []).forEach((m) => mods.add(m));
    }
    return Array.from(mods);
  }
}
