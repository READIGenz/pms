import { PrismaClient, Discipline, Prisma } from '@prisma/client';

const prisma = new PrismaClient();
type Tx = Prisma.TransactionClient | PrismaClient;


const toNull = (v?: any) =>
  typeof v === 'string' && v.trim() === '' ? null : v;

/** Normalizers (keep “”→null for optional-unique fields) */
const cleanChecklist = (c: any) => ({
  code: String(c.code).trim(),
  title: String(c.title).trim(),
  discipline: c.discipline as Discipline, // ensure one of: 'Civil' | 'MEP' | 'Finishes'
  stageLabel: String(c.stageLabel || '').trim(),
  tags: Array.isArray(c.tags) ? c.tags : [],
  status: c.status || 'Active',
  version: Number.isFinite(c.version) ? c.version : 1,
});

const cleanChecklistItem = (i: any, checklistId: string) => ({
  checklistId,
  seq: Number(i.seq) || 0,
  text: String(i.text || '').trim(),
  requirement: toNull(i.requirement),
  method: Array.isArray(i.method) ? i.method : [],
  risk: toNull(i.risk),
  tags: Array.isArray(i.tags) ? i.tags : [],
});

const cleanActivity = (a: any) => ({
  code: toNull(a.code),                                 // OPTIONAL UNIQUE
  title: String(a.title || '').trim(),
  discipline: a.discipline as Discipline,
  stageLabel: toNull(a.stageLabel),
  phase: Array.isArray(a.phase) ? a.phase : [],
  element: Array.isArray(a.element) ? a.element : [],
  system: Array.isArray(a.system) ? a.system : [],
  nature: Array.isArray(a.nature) ? a.nature : [],
  method: Array.isArray(a.method) ? a.method : [],
  status: a.status || 'Active',
  version: Number.isFinite(a.version) ? a.version : 1,
  notes: toNull(a.notes),
});

const cleanMaterial = (m: any) => ({
  code: toNull(m.code),                                  // OPTIONAL UNIQUE
  name: String(m.name || '').trim(),
  category: toNull(m.category),
  aliases: Array.isArray(m.aliases) ? m.aliases : [],
  properties: m.properties ?? null,
  status: m.status || 'Active',
});

type TChecklist = ReturnType<typeof cleanChecklist>;
type TChecklistItem = ReturnType<typeof cleanChecklistItem>;
type TActivity = ReturnType<typeof cleanActivity>;
type TMaterial = ReturnType<typeof cleanMaterial>;

/** Helpers */
const ciEquals = (a?: string | null, b?: string | null) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/** Upsert Activity by code if provided, else by composite (discipline, stageLabel, title) */
async function upsertActivity(tx: Tx, a: TActivity) {
  if (a.code) {
    return tx.refActivity.upsert({
      where: { code: a.code },
      update: { ...a },
      create: { ...a },
    });
  }
  // No code: try find by composite (discipline, stageLabel, title)
  const existing = await tx.refActivity.findFirst({
    where: {
      discipline: a.discipline,
      title: a.title,
      // stageLabel is nullable; match NULL = NULL or value equality
      OR: [
        { stageLabel: a.stageLabel ?? undefined },
        ...(a.stageLabel == null ? [{ stageLabel: null }] : []),
      ],
    },
  });
  if (existing) {
    return tx.refActivity.update({
      where: { id: existing.id },
      data: { ...a },
    });
  }
  return tx.refActivity.create({ data: { ...a } });
}

/** Upsert Material by code if provided, else case-insensitive name+category */
async function upsertMaterial(tx: Tx, m: TMaterial) {
  if (m.code) {
    return tx.refMaterial.upsert({
      where: { code: m.code },
      update: { ...m },
      create: { ...m },
    });
  }
  const existing = await tx.refMaterial.findFirst({
    where: {
      AND: [
        { name: { equals: m.name, mode: 'insensitive' } },
        m.category == null
          ? { category: null }
          : { category: { equals: m.category, mode: 'insensitive' } },
      ],
    },
  });
  if (existing) {
    return tx.refMaterial.update({
      where: { id: existing.id },
      data: { ...m },
    });
  }
  return tx.refMaterial.create({ data: { ...m } });
}

/** Upsert Checklist by code */
async function upsertChecklist(tx: Tx, c: TChecklist) {
  return tx.refChecklist.upsert({
    where: { code: c.code },
    update: { ...c },
    create: { ...c },
  });
}

