// pms-frontend/src/api/RefChecklists.ts
import { api } from "./client";

/** ——— Types your UI already expects (kept stable) ——— */
export type RefChecklistMeta = {
  id: string;
  code?: string | null;
  title: string;
  discipline?: "Civil" | "MEP" | "Finishes" | string; // keep permissive
  stageLabel?: string | null;
  tags?: string[];
  status?: string;         // "Active" | "Inactive"
  version?: number;
  versionLabel?: string | null;
  versionMajor?: number;
  versionMinor?: number;
  versionPatch?: number;
  /** Runner uses this; normalize from server (_count/itemsCount/items.length) */
  itemsCount?: number;
};

/**
 * UI-facing item the Runner needs. Keep optional to be lenient with server.
 * (Fields read in WIR Runner: title/name/code/unit/uom/tolerance/required/mandatory/status/tags/value)
 */
export type RefChecklistItem = {
  id: string;

  /** UI label fields */
  title?: string | null;
  name?: string | null;

  code?: string | null;

  unit?: string | null;
  uom?: string | null;

  /** legacy/alt fields kept for compatibility */
  spec?: string | null;
  specification?: string | null;

  required?: boolean | string | null;
  mandatory?: "Mandatory" | "Optional" | boolean | string | null;

  /** tolerance operator + numeric parts */
  tolerance?: string | "+-" | "<=" | "=" | null;
  base?: number | null;
  plus?: number | null;
  minus?: number | null;

  status?: string | null;
  tags?: string[];

  value?: string | number | null;

  /** extra flags coming from ref items */
  critical?: boolean | null;

  // 🔥 NEW: raw fields we also carry through for convenience
  checklistId?: string;
  seq?: number | null;
  text?: string | null;
  itemCode?: string | null;
  requirement?: RequirementFlag | string | null;
  aiEnabled?: boolean | null;
  aiConfidence?: number | null;
  units?: string | null;
};

/** ——— Backend-facing helpers & raw shapes ——— */
export type RequirementFlag = "Mandatory" | "Optional" | null;
export type ToleranceOp = "<=" | "+-" | "=" | ">=" | null;

/** Raw item shape as the controller returns when includeItems=1 */
type RefChecklistItemRaw = {
  id: string;
  checklistId?: string;
  seq?: number | null;
  text: string;
  requirement?: RequirementFlag;
  itemCode?: string | null;
  critical?: boolean | null;
  aiEnabled?: boolean | null;
  aiConfidence?: number | null;
  units?: string | null;
  tolerance?: ToleranceOp;
  base?: number | null;
  plus?: number | null;
  minus?: number | null;
  tags?: string[] | null;

  // If backend already carries a default/reference value, accept it.
  value?: string | number | null;
};

type RefChecklistRaw = {
  id: string;
  code?: string | null;
  title?: string | null;

  // counts may appear in multiple ways
  itemsCount?: number | null;
  _count?: { items?: number | null };

  // present only when includeItems=1
  items?: RefChecklistItemRaw[];

  // allow any extra fields without breaking
  [k: string]: any;
};

/** Normalize any server payload wrapper to the actual record */
function unwrap<T = any>(data: any): T {
  const one = data?.data ?? data;
  return (one?.data ?? one) as T;
}

/** Safely resolve item count from multiple server shapes */
export function resolveChecklistCount(
  src?: Partial<RefChecklistRaw> | null,
  fallback = 0
): number {
  if (!src) return fallback;
  if (Array.isArray(src.items)) return src.items.length;
  if (Number.isFinite(src.itemsCount as number)) return Number(src.itemsCount);
  if (src._count && Number.isFinite(src._count.items as number)) return Number(src._count.items);
  return fallback;
}

// helper near the top of file (or just above mapRawItemToUI)
const numOrNull = (v: any): number | null => {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (typeof v === "string") {
        const n = Number(v.trim());
        return Number.isFinite(n) ? n : null;
    }
    return null;
};

export function mapRawItemToUI(it: RefChecklistItemRaw): RefChecklistItem {
  const base = numOrNull(it.base);
  const plus = numOrNull(it.plus);
  const minus = numOrNull(it.minus);

  return {
    id: String(it.id ?? ""),

    // raw identity
    checklistId: it.checklistId ? String(it.checklistId) : undefined,
    seq: typeof it.seq === "number" ? it.seq : null,
    text: it.text ?? null,

    // labels / codes that Runner mapping uses
    title: it.text ?? null,
    name: it.text ?? null,
    itemCode: it.itemCode ?? null,
    code: it.itemCode ?? null,

    // requirement / mandatory flags
    requirement: it.requirement ?? null,
    mandatory: it.requirement ?? null,
    required:
      it.requirement === "Mandatory"
        ? true
        : it.requirement === "Optional"
        ? false
        : null,

    // tolerance pieces
    units: it.units ?? null,
    unit: it.units ?? null,
    uom: it.units ?? null,
    tolerance: it.tolerance ?? null,
    base,
    plus,
    minus,

    // other flags
    critical: it.critical ?? null,
    aiEnabled: it.aiEnabled ?? null,
    aiConfidence: numOrNull(it.aiConfidence),

    tags: Array.isArray(it.tags) ? it.tags : [],
    value:
      typeof it.value === "number" || typeof it.value === "string"
        ? it.value
        : null,
  };
}

