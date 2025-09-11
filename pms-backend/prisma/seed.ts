import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Users, including superadmin
  const entries = [
    { email: 'superadmin@demo.local',    name: 'Super Admin',        role: 'Admin',             code: 'ADM000', city: 'Chennai', isSuperAdmin: true },
    { email: 'customer@demo.local',      name: 'Customer',           role: 'Customer',          code: 'CUS001', city: 'Chennai' },
    { email: 'pmc@demo.local',           name: 'PMC Lead',           role: 'PMC',               code: 'PMC001', city: 'Chennai' },
    { email: 'architect@demo.local',     name: 'Architect',          role: 'Architect',         code: 'ARC001', city: 'Chennai' },
    { email: 'designer@demo.local',      name: 'Designer',           role: 'Designer',          code: 'DSN001', city: 'Chennai' },
    { email: 'contractor@demo.local',    name: 'Contractor',         role: 'Contractor',        code: 'CON001', city: 'Chennai' },
    { email: 'legal@demo.local',         name: 'Legal/Liaisoning',   role: 'Legal/Liaisoning',  code: 'LEG001', city: 'Chennai' },
    { email: 'pmt@demo.local',           name: 'Ava-PMT',            role: 'Ava-PMT',           code: 'PMT001', city: 'Chennai' },
    { email: 'inspector.pmc@demo.local', name: 'Inspector (PMC)',    role: 'Inspector (PMC)',   code: 'INSP01', city: 'Chennai' },
    { email: 'hod.pmc@demo.local',       name: 'HOD (PMC)',          role: 'HOD (PMC)',         code: 'HOD001', city: 'Chennai' },
  ] as const;

  const users: Record<string, any> = {};
  for (const u of entries) {
    users[u.email] = await prisma.user.upsert({
      where: { email: u.email },
      update: { role: u.role, name: u.name, city: u.city, isSuperAdmin: (u as any).isSuperAdmin ?? false },
      create: { email: u.email, role: u.role, name: u.name, city: u.city, code: u.code, isSuperAdmin: (u as any).isSuperAdmin ?? false },
    });
  }

  const project = await prisma.project.upsert({
    where: { code: 'CH-ANN' },
    update: {},
    create: { code: 'CH-ANN', name: 'City Hospital Annex', city: 'Chennai', status: 'Ongoing', stage: 'Construction', health: 'Good' },
  });

  // Assign roles per project via ProjectMember (explicit M:N)
  const memberships: Array<{ email: string; role: string }> = [
    { email: 'customer@demo.local', role: 'Customer' },
    { email: 'pmc@demo.local', role: 'PMC' },
    { email: 'architect@demo.local', role: 'Architect' },
    { email: 'designer@demo.local', role: 'Designer' },
    { email: 'contractor@demo.local', role: 'Contractor' },
    { email: 'legal@demo.local', role: 'Legal/Liaisoning' },
    { email: 'pmt@demo.local', role: 'Ava-PMT' },
    { email: 'inspector.pmc@demo.local', role: 'Inspector (PMC)' },
    { email: 'hod.pmc@demo.local', role: 'HOD (PMC)' },
  ];
  for (const m of memberships) {
    await prisma.projectMember.upsert({
      where: {
        projectId_userId_role: {
          projectId: project.projectId,
          userId: users[m.email].userId,
          role: m.role,
        },
      },
      create: { projectId: project.projectId, userId: users[m.email].userId, role: m.role },
      update: {},
    });
  }

  console.log('Seed (admin + project members) complete ✅');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
