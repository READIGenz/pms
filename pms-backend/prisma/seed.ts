// prisma/seed.ts
/* eslint-disable no-console */
import {
  PrismaClient,
  PreferredLanguage,
  OperatingZone,
  UserStatus,
  CompanyStatus,
  UserRole,
  CompanyRole,
  RoleScope,
  ProjectStatus,
  ProjectStage,
  ProjectType,
  StructureType,
  ConstructionType,
  ContractType,
  ProjectHealth,
  CurrencyCode,
  AreaUnit,
  StateType,
} from '@prisma/client';

const prisma = new PrismaClient();

/** ----------------------- small helpers ----------------------- */
const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const ensure = async <T>(q: () => Promise<T | null>, c: () => Promise<T>) => (await q()) ?? (await c());
const phone10 = (i: number) => (9000000000 + i).toString(); // 10 digits
async function getUniquePhone(countryCode: string, seed: number): Promise<string> {
  // Try a sequence of numbers until we find a free (countryCode, phone) pair
  // We jump by a prime-ish step to avoid many collisions if re-run.
  let attempt = 0;
  while (attempt < 1000) {
    const base = 9000000000 + seed + attempt * 37; // 10 digits
    const phone = base.toString();
    const exists = await prisma.user.findFirst({ where: { countryCode, phone } });
    if (!exists) return phone;
    attempt++;
  }
  throw new Error('Could not allocate a unique phone number');
}
const SERVICE_PROVIDER_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.Ava_PMT,
  UserRole.Contractor,
  UserRole.Consultant,
  UserRole.PMC,
  UserRole.Supplier,
]);

function toCompanyRole(role: UserRole | null | undefined): CompanyRole | null {
  switch (role) {
    case UserRole.Ava_PMT: return CompanyRole.Ava_PMT;
    case UserRole.Contractor: return CompanyRole.Contractor;
    case UserRole.Consultant: return CompanyRole.Consultant;
    case UserRole.PMC: return CompanyRole.PMC;
    case UserRole.Supplier: return CompanyRole.Supplier;
    default: return null;
  }
}

/** ----------------------- reset (optional) ----------------------- */
/**
 * If you run with env RESET=1, this will hard-truncate all app tables before seeding.
 * Example:
 *   RESET=1 npx prisma db seed
 */
async function resetDbIfAsked() {
  if (process.env.RESET !== '1') return;
  console.log('⚠️  RESET=1 → truncating tables…');
  // Note: quoted names match @@map() values in the schema
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      EXECUTE 'TRUNCATE TABLE
        "UserRoleMembership",
        "UserCompany",
        "UserProject",
        "ProjectTag",
        "Project",
        "Company",
        "User",
        "District",
        "State",
        "ref_project_tag"
      RESTART IDENTITY CASCADE';
    EXCEPTION WHEN others THEN
      -- For safety across environments just continue if this fails
      RAISE NOTICE 'Truncate failed or tables missing, continuing…';
    END $$;
  `);
}

/** ----------------------- seed data ----------------------- */

const stateDefs = [
  { code: 'DL', name: 'Delhi' },
  { code: 'KA', name: 'Karnataka' },
  { code: 'MH', name: 'Maharashtra' },
  { code: 'GJ', name: 'Gujarat' },
  { code: 'TN', name: 'Tamil Nadu' },
] as const;

const districtPerState = (stateName: string) => [
  `${stateName} Metro`,
  `${stateName} City`,
  `${stateName} Rural`,
];

const projectTitles = [
  'Ivy Residences',
  'Orchid Heights',
  'Cedar Commerce Park',
  'Maple Industrial Estate',
  'Lotus Institutional Campus',
  'Fusion Mixed-use Hub',
  'Harbor Infrastructure Upgrade',
  'Azure Villas',
  'Sunset Row Houses',
  'Core & Shell Tower',
];

const companyRoleNames: Array<[CompanyRole, string[]]> = [
  [CompanyRole.Ava_PMT,    ['Ava PMT Alpha', 'Ava PMT Beta', 'Ava PMT Gamma']],
  [CompanyRole.Contractor, ['BuildRight Co', 'Metro Builders', 'Skyline Infra']],
  [CompanyRole.Consultant, ['Vertex Consultants', 'SolidWorks Advisory', 'DesignMatrix']],
  [CompanyRole.PMC,        ['Prime PMC', 'Omni PMC', 'Nova PMC']],
  [CompanyRole.Supplier,   ['Ultra Suppliers', 'GreenLine Supplies', 'ProcureOne']],
];

/** ----------------------- creators ----------------------- */

async function ensureStatesAndDistricts() {
  const states = [];
  for (const s of stateDefs) {
    const st = await prisma.state.upsert({
      where: { code: s.code },
      update: {},
      create: { code: s.code, name: s.name, type: StateType.State },
    });
    states.push(st);
    for (const d of districtPerState(s.name)) {
      await ensure(
        () => prisma.district.findFirst({ where: { stateId: st.stateId, name: d } }),
        () => prisma.district.create({ data: { stateId: st.stateId, name: d } }),
      );
    }
  }
  return states;
}

async function createCompanies(states: Awaited<ReturnType<typeof ensureStatesAndDistricts>>) {
  const out = [];
  for (const [role, names] of companyRoleNames) {
    for (const name of names) {
      const st = pick(states);
      const dist = await prisma.district.findFirst({ where: { stateId: st.stateId } });
      const existing = await prisma.company.findFirst({ where: { name } });
      if (existing) { out.push(existing); continue; }
      const comp = await prisma.company.create({
        data: {
          name,
          companyRole: role,
          status: CompanyStatus.Active,
          stateId: st.stateId,
          districtId: dist?.districtId ?? null,
          address: `${name} HQ`,
          pin: '560001',
          contactEmail: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '')}@example.com`,
        },
      });
      out.push(comp);
    }
  }
  return out;
}

