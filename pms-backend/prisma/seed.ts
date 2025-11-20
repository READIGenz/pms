import { PrismaClient, StateType } from '@prisma/client';
import { states } from './../india-state-district-seed'; // adjust path if needed

const prisma = new PrismaClient();

async function main() {
  for (const state of states) {
    await prisma.state.upsert({
      where: { code: state.code },
      update: {},
      create: {
        code: state.code,
        name: state.name,
        type: state.type as StateType,
        districts: {
          create: state.districts,
        },
      },
    });
  }

  console.log('✅ Seeded states and districts.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