export function formatTolerance(
  tolOp?: string | null,
  base?: number | null,
  plus?: number | null,
  minus?: number | null,
  uom?: string | null
): string | null {
  const op = (tolOp || "").trim();              // "<=", "+-", "="
  const unit = (uom || "").trim();              // e.g. "mm", "%"

  const has = (v: any) => typeof v === "number" && Number.isFinite(v);

  if (op === "<=") {
    if (has(plus)) return `≤ ${plus}${unit ? " " + unit : ""}`;
    if (has(minus)) return `≤ ${minus}${unit ? " " + unit : ""}`;
    return "≤ —";
  }

  if (op === "+-") {
    if (has(base) && has(plus)) return `${base} ± ${plus}${unit ? " " + unit : ""}`;
    if (has(plus)) return `± ${plus}${unit ? " " + unit : ""}`;
    // fallback if only base
    if (has(base)) return `${base}${unit ? " " + unit : ""}`;
    return "± —";
  }

  if (op === "=") {
    if (has(base)) return `= ${base}${unit ? " " + unit : ""}`;
    return "= —";
  }

  // Unknown / not set
  if (has(base)) return `${base}${unit ? " " + unit : ""}`;
  return null;
}

/** ========== Public API ========== */

/**
 * Fetch checklist meta (no items) and normalize itemsCount.
 * GET /admin/ref/checklists/:id
 */
export async function getRefChecklistMeta(id: string): Promise<RefChecklistMeta> {
  const res = await api.get(`/admin/ref/checklists/${id}`);
  const raw = unwrap<RefChecklistRaw & {
    discipline?: string;
    status?: string;
    version?: number;
    versionLabel?: string | null;
    versionMajor?: number;
    versionMinor?: number;
    versionPatch?: number;
    stageLabel?: string | null;
    tags?: string[] | null;
  }>(res.data);

  return {
    id: String(raw.id),
    code: raw.code ?? null,
    title: raw.title || "(Checklist)",
    discipline: (raw as any).discipline,
    stageLabel: (raw as any).stageLabel ?? null,
    tags: (raw as any).tags ?? undefined,
    status: (raw as any).status,
    version: (raw as any).version,
    versionLabel: (raw as any).versionLabel ?? null,
    versionMajor: (raw as any).versionMajor,
    versionMinor: (raw as any).versionMinor,
    versionPatch: (raw as any).versionPatch,
    itemsCount: resolveChecklistCount(raw, 0),
  };
}

/**
 * List checklist items for a Ref checklist.
 * Calls GET /admin/ref/checklists/:id?includeItems=1 and maps to UI type.
 */
export async function listRefChecklistItems(id: string): Promise<RefChecklistItem[]> {
  const res = await api.get(`/admin/ref/checklists/${id}`, { params: { includeItems: "1" } });
   console.log("[RefChecklists] raw items", res);
  const raw = unwrap<RefChecklistRaw>(res.data);
  const items = Array.isArray(raw.items) ? raw.items : [];
  return items.map(mapRawItemToUI);
}

/** Helper to get a numeric count client-side (if items not provided) */
export async function getRefChecklistCount(id: string): Promise<number> {
  try {
    // First try meta (fast & cheap)
    const meta = await getRefChecklistMeta(id);
    if (typeof meta.itemsCount === "number") return meta.itemsCount;

    // Fallback: fetch items and count
    const items = await listRefChecklistItems(id);
    return items.length;
  } catch {
    return 0;
  }
}

// /** (Optional) Replace items via PATCH :id/items — handy for editors */
// export async function replaceRefChecklistItems(
//   refChecklistId: string,
//   items: RefChecklistItem[]
// ) {
//   const payload = {
//     items: (items || []).map((it, i) => ({
//       id: it.id,
//       seq: i + 1,
//       // controller expects 'text'
//       text: it.title || it.name || it.code || `Item ${i + 1}`,
//       requirement:
//         (it.required as RequirementFlag) ??
//         (it.mandatory as RequirementFlag) ??
//         null,
//       itemCode: it.code ?? null,
//       units: it.unit ?? it.uom ?? null,
//       tolerance: (it.tolerance as ToleranceOp) ?? null,

//       // pass through without inventing values
//       critical: typeof it.critical === "boolean" ? it.critical : null,
//       value:
//         typeof it.value === "number" || typeof it.value === "string"
//           ? it.value
//           : null,

//       // keep other optional server fields explicit and null unless set by UI
//       aiEnabled: null,
//       aiConfidence: null,
//       base: null,
//       plus: null,
//       minus: null,
//       tags: it.tags ?? null,
//     })),
//   };
//   const { data } = await api.patch(
//     `/admin/ref/checklists/${refChecklistId}/items`,
//     payload
//   );
//   return unwrap(data);
// }
