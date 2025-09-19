"use strict";
//to seed db with data
//npx prisma generate
//npx ts-node prisma/seed.ts
Object.defineProperty(exports, "__esModule", { value: true });
// pms-backend/prisma/seed.ts
require("dotenv/config");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
// ---------- helpers ----------
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pickOrNull = (arr) => arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
const range = (n) => Array.from({ length: n }, (_, i) => i);
const langs = ['en', 'hi', 'bn', 'ta', 'te', 'mr', 'pa', 'or', 'gu', 'kn', 'ml'];
const zones = ['NCR', 'North', 'South', 'East', 'West', 'Central'];
const userStatuses = ['Active', 'Inactive'];
const CC = '91'; // country code must be digits-only to satisfy user_cc_digits constraint
const compStatuses = ['Active', 'Inactive'];
const compRoles = ['Ava_PMT', 'Contractor', 'Consultant', 'PMC', 'Supplier'];
const projStatuses = ['Draft', 'Active', 'OnHold', 'Completed', 'Archived'];
const projStages = ['Planning', 'Design', 'Procurement', 'Execution', 'Handover', 'Closed'];
const projTypes = ['Residential', 'Commercial', 'Industrial', 'Institutional', 'MixedUse', 'Infrastructure', 'Other'];
const structureTypes = ['LowRise', 'HighRise', 'Villa', 'RowHouse', 'InteriorFitout', 'ShellCore', 'Other'];
const constructionTypes = ['New', 'Renovation', 'Retrofit', 'Repair', 'Fitout', 'Other'];
const contractTypes = ['LumpSum', 'ItemRate', 'Turnkey', 'EPC', 'PMC', 'LabourOnly', 'Other'];
const healths = ['Green', 'Amber', 'Red', 'Unknown'];
const currencies = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'SGD', 'AUD', 'Other'];
const areaUnits = ['SQFT', 'SQM', 'SQYD', 'Acre', 'Hectare'];
// ---------- seed data ----------
async function ensureStatesAndDistricts() {
    // 10 States/UT with 2+ districts each
    const stateDefs = [
        { code: 'DL', name: 'Delhi', type: 'UT', dists: ['New Delhi', 'Central Delhi', 'South Delhi'] },
        { code: 'MH', name: 'Maharashtra', type: 'State', dists: ['Mumbai', 'Pune', 'Nagpur'] },
        { code: 'KA', name: 'Karnataka', type: 'State', dists: ['Bengaluru Urban', 'Mysuru'] },
        { code: 'TN', name: 'Tamil Nadu', type: 'State', dists: ['Chennai', 'Coimbatore'] },
        { code: 'GJ', name: 'Gujarat', type: 'State', dists: ['Ahmedabad', 'Surat'] },
        { code: 'RJ', name: 'Rajasthan', type: 'State', dists: ['Jaipur', 'Udaipur'] },
        { code: 'UP', name: 'Uttar Pradesh', type: 'State', dists: ['Noida', 'Lucknow'] },
        { code: 'WB', name: 'West Bengal', type: 'State', dists: ['Kolkata', 'Howrah'] },
        { code: 'TS', name: 'Telangana', type: 'State', dists: ['Hyderabad', 'Warangal'] },
        { code: 'KL', name: 'Kerala', type: 'State', dists: ['Ernakulam', 'Thiruvananthapuram'] },
    ];
    const states = [];
    for (const s of stateDefs) {
        const st = await prisma.state.upsert({
            where: { code: s.code },
            update: { name: s.name, type: s.type },
            create: { code: s.code, name: s.name, type: s.type },
        });
        states.push(st);
        // Districts via composite unique (stateId, name)
        for (const dn of s.dists) {
            await prisma.district.upsert({
                where: { stateId_name: { stateId: st.stateId, name: dn } },
                update: {},
                create: { name: dn, stateId: st.stateId },
            });
        }
    }
    return states;
}
async function ensureRefTags() {
    const tags = [
        { tagCode: 'RES', label: 'Residential' },
        { tagCode: 'COM', label: 'Commercial' },
        { tagCode: 'IND', label: 'Industrial' },
        { tagCode: 'HSP', label: 'Hospital' },
        { tagCode: 'EDU', label: 'Education' },
        { tagCode: 'INF', label: 'Infrastructure' },
        { tagCode: 'ITP', label: 'IT Park' },
        { tagCode: 'RET', label: 'Retail' },
        { tagCode: 'LOG', label: 'Logistics' },
        { tagCode: 'FIT', label: 'Interiors Fitout' },
        { tagCode: 'REN', label: 'Renovation' },
        { tagCode: 'EPC', label: 'EPC' },
    ];
    for (const t of tags) {
        await prisma.refProjectTag.upsert({
            where: { tagCode: t.tagCode },
            update: { label: t.label },
            create: t,
        });
    }
    return tags.map(t => t.tagCode);
}
async function ensureUsers(states) {
    // Super Admin
    await prisma.user.upsert({
        where: { countryCode_phone: { countryCode: CC, phone: '9000000001' } },
        update: {},
        create: {
            code: 'ADM-0001',
            firstName: 'Super',
            lastName: 'Admin',
            countryCode: CC,
            phone: '9000000001',
            email: 'admin@example.com',
            preferredLanguage: 'en',
            operatingZone: 'NCR',
            userStatus: 'Active',
            isSuperAdmin: true,
            address: 'HQ',
            cityTown: 'New Delhi',
            stateId: states.find(s => s.code === 'DL')?.stateId,
            districtId: (await prisma.district.findFirst({ where: { name: 'New Delhi' } }))?.districtId ?? null,
            pin: '110001',
        },
    });
    // 10 more users
    for (let i = 2; i <= 11; i++) {
        const st = pick(states);
        const dist = await prisma.district.findFirst({ where: { stateId: st.stateId } });
        const phone = String(9000000000 + i); // 9000000002 .. 9000000011 (10 digits)
        const pin = String(560000 + i); // 560002 .. 560011 (6 digits)
        await prisma.user.upsert({
            where: { countryCode_phone: { countryCode: CC, phone } },
            update: {},
            create: {
                code: `USR-${String(i).padStart(4, '0')}`,
                firstName: `User${i}`,
                lastName: 'Demo',
                countryCode: CC,
                phone,
                email: `user${i}@example.com`,
                preferredLanguage: pick(langs),
                operatingZone: pick(zones),
                userStatus: pick(userStatuses),
                address: `${i} Example Street`,
                cityTown: 'Metro',
                stateId: st.stateId,
                districtId: dist?.districtId ?? null,
                pin, // 6 digits
                isClient: Math.random() < 0.5,
                isServiceProvider: Math.random() < 0.6,
            },
        });
    }
}
async function ensureCompanies(states) {
    // Create 10 companies; use unique GSTIN as the upsert key
    for (let i = 1; i <= 10; i++) {
        const st = pick(states);
        const dist = await prisma.district.findFirst({ where: { stateId: st.stateId } });
        const contactMobile = String(9000001000 + i); // 9000001001 .. 9000001010 (10 digits)
        const pin = String(400000 + i); // 400001 .. 400010 (6 digits)
        await prisma.company.upsert({
            where: { gstin: `29ABCDE${String(1000 + i)}F1Z${(i % 9) + 1}` },
            update: {},
            create: {
                name: `Company ${i}`,
                status: pick(compStatuses),
                website: `https://company${i}.example`,
                companyRole: pick(compRoles),
                gstin: `29ABCDE${String(1000 + i)}F1Z${(i % 9) + 1}`,
                pan: `ABCDE${String(1000 + i)}F`,
                cin: `U12345KA20${String(10 + i)}PLC${String(100000 + i)}`,
                primaryContact: `Contact ${i}`,
                contactMobile,
                contactEmail: `c${i}@example.com`,
                stateId: st.stateId,
                districtId: dist?.districtId ?? null,
                address: `${i} Corporate Park`,
                pin,
                notes: `Seeded company ${i}`,
                userId: (await prisma.user.findFirst({ where: { isServiceProvider: true }, select: { userId: true } }))?.userId ?? null,
            },
        });
    }
}
async function ensureProjects(states, tagCodes) {
    const users = await prisma.user.findMany({ select: { userId: true } });
    const companies = await prisma.company.findMany({ select: { companyId: true } });
    const pickOrNull = (arr) => arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
    for (let i = 1; i <= 10; i++) {
        const st = pick(states);
        const dist = await prisma.district.findFirst({ where: { stateId: st.stateId } });
        const byUser = Math.random() < 0.5;
        const userRow = byUser ? pickOrNull(users) : null;
        const companyRow = !byUser ? pickOrNull(companies) : null;
        const clientUserId = userRow?.userId ?? null;
        const clientCompanyId = companyRow?.companyId ?? null;
        const pin = String(500000 + i); // 500001 .. 500010 (6 digits)
        const proj = await prisma.project.upsert({
            where: { code: `PRJ-${String(i).padStart(4, '0')}` },
            update: {},
            create: {
                title: `Project ${i}`,
                code: `PRJ-${String(i).padStart(4, '0')}`,
                status: pick(projStatuses),
                stage: pick(projStages),
                projectType: pick(projTypes),
                structureType: pick(structureTypes),
                constructionType: pick(constructionTypes),
                contractType: pick(contractTypes),
                health: pick(healths),
                clientUserId,
                clientCompanyId,
                address: `${i} Project Avenue`,
                cityTown: 'Metro City',
                stateId: st.stateId,
                districtId: dist?.districtId ?? null,
                pin,
                latitude: (12.90 + i / 1000).toFixed(6),
                longitude: (77.59 + i / 1000).toFixed(6),
                startDate: new Date(2023, (i % 12), (i % 28) + 1),
                plannedCompletionDate: new Date(2025, ((i + 6) % 12), ((i + 7) % 28) + 1),
                currency: pick(currencies),
                contractValue: (10000000 + i * 100000),
                areaUnit: pick(areaUnits),
                plotArea: (10000 + i * 100),
                builtUpArea: (8000 + i * 120),
                floors: (i % 15) + 1,
                description: `Seeded project ${i}`,
            },
            select: { projectId: true }
        });
        // Attach up to 3 unique tags
        const tagsForThis = Array.from(new Set(range(3).map(() => pick(tagCodes))));
        if (tagsForThis.length) {
            await prisma.projectTag.createMany({
                data: tagsForThis.map(tagCode => ({ projectId: proj.projectId, tagCode })),
                skipDuplicates: true,
            });
        }
    }
}
async function main() {
    const states = await ensureStatesAndDistricts();
    const tagCodes = await ensureRefTags();
    await ensureUsers(states);
    await ensureCompanies(states);
    await ensureProjects(states, tagCodes);
    console.log('✅ Seed complete: States, Districts, Users (incl. Super Admin), Companies, Projects, RefProjectTags, ProjectTags.');
    console.log('   Super Admin: email=admin@example.com or phone=+91 9000000001 (use your OTP dev flow).');
}
main()
    .catch((e) => {
    const msg = e?.message ?? e;
    console.error('Seed failed:', msg);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map