/** Upsert Checklist Item by (checklistId, seq) */
async function upsertChecklistItem(tx: Tx, item: TChecklistItem) {
  const found = await tx.refChecklistItem.findFirst({
    where: { checklistId: item.checklistId, seq: item.seq },
  });
  if (found) {
    return tx.refChecklistItem.update({
      where: { id: found.id },
      data: { ...item },
    });
  }
  return tx.refChecklistItem.create({ data: { ...item } });
}

/** Upsert link helpers (make your own uniqueness rule; here (itemId+label/name)) */
async function upsertItemActivityLink(
  tx: Tx,
  itemId: string,
  label: string,
  activityId: string | null,
  tags: string[] = [],
) {
  const existing = await tx.refChecklistItemActivityLink.findFirst({
    where: { itemId, label },
  });
  const data = { itemId, label, activityId, tags };
  if (existing) {
    return tx.refChecklistItemActivityLink.update({
      where: { id: existing.id },
      data,
    });
  }
  return tx.refChecklistItemActivityLink.create({ data });
}

async function upsertItemMaterialLink(
  tx: Tx,
  itemId: string,
  name: string,
  materialId: string | null,
  category?: string | null,
  properties?: any,
) {
  const existing = await tx.refChecklistItemMaterialLink.findFirst({
    where: { itemId, name },
  });
  const data = { itemId, name, materialId, category: toNull(category), properties: properties ?? null };
  if (existing) {
    return tx.refChecklistItemMaterialLink.update({
      where: { id: existing.id },
      data,
    });
  }
  return tx.refChecklistItemMaterialLink.create({ data });
}

/** OPTIONAL: connect activity<->material if you have that mapping */
async function ensureActivityMaterial(
  tx: PrismaClient,
  activityId: string,
  materialId: string,
  note?: string | null,
) {
  const exists = await tx.refActivityMaterial.findFirst({
    where: { activityId, materialId },
  });
  if (!exists) {
    await tx.refActivityMaterial.create({
      data: { activityId, materialId, note: toNull(note) },
    });
  } else if (note && !exists.note) {
    await tx.refActivityMaterial.update({
      where: { id: exists.id },
      data: { note },
    });
  }
}

/* ------------------------------------------------------------------ */
/* ----------------------------- SEED -------------------------------- */
/* ------------------------------------------------------------------ */

/** TODO: Replace the sample arrays with your parsed data.
 *  Shapes expected:
 *  - checklists: { code, title, discipline, stageLabel, tags?, status?, version? }
 *  - checklistItems: [{ checklistCode, seq, text, requirement?, method?:[], risk?, tags?:[],
 *      suggestedActivities?: [{ code?, title, discipline, stageLabel?, tags?:[] }],
 *      suggestedMaterials?: [{ code?, name, category?, aliases?:[], properties?:any }]
 *    }, ...]
 *  - activities: { code?, title, discipline, stageLabel?, system?:[], nature?:[], method?:[], notes?, status?, version? }
 *  - materials:  { code?, name, category?, aliases?:[], properties?:any, status? }
 */
const checklistsRaw: any[] = [
  { code: 'CL-CIV-0001', title: 'Rebar — Slab', discipline: 'Civil', stageLabel: 'Structural • Slab', tags: ['measurement','evidence'], status: 'Active', version: 1 },
  { code: 'CL-CIV-0002', title: 'Formwork — Beam', discipline: 'Civil', stageLabel: 'Structural • Beam', tags: ['visual','document'], status: 'Inactive', version: 1 },
  { code: 'CL-MEP-0001', title: 'Conduit installation', discipline: 'MEP', stageLabel: 'Services • Conduits / Wiring', tags: ['visual','measurement'], status: 'Active', version: 1 },
  { code: 'CL-FIN-0001', title: 'Tile installation — ceramic', discipline: 'Finishes', stageLabel: 'Finishes • Tiling', tags: ['visual','measurement'], status: 'Draft', version: 1 },
  { code: 'CL-ARC-0001', title: 'Door frame installation', discipline: 'MEP', stageLabel: 'Finishes • Doors', tags: ['visual','document'], status: 'Active', version: 1 },
];