async function createProjects(states: Awaited<ReturnType<typeof ensureStatesAndDistricts>>) {
  const out = [];
  for (let i = 0; i < projectTitles.length; i++) {
    const title = projectTitles[i];
    const code = `PRJ-${(i + 1).toString().padStart(4, '0')}`;
    const st = pick(states);
    const dist = await prisma.district.findFirst({ where: { stateId: st.stateId } });
    const p = await prisma.project.upsert({
      where: { code },
      update: {},
      create: {
        title,
        code,
        status: ProjectStatus.Active,
        stage: ProjectStage.Planning,
        projectType: ProjectType.Residential,
        structureType: StructureType.LowRise,
        constructionType: ConstructionType.New,
        contractType: ContractType.LumpSum,
        health: ProjectHealth.Green,
        stateId: st.stateId,
        districtId: dist?.districtId ?? null,
        cityTown: 'Metro',
        pin: '560001',
        currency: CurrencyCode.INR,
        contractValue: '10000000.00',
        plotArea: '10000.00',
        builtUpArea: '15000.00',
        areaUnit: AreaUnit.SQM,
        floors: 10,
        description: `Seeded project ${title}`,
      },
    });
    out.push(p);
  }
  return out;
}

/** Build a membership at correct scope + create junctions */
async function attachMembership(userId: string, role: UserRole, ctx: {
  projects: { projectId: string }[],
  companies: { companyId: string, companyRole: CompanyRole | null }[],
  default?: boolean
}) {
  if (role === UserRole.Client) {
    const prj = pick(ctx.projects);
    await prisma.userRoleMembership.create({
      data: { userId, role, scopeType: RoleScope.Project, projectId: prj.projectId, isDefault: !!ctx.default },
    });
    await prisma.userProject.create({
      data: { userId, projectId: prj.projectId },
    });
  } else if (SERVICE_PROVIDER_ROLES.has(role)) {
    const wanted = toCompanyRole(role);
    const pool = wanted ? ctx.companies.filter(c => c.companyRole === wanted) : ctx.companies;
    const comp = pick(pool);
    await prisma.userRoleMembership.create({
      data: { userId, role, scopeType: RoleScope.Company, companyId: comp.companyId, isDefault: !!ctx.default },
    });
    await prisma.userCompany.create({
      data: { userId, companyId: comp.companyId },
    });
  } else if (role === UserRole.Admin) {
    await prisma.userRoleMembership.create({
      data: { userId, role, scopeType: RoleScope.Global, isDefault: !!ctx.default },
    });
  }
}

/** Create a user with N roles (1→5), role-identifying email, and flags */
async function createUserWithRoles(idx: number, args: {
  email: string;
  firstName?: string;
  roles: UserRole[];
  states: Awaited<ReturnType<typeof ensureStatesAndDistricts>>;
  projects: Awaited<ReturnType<typeof createProjects>>;
  companies: Awaited<ReturnType<typeof createCompanies>>;
  isSuperAdmin?: boolean;
}) {
  const st = pick(args.states);
  const dist = await prisma.district.findFirst({ where: { stateId: st.stateId } });

  const isClient = args.roles.includes(UserRole.Client);
  const isServiceProvider = args.roles.some(r => SERVICE_PROVIDER_ROLES.has(r));

const cc = '91'; // normalize
const phone = await getUniquePhone(cc, idx);

const user = await prisma.user.upsert({
  where: { email: args.email },
  update: {},
  create: {
    code: `USR-${(idx).toString().padStart(4, '0')}`,
    firstName: args.firstName || `User${idx}`,
    lastName: 'Demo',
    countryCode: cc,
    phone,
    email: args.email,
    preferredLanguage: pick([PreferredLanguage.en, PreferredLanguage.hi]),
    stateId: st.stateId,
    districtId: dist?.districtId ?? null,
    cityTown: 'Metro',
    pin: '560002',
    operatingZone: OperatingZone.NCR,
    address: `${idx} Example Street`,
    isClient,
    isServiceProvider,
    userStatus: UserStatus.Active,
    isSuperAdmin: !!args.isSuperAdmin,
  },
});


  for (let r = 0; r < args.roles.length; r++) {
    const role = args.roles[r];
    await attachMembership(user.userId, role, {
      projects: args.projects,
      companies: args.companies,
      default: r === 0, // first membership = default
    });
  }

  return user;
}

