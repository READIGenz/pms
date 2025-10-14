"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
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
//# sourceMappingURL=seed.js.map