const checklistItemsRaw: any[] = [
  // Example:
  // {
  //   checklistCode: 'CHK-CIV-PLN-001',
  //   seq: 1,
  //   text: 'Verify soil test report is approved',
  //   requirement: 'Mandatory',
  //   method: ['Review'],
  //   risk: 'High',
  //   tags: ['soil','geotech'],
  //   suggestedActivities: [
  //     { code: null, title: 'Soil Investigation', discipline: 'Civil', stageLabel: 'Planning', tags: ['geotech'] }
  //   ],
  //   suggestedMaterials: [
  //     { code: null, name: 'Borehole Logs', category: 'Docs' }
  //   ]
  // }
 // CL-CIV-0001 — Rebar — Slab
  { checklistCode: 'CL-CIV-0001', seq: 1, text: 'Bar diameter as per drawing', requirement: 'Mandatory', method: ['Measurement'], risk: null, tags: ['tol:eq','dim:mm'], 
    suggestedActivities: [{ code: 'RCC-610', title: 'Slab reinforcement placement & cover check', discipline: 'Civil', stageLabel: 'Structural • Slab' }],
    suggestedMaterials: [{ code: 'STE-101', name: 'Reinforcing steel B500B — deformed bars', category: 'Rebar & Steel' }] },
  { checklistCode: 'CL-CIV-0001', seq: 2, text: 'Rebar spacing', requirement: 'Mandatory', method: ['Measurement'], risk: null, tags: ['tol:lte','dim:mm'], 
    suggestedActivities: [{ code: 'RCC-610', title: 'Slab reinforcement placement & cover check', discipline: 'Civil', stageLabel: 'Structural • Slab' }],
    suggestedMaterials: [{ code: 'STE-101', name: 'Reinforcing steel B500B — deformed bars', category: 'Rebar & Steel' }] },
  { checklistCode: 'CL-CIV-0001', seq: 3, text: 'Concrete cover blocks', requirement: 'Mandatory', method: ['Measurement','Evidence'], risk: null, tags: ['tol:range','dim:mm'], 
    suggestedActivities: [{ code: 'RCC-610', title: 'Slab reinforcement placement & cover check', discipline: 'Civil', stageLabel: 'Structural • Slab' }],
    suggestedMaterials: [{ code: 'CON-001', name: 'Ready-mix concrete C30/37 (S3, 20 mm agg)', category: 'Concrete' }] },

  // CL-CIV-0002 — Formwork — Beam
  { checklistCode: 'CL-CIV-0002', seq: 1, text: 'Formwork alignment', requirement: 'Mandatory', method: ['Measurement','Visual'], risk: null, tags: ['tol:range','dim:mm'], suggestedMaterials: [] },
  { checklistCode: 'CL-CIV-0002', seq: 2, text: 'Release agent applied', requirement: 'Mandatory', method: ['Visual','Document'], risk: null, tags: [], suggestedMaterials: [] },

  // CL-MEP-0001 — Conduit installation
  { checklistCode: 'CL-MEP-0001', seq: 1, text: 'Conduit size', requirement: 'Mandatory', method: ['Measurement'], risk: null, tags: ['tol:eq','dim:mm'], 
    suggestedMaterials: [{ code: 'ELE-301', name: 'Copper cable 4C × 16 mm² PVC — 450/750 V', category: 'Cables' }] },
  { checklistCode: 'CL-MEP-0001', seq: 2, text: 'Junction box spacing', requirement: 'Mandatory', method: ['Measurement'], risk: null, tags: ['tol:lte','dim:mm'], 
    suggestedMaterials: [{ code: 'ELE-301', name: 'Copper cable 4C × 16 mm² PVC — 450/750 V', category: 'Cables' }] },

  // CL-FIN-0001 — Tile installation — ceramic
  { checklistCode: 'CL-FIN-0001', seq: 1, text: 'Alignment / level', requirement: 'Mandatory', method: ['Measurement','Visual'], risk: null, tags: ['tol:range','dim:mm'], suggestedMaterials: [] },
  { checklistCode: 'CL-FIN-0001', seq: 2, text: 'Grout width', requirement: 'Mandatory', method: ['Measurement'], risk: null, tags: ['tol:eq','dim:mm'], suggestedMaterials: [] },

  // CL-ARC-0001 — Door frame installation
  { checklistCode: 'CL-ARC-0001', seq: 1, text: 'Fixings spacing', requirement: 'Mandatory', method: ['Measurement'], risk: null, tags: ['tol:lte','dim:mm'], suggestedMaterials: [] },
  { checklistCode: 'CL-ARC-0001', seq: 2, text: 'Clear opening', requirement: 'Mandatory', method: ['Measurement'], risk: null, tags: ['tol:eq','dim:mm'], suggestedMaterials: [] },

];
const activitiesRaw: any[] = [
  { code: 'PCG-101', title: 'Project kick-off & stakeholder alignment',
    discipline: 'Civil', stageLabel: 'Architecture • Design',
    phase: ['PH.PRECON'], element: [] },

  { code: 'SUR-201', title: 'Site survey & benchmarks establishment',
    discipline: 'Civil', stageLabel: 'Structural • Foundation',
    phase: ['PH.SURVEY'], element: [] },

  { code: 'FDN-506', title: 'Waterstops & joint treatment at construction joints',
    discipline: 'Civil', stageLabel: 'Structural • Foundation',
    phase: ['PH.SUBSTRUCT'], element: ['ELM.JOINT'] },

  { code: 'RCC-610', title: 'Slab reinforcement placement & cover check',
    discipline: 'Civil', stageLabel: 'Structural • Slab',
    phase: ['PH.SUPERSTRUCT'], element: ['ELM.SLAB'] },

  { code: 'MAS-701', title: 'AAC blockwork — external walls',
    discipline: 'Civil', stageLabel: 'Masonry • Blockwork',
    phase: ['PH.SUPERSTRUCT'], element: ['ELM.WALL'] },

  { code: 'ELE-1001', title: 'Main DB installation & termination',
    discipline: 'MEP', stageLabel: 'Services • Electrical',
    phase: ['PH.MEP'], element: [] },

  { code: 'ELE-1010', title: 'ELV CCTV cabling & device terminations',
    discipline: 'MEP', stageLabel: 'Services • Electrical',
    phase: ['PH.MEP'], element: [] },

  { code: 'PHE-1105', title: 'Water supply piping — hydro test',
    discipline: 'MEP', stageLabel: 'Services • Plumbing',
    phase: ['PH.TC'], element: [] },

  { code: 'HVC-1202', title: 'Duct installation & supports',
    discipline: 'MEP', stageLabel: 'Services • HVAC',
    phase: ['PH.MEP'], element: [] },

  { code: 'FIN-2201', title: 'Wall painting — first coat',
    discipline: 'Finishes', stageLabel: 'Finishes • Painting',
    phase: ['PH.FINISHES'], element: ['ELM.WALL'] },
];


