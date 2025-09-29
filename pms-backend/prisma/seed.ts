// prisma/seed.ts
import {
  PrismaClient,
  UserRole,
  CompanyRole,
  UserStatus,
  RoleScope,
} from "@prisma/client";

const prisma = new PrismaClient();

// --- date helpers (store as date-only for memberships) ---
const today = new Date();
today.setHours(0, 0, 0, 0);
const toDateOnly = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const addDays = (d: Date, days: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
};

async function main() {
  console.log("Seeding: States & Districts");
  // Minimal refs for filters
  const dl = await prisma.state.upsert({
    where: { code: "DL" },
    update: {},
    create: { code: "DL", name: "Delhi", type: "UT" as any },
  });
  const mh = await prisma.state.upsert({
    where: { code: "MH" },
    update: {},
    create: { code: "MH", name: "Maharashtra", type: "State" as any },
  });
  const ka = await prisma.state.upsert({
    where: { code: "KA" },
    update: {},
    create: { code: "KA", name: "Karnataka", type: "State" as any },
  });

  const delhi = await prisma.district.upsert({
    where: { stateId_name: { stateId: dl.stateId, name: "New Delhi" } },
    update: {},
    create: { stateId: dl.stateId, name: "New Delhi" },
  });
  const mumbai = await prisma.district.upsert({
    where: { stateId_name: { stateId: mh.stateId, name: "Mumbai" } },
    update: {},
    create: { stateId: mh.stateId, name: "Mumbai" },
  });
  const bengaluru = await prisma.district.upsert({
    where: { stateId_name: { stateId: ka.stateId, name: "Bengaluru Urban" } },
    update: {},
    create: { stateId: ka.stateId, name: "Bengaluru Urban" },
  });

  console.log("Seeding: Admin");
  // Admin user (set passwordHash according to your auth, left null here)
  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      code: "ADMIN",
      firstName: "System",
      lastName: "Admin",
      countryCode: "+91",
      phone: "9000000000",
      email: "admin@example.com",
      userStatus: UserStatus.Active,
      isSuperAdmin: true,
      userRole: UserRole.Admin,
      passwordHash: null,
      stateId: dl.stateId,
      districtId: delhi.districtId,
    },
  });

  console.log("Seeding: 10 Companies (upsert by companyCode)");
  const companyRoles: CompanyRole[] = [
    CompanyRole.IH_PMT,
    CompanyRole.PMC,
    CompanyRole.Supplier,
    CompanyRole.Contractor,
    CompanyRole.Consultant,
  ];

  const companies = await Promise.all(
    Array.from({ length: 10 }, async (_, i) => {
      const code = `CO${String(i + 1).padStart(3, "0")}`;
      const name = `Company ${String(i + 1).padStart(2, "0")}`;
      const role = companyRoles[i % companyRoles.length];
      const st = [dl, mh, ka][i % 3];
      const dt = [delhi, mumbai, bengaluru][i % 3];

      return prisma.company.upsert({
        where: { companyCode: code }, // <-- unique key
        update: {
          name,
          companyRole: role,
          stateId: st.stateId,
          districtId: dt.districtId,
          status: "Active" as any,
        },
        create: {
          companyCode: code, // <-- keep setting companyCode in create
          name,
          companyRole: role,
          status: "Active" as any,
          stateId: st.stateId,
          districtId: dt.districtId,
        },
      });
    })
  );

  console.log("Seeding: 10 Client Users");
  const clients = await Promise.all(
    Array.from({ length: 10 }, async (_, i) => {
      const idx = i + 1;
      const email = `client${idx}@example.com`;
      const st = [dl, mh, ka][idx % 3];
      const dt = [delhi, mumbai, bengaluru][idx % 3];

      return prisma.user.upsert({
        where: { email },
        update: {
          isClient: true,
          stateId: st.stateId,
          districtId: dt.districtId,
        },
        create: {
          code: `C${String(idx).padStart(3, "0")}`,
          firstName: `Client${idx}`,
          lastName: idx % 2 ? "Enterprises" : "Limited",
          countryCode: "+91",
          phone: `9${String(800000000 + idx).padStart(9, "0")}`,
          email,
          isClient: true,
          userStatus: idx % 5 === 0 ? UserStatus.Inactive : UserStatus.Active,
          stateId: st.stateId,
          districtId: dt.districtId,
          userRole: null, // using memberships instead
        },
      });
    })
  );

  console.log("Seeding: 10 Non-Client Users with memberships");
  const roleCycle: UserRole[] = [
    UserRole.IH_PMT,
    UserRole.PMC,
    UserRole.Supplier,
    UserRole.Contractor,
    UserRole.Consultant,
  ];

  const nonClients = await Promise.all(
    Array.from({ length: 10 }, async (_, i) => {
      const idx = i + 1;
      const email = `user${idx}@example.com`;
      const st = [dl, mh, ka][idx % 3];
      const dt = [delhi, mumbai, bengaluru][idx % 3];

      const u = await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          code: `U${String(idx).padStart(3, "0")}`,
          firstName: `User${idx}`,
          lastName: "Worker",
          countryCode: "+91",
          phone: `8${String(800000000 + idx).padStart(9, "0")}`,
          email,
          isClient: false,
          userStatus: UserStatus.Active,
          stateId: st.stateId,
          districtId: dt.districtId,
          userRole: null,
        },
      });

      // Company-scoped membership: even indexes active today, odd expired
      const role = roleCycle[i % roleCycle.length];
      const company = companies[i % companies.length];

      const active = i % 2 === 0;
      const from = toDateOnly(active ? addDays(today, -7) : addDays(today, -60));
      const to = toDateOnly(active ? addDays(today, 21) : addDays(today, -30));

      // Avoid duplicates on repeated seeds: check then create
      const existing = await prisma.userRoleMembership.findFirst({
        where: {
          userId: u.userId,
          role,
          scopeType: RoleScope.Company,
          companyId: company.companyId,
          projectId: null,
          validFrom: from,
          validTo: to,
        },
      });
      if (!existing) {
        await prisma.userRoleMembership.create({
          data: {
            userId: u.userId,
            role,
            scopeType: RoleScope.Company,
            companyId: company.companyId,
            projectId: null,
            isDefault: false,
            validFrom: from,
            validTo: to,
            createdBy: admin.userId,
            notes: active
              ? "Active membership (by date window)"
              : "Expired membership (by date window)",
          },
        });
      }

      return u;
    })
  );

  console.log("Seed complete:");
  console.log({
    companies: companies.length,
    clients: clients.length,
    nonClients: nonClients.length,
    admin: admin.email,
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
