"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const india_state_district_seed_1 = require("./../india-state-district-seed"); // adjust path if needed
const prisma = new client_1.PrismaClient();
async function main() {
    for (const state of india_state_district_seed_1.states) {
        await prisma.state.upsert({
            where: { code: state.code },
            update: {},
            create: {
                code: state.code,
                name: state.name,
                type: state.type,
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
//# sourceMappingURL=seed.js.map