const materialsRaw: any[] = [
  // { code: 'MAT-CEM-OPC43', name: 'Cement OPC 43', category: 'Cement', aliases: ['OPC 43'], properties: [{key:'grade', value:'43'}] }
 {
    code: 'CON-001',
    name: 'Ready-mix concrete C30/37 (S3, 20 mm agg)',
    category: 'Concrete',
    aliases: [],
    properties: [
      { k: 'Compressive Strength', v: 'C30/37', u: '' },
      { k: 'Slump Class', v: 'S3', u: '' },
      { k: 'Max Aggregate Size', v: '20', u: 'mm' },
      { k: 'Cement Type', v: 'CEM II/A-L', u: '' },
    ],
    status: 'Active',
  },
  {
    code: 'STE-101',
    name: 'Reinforcing steel B500B — deformed bars',
    category: 'Rebar & Steel',
    aliases: [],
    properties: [
      { k: 'Yield Strength', v: '500', u: 'MPa' },
      { k: 'Ductility Class', v: 'B', u: '' },
      { k: 'Available Diameters', v: '10–32', u: 'mm' },
    ],
    status: 'Active',
  },
  {
    code: 'MAS-701',
    name: 'AAC block 600×200×200 mm, density 600',
    category: 'Masonry Block',
    aliases: [],
    properties: [
      { k: 'Compressive Strength', v: '3.5', u: 'MPa' },
      { k: 'Dry Density', v: '600', u: 'kg/m3' },
      { k: 'Size', v: '600×200×200', u: 'mm' },
    ],
    status: 'Inactive',
  },
  {
    code: 'WPF-501',
    name: 'SBS modified bituminous membrane 4 mm',
    category: 'Waterproofing',
    aliases: [],
    properties: [
      { k: 'Reinforcement', v: 'Polyester', u: '' },
      { k: 'Thickness', v: '4', u: 'mm' },
      { k: 'Finish', v: 'Mineral slate', u: '' },
    ],
    status: 'Draft',
  },
  {
    code: 'ELE-301',
    name: 'Copper cable 4C × 16 mm² PVC — 450/750 V',
    category: 'Cables',
    aliases: [],
    properties: [
      { k: 'Conductor Class', v: '5', u: '' },
      { k: 'No. of Cores', v: '4', u: '' },
      { k: 'Cross Section', v: '16', u: 'mm²' },
      { k: 'Voltage Rating', v: '450/750', u: 'V' },
    ],
    status: 'Active',
  },
  {
    code: 'PHE-401',
    name: 'uPVC pipe SDR 26 — OD 110 mm',
    category: 'Pipes',
    aliases: [],
    properties: [
      { k: 'Outside Diameter', v: '110', u: 'mm' },
      { k: 'SDR', v: '26', u: '' },
    ],
    status: 'Active',
  },
  {
    code: 'HVC-601',
    name: 'GI rectangular duct — 24 gauge (0.6 mm)',
    category: 'Ducts',
    aliases: [],
    properties: [
      { k: 'Material', v: 'Galvanized steel', u: '' },
      { k: 'Sheet Thickness', v: '0.6', u: 'mm' },
    ],
    status: 'Active',
  },
];

