import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Ensure the singleton settings row exists with id=1
  await prisma.adminAuditSetting.upsert({
    where: { id: 1 },
    update: {}, // keep existing values; we only care that it exists
    create: {
      id: 1,
      assignmentsEnabled: true,
      // updatedBy* are optional; leave null on first create
    },
  });

  console.log('✓ AdminAuditSetting seeded (id=1)');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
