// pms-frontend/src/api/RefChecklists.ts
import { api } from "./client";

/** ——— Types your UI already expects (kept stable) ——— */
export type RefChecklistMeta = {
  id: string;
  title?: string | null;
  /** Prefer items?.length, else itemsCount/_count.items, else 0 */
  itemsCount?: number | null;
};

export type RefChecklistItem = {
  id: string;
  name: string;                 // UI label (from backend 'text' or 'itemCode')

  // NEW: runner/FE expectations (all optional + nullable for safety)
  title?: string | null;        // mapped from 'text'
  tags?: string[] | null;       // mapped from 'tags'
  code?: string | null;         // mapped from 'itemCode'
  unit?: string | null;         // mapped from 'units'
  uom?: string | null;          // alias of unit (same as 'units')
  specification?: string | null;// no direct prisma field; leave null unless you derive
  status?: string | null;       // not present on ref items; kept for runner compatibility
  mandatory?: string | null;    // alias of required for runner compatibility

  // Existing fields you already used
  spec?: string | null;
  required?: string | null;     // 'Mandatory' | 'Optional' | null
  tolerance?: string | null;    // '<=' | '+-' | '=' | null
};

/** ——— Backend-facing helpers & raw shapes ——— */
type RequirementFlag = "Mandatory" | "Optional" | null;
type ToleranceOp = "<=" | "+-" | "=" | null;

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
  const maybe = data?.data ?? data;
  return (maybe?.data ?? maybe) as T;
}

/** Safely resolve item count from multiple server shapes */
export function resolveChecklistCount(
  src?: Partial<RefChecklistRaw> | null,
  fallback = 0
): number {
  if (!src) return fallback;
  if (Array.isArray(src.items)) return src.items.length;
  if (typeof src.itemsCount === "number") return src.itemsCount;
  if (src._count && typeof src._count.items === "number") return src._count.items!;
  return fallback;
}

/** Map backend raw item → your UI item type (non-breaking for existing UI) */
function mapRawItemToUI(it: RefChecklistItemRaw): RefChecklistItem {
  const unit = it.units ?? null;
  return {
    id: it.id,
    name: it.text || it.itemCode || "(Item)",

    // New fields used by runner
    title: it.text ?? null,
    tags: it.tags ?? null,
    code: it.itemCode ?? null,
    unit,
    uom: unit,
    specification: null,        // no direct source; keep for runner compatibility
    status: null,               // not on RefChecklistItem; runner-safe placeholder
    mandatory: it.requirement ?? null,

    // Existing fields
    spec: null,                 // reserve for UI free-text if you later add one
    required: it.requirement ?? null,
    tolerance: it.tolerance ?? null,
  };
}

/** ========== Public API (drop-in replacements) ========== */

/**
 * Fetch checklist meta.
 * Uses GET /admin/ref/checklists/:id (no items) and normalizes itemsCount.
 */
export async function getRefChecklistMeta(refChecklistId: string): Promise<RefChecklistMeta | null> {
  if (!refChecklistId) return null;
  const { data } = await api.get(`/admin/ref/checklists/${refChecklistId}`, {
    params: { includeItems: "0" },
  });
  const raw = unwrap<RefChecklistRaw>(data);
  return {
    id: String(raw?.id ?? refChecklistId),
    title: raw?.title ?? null,
    itemsCount: resolveChecklistCount(raw, null as any), // keep null if unknown
  };
}

/**
 * List checklist items.
 * Calls GET /admin/ref/checklists/:id?includeItems=1 and maps to your UI type.
 */
export async function listRefChecklistItems(refChecklistId: string): Promise<RefChecklistItem[]> {
  if (!refChecklistId) return [];
  const { data } = await api.get(`/admin/ref/checklists/${refChecklistId}`, {
    params: { includeItems: "1" },
  });
  const raw = unwrap<RefChecklistRaw>(data);
  const items = Array.isArray(raw?.items) ? raw.items : [];
  return items.map(mapRawItemToUI);
}

/** (Optional) Replace items via PATCH :id/items — handy for editors */
export async function replaceRefChecklistItems(
  refChecklistId: string,
  items: RefChecklistItem[]
) {
  const payload = {
    items: (items || []).map((it, i) => ({
      id: it.id,
      seq: i + 1,
      text: it.title || it.name,                      // controller expects 'text'
      requirement: (it.required as RequirementFlag) ?? (it.mandatory as RequirementFlag) ?? null,
      itemCode: it.code ?? null,
      units: it.unit ?? it.uom ?? null,
      tolerance: (it.tolerance as ToleranceOp) ?? null,
      // leave the rest null unless you explicitly capture them in UI
      critical: null,
      aiEnabled: null,
      aiConfidence: null,
      base: null,
      plus: null,
      minus: null,
      tags: it.tags ?? null,
    })),
  };
  const { data } = await api.patch(`/admin/ref/checklists/${refChecklistId}/items`, payload);
  return unwrap(data);
}