/* ---------------- Phase & Element vocab ---------------- */
const PHASES = [
  "PH.PRECON","PH.SURVEY","PH.EARTH","PH.SUBSTRUCT","PH.SUPERSTRUCT",
  "PH.MEP","PH.FINISHES","PH.TC","PH.HANDOVER",
] as const;

const ELEMENTS = [
  "ELM.SLAB","ELM.BEAM","ELM.COLUMN","ELM.WALL","ELM.JOINT",
  "ELM.DOOR","ELM.WINDOW","ELM.ROOF","ELM.STAIR",
] as const;

async function main() {
  await prisma.$transaction(async (tx) => {
    // 1) Seed Activities
    for (const raw of activitiesRaw) {
      await upsertActivity(tx, cleanActivity(raw));
    }

    // 2) Seed Materials
    for (const raw of materialsRaw) {
      await upsertMaterial(tx, cleanMaterial(raw));
    }

    // 3) Seed Checklists and Items (+ suggested links)
    for (const cRaw of checklistsRaw) {
      const c = cleanChecklist(cRaw);
      const checklist = await upsertChecklist(tx, c);

      // all items for this checklist
      const itemsForChecklist = checklistItemsRaw.filter(
        (i) => ciEquals(i.checklistCode, c.code)
      );

      // Upsert items
      for (const iRaw of itemsForChecklist) {
        const item = await upsertChecklistItem(tx, cleanChecklistItem(iRaw, checklist.id));

        // Suggested Activities (create link; try to resolve to a RefActivity if code OR composite match)
        for (const sAct of iRaw.suggestedActivities ?? []) {
          const a = cleanActivity(sAct);

          let matched: { id: string } | null = null;
          if (a.code) {
            matched = await tx.refActivity.findUnique({ where: { code: a.code } });
          }
          if (!matched) {
            matched = await tx.refActivity.findFirst({
              where: {
                discipline: a.discipline,
                title: a.title,
                OR: [
                  { stageLabel: a.stageLabel ?? undefined },
                  ...(a.stageLabel == null ? [{ stageLabel: null }] : []),
                ],
              },
              select: { id: true },
            });
          }
          // Create/update the link (activityId can be null if not found)
          await upsertItemActivityLink(tx, item.id, a.title, matched?.id ?? null, sAct.tags || []);
        }

        // Suggested Materials (create link; try to resolve)
        for (const sMat of iRaw.suggestedMaterials ?? []) {
          const m = cleanMaterial(sMat);

          let matched: { id: string } | null = null;
          if (m.code) {
            matched = await tx.refMaterial.findUnique({ where: { code: m.code } });
          }
          if (!matched) {
            matched = await tx.refMaterial.findFirst({
              where: {
                AND: [
                  { name: { equals: m.name, mode: 'insensitive' } },
                  m.category == null
                    ? { category: null }
                    : { category: { equals: m.category, mode: 'insensitive' } },
                ],
              },
              select: { id: true },
            });
          }
          await upsertItemMaterialLink(
            tx,
            item.id,
            m.name,
            matched?.id ?? null,
            m.category ?? null,
            m.properties ?? null
          );
        }
      }
    }

    // 4) OPTIONAL: If you have an Activity→Material mapping, ensure junctions
    // Example: for each activityRaw, attach by material code names present
    // for (const aRaw of activitiesRaw) {
    //   const a = cleanActivity(aRaw);
    //   const act = a.code
    //     ? await tx.refActivity.findUnique({ where: { code: a.code } })
    //     : await tx.refActivity.findFirst({ where: { discipline: a.discipline, title: a.title, stageLabel: a.stageLabel ?? null } });
    //   if (!act) continue;
    //   for (const matCode of aRaw.materialCodes ?? []) {
    //     const mat = await tx.refMaterial.findUnique({ where: { code: matCode } });
    //     if (mat) await ensureActivityMaterial(tx, act.id, mat.id);
    //   }
    // }
  });

  console.log('✅ Ref libraries seeded (idempotent).');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