/** ----------------------- main ----------------------- */

async function main() {
  await resetDbIfAsked();

  console.log('🌱 Seeding…');

  // 1) States/Districts
  const states = await ensureStatesAndDistricts();
  console.log(`  ✓ states: ${states.length}; districts: ${await prisma.district.count()}`);

  // 2) Companies (3 per CompanyRole)
  const companies = await createCompanies(states);
  console.log(`  ✓ companies: ${companies.length} (3 per CompanyRole)`);

  // 3) Projects (10 total)
  const projects = await createProjects(states);
  console.log(`  ✓ projects: ${projects.length}`);

  // 4) Reference tags
  await prisma.refProjectTag.createMany({
    data: [
      { tagCode: 'PRIORITY', label: 'High Priority' },
      { tagCode: 'GOVT', label: 'Government' },
      { tagCode: 'PRIVATE', label: 'Private' },
    ],
    skipDuplicates: true,
  });

  // 5) Users (20) with 1→5 roles each, role-identifying emails
  //    Include super admin + 5-role test user.
  let userIdx = 1;

  // Super Admin (global)
  await createUserWithRoles(userIdx++, {
    email: 'admin@demo.local',
    firstName: 'Super',
    roles: [UserRole.Admin],
    isSuperAdmin: true,
    states, projects, companies,
  });

  // 5-role user (service provider spectrum) + Client → total 5 roles (choose any five)
  await createUserWithRoles(userIdx++, {
    email: 'fiveroles@demo.local',
    firstName: 'FiveRole',
    roles: [UserRole.Client, UserRole.Ava_PMT, UserRole.Contractor, UserRole.Consultant, UserRole.PMC],
    states, projects, companies,
  });

  // Users with 1 role
  await createUserWithRoles(userIdx++, { email: 'client@demo.local', roles: [UserRole.Client], states, projects, companies });
  await createUserWithRoles(userIdx++, { email: 'avapmt@demo.local', roles: [UserRole.Ava_PMT], states, projects, companies });
  await createUserWithRoles(userIdx++, { email: 'contractor@demo.local', roles: [UserRole.Contractor], states, projects, companies });
  await createUserWithRoles(userIdx++, { email: 'consultant@demo.local', roles: [UserRole.Consultant], states, projects, companies });
  await createUserWithRoles(userIdx++, { email: 'pmc@demo.local', roles: [UserRole.PMC], states, projects, companies });
  await createUserWithRoles(userIdx++, { email: 'supplier@demo.local', roles: [UserRole.Supplier], states, projects, companies });

  // Users with 2 roles
  await createUserWithRoles(userIdx++, { email: 'client2roles@demo.local', roles: [UserRole.Client, UserRole.Contractor], states, projects, companies });
  await createUserWithRoles(userIdx++, { email: 'pmt2roles@demo.local', roles: [UserRole.Ava_PMT, UserRole.Consultant], states, projects, companies });

  // Users with 3 roles
  await createUserWithRoles(userIdx++, { email: 'threeroles1@demo.local', roles: [UserRole.Client, UserRole.PMC, UserRole.Supplier], states, projects, companies });
  await createUserWithRoles(userIdx++, { email: 'threeroles2@demo.local', roles: [UserRole.Contractor, UserRole.Consultant, UserRole.PMC], states, projects, companies });

  // Users with 4 roles
  await createUserWithRoles(userIdx++, { email: 'fourroles1@demo.local', roles: [UserRole.Client, UserRole.Contractor, UserRole.Consultant, UserRole.PMC], states, projects, companies });
  await createUserWithRoles(userIdx++, { email: 'fourroles2@demo.local', roles: [UserRole.Ava_PMT, UserRole.Contractor, UserRole.PMC, UserRole.Supplier], states, projects, companies });

  // Mix more singles & combos to reach 20
  await createUserWithRoles(userIdx++, { email: 'clientonly2@demo.local', roles: [UserRole.Client], states, projects, companies });
  await createUserWithRoles(userIdx++, { email: 'contractoronly2@demo.local', roles: [UserRole.Contractor], states, projects, companies });
  await createUserWithRoles(userIdx++, { email: 'pmconly2@demo.local', roles: [UserRole.PMC], states, projects, companies });
  await createUserWithRoles(userIdx++, { email: 'consultantonly2@demo.local', roles: [UserRole.Consultant], states, projects, companies });
  await createUserWithRoles(userIdx++, { email: 'supplieronly2@demo.local', roles: [UserRole.Supplier], states, projects, companies });
  await createUserWithRoles(userIdx++, { email: 'clientpluspmt@demo.local', roles: [UserRole.Client, UserRole.Ava_PMT], states, projects, companies });
  await createUserWithRoles(userIdx++, { email: 'pmcpluscontractor@demo.local', roles: [UserRole.PMC, UserRole.Contractor], states, projects, companies });

  const userCount = await prisma.user.count();
  const roleMembershipCount = await prisma.userRoleMembership.count();
  console.log(`  ✓ users: ${userCount} (memberships: ${roleMembershipCount})`);

  console.log('✅ Seed complete.');
}

/** ----------------------- run ----------------------- */
main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
