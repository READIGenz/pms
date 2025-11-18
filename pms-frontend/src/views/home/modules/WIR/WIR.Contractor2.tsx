// pms-frontend/src/views/home/modules/WIR/WIR.Contractor.tsx
// === [Runner_0] === Imports and Utilities
import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { api } from "../../../../api/client";
import {
  listWir as apiListWir,
  getWir as apiGetWir,
  createWir as apiCreateWir,
  updateWir as apiUpdateWir,
  deleteWir as apiDeleteWir,
  submitWir as apiSubmitWir,
  recommendWir as apiRecommendWir,
  approveWir as apiApproveWir,
  rescheduleWir as apiRescheduleWir,
  getWirHistory as apiGetWirHistory,
  listWirDiscussions as apiListWirDiscussions,
  postWirDiscussionMessage as apiPostWirDiscussionMessage,
  saveWirRunnerInspector,
  saveWirRunnerHod,
  getWir,
} from "../../../../api/wir";
import { useAuth } from "../../../../hooks/useAuth";
import { getRoleBaseMatrix } from "../../../admin/permissions/AdminPermProjectOverrides";
import { getModuleSettings } from "../../../../api/adminModuleSettings";
import { normalizeSettings } from "../../../admin/moduleSettings/useModuleSettings";
import { useScrollLock } from "../../../../hooks/useScrollLock";
import { getRefChecklistMeta, listRefChecklistItems, RefChecklistMeta, RefChecklistItem, formatTolerance } from "../../../../api/RefChecklists";

/* ========================= Debug helpers ========================= */
const DEBUG = true;
const log = (...a: any[]) => DEBUG && console.log("[WIR]", ...a);
const group = (label: string, ...rest: any[]) =>
  DEBUG && console.groupCollapsed("[WIR]", label, ...rest);
const groupEnd = () => DEBUG && console.groupEnd();

/* ========================= JWT helpers ========================= */
function decodeJwtPayload(token: string): any | null {
  try {
    const [, b64] = token.split(".");
    if (!b64) return null;
    const norm = b64.replace(/-/g, "+").replace(/_/g, "/");
    const pad = norm.length % 4 ? "=".repeat(4 - (norm.length % 4)) : "";
    return JSON.parse(atob(norm + pad));
  } catch {
    return null;
  }
}

const getToken = (): string | null =>
  localStorage.getItem("token") ||
  sessionStorage.getItem("token") ||
  (window as any).__AUTH_TOKEN ||
  null;

const getClaims = (): any | null => {
  const t = getToken();
  return t ? decodeJwtPayload(t) : null;
};

const preventOpenIfRO =
  (isRO: boolean) =>
    (e: React.MouseEvent | React.PointerEvent | React.MouseEvent<HTMLSelectElement>) => {
      if (isRO) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

// Resolve userId from the JWT (no hooks here)
function getUserIdFromToken(): string | null {
  const jwt = getClaims() || {};
  const uid = jwt.sub || jwt.userId || jwt.uid || jwt.id || null;
  return uid ? String(uid) : null;
}

function resolveUserIdFrom(anyClaims?: any, anyUser?: any): string | null {
  const c = anyClaims || {};
  const candidates = [c.sub, c.userId, c.uid, c.id, anyUser?.userId, anyUser?.id];
  const hit = candidates.find((v) => v !== undefined && v !== null && String(v).trim() !== "");
  return hit != null ? String(hit) : null;
}

/* ========================= Role helpers ========================= */
const normalizeRole = (raw?: string) => {
  const norm = (raw || "").toString().trim().replace(/[_\s-]+/g, "").toLowerCase();
  switch (norm) {
    case "admin":
      return "Admin";
    case "client":
      return "Client";
    case "ihpmt":
      return "IH-PMT";
    case "contractor":
      return "Contractor";
    case "consultant":
      return "Consultant";
    case "pmc":
      return "PMC";
    case "supplier":
      return "Supplier";
    default:
      return raw || "";
  }
};

type RoleKey = "Client" | "IH-PMT" | "Contractor" | "Consultant" | "PMC" | "Supplier";
const MODULE_CODE = "WIR";
//const currentUserId = getUserIdFromToken();

/* ========================= Permission helpers ========================= */
// Normalize an override cell to 'deny' | 'inherit' | undefined
function readOverrideCell(
  matrix: any,
  moduleCode: string,
  action: string
): "deny" | "inherit" | undefined {
  if (!matrix) return undefined;
  const mod =
    matrix[moduleCode] ??
    matrix[moduleCode?.toLowerCase?.()] ??
    matrix[moduleCode?.toUpperCase?.()];
  if (!mod || typeof mod !== "object") return undefined;
  const v = mod[action] ?? mod[action?.toLowerCase?.()] ?? mod[action?.toUpperCase?.()];
  if (v === false) return "deny"; // back-compat boolean
  if (v === "deny" || v === "inherit") return v;
  return undefined;
}

/* SoftPill — small pill with optional value & tone */
type SoftTone = "neutral" | "info" | "success" | "warning" | "danger" | "gray";

function SoftPill({
  label,
  value,
  tone = "neutral",
}: {
  label?: string | null;
  value?: string | null;
  tone?: SoftTone;
}) {
  const l = (label ?? "").toString().trim();
  const v = (value ?? "").toString().trim();

  if (!l && !v) return null;

  const toneCls: Record<SoftTone, string> = {
    neutral:
      "border dark:border-neutral-800 bg-gray-50 text-gray-800 dark:bg-neutral-800 dark:text-gray-200",
    info:
      "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    success:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    warning:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    danger:
      "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
    gray:
      "border dark:border-neutral-800 bg-gray-50 text-gray-800 dark:bg-neutral-900 dark:text-gray-200",
  };

  return (
    <span
      className={
        "inline-flex items-center text-[11px] px-2 py-0.5 rounded-md " +
        toneCls[tone]
      }
    >
      {l && <span className="mr-1">{l}</span>}
      {v && <span className="opacity-80">{v}</span>}
    </span>
  );
}

type RunnerCardItem = {
  /** Stable UI key: prefer WIR item id (wid) else checklist item id (cid) */
  id: string;
  /** WIR item id (DB id) – used for saving to BE when present */
  wid?: string | null;
  /** RefChecklist item id – used to compose the full list and as fallback id */
  cid?: string | null;

  title: string;
  code?: string | null;
  unit?: string | null;
  tolerance?: string | null;
  required?: boolean | string | null;
  requirement?: string | null;
  critical?: boolean | null;
  status?: string | null;
  tags?: string[];
  base?: number | null;
  plus?: number | null;
  minus?: number | null;
};

type DenyCell = "inherit" | "deny";
type OverrideMatrixLite = Record<string, Record<string, DenyCell | undefined>>; // e.g. { WIR: { view: 'inherit'|'deny' } }

async function fetchUserOverrideMatrix(
  projectId: string,
  userId: string
): Promise<OverrideMatrixLite> {
  try {
    const res = await apiGetSafe<any>(
      `/admin/permissions/projects/${projectId}/users/${userId}/overrides`
    );
    const m = (res?.matrix ?? res) || {};
    return m;
  } catch {
    return {};
  }
}

async function resolveAutoHodForDate(projectId: string, onDateISO: string): Promise<UserLite | null> {
  // Reuse the same roles resolver you already have
  const roles = await resolvePmcActingRolesForProjectOnDate(projectId, onDateISO);

  // Prefer a pure HOD first…
  const pureHod = roles.find(r => r.role === "HOD");
  if (pureHod) return pureHod.user;

  // …else accept Inspector+HOD (they can act as HOD)
  const both = roles.find(r => r.role === "Inspector+HOD");
  return both ? both.user : null;
}

function effAllow(baseYes: boolean | undefined, denyCell: DenyCell | undefined): boolean {
  // deny-only overrides: inherit => keep base; deny => force false
  return !!baseYes && denyCell !== "deny";
}

type PmcActingRole = "Inspector" | "HOD" | "Inspector+HOD" | "ViewerOnly";
function deducePmcActingRole(
  effView: boolean,
  effRaise: boolean,
  effReview: boolean,
  effApprove: boolean
): PmcActingRole {
  // Per rule:
  // Inspector  => View=true, Raise=false, Review=true,  Approve=false
  // HOD        => View=true, Raise=false, Review=false, Approve=true
  // Both       => View=true, Raise=false, Review=true,  Approve=true
  // Anything else = ViewerOnly (or not eligible)
  if (effView && !effRaise && effReview && !effApprove) return "Inspector";
  if (effView && !effRaise && !effReview && effApprove) return "HOD";
  if (effView && !effRaise && effReview && effApprove) return "Inspector+HOD";
  return "ViewerOnly";
}

type ActingPmc = { user: UserLite; role: PmcActingRole };

async function resolvePmcActingRolesForProjectOnDate(
  projectId: string,
  onDateISO: string
): Promise<ActingPmc[]> {
  const base = await getRoleBaseMatrix(projectId, "PMC" as any);
  const baseView = !!base?.WIR?.view;
  const baseRaise = !!base?.WIR?.raise;
  const baseReview = !!base?.WIR?.review;
  const baseApprove = !!base?.WIR?.approve;

  const all = await fetchActivePMCsForProjectOnDate(projectId, onDateISO);
  const out: ActingPmc[] = [];

  for (const hit of all) {
    const userId = hit.user.userId;
    const over = await fetchUserOverrideMatrix(projectId, userId);
    const row = (over?.WIR ?? {}) as Record<
      "view" | "raise" | "review" | "approve",
      DenyCell | undefined
    >;

    const effV = effAllow(baseView, row.view);
    const effRz = effAllow(baseRaise, row.raise);
    const effRv = effAllow(baseReview, row.review);
    const effAp = effAllow(baseApprove, row.approve);

    const label = deducePmcActingRole(effV, effRz, effRv, effAp);
    if (label !== "ViewerOnly") out.push({ user: hit.user, role: label });
  }
  return out;
}

// Fetch ALL PMCs active for this project on a date (sorted by most recently updated)
async function fetchActivePMCsForProjectOnDate(projectId: string, onDateISO: string) {
  const { data } = await api.get("/admin/users", { params: { includeMemberships: "1" } });
  const users: UserLite[] = Array.isArray(data) ? data : (data?.users ?? []);

  const candidates: { user: UserLite; mem: MembershipLite }[] = [];
  for (const u of users) {
    const mems = Array.isArray(u.userRoleMemberships) ? u.userRoleMemberships : [];
    for (const m of mems) {
      if (String(m?.role || "").toLowerCase() !== "pmc") continue;
      if (String(m?.project?.projectId || "") !== String(projectId)) continue;
      const from = m?.validFrom || undefined;
      const to = m?.validTo || undefined;
      if (isWithinYMD(onDateISO, from, to)) {
        candidates.push({ user: u, mem: m });
      }
    }
  }

  candidates.sort((a, b) => {
    const au = Date.parse(a.mem.updatedAt || "") || 0;
    const bu = Date.parse(b.mem.updatedAt || "") || 0;
    return bu - au;
  });

  return candidates; // array of { user, mem }
}

// compute effective canRaise = (base allow) AND (NOT user-override deny)
async function fetchEffectiveRaisePermission(
  projectId: string,
  roleKey: RoleKey
): Promise<boolean> {
  const userId = getUserIdFromToken();
  if (!userId) return false;

  let baseRaise = false;
  try {
    const base = await getRoleBaseMatrix(projectId, roleKey);
    baseRaise = !!base?.WIR?.raise; // base boolean
  } catch {
    baseRaise = false;
  }

  let userDeny = false;
  try {
    const res = await apiGetSafe<any>(
      `/admin/permissions/projects/${projectId}/users/${userId}/overrides`
    );
    const matrix = res?.matrix ?? res;
    userDeny = readOverrideCell(matrix, "WIR", "raise") === "deny";
  } catch {
    userDeny = false; // no overrides -> inherit
  }

  return baseRaise && !userDeny;
}

// ---- PMC guard helpers (reuse pmcAssignments.tsx shapes) ----
type MembershipLite = {
  role?: string | null;
  project?: { projectId?: string; title?: string } | null;
  company?: { companyId?: string; name?: string | null } | null;
  validFrom?: string | null;
  validTo?: string | null;
  updatedAt?: string | null;
};
type UserLite = {
  userId: string;
  firstName: string;
  middleName?: string | null;
  lastName?: string | null;
  email?: string | null;
  countryCode?: string | null;
  phone?: string | null;
  company?: { name?: string | null } | null;
  userRoleMemberships?: MembershipLite[];
};

function displayNameLite(u: UserLite) {
  return (
    [u.firstName, u.middleName, u.lastName].filter(Boolean).join(" ").trim() ||
    u.email ||
    `User #${u.userId}`
  );
}
function displayPhone(u: Partial<UserLite> | any) {
  const cc = String(u?.countryCode ?? "").replace(/\D+/g, "");
  const ph = String(u?.phone ?? "").replace(/\D+/g, "");
  if (!ph) return "";
  // default to India (91) if cc missing; aligns with long-term rule
  return `+${cc || "91"}${ph}`;
}
function getCompanyNameForProjectPMC(u: UserLite, pid: string) {
  const mems = u.userRoleMemberships || [];
  // Prefer PMC membership tied to this project (scope: Project) and read its company name
  const projMem = mems.find(
    (m) =>
      String(m.project?.projectId || "") === String(pid) &&
      String(m.role || "").toLowerCase() === "pmc"
  );
  if (projMem?.company?.name) return projMem.company.name;
  // Fallback: any company-scoped membership with PMC role
  const anyPmc = mems.find((m) => !m.project?.projectId && String(m.role || "").toLowerCase() === "pmc");
  return anyPmc?.company?.name || null;
}
function fmtLocalDateOnly(v?: string | null) {
  if (!v) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? String(v)
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isWithinYMD(dateISO: string, startISO?: string | null, endISO?: string | null) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return false;
  const d = new Date(dateISO + "T00:00:00");
  const s = startISO ? new Date(startISO) : null;
  const e = endISO ? new Date(endISO) : null;
  if (isNaN(+d)) return false;
  if (s && d < s) return false;
  if (e && d > e) return false;
  return true;
}

async function ensurePMCGuardForSubmit(
  projectId: string,
  plannedDateISO?: string | null
): Promise<boolean> {
  const onDate = plannedDateISO && /^\d{4}-\d{2}-\d{2}$/.test(plannedDateISO) ? plannedDateISO : todayISO();
  const roles = await resolvePmcActingRolesForProjectOnDate(projectId, onDate);
  if (!roles.length) {
    alert(
      `Cannot submit: No active PMC assignment found for this project on ${fmtLocalDateOnly(
        onDate
      )}.\n\nAsk Admin to assign a PMC covering the IR date.`
    );
    return false;
  }
  const list = roles.map((r) => `${displayNameLite(r.user)} — ${r.role}`).join("\n");
  return window.confirm(`Eligible on ${fmtLocalDateOnly(onDate)}:\n${list}\n\nProceed with submit?`);
}

/* ========================= Format helpers ========================= */
/* ===== Requirement / Tolerance formatter (base ± tol with units) ===== */
function numOrNull(x: any): number | null {
  if (x === null || x === undefined || x === "") return null;
  const v = Number(String(x).replace(/[^\d.+-eE]/g, ""));
  return Number.isFinite(v) ? v : null;
}
function fix(n: number, dp = 3) {
  return n.toFixed(dp);
}

const isIsoLike = (v: any) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v);
const fmtDate = (v: any) => (isIsoLike(v) ? new Date(v).toLocaleDateString() : v ?? "");
const fmtDateTime = (v: any) => (isIsoLike(v) ? new Date(v).toLocaleString() : v ?? "");
const DISCIPLINES = ["Civil", "MEP", "Finishes"] as const;

/* ========================= Types (UI-lean) ========================= */
type WIRProps = {
  hideTopHeader?: boolean;
  onBackOverride?: () => void;
};

type WirItem = {
  id: string;
  name: string;
  spec?: string | null;
  required?: string | null;
  tolerance?: string | null;
  photoCount?: number | null;
  status?: string | null;
};

type WirRecord = {
  wirId: string;
  code?: string | null;
  title: string;
  projectId: string;
  projectCode?: string | null;
  projectTitle?: string | null;
  bicName?: string | null;

  status?: string | null; // Draft | Submitted | Recommended | Approved | Rejected
  health?: string | null; // Green | Amber | Red | Unknown

  discipline?: string | null;
  stage?: string | null;

  forDate?: string | null;
  forTime?: string | null;

  cityTown?: string | null;
  stateName?: string | null;

  contractorName?: string | null;
  inspectorName?: string | null;
  hodName?: string | null;
  /** Author (creator) id for draft-visibility rules */
  authorId?: string | null;

  items?: WirItem[];
  description?: string | null;
  updatedAt?: string | null;

  wasRescheduled?: boolean;     // derived boolean
  lastRescheduledAt?: string | null; // optional display/tooltip

  // Carry runner state from backend so Runner effect can hydrate
  runnerInspector?: {
    items?: any[];                  // { itemId, checklistItemId, status, measurement, remark, ... }
    overallRecommendation?: "APPROVE" | "APPROVE_WITH_COMMENTS" | "REJECT" | null;
  } | null;

  runnerHod?: {
    items?: any[];                  // { itemId, checklistItemId, hodRemark, hodLastSavedAt, ... }
    overallOutcome?: "ACCEPT" | "RETURN" | "REJECT" | null;
    overallNotes?: string | null;
  } | null;
};

type FetchState = {
  list: WirRecord[];
  loading: boolean;
  error: string | null;
};

type NewWirForm = {
  projectCode?: string | null;
  projectTitle?: string | null;
  activityType?: "Standard" | "Custom";
  customActivityText?: string;
  activityId?: string | null;
  activityLabel?: string | null;
  discipline?: string | null;
  dateISO: string; // yyyy-mm-dd
  time12h: string; // HH:MM AM/PM
  location?: string | null;
  details?: string;
  inspectorUserId?: string | null;
  hodUserId?: string | null;

  // attachments
  drawingFiles: File[];
  itpFiles: File[];
  otherDocs: File[];
  photos: File[];
  materialApprovalFiles: File[];
  safetyClearanceFiles: File[];

  // checklists
  pickedChecklistIds: string[];
  pickedComplianceIds: string[];
};

type ActivityLite = {
  id: string;
  code?: string | null;
  title?: string | null;
  discipline?: string | null;
  status?: string | null;
};
type ActivityState = { rows: ActivityLite[]; loading: boolean; error: string | null };

type ChecklistLite = {
  id: string;
  code?: string | null;
  title?: string | null;
  discipline?: string | null;
  status?: string | null;
  aiDefault?: boolean | null;
};
type ChecklistState = { rows: ChecklistLite[]; loading: boolean; error: string | null };

/* ========================= tiny safe GET with timeout ========================= */
async function apiGetSafe<T = any>(
  url: string,
  { params, timeoutMs = 12000 }: { params?: any; timeoutMs?: number } = {}
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await api.get(url, { params, signal: controller.signal });
    return res.data as T;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDiscussion(
  pid: string,
  wid: string
): Promise<DiscussionMsg[]> {
  const data = await apiListWirDiscussions(pid, wid);
  // Support plain array or wrapped { items / rows }
  const arr: any[] = Array.isArray(data)
    ? data
    : data?.items || data?.rows || [];

  const msgs: DiscussionMsg[] = arr.map((r: any) => {
    const createdAt =
      r.createdAt || r.created_at || r.created_on || new Date().toISOString();

    // Try to resolve authorName from denormalized field or related `author`
    const authorName =
      r.authorName ??
      (r.author
        ? `${r.author.firstName ?? ""} ${r.author.lastName ?? ""}`.trim() ||
        undefined
        : undefined);

    // ---- ATTACHMENTS MAPPING (robust to different backend shapes) ----
    let fileUrl: string | null =
      r.fileUrl ??
      r.fileURL ??
      r.attachmentUrl ??
      r.attachmentURL ??
      null;

    let fileName: string | null =
      r.fileName ??
      r.filename ??
      r.attachmentName ??
      r.attachmentFilename ??
      null;

    // If not flat fields, try array/object forms like { attachments: [...] } or { files: [...] }
    if (!fileUrl) {
      const filesArr: any[] = Array.isArray(r.attachments)
        ? r.attachments
        : Array.isArray(r.files)
          ? r.files
          : [];

      if (filesArr.length > 0) {
        const f = filesArr[0] || {};
        fileUrl =
          f.url ??
          f.downloadUrl ??
          f.href ??
          f.fileUrl ??
          null;
        fileName =
          fileName ??
          f.name ??
          f.fileName ??
          f.filename ??
          null;
      }
    }

    return {
      id: String(r.id ?? ""),
      wirId: String(r.wirId ?? wid),
      authorId: String(r.authorId ?? ""),
      authorName,
      // use `body` as the actual message text, with fallbacks
      notes: String(
        r.body ?? // Prisma column
        r.notes ?? // in case controller renamed it
        r.message ??
        ""
      ),
      createdAt: String(createdAt),
      fileUrl: fileUrl || undefined,
      fileName: fileName || undefined,
    };
  });

  // Oldest first (if you want latest first, reverse this sort)
  msgs.sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return msgs;
}

/** POST comment + optional file.
 *  NOTE: backend currently accepts JSON body only; payload.file is ignored for now.
 */
async function postDiscussion(
  pid: string,
  wid: string,
  payload: DiscussionPayload
): Promise<DiscussionMsg> {
  const data = await apiPostWirDiscussionMessage(pid, wid, {
    body: payload.notes,   // matches Prisma column
    notes: payload.notes,  // in case controller uses `notes`
    authorId: payload.authorId,
  });

  const createdAt =
    data?.createdAt || data?.created_at || data?.created_on || new Date().toISOString();

  const authorName =
    data?.authorName ??
    (data?.author
      ? `${data.author.firstName ?? ""} ${data.author.lastName ?? ""}`.trim() ||
      undefined
      : undefined);

  const fileUrl =
    data?.fileUrl ??
    data?.attachmentUrl ??
    null;

  const fileName =
    data?.fileName ??
    data?.attachmentName ??
    null;

  return {
    id: String(data?.id ?? data?.commentId ?? crypto.randomUUID()),
    wirId: String(wid),
    authorId: String(data?.authorId ?? payload.authorId),
    authorName,
    notes: String(
      data?.body ??       // Prisma column
      data?.notes ??    // if controller remaps to notes
      data?.message ??  // older shapes
      payload.notes
    ),
    createdAt: String(createdAt),
    fileUrl,
    fileName,
  };
}

// --- Checklist items-count cache ---
type ChecklistCountMap = Record<string, number>;

function extractChecklistIds(w: WirRecord): string[] {
  const raw = w.items || [];
  // Accept: {name:id}, {code:id}, {checklistId:id}, or raw string in name/title
  const ids = raw.map((it: any) => {
    const c1 = it?.checklistId ?? it?.name ?? it?.code ?? it?.id ?? it?.title;
    return c1 != null ? String(c1).trim() : "";
  }).filter(Boolean);

  // If server ever sends a 'selectedChecklistIds' array, merge that too (defensive).
  const extra = Array.isArray((w as any)?.selectedChecklistIds)
    ? (w as any).selectedChecklistIds.map((z: any) => String(z).trim()).filter(Boolean)
    : [];

  return Array.from(new Set([...ids, ...extra]));
}

/* ========================= UI Atoms ========================= */
/** KPI-style pill (value-only, bold) */
/** KPI-style pill (value-only, bold; optional label prefix for BIC) */
function KpiPill({
  value,
  tone = "neutral",
  prefix, // e.g., "BIC"
}: {
  value?: string | null;
  tone?: "neutral" | "amber" | "emerald" | "rose" | "blue" | "gray" | "indigo";
  prefix?: string;
}) {
  const v = (value || "").toString().trim();
  if (!v) return null;

  const toneCls: Record<string, string> = {
    neutral: "border dark:border-neutral-800 bg-white dark:bg-neutral-900",
    amber:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    emerald:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    rose:
      "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
    blue:
      "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    gray:
      "border dark:border-neutral-800 bg-gray-50 text-gray-800 dark:bg-neutral-900 dark:text-gray-200",
    indigo:
      "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  };

  return (
    <span
      className={`inline-flex items-center text-xs px-2 py-1 rounded-lg leading-tight align-middle shrink-0 ${toneCls[tone] || toneCls.neutral}`}
    >      {prefix ? <span className="opacity-80 mr-1">{prefix}:</span> : null}
      <b>{v}</b>
    </span>
  );
}

/** Map domain values to KPI tones */
function toneForStatus(s?: string | null): Parameters<typeof KpiPill>[0]["tone"] {
  const k = (s || "").toLowerCase();
  if (k === "approved") return "emerald";
  if (k === "rejected") return "rose";
  if (k === "submitted" || k === "recommended") return "amber"; // pending-like
  if (k === "draft") return "gray";
  return "neutral";
}
function toneForTransmission(t?: string | null): Parameters<typeof KpiPill>[0]["tone"] {
  const k = (t || "").toLowerCase();
  if (k.includes("public")) return "emerald";
  if (k.includes("internal")) return "indigo";
  if (k.includes("restrict") || k.includes("private")) return "rose";
  return "neutral";
}

function SectionCard({ title, children }: { title: string; children: any }) {
  return (
    <div className="bg-gray-50/60 dark:bg-neutral-900 rounded-xl border dark:border-neutral-800 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-3">
        {title}
      </div>
      {children}
    </div>
  );
}

function FieldRow({ label, value, wide = false }: { label: string; value?: any; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-0.5 font-medium dark:text-white break-words">{value || "—"}</div>
    </div>
  );
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nowTime12h() {
  const d = new Date();
  let hh = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, "0");
  const am = hh < 12;
  hh = hh % 12 || 12;
  return `${String(hh).padStart(2, "0")}:${mm} ${am ? "AM" : "PM"}`;
}

/* ====== Time helpers for custom picker ====== */
function parseTime12h(s: string) {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  let h = 12,
    mm = 0,
    ap: "AM" | "PM" = "AM";
  if (m) {
    h = Math.min(12, Math.max(1, parseInt(m[1], 10) || 12));
    mm = Math.min(59, Math.max(0, parseInt(m[2], 10) || 0));
    ap = m[3].toUpperCase() === "PM" ? "PM" : "AM";
  }
  return { hour: h, minute: mm, ampm: ap };
}
function fmtTime12h(h: number, m: number, ap: "AM" | "PM") {
  const hh = String(Math.min(12, Math.max(1, h))).padStart(2, "0");
  const mm = String(Math.min(59, Math.max(0, m))).padStart(2, "0");
  return `${hh}:${mm} ${ap}`;
}

// ---- File name helpers ----
function listFileNames(arr?: File[] | null, max = 3) {
  const files = Array.isArray(arr) ? arr : [];
  const names = files.map((f) => f?.name || "").filter(Boolean);
  const shown = names.slice(0, max);
  const extra = Math.max(0, names.length - shown.length);
  return { shown, extra, total: names.length };
}

/* ========================= Runner helpers/pills ========================= */
function DotSep({ left, right }: { left?: string | null; right?: string | null }) {
  const a = (left || "").toString().trim();
  const b = (right || "").toString().trim();
  return (
    <div className="text-xs text-gray-600 dark:text-gray-300">
      {[a || "—", b || "—"].filter(Boolean).join(" • ")}
    </div>
  );
}

function requiredToLabel(v: any): "Mandatory" | "Optional" | "—" {
  const s = (v ?? "").toString().trim().toLowerCase();
  if (v === true || s === "mandatory" || s === "yes" || s === "y" || s === "true") return "Mandatory";
  if (v === false || s === "optional" || s === "no" || s === "n" || s === "false") return "Optional";
  return "—";
}

export type WirHistoryRow = {
  sNo: number;
  id: string;
  date: string;
  action: string;
  by?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  notes?: string | null;
};

// --- Discussion types (aligned with Prisma WirDiscussion) ---
type DiscussionMsg = {
  id: string;
  wirId: string;
  authorId: string;
  authorName?: string | null;
  notes: string;         // UI-friendly name, maps from backend `body`
  createdAt: string;
  fileUrl?: string | null;   // optional attachment URL
  fileName?: string | null;  // optional attachment display name
};

type DiscussionPayload = {
  authorId: string;
  notes: string;
  file?: File | null;        // optional file; currently ignored by backend
};

async function fetchWirHistory(pid: string, wid: string): Promise<WirHistoryRow[]> {
  const data = await apiGetWirHistory(pid, wid);
  const rows: WirHistoryRow[] = (Array.isArray(data) ? data : []).map((r: any) => ({
    sNo: Number(r.sNo ?? 0),
    id: String(r.id ?? ""),
    date: r.date ? String(r.date) : "",
    action: r.action ? String(r.action) : "",
    by: r.by ?? null,
    fromStatus: r.fromStatus ?? null,
    toStatus: r.toStatus ?? null,
    notes: r.notes ?? null,
  }));
  return rows;
}

/* ========================= Main Component ========================= */
export default function WIR_Contractor({ hideTopHeader, onBackOverride }: WIRProps) {
  const { projectId = "" } = useParams<{ projectId: string }>();
  const location = useLocation();
  const navState = (location.state as any) || {};
  const navigate = useNavigate();

  // prefer role from JWT claims; then navState; then useAuth fallbacks
  const { user, claims } = useAuth();
  const claimsFromJwt = getClaims() || {};
  const passedRole = normalizeRole(navState?.role);
  const role =
    passedRole ||
    normalizeRole(
      claimsFromJwt?.role ??
      claimsFromJwt?.userRole ??
      claimsFromJwt?.roleName ??
      (user as any)?.role ??
      (claims as any)?.role ??
      (claims as any)?.userRole ??
      (claims as any)?.roleName ??
      ""
    );
  const [currentUserId, setCurrentUserId] = useState<string | null>(() =>
    resolveUserIdFrom(claimsFromJwt, user)
  );

  // Author-only deletion guard (Draft + author + Contractor)
  const canDeleteFromList = (w: WirRecord) =>
    String(w?.status || '').toLowerCase() === 'draft' &&
    String(w?.authorId || '') === String(currentUserId || '') &&
    normalizeRole(role) === 'Contractor';

  const [clCounts, setClCounts] = useState<ChecklistCountMap>({});
  const [clCountsLoading, setClCountsLoading] = useState(false);


  // refresh when auth context or token changes
  useEffect(() => {
    setCurrentUserId(resolveUserIdFrom(getClaims() || {}, user));
  }, [user, claims]); // claims comes from useAuth()

  // also pick up token rotations across tabs in the same profile
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "token") {
        setCurrentUserId(resolveUserIdFrom(getClaims() || {}, user));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [user]);
  const roleKey = (role || "Client") as RoleKey;

  // project label from state for immediate header info
  const passedProject = navState?.project as
    | { projectId?: string; code?: string | null; title?: string | null }
    | undefined;

  const [q, setQ] = useState("");
  const [state, setState] = useState<FetchState>({ list: [], loading: true, error: null });
  const [view, setView] = useState<"list" | "new">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [canRaise, setCanRaise] = useState<boolean>(false);
  const [transmissionType, setTransmissionType] = useState<string | null>(null);

  // Read-only Runner expansion
  const [runnerItems, setRunnerItems] = useState<RunnerCardItem[]>([]);
  const [runnerLoading, setRunnerLoading] = useState(false);
  const [runnerError, setRunnerError] = useState<string | null>(null);

  // local, controlled edit buffers for the tiles
  const [runnerInspectorEdits, setRunnerInspectorEdits] = useState<Record<string, {
    status: 'PASS' | 'FAIL' | null;
    measurement: string | null;
    remark: string | null;
  }>>({});

  const [runnerHodEdits, setRunnerHodEdits] = useState<Record<string, {
    hodRemark: string | null;
  }>>({});

  // === [Runner_1] === Types and Constants
  // Inspector tile local state (per checklist item in Runner)
  type InspectorRunnerState = {
    status: "PASS" | "FAIL" | null;
    measurement: string;
    remark: string;
    photos: File[];
  };

  // === [Runner_2] === State: inspectorState, inspectorRecommendation
  const [inspectorState, setInspectorState] = useState<
    Record<string, InspectorRunnerState>
  >({});

  // HOD tile local state (per checklist item in Runner)
  type HodRunnerState = {
    remark: string;
    lastSavedAt?: string;
  };

  const [hodState, setHodState] = useState<Record<string, HodRunnerState>>({});

  const getHodState = (itemId: string): HodRunnerState => {
    return (
      hodState[itemId] || {
        remark: "",
        lastSavedAt: undefined,
      }
    );
  };


  const updateHodState = (itemId: string, patch: Partial<HodRunnerState>) => {
    setHodState((prev) => {
      const current: HodRunnerState =
        prev[itemId] || {
          remark: "",
          lastSavedAt: undefined,
        };
      return {
        ...prev,
        [itemId]: { ...current, ...patch },
      };
    });
  };

  const handleHodRemarkChange =
    (itemId: string) =>
      (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
        updateHodState(itemId, { remark: e.target.value });
      };

  const handleHodSave = (itemId: string) => async () => {
    if (!selected) return;

    const st = getHodState(itemId);
    const trimmed = (st.remark || "").trim();
    if (!trimmed) {
      alert("Please add a HOD remark before saving.");
      return;
    }

    // Find the runner row and get its WIR row id (wid)
    const row = runnerItems.find((r) => String(r.id) === String(itemId)) || null;
    const wid = row?.wid ? String(row.wid) : null;

    if (!wid) {
      // No WIR row yet => cannot save against this item
      alert(
        "This checklist item is not yet part of the WIR (no WIR row id). " +
        "Ask the Contractor/Inspector to open Runner and Save once so rows are created, then try again."
      );
      return;
    }

    const ts = new Date().toISOString();
    updateHodState(itemId, { lastSavedAt: ts });

    // Send ONLY itemId = wid (DB id)
    const payload: any = {
      items: [
        {
          itemId: wid,
          hodRemark: trimmed,  // keep `hodRemark`; most DTOs accept this
          remark: trimmed,     // extra compatibility (harmless duplicate)
        },
      ],
    };

    try {
      await saveWirRunnerHod(projectId, selected.wirId, payload);
      alert("HOD remark saved.");
    } catch (e: any) {
      const data = e?.response?.data;
      const msg = Array.isArray(data?.message)
        ? data.message.join("\n")
        : data?.message || data?.error || e?.message || "Failed to save HOD remark";
      console.error("[WIR] HOD save failed", { status: e?.response?.status, data, payload });
      alert(msg);
    }
    console.log("[SAVE] HOD remark save triggered", {
      user: user,
      projectId,
      wirId: selected?.wirId,
      itemId,
    });
  };

  type InspectorRecommendationChoice =
    | "APPROVE"
    | "APPROVE_WITH_COMMENTS"
    | "REJECT";

  const OVERALL_REC_KEY = "__overall__"; // Overall Inspector recommendation

  const [inspectorRecommendation, setInspectorRecommendation] = useState<
    Record<string, InspectorRecommendationChoice | null>
  >({});

  const [inspectorSaving, setInspectorSaving] = useState(false);


  // Label helper for inspector recommendation (overall)
  const inspectorRecLabel = (
    choice: InspectorRecommendationChoice | null
  ): string => {
    if (!choice) return "Not yet given";
    if (choice === "APPROVE") return "Approve";
    if (choice === "APPROVE_WITH_COMMENTS") return "Approve with Comments";
    if (choice === "REJECT") return "Reject";
    return "Not yet given";
  };

  type InspectorSavePayload = {
    items: {
      itemId: string;
      status: "PASS" | "FAIL" | null;
      measurement: string | null;
      remark: string | null;
    }[];
    overallRecommendation?: "APPROVE" | "APPROVE_WITH_COMMENTS" | "REJECT" | null;
  };

  // === [Runner_4] === Function: persistInspectorData()
  // Actually sends payload to backend
  const persistInspectorData = async (mode: "save" | "preview" | "sendToHod") => {
    if (!projectId || !selected) {
      alert("Project / WIR context missing; cannot save Inspector data.");
      return;
    }
    const raw = {
      items: (
        (selected?.runnerInspector?.items || [])
          .map((ri) => {
            const st = inspectorState[ri.itemId] || {};
            const measurement =
              typeof st.measurement === "number"
                ? String(st.measurement)
                : (st.measurement || "").trim();
            const remark = (st.remark || "").trim();
            const status = st.status ?? null;

            const hasAny =
              Boolean(measurement) || Boolean(remark) || status !== null;
            if (!hasAny) return undefined;

            return {
              itemId: ri.itemId as string,
              status,
              measurement: measurement || null,
              remark: remark || null,
            };
          })
          .filter((x): x is {
            itemId: string;
            status: "PASS" | "FAIL" | null;
            measurement: string | null;
            remark: string | null;
          } => Boolean(x))
      ),
      overallRecommendation:
        inspectorRecommendation[OVERALL_REC_KEY] ?? null,
    };

    try {
      setInspectorSaving(true);
      console.log("[SAVE] Inspector payload to backend:", {
        wirId: selected?.wirId,
        raw,
      });
      await saveWirRunnerInspector(projectId, selected.wirId, raw);
      log("Inspector runner saved", { wirId: selected.wirId, mode, raw });

      if (mode === "save") {
        alert("Inspector data saved.");
      } else if (mode === "preview") {
        alert("Inspector data saved. Preview can use this saved data.");
      } else if (mode === "sendToHod") {
        alert("Inspector data saved and marked ready for HOD.");
      }
    } catch (e: any) {
      // ---- Precise error reporting ----
      const resp = e?.response;
      const data = resp?.data;

      // Common NestJS error shapes:
      // { statusCode, message: string|string[], error }
      // or your service might return { error: "...", details: {...} }
      let msg = "Failed to save Inspector data";
      if (Array.isArray(data?.message)) {
        msg = data.message.join("\n");
      } else if (typeof data?.message === "string") {
        msg = data.message;
      } else if (typeof data?.error === "string") {
        msg = data.error;
      } else if (typeof e?.message === "string") {
        msg = e.message;
      }

      alert(msg);

      // Log full context for dev console
      console.error("[WIR] Inspector runner save failed", {
        status: resp?.status,
        statusText: resp?.statusText,
        url: resp?.config?.url,
        raw,
        data
      });
    } finally {
      setInspectorSaving(false);
    }
    console.log("[SAVE] Logged-in user info:", role);
    console.log("[SAVE] Role (inspector/hod?) should influence view/save logic");
  };

  // Overall HOD finalize modal state
  type HodOutcome = "ACCEPT" | "RETURN" | "REJECT";

  const [hodFinalizeOpen, setHodFinalizeOpen] = useState(false);
  const [hodOutcome, setHodOutcome] = useState<HodOutcome | null>(null);
  const [hodNotesText, setHodNotesText] = useState("");

  const getInspectorRecommendation = (
    itemId: string
  ): InspectorRecommendationChoice | null => {
    return inspectorRecommendation[itemId] ?? null;
  };

  const updateInspectorRecommendation = (
    itemId: string,
    value: InspectorRecommendationChoice | null
  ) => {
    setInspectorRecommendation((prev) => ({
      ...prev,
      [itemId]: value,
    }));
  };

  const getInspectorState = (itemId: string): InspectorRunnerState => {
    return (
      inspectorState[itemId] || {
        status: null,
        measurement: "",
        remark: "",
        photos: [],
      }
    );
  };

  const updateInspectorState = (
    itemId: string,
    patch: Partial<InspectorRunnerState>
  ) => {
    setInspectorState((prev) => {
      const current = prev[itemId] || {
        status: null as "PASS" | "FAIL" | null,
        measurement: "",
        remark: "",
        photos: [] as File[],
      };
      return {
        ...prev,
        [itemId]: { ...current, ...patch },
      };
    });
  };

  const handleInspectorPhotoChange =
    (itemId: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      const current = getInspectorState(itemId);
      updateInspectorState(itemId, {
        photos: [...current.photos, ...files],
      });
    };

  const handleInspectorMark =
    (itemId: string, status: "PASS" | "FAIL") =>
      () => {
        const current = getInspectorState(itemId);
        // Clicking again will toggle off
        const nextStatus = current.status === status ? null : status;
        updateInspectorState(itemId, { status: nextStatus });
      };

  const handleInspectorRemarkChange =
    (itemId: string) =>
      (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
        updateInspectorState(itemId, { remark: e.target.value });
      };

  const handleInspectorMeasurementChange =
    (itemId: string) =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        updateInspectorState(itemId, { measurement: e.target.value });
      };

  // fetch "transmission type" from Module Settings (project row or module default)
  async function fetchTransmissionType(pid: string): Promise<string | null> {
    if (!pid) return null;
    try {
      // ask adminModuleSettings for this project's WIR settings;
      // backend should return merged-with-defaults when no project row exists
      const raw = await getModuleSettings(pid, MODULE_CODE as any);
      const norm = normalizeSettings(raw || undefined);
      const tx = norm?.extra?.transmissionType;
      return tx ? String(tx) : null;
    } catch {
      return null;
    }
  }

  // Pre-fill project chips in Create view from navigation state
  const [newForm, setNewForm] = useState<NewWirForm>({
    activityType: "Standard", // explicit default so logic is stable
    projectCode: passedProject?.code ?? null,
    projectTitle: passedProject?.title ?? null,
    activityId: null,
    activityLabel: null,
    discipline: null,
    inspectorUserId: null,
    hodUserId: null,
    dateISO: todayISO(),
    time12h: nowTime12h(),
    location: "",
    details: "",
    drawingFiles: [],
    itpFiles: [],
    otherDocs: [],
    photos: [],
    materialApprovalFiles: [],
    safetyClearanceFiles: [],
    pickedChecklistIds: [],
    pickedComplianceIds: [],
  });

  async function fetchChecklistCountOnce(id: string): Promise<number> {
    try {
      const meta: RefChecklistMeta | null = await getRefChecklistMeta(id);
      const cnt = Number(meta?.itemsCount ?? 0);
      setClCounts(prev => (prev[id] == null ? { ...prev, [id]: cnt } : prev));
      return cnt;
    } catch {
      setClCounts(prev => (prev[id] == null ? { ...prev, [id]: 0 } : prev));
      return 0;
    }
  }

  async function warmChecklistCounts(rows: WirRecord[]) {
    const ids = new Set<string>();
    for (const w of rows) extractChecklistIds(w).forEach(id => ids.add(id));
    const missing = Array.from(ids).filter(id => clCounts[id] == null);
    if (!missing.length) return;

    setClCountsLoading(true);
    try {
      await Promise.all(missing.map(id => fetchChecklistCountOnce(id)));
    } finally {
      setClCountsLoading(false);
    }
  }

  function totalItemsForWir(w: WirRecord): number {
    return extractChecklistIds(w).reduce((sum, id) => sum + (clCounts[id] ?? 0), 0);
  }

  const [activities, setActivities] = useState<ActivityState>({ rows: [], loading: false, error: null });
  const [checklists, setChecklists] = useState<ChecklistState>({ rows: [], loading: false, error: null });

  const loadActivities = async () => {
    setActivities((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await apiGetSafe("/admin/ref/activities", {
        params: { status: "Active", page: 1, pageSize: 200 },
      });

      const raw: any[] = (Array.isArray(data)
        ? data
        : Array.isArray((data as any)?.items)
          ? (data as any).items
          : Array.isArray((data as any)?.records)
            ? (data as any).records
            : Array.isArray((data as any)?.activities)
              ? (data as any).activities
              : []) as any[];

      const rows: ActivityLite[] = raw
        .map((x: any) => ({
          id: String(x.id ?? x.activityId ?? x.code ?? x.slug ?? ""),
          code: x.code ?? null,
          title: x.title ?? x.name ?? null,
          discipline: x.discipline ?? null,
          status: x.status ?? null,
        }))
        .filter((a) => a.id);

      setActivities({ rows, loading: false, error: null });
    } catch (e: any) {
      setActivities({
        rows: [],
        loading: false,
        error:
          e?.name === "CanceledError" || e?.message?.includes("aborted")
            ? "Timed out. Click Reload."
            : e?.response?.data?.error || e?.message || "Failed to load activities",
      });
    }
  };

  const loadChecklists = async () => {
    setChecklists((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await apiGetSafe("/admin/ref/checklists", {
        params: { status: "Active", page: 1, pageSize: 200, discipline: newForm.discipline || undefined },
      });

      const raw: any[] = (Array.isArray(data)
        ? data
        : Array.isArray((data as any)?.items)
          ? (data as any).items
          : Array.isArray((data as any)?.records)
            ? (data as any).records
            : Array.isArray((data as any)?.checklists)
              ? (data as any).checklists
              : []) as any[];

      const rows: ChecklistLite[] = raw
        .map((x: any) => ({
          id: String(x.id ?? x.checklistId ?? x.code ?? x.slug ?? ""),
          code: x.code ?? null,
          title: x.title ?? x.name ?? null,
          discipline: x.discipline ?? null,
          status: x.status ?? null,
          aiDefault: x.aiDefault ?? null,
        }))
        .filter((c) => c.id);

      setChecklists({ rows, loading: false, error: null });
    } catch (e: any) {
      setChecklists({
        rows: [],
        loading: false,
        error:
          e?.name === "CanceledError" || e?.message?.includes("aborted")
            ? "Timed out. Click Reload."
            : e?.response?.data?.error || e?.message || "Failed to load checklists",
      });
    }
  };

  // Picker modal state
  const [clLibOpen, setClLibOpen] = useState(false);
  const [clQuery, setClQuery] = useState("");
  const [clPicked, setClPicked] = useState<Set<string>>(new Set());
  const [roViewOpen, setRoViewOpen] = useState(false);
  const [roTab, setRoTab] = useState<'document' | 'discussion'>('document');
  const [docTab, setDocTab] = useState<'overview' | 'runner'>('overview');

  const [discMsgs, setDiscMsgs] = useState<DiscussionMsg[]>([]);
  const [discLoading, setDiscLoading] = useState(false);
  const [discError, setDiscError] = useState<string | null>(null);
  const [userNameById, setUserNameById] = useState<Record<string, string>>({});

  // composer
  const [discText, setDiscText] = useState("");
  const [discFile, setDiscFile] = useState<File | null>(null); // either file OR camera photo

  type ViewMode = "create" | "edit" | "readonly";
  const [mode, setMode] = useState<ViewMode>("create");
  const isRO = mode === "readonly";

  // === Dispatch modal state ===
  type DispatchCandidate = UserLite & {
    companyName?: string | null;
    displayPhone?: string | null;
    acting?: "Inspector" | "Inspector+HOD" | "HOD";
  };
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dispatchWirId, setDispatchWirId] = useState<string | null>(null);
  const [dispatchPick, setDispatchPick] = useState<string | null>(null);
  const [dispatchSearch, setDispatchSearch] = useState("");
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchErr, setDispatchErr] = useState<string | null>(null);
  const [dispatchCandidates, setDispatchCandidates] = useState<DispatchCandidate[]>([]);
  const [dispatchDateISO, setDispatchDateISO] = useState<string>(todayISO());

  // load Inspector suggestions for a given date (Inspector / Inspector+HOD)
  async function loadInspectorSuggestions(pid: string, onDateISO: string) {
    setDispatchLoading(true);
    setDispatchErr(null);
    try {
      const roles = await resolvePmcActingRolesForProjectOnDate(pid, onDateISO); // returns ActingPmc[]
      const insp = roles.filter((r) => r.role === "Inspector" || r.role === "Inspector+HOD");
      const uniq = new Map<string, DispatchCandidate>();
      for (const r of insp) {
        const u = r.user;
        uniq.set(String(u.userId), {
          ...u,
          companyName: getCompanyNameForProjectPMC(u, pid),
          displayPhone: displayPhone(u),
          acting: r.role as any,
        });
      }
      setDispatchCandidates(Array.from(uniq.values()));
    } catch (e: any) {
      setDispatchErr(e?.message || "Failed to load suggestions");
      setDispatchCandidates([]);
    } finally {
      setDispatchLoading(false);
    }
  }

  function roleLabelFromActing(a?: "Inspector" | "Inspector+HOD" | "HOD" | null) {
    if (a === "Inspector+HOD") return "Both";
    if (a === "HOD") return "HOD";
    return "Inspector";
  }

  async function onDispatchSend() {
    if (!dispatchWirId) return;
    if (!dispatchPick) {
      alert("Please pick a recipient (Inspector).");
      return;
    }

    // Guard: only Contractors can submit a Draft
    if (normalizeRole(role) !== "Contractor") {
      alert("Only Contractors can submit a WIR. Open this IR as Contractor (author).");
      return;
    }

    // Identify the chosen inspector (for nice confirm + optimistic BIC)
    const candidate = dispatchCandidates.find(u => String(u.userId) === String(dispatchPick)) || null;
    const wirMeta = state.list.find(w => String(w.wirId) === String(dispatchWirId)) || null;
    const wirCodeTitle = [wirMeta?.code, wirMeta?.title || "Inspection Request"].filter(Boolean).join(" ");
    const ok = window.confirm(
      `Send ${wirCodeTitle} to ${candidate ? displayNameLite(candidate) : "selected inspector"}?`
    );
    if (!ok) return;

    try {
      // A) Figure out the auto HOD for this date
      const hodUser = await resolveAutoHodForDate(projectId, dispatchDateISO || newForm.dateISO || todayISO());
      const hodId = hodUser ? String(hodUser.userId) : null;

      // B) Figure out the contractor = author of WIR (fallback to current user)
      const authorIdRaw =
        wirMeta?.authorId ??
        (await (async () => {
          try {
            const full = await loadWir(projectId, dispatchWirId);
            return full?.authorId ?? full?.createdBy?.userId ?? full?.author?.userId ?? null;
          } catch {
            return null;
          }
        })());
      const contractorId = String(authorIdRaw || currentUserId || getUserIdFromToken() || "");

      // C) Persist all participants on the draft BEFORE submit
      await apiUpdateWir(projectId, dispatchWirId, {
        inspectorId: dispatchPick,
        hodId: hodId || null,           // ← assign HOD irrespective of pick
        contractorId: contractorId || null // ← assign contractor = author
      });

      // D) Submit (status → Submitted; server sets BIC)
      await apiSubmitWir(projectId, dispatchWirId, { role: "Contractor" });

      // E) Optimistic UI for BIC chip
      if (candidate) {
        const bicNameNow = displayNameLite(candidate);
        setState(s => ({
          ...s,
          list: s.list.map(w => (String(w.wirId) === String(dispatchWirId) ? { ...w, bicName: bicNameNow } : w))
        }));
      }

      // Close + refresh
      setDispatchOpen(false);
      setDispatchWirId(null);
      setDispatchPick(null);
      resetNewForm();
      goToList(true);
    } catch (e: any) {
      const s = e?.response?.status;
      const msg = e?.response?.data?.error || e?.message || "Failed to dispatch";
      if (s === 403) {
        alert("Not allowed: Only the Contractor who authored this Draft can submit, and only while status is Draft.");
      } else {
        alert(`Error ${s ?? ""} ${msg}`);
      }
    }
  }

  async function onDiscussionSend() {
    if (!selected) return;
    const authorId = currentUserId || getUserIdFromToken();
    const notes = (discText || "").trim();

    if (!authorId) {
      alert("No userId found in token. Please re-login.");
      return;
    }
    if (!notes && !discFile) {
      alert("Write a note or attach a file.");
      return;
    }

    // optimistic placeholder
    const tempId = `temp-${Date.now()}`;
    const optimistic: DiscussionMsg = {
      id: tempId,
      wirId: selected.wirId,
      authorId: String(authorId),
      authorName: null,
      notes,
      fileUrl: null,
      createdAt: new Date().toISOString(),
    };
    setDiscMsgs((prev) => [optimistic, ...prev]);

    try {
      const saved = await postDiscussion(projectId, selected.wirId, {
        notes,
        authorId: String(authorId),
        file: discFile,
      });

      // swap optimistic with saved
      setDiscMsgs((prev) =>
        prev.map((m) => (m.id === tempId ? saved : m))
      );
      setDiscText("");
      setDiscFile(null);
    } catch (e: any) {
      // rollback optimistic
      setDiscMsgs((prev) => prev.filter((m) => m.id !== tempId));
      const s = e?.response?.status;
      const msg = e?.response?.data?.error || e?.message || "Failed to send comment";
      alert(`Error ${s ?? ""} ${msg}`);
    }
  }

  function openDispatchModal(wirId: string, onDateISO: string) {
    setDispatchWirId(wirId);
    setDispatchPick(null);
    setDispatchSearch("");
    setDispatchOpen(true);
    setDispatchDateISO(onDateISO || todayISO());
    loadInspectorSuggestions(projectId, onDateISO);
  }

  function joinWithDots(...parts: Array<string | null | undefined>) {
    return parts
      .map((p) => (p ?? "").toString().trim())
      .filter(Boolean)
      .join(" · ");
  }

  // Attachment “pills” (derived)
  const hasDrawing = newForm.drawingFiles.length > 0;
  const hasITP = newForm.itpFiles.length > 0;
  const hasOther = newForm.otherDocs.length > 0;
  const hasPhotos = newForm.photos.length > 0;
  const hasMA = newForm.materialApprovalFiles.length > 0;
  const hasSafety = newForm.safetyClearanceFiles.length > 0;

  // === [Runner_6] === Selector: selected WIR from list
  const selected = useMemo(
    () => state.list.find((w) => String(w.wirId) === String(selectedId)) || null,
    [state.list, selectedId]
  );

  console.log("[FETCH] Loaded WIR runner data:", {
    wirId: selected?.wirId,
    runnerInspector: selected?.runnerInspector,
    inspectorItems: selected?.runnerInspector?.items,
  });

  const checklistLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of checklists.rows) {
      const label = [c.code, c.title].filter(Boolean).join(": ");
      map.set(c.id, label || c.id);
    }
    return map;
  }, [checklists.rows]);

  const resetNewForm = () =>
    setNewForm({
      projectCode: passedProject?.code ?? null,
      projectTitle: passedProject?.title ?? null,
      activityId: null,
      activityLabel: null,
      activityType: "Standard",
      customActivityText: "",
      discipline: null,
      inspectorUserId: null,
      hodUserId: null,
      dateISO: todayISO(),
      time12h: nowTime12h(),
      location: "",
      details: "",
      drawingFiles: [],
      itpFiles: [],
      otherDocs: [],
      photos: [],
      materialApprovalFiles: [],
      safetyClearanceFiles: [],
      pickedChecklistIds: [],
      pickedComplianceIds: [],
    });

  const mapWirToForm = (x: any): NewWirForm => {
    const activityId = x?.activityId ?? null;
    const activityLabel =
      x?.activityLabel ??
      ([x?.activity?.code, x?.activity?.title].filter(Boolean).join(": ") || null);

    const inferredCustom = !activityId && (activityLabel || x?.title) ? "Custom" : "Standard";
    return {
      projectCode: x?.project?.code ?? passedProject?.code ?? null,
      projectTitle: x?.project?.title ?? passedProject?.title ?? null,
      activityId,
      activityLabel,
      activityType: inferredCustom, // NEW
      customActivityText: inferredCustom === "Custom" ? activityLabel || x?.title || "" : "",
      discipline: x?.discipline ?? null,
      dateISO: (x?.forDate && String(x.forDate).slice(0, 10)) || todayISO(),
      time12h: x?.forTime || nowTime12h(),
      location: x?.cityTown ?? "",
      details: x?.description ?? "",
      drawingFiles: [],
      itpFiles: [],
      otherDocs: [],
      photos: [],
      materialApprovalFiles: [],
      safetyClearanceFiles: [],
      pickedChecklistIds: Array.isArray(x?.items)
        ? x.items.map((it: any) => it?.name || it?.code || it?.id).filter(Boolean)
        : [],
      pickedComplianceIds: [],
    };
  };

  const loadWir = async (pid: string, wid: string) => {
    const data = await apiGetWir(pid, wid);

    //  Injected auto-initialize logic
    if ((data?.items?.length ?? 0) === 0) {
      const checklistId = data?.checklistId ?? data?.meta?.checklistId;
      if (checklistId) {
        log("Runner: No rows found, auto-initializing...");
        await api.post(`/projects/${pid}/wir/${wid}/runner/initialize`, {
          checklistId,
        });
        const updated = await apiGetWir(pid, wid); // re-fetch after init
        return updated;
      }
    }
    return data;
  };

  const goToList = (afterReload = true) => {
    const finish = () => {
      setSelectedId(null);
      setView("list");
      try {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch { }
    };
    if (afterReload) {
      reloadWirList().finally(finish);
    } else {
      finish();
    }
  };

  // ----- AUTH GATE + ensure Authorization header -----
  useEffect(() => {
    const token = getToken();
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }
    (api.defaults.headers.common as any).Authorization = `Bearer ${token}`;
  }, [navigate]);

  /* ========================= Load WIR list ========================= */
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await apiListWir(projectId);

        const arr: any[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.records)
            ? data.records
            : [];
        const list: WirRecord[] = arr.map((x) => ({
          wirId: x.wirId ?? x.id,
          code: x.code ?? x.irCode ?? null,
          title: x.title ?? x.name ?? "Inspection Request",
          projectId: x.projectId ?? projectId,
          projectCode: x.project?.code ?? null,
          projectTitle: x.project?.title ?? null,
          status: x.status ?? null,
          health: x.health ?? null,
          discipline: x.discipline ?? null,
          stage: x.stage ?? null,
          forDate: x.forDate ?? x.plannedDate ?? null,
          forTime: x.forTime ?? null,
          cityTown: x.cityTown ?? x.location?.cityTown ?? null,
          stateName:
            x.state?.name ?? (typeof x.state === "string" ? x.state : null),
          contractorName:
            x.contractor?.name ??
            x.participants?.contractor?.name ?? x.participants?.contractor ??
            x.contractorName ?? null,

          inspectorName:
            x.inspector?.name ??
            x.participants?.inspector?.name ?? x.participants?.inspector ??
            x.inspectorName ?? null,

          hodName:
            x.hod?.name ??
            x.participants?.hod?.name ?? x.participants?.hod ??
            x.hodName ?? null,

          bicName:
            x.participants?.bic?.name ?? x.bic?.name ?? x.bicName ?? null,
          authorId:
            x.authorId ??
            x.createdBy?.userId ??
            x.createdById ??
            x.author?.userId ??
            null,
          items: (x.items || []).map((it: any, i: number) => ({
            id: it.id ?? `it-${i}`,
            name: it.name ?? it.title ?? `Item ${i + 1}`,
            spec: it.spec ?? it.specification ?? null,
            required: it.required ?? it.requirement ?? null,
            tolerance: it.tolerance ?? null,
            photoCount:
              it.photoCount ?? (Array.isArray(it.photos) ? it.photos.length : null),
            status: it.status ?? null,
          })),
          description: x.description ?? x.notes ?? null,
          updatedAt: x.updatedAt ?? x.modifiedAt ?? x.createdAt ?? null,

          // NEW ↓ prefer direct flags/columns if backend sends them
          wasRescheduled:
            !!(
              x.rescheduledAt ||
              x.rescheduledById ||
              x.flags?.rescheduled === true ||
              (Array.isArray(x.history) && x.history.some((h: any) =>
                String(h?.action || "").toLowerCase().includes("resched")
              ))
            ),
        }));

        if (!cancelled) {
          setState({ list, loading: false, error: null });
          warmChecklistCounts(list);
        }
      } catch (e: any) {
        if (!cancelled)
          setState({
            list: [],
            loading: false,
            error: e?.response?.data?.error || e?.message || "Failed to load WIRs",
          });
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    if (!projectId) {
      setCanRaise(false);
      return;
    }
    (async () => {
      const ok = await fetchEffectiveRaisePermission(projectId, roleKey);
      if (!cancelled) setCanRaise(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, roleKey]);

  // fetch transmission type for both list and RO modal
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const tt = await fetchTransmissionType(projectId);
      if (!cancelled) setTransmissionType(tt);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const visibleActivities = useMemo(() => {
    if (!newForm.discipline) return activities.rows;
    return activities.rows.filter(
      (a) => (a.discipline || "").toLowerCase() === newForm.discipline!.toLowerCase()
    );
  }, [activities.rows, newForm.discipline]);

  const visibleChecklists = useMemo(() => {
    const disc = (newForm.discipline || "").toLowerCase();
    let rows = !disc ? checklists.rows : checklists.rows.filter((c) => (c.discipline || "").toLowerCase() === disc);
    const q = clQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) => {
      const hay = [c.code, c.title, c.discipline].map((v) => (v || "").toLowerCase());
      return hay.some((h) => h.includes(q));
    });
  }, [checklists.rows, newForm.discipline, clQuery]);

  //---------------- WIR History Types and States  ------------
  const [histOpen, setHistOpen] = useState(false);
  const [histLoading, setHistLoading] = useState(false);
  const [histError, setHistError] = useState<string | null>(null);
  const [histRows, setHistRows] = useState<WirHistoryRow[]>([]);

  // Read-only "Open Filled Form" modal
  const [filledOpen, setFilledOpen] = useState(false);
  const filledRef = useRef<HTMLDivElement>(null);

  // ===== Sort & Filter state (list-view only) =====
  type SortKey = "updatedDesc" | "dateAsc" | "dateDesc" | "status" | "code";
  const [sortKey, setSortKey] = useState<SortKey>("updatedDesc");

  const STATUS_OPTIONS = ["Draft", "Submitted", "Recommended", "Approved", "Rejected"] as const;
  type StatusKey = typeof STATUS_OPTIONS[number];

  const [filterOpen, setFilterOpen] = useState(false);
  const [fltStatuses, setFltStatuses] = useState<Set<StatusKey>>(new Set());
  const [fltDisciplines, setFltDisciplines] = useState<Set<string>>(new Set());
  const [fltDateFrom, setFltDateFrom] = useState<string>("");
  const [fltDateTo, setFltDateTo] = useState<string>("");

  function resetFilters() {
    setFltStatuses(new Set());
    setFltDisciplines(new Set());
    setFltDateFrom("");
    setFltDateTo("");
  }

  function inDateWindow(dateISO?: string | null, from?: string, to?: string) {
    if (!dateISO) return true;
    const d = Date.parse(String(dateISO));
    if (Number.isNaN(d)) return true;
    const t = new Date(d);
    if (from) {
      const f = new Date(from + "T00:00:00");
      if (t < f) return false;
    }
    if (to) {
      const e = new Date(to + "T23:59:59");
      if (t > e) return false;
    }
    return true;
  }

  /* ========================= Derived ========================= */
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();

    // base: text search
    let rows = state.list.filter((w) =>
      !needle
        ? true
        : [w.title, w.code, w.status, w.discipline, w.cityTown, w.stateName, w.contractorName, w.inspectorName, w.hodName, w.bicName]
          .map((s) => (s || "").toString().toLowerCase())
          .some((s) => s.includes(needle))
    );

    // filter: status
    if (fltStatuses.size) {
      rows = rows.filter((w) => fltStatuses.has((w.status || "Draft") as StatusKey));
    }

    // filter: discipline
    if (fltDisciplines.size) {
      rows = rows.filter((w) => {
        const d = (w.discipline || "").toString();
        return d && fltDisciplines.has(d);
      });
    }

    // filter: date window (forDate)
    rows = rows.filter((w) => inDateWindow(w.forDate || null, fltDateFrom || undefined, fltDateTo || undefined));

    // sort
    const normStatus = (s?: string | null) => (s || "").toString().toLowerCase();
    rows.sort((a, b) => {
      switch (sortKey) {
        case "dateAsc":
          return (Date.parse(a.forDate || "") || 0) - (Date.parse(b.forDate || "") || 0);
        case "dateDesc":
          return (Date.parse(b.forDate || "") || 0) - (Date.parse(a.forDate || "") || 0);
        case "status":
          return normStatus(a.status).localeCompare(normStatus(b.status));
        case "code":
          return (a.code || "").localeCompare(b.code || "");
        case "updatedDesc":
        default:
          return (Date.parse(b.updatedAt || "") || 0) - (Date.parse(a.updatedAt || "") || 0);
      }
    });

    return rows;
  }, [state.list, q, fltStatuses, fltDisciplines, fltDateFrom, fltDateTo, sortKey]);

  const pageHeading = useMemo(() => {
    if (mode === "edit" && selected) {
      const code = selected.code ? `${selected.code} — ` : "";
      const ttl = selected.title || newForm.activityLabel || "Inspection Request";
      return `${code}${ttl}`;
    }
    return "Work Inspection Requests";
  }, [mode, selected]);

  const projectLabel = useMemo(() => {
    const code = newForm.projectCode ?? selected?.projectCode ?? passedProject?.code ?? "";
    const title = newForm.projectTitle ?? selected?.projectTitle ?? passedProject?.title ?? "";
    if (code || title) return `${code ? code + " — " : ""}${title}`;
    return `Project: ${projectId}`;
  }, [
    newForm.projectCode,
    newForm.projectTitle,
    selected?.projectCode,
    selected?.projectTitle,
    passedProject?.code,
    passedProject?.title,
    projectId,
  ]);

  const normStatus = (s?: string | null) => (s || "Draft").toString().trim().toLowerCase();

  const kpis = useMemo(() => {
    const total = state.list.length;
    let approved = 0,
      rejected = 0,
      pending = 0;
    for (const w of state.list) {
      const st = normStatus(w.status);
      if (st === "approved") approved++;
      else if (st === "rejected") rejected++;
      else if (st === "submitted" || st === "recommended") pending++;
    }
    return { total, pending, approved, rejected };
  }, [state.list]);

  // TEMP: delete a WIR straight from list (DB hard delete)
  const onDeleteWir = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!id) return;

    if (!window.confirm("Delete this WIR permanently? This cannot be undone.")) return;

    try {
      await apiDeleteWir(projectId, id);
      // Optimistic UI: remove from list
      setState((s) => ({
        ...s,
        list: s.list.filter((w) => String(w.wirId) !== String(id)),
      }));
    } catch (err: any) {
      const s = err?.response?.status;
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        "Failed to delete";
      if (s === 403) {
        alert("Not allowed: Only the Contractor who authored this Draft can delete it.");
      } else {
        alert(`Error ${s ?? ""} ${msg}`);
      }
    }
  };

  /* ========================= Actions (stubs) ========================= */
  const onPrimary = async () => {
    if (!canRaise) {
      alert("You don't have permission to raise a WIR.");
      return;
    }
    const r = normalizeRole(role);

    // Contractor: on list -> create, on detail -> submit
    if (r === "Contractor") {
      openCreateNew();
      return;
    }

    // Non-contractor roles require a selected WIR (detail view)
    if (!selected) {
      alert("Open a WIR first.");
      return;
    }

    try {
      if (r === "PMC" || r === "IH-PMT" || r === "Consultant") {
        await apiRecommendWir(projectId, selected.wirId, { role: r });
        await reloadWirList();
        alert("Recommended.");
        goToList(true);
        return;
      }
      if (r === "Admin" || r === "Client") {
        await apiApproveWir(projectId, selected.wirId, { role: r });
        await reloadWirList();
        alert("Approved.");
        goToList(true);
        return;
      }
      alert("No action available for your role.");
    } catch (e: any) {
      const s = e?.response?.status;
      const msg = e?.response?.data?.error || e?.message || "Failed";
      alert(`Error ${s ?? ""} ${msg}`);
    }
  };

  const onOpen = async (id: string) => {
    try {
      setSelectedId(id);
      const row = state.list.find((w) => String(w.wirId) === String(id));
      let status = row?.status || "Draft";
      const full = await loadWir(projectId, id);  // ensures auto-initialize + fresh
      status = full?.status || status;
      setNewForm(mapWirToForm(full || {}));

      // NEW: hydrate runner tiles now (Inspector/HOD)
      hydrateRunnerFrom(full);
      if (!checklists.rows.length && !checklists.loading) loadChecklists();

      const statusLower = (status || "").toLowerCase();
      const authorIdRaw =
        full?.authorId ??
        row?.authorId ??
        full?.createdBy?.userId ??
        full?.author?.userId ??
        full?.createdById ??
        null;
      const authorId = authorIdRaw != null ? String(authorIdRaw) : "";
      const me = (currentUserId || getUserIdFromToken() || "") + "";
      if (statusLower === "draft" && authorId && me && authorId === me) {
        // my draft -> edit
        setMode("edit");
        setView("new");
        try {
          window.scrollTo({ top: 0, behavior: "smooth" });
        } catch { }
      } else {
        setMode("readonly");
        setRoViewOpen(true);
      }
    } catch (e: any) {
      const s = e?.response?.status;
      const msg = e?.response?.data?.error || e?.message || "Failed to open WIR";
      alert(`Error ${s ?? ""} ${msg}`);
    }
  };

  const loadWirListIfNeededAndGet = async (id: string) => {
    try {
      const full = await loadWir(projectId, id);
      hydrateRunnerFrom(full);     // NEW: hydrate immediately
      return full;
    } catch {
      if (!state.list.length) await reloadWirList();
      return state.list.find((w) => String(w.wirId) === String(id)) || {};
    }
  };

  const onBack = () => {
    if (view === "new") {
      setView("list");
      setSelectedId(null);
      return;
    }
    if (onBackOverride) return onBackOverride();
    navigate(-1);
  };

  // ------ File inputs ------
  const onPickFiles = (key: keyof NewWirForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isRO) return;
    const files = Array.from(e.target.files || []);
    setNewForm((f) => ({ ...f, [key]: files }));
  };

  // ------ Compliance View Items (stub) ------
  const onViewCompliance = () => {
    alert(
      `Compliance items (stub):\n• Safety Helmets\n• Harnesses\n• Permit-to-Work\n(From ${newForm.pickedChecklistIds.length} checklist(s))`
    );
  };

  // Build POST/PATCH body from form
  const buildWirPayload = () => {
    const title =
      newForm.activityType === "Custom"
        ? (newForm.customActivityText || "").trim() || "Inspection Request"
        : newForm.activityLabel || "Inspection Request";

    return {
      title,
      code: null,
      discipline: newForm.discipline,
      stage: null,
      forDate: newForm.dateISO,
      forTime: newForm.time12h,
      cityTown: newForm.location || null,
      stateName: null,
      description: newForm.details || null,
      items: (newForm.pickedChecklistIds || []).map((id) => ({
        name: id,
        spec: null,
        required: null,
        tolerance: null,
        photoCount: 0,
        status: "Unknown",
      })),
    };
  };

  // === [Runner_5] === WIR List Fetch: reloadWirList()
  // Loads list of WIRs into state.list → used to derive selected
  const reloadWirList = async () => {
    const data = await apiListWir(projectId);

    const arr: any[] = Array.isArray(data)
      ? data
      : Array.isArray((data as any)?.records)
        ? (data as any).records
        : [];
    const list: WirRecord[] = arr.map((x) => ({
      wirId: x.wirId ?? x.id,
      code: x.code ?? x.irCode ?? null,
      title: x.title ?? x.name ?? "Inspection Request",
      projectId: x.projectId ?? projectId,
      projectCode: x.project?.code ?? null,
      projectTitle: x.project?.title ?? null,
      status: x.status ?? null,
      health: x.health ?? null,
      discipline: x.discipline ?? null,
      stage: x.stage ?? null,
      forDate: x.forDate ?? x.plannedDate ?? null,
      forTime: x.forTime ?? null,
      cityTown: x.cityTown ?? x.location?.cityTown ?? null,
      stateName:
        x.state?.name ?? (typeof x.state === "string" ? x.state : null),
      contractorName:
        x.contractor?.name ??
        x.participants?.contractor?.name ?? x.participants?.contractor ??
        x.contractorName ?? null,

      inspectorName:
        x.inspector?.name ??
        x.participants?.inspector?.name ?? x.participants?.inspector ??
        x.inspectorName ?? null,

      hodName:
        x.hod?.name ??
        x.participants?.hod?.name ?? x.participants?.hod ??
        x.hodName ?? null,

      bicName:
        x.participants?.bic?.name ?? x.bic?.name ?? x.bicName ?? null,
      authorId:
        x.authorId ??
        x.createdBy?.userId ??
        x.createdById ??
        x.author?.userId ??
        null,

      items: (x.items || []).map((it: any, i: number) => ({
        id: it.id ?? `it-${i}`,
        name: it.name ?? it.title ?? `Item ${i + 1}`,
        spec: it.spec ?? it.specification ?? null,
        required: it.required ?? it.requirement ?? null,
        tolerance: it.tolerance ?? null,
        photoCount:
          it.photoCount ?? (Array.isArray(it.photos) ? it.photos.length : null),
        status: it.status ?? null,
      })),

      // 🔽 NEW: carry runner inspector / HOD blobs from backend
      runnerInspector: (x as any).runnerInspector ?? null,
      runnerHod: (x as any).runnerHod ?? null,

      description: x.description ?? x.notes ?? null,
      updatedAt: x.updatedAt ?? x.modifiedAt ?? x.createdAt ?? null,

      // NEW ↓ prefer direct flags/columns if backend sends them
      wasRescheduled:
        !!(
          x.rescheduledAt ||
          x.rescheduledById ||
          x.flags?.rescheduled === true ||
          (Array.isArray(x.history) && x.history.some((h: any) =>
            String(h?.action || "").toLowerCase().includes("resched")
          ))
        ),
      // === [Runner_FE_Discard_Bug]: runnerInspector/runnerHod not being passed here
      // 🔴 You MUST add:
      // runnerInspector: x.runnerInspector ?? null,
      // runnerHod: x.runnerHod ?? null,
    }));

    setState({ list, loading: false, error: null });
    warmChecklistCounts(list);
  };

  // ------ Save/Submit ------
  const canSubmit = () => {
    const basicsOk = !!newForm.discipline && !!newForm.dateISO && !!newForm.time12h;
    const hasChecklist = (newForm.pickedChecklistIds?.length || 0) > 0;
    // Accept legacy drafts that carry only activityLabel (no activityId)
    const hasActivity =
      newForm.activityType === "Custom"
        ? !!newForm.customActivityText?.trim()
        : !!(newForm.activityId || newForm.activityLabel);
    return basicsOk && hasActivity && hasChecklist;
  };

  const onSaveDraft = async () => {
    try {
      const body = buildWirPayload();

      if (!selectedId) {
        await apiCreateWir(projectId, body);
        alert("Draft created.");
        resetNewForm();
        goToList(true);
        return;
      }

      await apiUpdateWir(projectId, selectedId, body);
      alert("Draft updated.");
      resetNewForm();
      goToList(true);
    } catch (e: any) {
      const s = e?.response?.status;
      const data = e?.response?.data;
      const msg =
        (typeof data === "string" && data) ||
        data?.message ||
        data?.error ||
        e?.message ||
        "Failed";
      if (s === 403) {
        alert(`Not allowed: ${msg || "You can only edit/submit your own Draft WIR."}`);
      } else {
        alert(`Error ${s ?? ""} ${msg}`);
      }
    }
  };

  const onSubmitNew = async () => {
    try {
      if (!canSubmit()) {
        alert("Select activity, discipline, date/time, and at least one checklist to submit.");
        return;
      }
      // Guard: ensure PMC is valid for the chosen date
      const ok = await ensurePMCGuardForSubmit(projectId, newForm.dateISO);
      if (!ok) return;

      // Confirm submit, then open Dispatch modal (mobile-first)
      if (!window.confirm("Submit this WIR now?")) return;

      // Ensure a WIR exists (create draft if needed)
      let id = selectedId;
      if (!id) {
        const created = await apiCreateWir(projectId, buildWirPayload());
        id = String(created?.wirId || created?.id);
        setSelectedId(id || null);
      }
      if (!id) throw new Error("Could not determine WIR ID to submit.");

      // Open Dispatch modal. Actual API submit + BIC update will happen on Send.
      openDispatchModal(id, newForm.dateISO);
    } catch (e: any) {
      const s = e?.response?.status;
      const data = e?.response?.data;
      const msg =
        (typeof data === "string" && data) ||
        data?.message ||
        data?.error ||
        e?.message ||
        "Failed";
      console.error("WIR submit prep error:", { status: s, data });
      alert(`Error ${s ?? ""} ${msg}`);
    }
  };

  // ------ Checklist library modal controls ------
  const openChecklistPicker = () => {
    if (isRO) return;
    setClPicked(new Set(newForm.pickedChecklistIds));
    setClLibOpen(true);
  };

  const toggleClPick = (id: string) => {
    if (isRO) return;
    setClPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmChecklistPick = () => {
    if (isRO) return;
    const ids = Array.from(new Set(clPicked));
    ids.sort((a, b) =>
      (checklistLabelById.get(a) || a).localeCompare(checklistLabelById.get(b) || b)
    );
    setNewForm((f) => ({ ...f, pickedChecklistIds: ids }));
    setClLibOpen(false);
  };

  const removeChecklist = (id: string) => {
    setNewForm((f) => ({ ...f, pickedChecklistIds: f.pickedChecklistIds.filter((x) => x !== id) }));
  };

  const openCreateNew = () => {
    if (!canRaise) {
      alert("You don't have permission to raise a WIR.");
      return;
    }
    setSelectedId(null);
    setMode("create");
    resetNewForm();
    setView("new");
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch { }
  };

  const onOpenFilledForm = () => {
    if (!selected) return;
    setFilledOpen(true);
  };

  const onReschedule = () => {
    if (!selected) return;
    // Prefill with selected's schedule
    const curDate = (selected.forDate && String(selected.forDate).slice(0, 10)) || todayISO();
    const curTime = selected.forTime || nowTime12h();
    setResCurDate(curDate);
    setResCurTime(curTime);

    // New defaults = same as current (user will change)
    setResNewDate(curDate);
    setResNewTime(curTime);

    setResNote("");
    setResOpen(true);
  };

  const onOpenHistory = async () => {
    if (!selected) {
      alert("Open a WIR first.");
      return;
    }
    setHistOpen(true);
    setHistLoading(true);
    setHistError(null);
    try {
      const rows = await fetchWirHistory(projectId, selected.wirId);
      setHistRows(rows);
    } catch (e: any) {
      setHistError(e?.response?.data?.error || e?.message || "Failed to load history");
      setHistRows([]);
    } finally {
      setHistLoading(false);
    }
  };

  /* ======= Modal lifecycle niceties ======= */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && roViewOpen) setRoViewOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [roViewOpen]);

  // const checklistStats = useMemo(() => {
  //   const items = selected?.items || [];
  //   const total = items.length;
  //   const mandatory = items.filter((it: any) => {
  //     const v = String(it?.required ?? "").toLowerCase();
  //     return v === "mandatory" || v === "yes" || it?.required === true;
  //   }).length;
  //   const critical = items.filter((it: any) => {
  //     const s = String(it?.status ?? "").toLowerCase();
  //     const sev = String((it as any)?.severity ?? "").toLowerCase();
  //     return s === "ncr" || (it as any)?.critical === true || sev === "critical";
  //   }).length;
  //   return { total, mandatory, critical };
  // }, [selected]);

  const pickedCandidate = useMemo(
    () => dispatchCandidates.find((u) => String(u.userId) === String(dispatchPick || "")) || null,
    [dispatchPick, dispatchCandidates]
  );

  // ===== AI Routing & Summary (derived text for Dispatch modal) =====
  const aiRouting = useMemo(() => {
    // Title of WIR
    const wirTitle =
      (selected?.title && String(selected.title).trim()) ||
      (newForm.activityType === "Custom"
        ? (newForm.customActivityText || "").trim()
        : (newForm.activityLabel || "").trim()) ||
      "Inspection Request";

    // Date of inspection
    const whenISO =
      (selected?.forDate && String(selected.forDate)) ||
      (newForm.dateISO && String(newForm.dateISO)) ||
      "";

    // Activity (selected or custom)
    const activityText =
      (newForm.activityType === "Custom"
        ? (newForm.customActivityText || "").trim()
        : (newForm.activityLabel || "").trim()) || wirTitle;

    const totalChecklist =
      (newForm.pickedChecklistIds?.length ?? 0) || (selected?.items?.length ?? 0) || 0;
    return {
      subject: `${wirTitle}${whenISO ? ` — ${fmtDate(whenISO)}` : ""}`,
      summary: `Request inspection for "${activityText}". Auto attached ${totalChecklist} checklist items.`,
    };
  }, [
    selected,
    newForm.activityType,
    newForm.customActivityText,
    newForm.activityLabel,
    newForm.dateISO,
    newForm.pickedChecklistIds,
  ]);

  useEffect(() => {
    if (view === "new" && !canRaise) setView("list");
  }, [view, canRaise]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dispatchOpen) setDispatchOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatchOpen]);

  useEffect(() => {
    if (!clLibOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setClLibOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clLibOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && hodFinalizeOpen) {
        setHodFinalizeOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hodFinalizeOpen]);

  useEffect(() => {
    if (clLibOpen) {
      loadChecklists();
    }
  }, [newForm.discipline, clLibOpen]);

  // === [Runner_HYDRATE] === Centralized hydrator for Inspector/HOD local state
  function hydrateRunnerFrom(full: any) {
    if (!full) return;

    const allRows: Array<{ id: string; wid?: string | null; cid?: string | null }> =
      Array.isArray(full.items)
        ? full.items.map((wi: any) => ({
          id: String(wi?.id ?? wi?.checklistItemId ?? ""),
          wid: wi?.id ? String(wi.id) : null,
          cid: wi?.checklistItemId ? String(wi.checklistItemId) : null,
        }))
        : [];

    // ---- Inspector ----
    const inspItems: any[] = Array.isArray(full.runnerInspector?.items)
      ? full.runnerInspector.items
      : [];

    setInspectorState(prev => {
      const next: any = { ...prev };
      for (const row of allRows) {
        const hit = inspItems.find((x: any) => {
          const xWid = x?.itemId != null ? String(x.itemId) : null;
          const xCid = x?.checklistItemId != null ? String(x.checklistItemId) : null;
          return (xWid && (xWid === row.id || xWid === row.wid)) || (xCid && xCid === row.cid);
        });
        if (hit) {
          next[row.id] = {
            status: hit.status ?? null,
            measurement: hit.measurement ?? "",
            remark: hit.remark ?? "",
            photos: [],
          };
        }
      }
      return next;
    });

    const overall = full.runnerInspector?.overallRecommendation ?? null;
    if (overall) {
      setInspectorRecommendation({ [OVERALL_REC_KEY]: overall });
    }

    // ---- HOD ----
    const hodItems: any[] = Array.isArray(full.runnerHod?.items)
      ? full.runnerHod.items
      : [];

    setHodState(prev => {
      const next: any = { ...prev };
      for (const row of allRows) {
        const hit = hodItems.find((x: any) => {
          const xWid = x?.itemId != null ? String(x.itemId) : null;
          return xWid === row.wid || xWid === row.id;
        });
        if (hit) {
          next[row.id] = {
            hodRemark: hit.hodRemark ?? hit.remark ?? "",
            lastSavedAt: hit.hodLastSavedAt ?? undefined,
          };
        }
      }
      return next;
    });
  }

  // === [Runner_Load_1] === Runner Panel: useEffect to hydrate runner items
  useEffect(() => {
    if (!selected || !roViewOpen || roTab !== "document" || docTab !== "runner") {
      log("Runner effect: skip", {
        hasSelected: !!selected,
        roViewOpen,
        roTab,
        docTab,
      });
      return;
    }

    let cancelled = false;

    (async () => {
      setRunnerLoading(true);
      setRunnerError(null);

      try {
        // ✅ Always fetch fresh WIR (auto-initializes if needed)
        const wir = await getWir(projectId, selected.wirId);
        const wirItemsArr: any[] = Array.isArray(wir.items) ? wir.items : [];

        // Map for quick lookup
        const byWid = new Map<string, any>();
        const byCid = new Map<string, any>();
        for (const wi of wirItemsArr) {
          const wid = wi?.id ? String(wi.id) : null;
          const cid = wi?.checklistItemId ? String(wi.checklistItemId) : null;
          if (wid) byWid.set(wid, wi);
          if (cid) byCid.set(cid, wi);
        }

        // === Load ref checklist rows
        const checklistIds = extractChecklistIds(wir);
        const refItems: any[] = [];
        for (const clId of checklistIds) {
          const rows = await listRefChecklistItems(clId);
          const arr: any[] = Array.isArray(rows)
            ? rows
            : Array.isArray((rows as any)?.items)
              ? (rows as any).items
              : Array.isArray((rows as any)?.records)
                ? (rows as any).records
                : [];


          for (const r of arr) {
            refItems.push({
              cid: String(r.id ?? r.itemId ?? r.code ?? r.slug ?? ""),
              title: r.title ?? r.name ?? r.label ?? "Item",
              code: r.code ?? null,
              unit: r.unit ?? r.uom ?? null,
              tolerance: r.tolerance ?? formatTolerance?.(r) ?? null,
              required: r.required ?? r.requirement ?? r.mandatory ?? null,
              requirement: r.requirement ?? null,
              critical: r.critical === true,
              base: numOrNull((r as any).base),
              plus: numOrNull((r as any).plus),
              minus: numOrNull((r as any).minus),
              tags: Array.isArray(r.tags) ? r.tags.slice(0, 10) : [],
            });
          }
        }

        // === Merge checklist + WIR items
        const all: RunnerCardItem[] = refItems.map((ri, i) => {
          const wi = byCid.get(ri.cid) || null;
          const wid = wi?.id ? String(wi.id) : null;
          const status = wi?.status ?? null;

          return {
            id: wid || ri.cid,
            wid,
            cid: ri.cid,
            title: String(ri.title ?? `Item ${i + 1}`),
            code: ri.code,
            unit: ri.unit,
            tolerance: ri.tolerance,
            required: ri.required,
            requirement: ri.requirement,
            critical: ri.critical ?? null,
            status,
            tags: ri.tags ?? [],
            base: ri.base ?? null,
            plus: ri.plus ?? null,
            minus: ri.minus ?? null,
          };
        });

        setRunnerItems(all);

        // === Hydrate Inspector Panel
        if (!cancelled) {
          const inspItems = Array.isArray(wir.runnerInspector?.items) ? wir.runnerInspector.items : [];

          const inspectorMatches = all.filter(row =>
            inspItems.some((x: any) => {
              const xWid = x?.itemId != null ? String(x.itemId) : null;
              const xCid = x?.checklistItemId != null ? String(x.checklistItemId) : null;
              return (xWid && (xWid === row.id || xWid === row.wid)) || (xCid && xCid === row.cid);
            })
          );
          console.log("[WIR] Inspector hydrated rows:", inspectorMatches.length, "of", all.length);

          setInspectorState((prev) => {
            const next: any = { ...prev };
            for (const row of all) {
              const hit = inspItems.find((x: any) => {
                const xWid = x?.itemId != null ? String(x.itemId) : null;
                const xCid = x?.checklistItemId != null ? String(x.checklistItemId) : null;
                return (xWid && (xWid === row.id || xWid === row.wid)) || (xCid && xCid === row.cid);
              });

              if (hit) {
                next[row.id] = {
                  status: hit.status ?? null,
                  measurement: hit.measurement ?? "",
                  remark: hit.remark ?? "",
                  photos: [],
                };
              }
            }
            return next;
          });

          const overall = wir.runnerInspector?.overallRecommendation;
          if (overall) {
            setInspectorRecommendation({ [OVERALL_REC_KEY]: overall });
          }
        }

        // === Hydrate HOD Panel
        if (!cancelled) {
          const hodItems = Array.isArray(wir.runnerHod?.items) ? wir.runnerHod.items : [];

          setHodState((prev) => {
            const next: any = { ...prev };
            for (const row of all) {
              const hit = hodItems.find((x: any) =>
                String(x?.itemId ?? "") === row.wid || String(x?.itemId ?? "") === row.id
              );
              if (hit) {
                next[row.id] = {
                  hodRemark: hit.hodRemark ?? hit.remark ?? "",
                  lastSavedAt: hit.hodLastSavedAt ?? undefined,
                };
              }
            }
            return next;
          });
        }
      } catch (err: any) {
        if (!cancelled) setRunnerError(err?.message || "Failed to load runner items");
      } finally {
        if (!cancelled) setRunnerLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selected?.wirId, roViewOpen, roTab, docTab]);

  useEffect(() => {
    if (!selected || !roViewOpen || roTab !== "document" || docTab !== "overview") return;

    const ids = Array.from(new Set(extractChecklistIds(selected))); // dedupe for safety
    if (!ids.length) {
      setOvStats({ total: 0, mandatory: 0, critical: 0 });
      setOvError(null);
      setOvLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setOvLoading(true);
      setOvError(null);
      try {
        // Fetch all checklists in parallel
        const allLists = await Promise.all(ids.map((id) => listRefChecklistItems(id)));
        const allItems = allLists.flat();

        // Helpers
        const toBool = (v: unknown): boolean =>
          v === true ||
          (typeof v === "string" && /^(true|yes|y|1)$/i.test(v.trim()));

        const isCritical = (r: any): boolean =>
          r?.critical === true || toBool(r?.critical);

        const isMandatory = (r: any): boolean => {
          // Prefer the canonical label from existing helper
          const label = requiredToLabel(
            (r?.required ?? r?.mandatory ?? r?.requirement) as any
          );
          return label === "Mandatory";
        };

        const total = allItems.length;
        const mandatory = allItems.reduce((n, r) => n + (isMandatory(r) ? 1 : 0), 0);
        const critical = allItems.reduce((n, r) => n + (isCritical(r) ? 1 : 0), 0);

        if (!cancelled) setOvStats({ total, mandatory, critical });
      } catch (e: any) {
        if (!cancelled) {
          setOvStats(null);
          setOvError(e?.message || "Failed to load checklist overview stats");
        }
      } finally {
        if (!cancelled) setOvLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selected?.wirId, roViewOpen, roTab, docTab]);

  useEffect(() => {
    if (!selected || !roViewOpen || roTab !== "discussion") return;

    let cancelled = false;
    (async () => {
      setDiscLoading(true);
      setDiscError(null);
      try {
        const rows = await fetchDiscussion(projectId, selected.wirId);
        if (!cancelled) setDiscMsgs(rows);
      } catch (e: any) {
        if (!cancelled) {
          setDiscMsgs([]);
          setDiscError(e?.response?.data?.error || e?.message || "Failed to load discussion");
        }
      } finally {
        if (!cancelled) setDiscLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, selected?.wirId, roViewOpen, roTab]);

  // Load all users once when Discussion tab is opened, so we can show full names for old messages
  useEffect(() => {
    if (!roViewOpen || roTab !== "discussion") return;

    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/admin/users");
        const users: UserLite[] = Array.isArray(data) ? data : (data?.users ?? []);
        if (cancelled) return;

        const map: Record<string, string> = {};
        for (const u of users) {
          map[String(u.userId)] = displayNameLite(u);
        }
        setUserNameById(map);
      } catch {
        if (!cancelled) {
          setUserNameById({});
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [roViewOpen, roTab]);

  /* ======== Custom Time Picker UI state ======== */
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [tpHour, setTpHour] = useState(12);
  const [tpMinute, setTpMinute] = useState(0);
  const [tpAP, setTpAP] = useState<"AM" | "PM">("AM");
  const [ovStats, setOvStats] = useState<{ total: number; mandatory: number; critical: number } | null>(null);
  const [ovLoading, setOvLoading] = useState(false);
  const [ovError, setOvError] = useState<string | null>(null);

  const openTimePicker = () => {
    if (isRO) return;
    const cur = parseTime12h(newForm.time12h || nowTime12h());
    setTpHour(cur.hour);
    setTpMinute(cur.minute);
    setTpAP(cur.ampm);
    setTimePickerOpen(true);
  };
  const confirmTimePicker = () => {
    setNewForm((f) => ({ ...f, time12h: fmtTime12h(tpHour, tpMinute, tpAP) }));
    setTimePickerOpen(false);
  };

  // === Reschedule modal state ===
  const [resOpen, setResOpen] = useState(false);
  const [resSaving, setResSaving] = useState(false);
  const [resNote, setResNote] = useState("");
  const [resCurDate, setResCurDate] = useState(todayISO());
  const [resCurTime, setResCurTime] = useState(nowTime12h());
  const [resNewDate, setResNewDate] = useState(todayISO());
  const [resNewTime, setResNewTime] = useState(nowTime12h());

  // Time picker (modal-local) for reschedule
  const [resTPopen, setResTPopen] = useState<null | "cur" | "new">(null);
  const [resTpHour, setResTpHour] = useState(12);
  const [resTpMinute, setResTpMinute] = useState(0);
  const [resTpAP, setResTpAP] = useState<"AM" | "PM">("AM");

  // Lock page scroll whenever any layered modal is open
  const anyModalOpen =
    roViewOpen || dispatchOpen || clLibOpen || resOpen || filledOpen || histOpen || hodFinalizeOpen;

  useScrollLock(anyModalOpen);

  function openResTP(which: "cur" | "new") {
    const src = which === "cur" ? resCurTime : resNewTime;
    const cur = parseTime12h(src || nowTime12h());
    setResTpHour(cur.hour);
    setResTpMinute(cur.minute);
    setResTpAP(cur.ampm);
    setResTPopen(which);
  }
  function confirmResTP() {
    const v = fmtTime12h(resTpHour, resTpMinute, resTpAP);
    if (resTPopen === "cur") setResCurTime(v);
    if (resTPopen === "new") setResNewTime(v);
    setResTPopen(null);
  }

  function onExportFilledPdf() {
    const node = filledRef.current;
    if (!node) return;
    // Collect current page styles (links + inline styles) so the print window matches Tailwind output
    const styleEls = Array.from(
      document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style')
    ).map((el) => el.outerHTML).join("\n");

    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) {
      alert("Popup blocked. Please allow popups to export PDF.");
      return;
    }

    const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>WIR - Filled Form</title>
${styleEls}
<style>
  @page { margin: 16mm; }
  /* Optional: ensure white background on print */
  body { background: #fff; }
</style>
</head>
<body>
  ${node.outerHTML}
  <script>
    // Wait a tick so fonts/styles settle, then print.
    setTimeout(function(){ window.print(); window.close(); }, 250);
  </script>
</body>
</html>`;
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
  }

  const onResSave = async () => {
    if (!selected) return;
    if (!resNewDate || !resNewTime) {
      alert("Pick new date and time.");
      return;
    }
    setResSaving(true);
    try {
      await apiRescheduleWir(projectId, selected.wirId, {
        role,                         // optional, for server audit
        currentDateISO: resCurDate,
        currentTime12h: resCurTime,
        newDateISO: resNewDate,
        newTime12h: resNewTime,
        notes: resNote || null,
      });

      setResOpen(false);
      await reloadWirList();
      const full = await loadWir(projectId, selected.wirId);
      setNewForm(mapWirToForm(full || {}));
    } catch (e: any) {
      const s = e?.response?.status;
      const msg = e?.response?.data?.error || e?.message || "Failed to reschedule";
      alert(`Error ${s ?? ""} ${msg}`);
    } finally {
      setResSaving(false);
    }
  };

  // Overall Inspector recommendation text for HOD tile
  const overallInspectorRec = inspectorRecLabel(
    inspectorRecommendation[OVERALL_REC_KEY] ?? null
  );
  // HOD finalize modal labels
  const hodModalWirTitle = useMemo(() => {
    if (!selected) return "";
    const code = selected.code ? `${selected.code} — ` : "";
    return code + (selected.title || "Inspection Request");
  }, [selected]);

  const hodModalInspectorName = selected?.inspectorName || "—";
  const hodModalRecommendation = overallInspectorRec || "Not yet given";

  const openHodFinalizeModal = () => {
    if (!selected) return;
    setHodOutcome(null);
    setHodNotesText("");
    setHodFinalizeOpen(true);
  };

  const handleHodOutcomeClick =
    (v: HodOutcome) => () => {
      setHodOutcome(v);
    };

  const handleHodFinalizeConfirm = () => {
    if (!selected) return;
    if (!hodOutcome) {
      alert("Please select an outcome (Accept / Return / Reject).");
      return;
    }

    // ⬇️ Keep behaviour non-breaking for now: just log + close.
    // Wire actual API here later when backend is ready.
    log("HOD Finalize submitted", {
      wirId: selected.wirId,
      wirCode: selected.code,
      wirTitle: selected.title,
      inspectorName: hodModalInspectorName,
      inspectorRecommendation: inspectorRecommendation[OVERALL_REC_KEY] ?? null,
      outcome: hodOutcome,
      notes: hodNotesText,
    });

    setHodFinalizeOpen(false);
  };

  /* ========================= Render ========================= */
  return (
    <section className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border dark:border-neutral-800 p-4 sm:p-5 md:p-6">
      {/* Header */}
      {!hideTopHeader && (
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg sm:text-xl md:text-2xl font-semibold dark:text-white whitespace-normal break-words">
            {pageHeading}
          </h1>
          <button
            onClick={onBack}
            className="text-sm px-3 py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
          >
            Back
          </button>
        </div>
      )}

      {/* Subheader: project & role chips */}
      <div className="mt-2 flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs px-2 py-1 rounded border dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800 dark:text-gray-100">
            {projectLabel}
          </span>
          {role && (
            <span className="text-xs px-2 py-1 rounded-full border dark:border-neutral-800 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
              Role: {role}
            </span>
          )}
        </div>

        {/* KPI Row – List view only */}
        {view === "list" && (
          <div className="mt-1 -mx-1">
            {/* Same as WIR tiles: single row on mobile, scrollable; wraps on ≥ sm */}
            <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap px-1 sm:flex-wrap sm:whitespace-normal">
              <KpiPill prefix="All" value={String(kpis.total)} tone="indigo" />
              <KpiPill prefix="Pending" value={String(kpis.pending)} tone="amber" />
              <KpiPill prefix="Approved" value={String(kpis.approved)} tone="emerald" />
              <KpiPill prefix="Rejected" value={String(kpis.rejected)} tone="rose" />
            </div>
          </div>
        )}
      </div>
      {view === "list" && (
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex-1 flex items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search IRs by code, title, status, discipline…"
              className="w-full text-sm border rounded-lg px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
            />
            {/* Sort */}
            <select
              className="shrink-0 text-sm border rounded-lg px-2 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              title="Sort"
            >
              <option value="">Sort</option>
              <option value="updatedDesc">Updated</option>
              <option value="dateAsc">Date ↑</option>
              <option value="dateDesc">Date ↓</option>
              <option value="status">Status</option>
              <option value="code">WIR Code</option>
            </select>

            {/* Filter */}
            <button
              onClick={() => setFilterOpen(true)}
              className="shrink-0 px-3 py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800 text-sm"
              title="Filter"
            >
              Filter
            </button>
          </div>

          {canRaise && (
            <button
              onClick={onPrimary}
              className="shrink-0 px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-sm"
            >
              +Create New WIR
            </button>
          )}
        </div>
      )}

      {/* List */}
      {view === "list" && (
        <div className="mt-4">
          {state.loading && <div className="text-sm text-gray-700 dark:text-gray-300">Loading WIRs…</div>}
          {state.error && !state.loading && (
            <div className="text-sm text-red-700 dark:text-red-400">{state.error}</div>
          )}
          {!state.loading && !state.error && filtered.length === 0 && (
            <div className="text-sm text-gray-600 dark:text-gray-400">No WIRs yet.</div>
          )}

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((w) => (
              <button
                key={w.wirId}
                onClick={() => onOpen(w.wirId)}
                className="group relative text-left rounded-2xl border dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 sm:p-5 shadow-sm hover:shadow-md transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
              >
                {/* (Removed the absolute top-right delete chip) */}
                <div className="flex items-start gap-3 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-base sm:text-lg font-semibold dark:text-white whitespace-normal break-words">
                      {(w.code ? `${w.code} — ` : "") + w.title}
                    </div>

                    {/* compact chips row */}
                    <div
                      className="mt-1 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap sm:flex-wrap sm:whitespace-normal"
                    >
                      <KpiPill value={w?.status || "—"} tone={toneForStatus(w?.status)} />
                      <KpiPill value={transmissionType || "—"} tone={toneForTransmission(transmissionType)} />
                      <KpiPill prefix="BIC" value={w?.bicName || "—"} tone="neutral" />
                    </div>
                    <div
                      className="mt-1 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap sm:flex-wrap sm:whitespace-normal"
                    >
                      {/* NEW: clock icon when rescheduled */}
                      {w.wasRescheduled ? (
                        <span
                          title="Rescheduled"
                          aria-label="Rescheduled"
                          className="inline-flex items-center text-[11px] px-1.5 py-0.5 rounded-md border dark:border-neutral-800 bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            width="14"
                            height="14"
                            className="mr-1"
                            aria-hidden="true"
                          >
                            <path d="M12 1.75a10.25 10.25 0 1 0 0 20.5 10.25 10.25 0 0 0 0-20.5Zm0 1.5a8.75 8.75 0 1 1 0 17.5 8.75 8.75 0 0 1 0-17.5Zm-.75 3.75v5.06l4.02 2.41.75-1.25-3.27-1.96V7h-1.5Z" />
                          </svg>
                          Rescheduled
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                      {joinWithDots(
                        w.forDate ? fmtDate(w.forDate) : null,
                        w.forTime || null,
                        clCountsLoading ? "calculating…" : `${totalItemsForWir(w)} items`
                      )}
                    </div>

                    {/* bottom action row with Delete button (author-only Drafts) */}
                    {canDeleteFromList(w) && (
                      <div className="mt-3 flex items-center justify-end">
                        <div
                          role="button"
                          aria-label="Delete WIR"
                          title="Delete (temporary)"
                          onClick={(e) => onDeleteWir(e, w.wirId)}
                          className="text-[11px] px-2 py-1 rounded-md border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300"
                        >
                          🗑 Delete
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      {/* ======= CREATE NEW ======= */}
      {view === "new" && (
        <div className="mt-4 grid grid-cols-1 gap-4">
          {/* Tile 1: Projects & References */}
          <SectionCard title="Projects & References">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FieldRow
                label="Project"
                wide
                value={
                  <div className="text-sm">
                    <span className="font-semibold">
                      {(newForm.projectCode ? `${newForm.projectCode} — ` : "") +
                        (newForm.projectTitle || "Project")}
                    </span>
                    <span className="ml-2 text-xs opacity-70">(auto from selection)</span>
                  </div>
                }
              />

              {/* ===== Discipline FIRST (moved above activity) ===== */}
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Select Discipline
                </div>
                <select
                  className="mt-1 w-full text-sm border rounded-lg px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                  value={newForm.discipline || ""}
                  disabled={isRO}
                  onMouseDown={preventOpenIfRO(isRO)}
                  onClick={preventOpenIfRO(isRO)}
                  onChange={(e) =>
                    setNewForm((f) => ({ ...f, discipline: e.target.value || null }))
                  }
                >
                  <option value="">— Select —</option>
                  {DISCIPLINES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              {/* Activity Type */}
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Activity Type
                </div>
                <div className="mt-1 flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="activity-type"
                      className="accent-emerald-600"
                      checked={(newForm.activityType || "Standard") === "Standard"}
                      disabled={isRO}
                      onChange={() =>
                        setNewForm((f) => ({
                          ...f,
                          activityType: "Standard",
                        }))
                      }
                    />
                    Standard
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="activity-type"
                      className="accent-emerald-600"
                      checked={newForm.activityType === "Custom"}
                      disabled={isRO}
                      onChange={() =>
                        setNewForm((f) => ({
                          ...f,
                          activityType: "Custom",
                          activityId: null,
                          activityLabel: null,
                        }))
                      }
                    />
                    Custom
                  </label>
                </div>
              </div>

              {/* Activity (Standard dropdown or Custom text) */}
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {newForm.activityType === "Custom" ? "Activity Details" : "Select Activity"}
                </div>

                {newForm.activityType === "Custom" ? (
                  <input
                    className="mt-1 w-full text-sm border rounded-lg px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                    placeholder="Describe the activity (e.g., PCC for Footing F2, rework on Beam B3)…"
                    value={newForm.customActivityText || ""}
                    disabled={isRO}
                    onChange={(e) =>
                      setNewForm((f) => ({ ...f, customActivityText: e.target.value }))
                    }
                  />
                ) : (
                  <select
                    className="mt-1 w-full text-sm border rounded-lg px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800 disabled:opacity-60"
                    value={newForm.activityId || ""}
                    disabled={activities.loading || isRO}
                    onMouseDown={preventOpenIfRO(isRO)}
                    onClick={preventOpenIfRO(isRO)}
                    onFocus={() => {
                      if (!activities.rows.length && !activities.loading) loadActivities();
                    }}
                    onChange={(e) => {
                      const id = e.target.value || null;
                      const picked =
                        visibleActivities.find((a) => String(a.id) === String(id)) || null;
                      const label = picked
                        ? [picked.code, picked.title].filter(Boolean).join(": ")
                        : null;
                      setNewForm((f) => ({ ...f, activityId: id, activityLabel: label }));
                    }}
                  >
                    {!activities.rows.length && !activities.loading && !activities.error && (
                      <option value="">Click to load…</option>
                    )}
                    {activities.loading && <option value="">Loading…</option>}
                    {activities.error && !activities.loading && (
                      <option value="" disabled>
                        {activities.error}
                      </option>
                    )}
                    {!activities.loading && !activities.error && activities.rows.length === 0 && (
                      <option value="" disabled>
                        No activities found
                      </option>
                    )}
                    {visibleActivities.map((a) => (
                      <option key={a.id} value={a.id}>
                        {[a.code, a.title].filter(Boolean).join(": ")}
                        {a.discipline ? ` — ${a.discipline}` : ""}
                      </option>
                    ))}
                  </select>
                )}

                {/* Standard-only helpers */}
                {newForm.activityType !== "Custom" && (
                  <div className="mt-1 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={loadActivities}
                      className="text-xs px-2 py-1 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                      title="Reload"
                      disabled={activities.loading}
                    >
                      {activities.loading ? "Loading…" : "Reload"}
                    </button>
                    {newForm.discipline && (
                      <span className="text-[11px] text-gray-600 dark:text-gray-300">
                        Filtering by discipline: <b>{newForm.discipline}</b>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Date + Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Date with inline calendar icon */}
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Date
                  </div>
                  <div className="mt-1 relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
                      {/* Calendar SVG */}
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        className="fill-current"
                      >
                        <path d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2zm13 6H4v12h16V8zM6 10h5v5H6v-5z" />
                      </svg>
                    </span>
                    <input
                      type="date"
                      className="w-full text-sm border rounded-lg pl-9 pr-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800 disabled:opacity-60"
                      value={newForm.dateISO}
                      disabled={isRO}
                      onMouseDown={preventOpenIfRO(isRO)}
                      onClick={preventOpenIfRO(isRO)}
                      onChange={(e) => setNewForm((f) => ({ ...f, dateISO: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Time with custom picker */}
                <div className="relative">
                  <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Time
                  </div>
                  <div className="mt-1">
                    <input
                      readOnly
                      placeholder="HH:MM AM/PM"
                      className="w-full text-sm border rounded-lg px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800 disabled:opacity-60 cursor-pointer"
                      value={newForm.time12h}
                      disabled={isRO}
                      onClick={(e) => {
                        if (isRO) return;
                        e.preventDefault();
                        openTimePicker();
                      }}
                    />
                  </div>

                  {/* Popover */}
                  {timePickerOpen && !isRO && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setTimePickerOpen(false)}
                      />
                      <div className="absolute z-40 mt-2 w-full max-w-xs rounded-xl border dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-lg p-3">
                        <div className="grid grid-cols-3 gap-2">
                          {/* Hour */}
                          <div>
                            <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                              Hour
                            </div>
                            <select
                              className="w-full text-sm border rounded-lg px-2 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                              value={tpHour}
                              onChange={(e) => setTpHour(Math.min(12, Math.max(1, parseInt(e.target.value, 10) || 12)))}
                            >
                              {Array.from({ length: 12 }).map((_, i) => {
                                const v = i + 1;
                                return (
                                  <option key={v} value={v}>
                                    {String(v).padStart(2, "0")}
                                  </option>
                                );
                              })}
                            </select>
                          </div>

                          {/* Minute */}
                          <div>
                            <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                              Minute
                            </div>
                            <select
                              className="w-full text-sm border rounded-lg px-2 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                              value={tpMinute}
                              onChange={(e) => setTpMinute(Math.min(59, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                            >
                              {Array.from({ length: 60 }).map((_, i) => (
                                <option key={i} value={i}>
                                  {String(i).padStart(2, "0")}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* AM/PM */}
                          <div>
                            <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                              AM/PM
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setTpAP("AM")}
                                className={
                                  "flex-1 text-sm px-2 py-2 rounded border dark:border-neutral-800 " +
                                  (tpAP === "AM"
                                    ? "bg-emerald-600 text-white"
                                    : "hover:bg-gray-50 dark:hover:bg-neutral-800")
                                }
                              >
                                AM
                              </button>
                              <button
                                type="button"
                                onClick={() => setTpAP("PM")}
                                className={
                                  "flex-1 text-sm px-2 py-2 rounded border dark:border-neutral-800 " +
                                  (tpAP === "PM"
                                    ? "bg-emerald-600 text-white"
                                    : "hover:bg-gray-50 dark:hover:bg-neutral-800")
                                }
                              >
                                PM
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setTimePickerOpen(false)}
                            className="text-sm px-3 py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={confirmTimePicker}
                            className="text-sm px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            Set Time
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Location */}
              <div className="md:col-span-2">
                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Location
                </div>
                <input
                  className="mt-1 w-full text-sm border rounded-lg px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800 disabled:opacity-60"
                  placeholder="Write area/zone (e.g., Block A, Footing F2)"
                  value={newForm.location || ""}
                  disabled={isRO}
                  onChange={(e) => setNewForm((f) => ({ ...f, location: e.target.value }))}
                />
              </div>
            </div>
          </SectionCard>

          {/* Tile 2: Work Inspection */}
          <SectionCard title="Work Inspection">
            <textarea
              rows={5}
              className="w-full text-sm border rounded-lg px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800 disabled:opacity-60"
              placeholder="Write inspection details…"
              value={newForm.details}
              disabled={isRO}
              onChange={(e) => setNewForm((f) => ({ ...f, details: e.target.value }))}
            />
          </SectionCard>

          {/* Tile 3: Documents and Evidence */}
          <SectionCard title="Documents and Evidence">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { key: "drawingFiles", label: "Attach Drawing", active: hasDrawing },
                { key: "itpFiles", label: "Attach ITP", active: hasITP },
                { key: "otherDocs", label: "Attach Other Document", active: hasOther },
                {
                  key: "photos",
                  label: "Upload Photos",
                  active: hasPhotos,
                  multiple: true,
                  accept: "image/*",
                },
                { key: "materialApprovalFiles", label: "Material Approval", active: hasMA },
                { key: "safetyClearanceFiles", label: "Safety Clearance", active: hasSafety },
              ].map((t) => {
                const inputId = `wir-${t.key}`;
                const files = (newForm as any)[t.key] as File[] | undefined;
                const { shown, extra, total } = listFileNames(files, 3);

                return (
                  <label
                    key={t.key}
                    htmlFor={inputId}
                    className={
                      "cursor-pointer rounded-xl border dark:border-neutral-800 p-4 flex items-start gap-3 " +
                      (t.active ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-white dark:bg-neutral-900")
                    }
                  >
                    <input
                      id={inputId}
                      type="file"
                      className="hidden"
                      multiple={!!(t as any).multiple}
                      accept={(t as any).accept}
                      disabled={isRO}
                      onMouseDown={preventOpenIfRO(isRO)}
                      onClick={preventOpenIfRO(isRO)}
                      onChange={onPickFiles(t.key as keyof NewWirForm)}
                    />
                    <div className="h-10 w-10 grid place-items-center rounded-lg bg-gray-100 dark:bg-neutral-800">
                      📎
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm dark:text-white">{t.label}</div>

                      {!t.active ? (
                        <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">No file selected</div>
                      ) : (
                        <>
                          <div className="mt-1 text-xs text-gray-700 dark:text-gray-200 break-words">
                            {shown.join(", ")}
                            {extra > 0 ? ` (+${extra} more)` : ""}
                          </div>
                          <div className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                            {total} file{total === 1 ? "" : "s"} attached
                          </div>
                        </>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
            {/* Compact file-name chips */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {([
                ...(newForm.drawingFiles || []),
                ...(newForm.itpFiles || []),
                ...(newForm.otherDocs || []),
                ...(newForm.materialApprovalFiles || []),
                ...(newForm.safetyClearanceFiles || []),
                ...(newForm.photos || []),
              ] as File[])
                .filter(Boolean)
                .map((f, i) => (
                  <span key={`${f.name}-${i}`} className="text-[10px] px-1.5 py-0.5 rounded-full border">
                    {f.name || "file"}
                  </span>
                ))}
            </div>
          </SectionCard>

          {/* Tile 4: Checklist Library */}
          <SectionCard title="Checklist Library">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (!isRO) {
                    setClPicked(new Set(newForm.pickedChecklistIds));
                    setClLibOpen(true);
                    loadChecklists();
                  }
                }}
                className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-sm disabled:opacity-60"
                disabled={isRO}
              >
                {checklists.loading ? "Loading…" : "Add from Library"}
              </button>
              {newForm.discipline && (
                <span className="text-[11px] text-gray-600 dark:text-gray-300">
                  Filtering by discipline: <b>{newForm.discipline}</b>
                </span>
              )}
              {checklists.error && (
                <span className="text-[11px] text-rose-600 dark:text-rose-400">{checklists.error}</span>
              )}
            </div>

            {newForm.pickedChecklistIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {newForm.pickedChecklistIds.map((id) => {
                  const label = checklistLabelById.get(id) || id;
                  return (
                    <span
                      key={id}
                      className="text-[11px] px-2 py-1 rounded-full border dark:border-neutral-700 flex items-center gap-1"
                    >
                      {label}
                      {!isRO && (
                        <button
                          onClick={() => removeChecklist(id)}
                          className="ml-1 text-xs opacity-70 hover:opacity-100"
                          title="Remove"
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            )}
          </SectionCard>

          {/* Tile 5: Compliance Checklist */}
          <SectionCard title="Compliance Checklist">
            <button
              onClick={onViewCompliance}
              className="px-3 py-2 rounded border dark:border-neutral-800 text-sm hover:bg-gray-50 dark:hover:bg-neutral-800"
            >
              View Items
            </button>
            {newForm.pickedComplianceIds.length > 0 && (
              <div className="mt-2 text-xs text-gray-700 dark:text-gray-300">
                Items: {newForm.pickedComplianceIds.length}
              </div>
            )}
          </SectionCard>

          {/* Actions + Note */}
          <div className="flex flex-wrap items-center gap-3">
            {mode !== "readonly" ? (
              canRaise ? (
                <>
                  <button
                    onClick={onSaveDraft}
                    className="px-4 py-2 rounded border dark:border-neutral-800 text-sm hover:bg-gray-50 dark:hover:bg-neutral-800"
                  >
                    Save Draft
                  </button>
                  {selectedId && (
                    <button
                      onClick={() => goToList(false)}
                      className="px-4 py-2 rounded border dark:border-neutral-800 text-sm hover:bg-gray-50 dark:hover:bg-neutral-800"
                    >
                      Close
                    </button>
                  )}
                  <button
                    onClick={onSubmitNew}
                    disabled={!canSubmit()}
                    className={
                      "px-4 py-2 rounded text-sm text-white " +
                      (canSubmit() ? "bg-emerald-600 hover:bg-emerald-700" : "bg-emerald-400 cursor-not-allowed")
                    }
                  >
                    Submit
                  </button>
                </>
              ) : (
                <div className="px-3 py-2 rounded border dark:border-neutral-800 text-sm text-gray-600 dark:text-gray-300">
                  You don't have permission to raise a WIR.
                </div>
              )
            ) : (
              <div className="px-3 py-2 rounded border dark:border-neutral-800 text-sm text-gray-600 dark:text-gray-300">
                Read-only — this WIR is {selected?.status || "Submitted"}.
              </div>
            )}

            {/* Library Modal */}
            {clLibOpen && (
              <div
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
                onClick={() => setClLibOpen(false)}           // backdrop closes
              >
                <div
                  className="relative w-full max-w-2xl rounded-2xl border dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xl"
                  onClick={(e) => e.stopPropagation()}         // prevent backdrop close
                >
                  {/* Top-right close */}
                  <button
                    onClick={() => setClLibOpen(false)}
                    aria-label="Close"
                    className="absolute right-3 top-3 z-20 rounded-full border dark:border-neutral-700 bg-white/90 dark:bg-neutral-900/90 p-2 shadow"
                  >
                    ✕
                  </button>
                  <div className="p-4 space-y-3 pt-16 sm:pt-6"> {/* make space under the X on mobile */}
                    <div>
                      <input
                        value={clQuery}
                        onChange={(e) => setClQuery(e.target.value)}
                        placeholder="Search by code, title…"
                        className="w-full text-sm border rounded-lg px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                      />
                      <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                        Selected: {clPicked.size}
                      </div>
                    </div>
                    <div className="max-h-72 overflow-auto rounded border dark:border-neutral-800">
                      {checklists.loading ? (
                        <div className="p-3 text-sm text-gray-600 dark:text-gray-300">Loading…</div>
                      ) : checklists.error ? (
                        <div className="p-3 text-sm text-rose-600 dark:text-rose-400">{checklists.error}</div>
                      ) : visibleChecklists.length === 0 ? (
                        <div className="p-3 text-sm text-gray-600 dark:text-gray-300">No checklists found.</div>
                      ) : (
                        <ul className="divide-y dark:divide-neutral-800">
                          {visibleChecklists.map((c) => {
                            const label = [c.code, c.title].filter(Boolean).join(": ");
                            const picked = clPicked.has(c.id);
                            return (
                              <li key={c.id} className="p-2">
                                <label className="flex items-start gap-3 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={picked}
                                    onChange={() => toggleClPick(c.id)}
                                    className="mt-1"
                                    disabled={isRO}
                                  />
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium dark:text-white truncate">
                                      {label || c.id}
                                    </div>
                                    <div className="text-xs text-gray-600 dark:text-gray-300">
                                      {c.discipline || "—"} {c.aiDefault ? "• AI Default" : ""}
                                    </div>
                                  </div>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setClLibOpen(false)}
                          className="text-sm px-3 py-2 rounded border dark:border-neutral-800"
                        >
                          Close
                        </button>
                        <button
                          onClick={() => setClPicked(new Set())}
                          className="text-sm px-3 py-2 rounded border dark:border-neutral-800 disabled:opacity-60"
                          disabled={isRO}
                        >
                          Clear Selection
                        </button>
                      </div>
                      <button
                        onClick={confirmChecklistPick}
                        className="w-full text-sm px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
                        disabled={checklists.loading || isRO}
                      >
                        Add Selected
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="text-xs text-gray-600 dark:text-gray-400">
              Note: Select activity, discipline, date/time, and at least one checklist to submit.
            </div>
          </div>
        </div>
      )}

      {/* ===== Filter Modal ===== */}
      {filterOpen && view === "list" && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="relative w-full max-w-xl h-auto max-h-[85vh] bg-white dark:bg-neutral-900 rounded-2xl border dark:border-neutral-800 shadow-2xl flex flex-col"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <button
              onClick={() => setFilterOpen(false)}
              aria-label="Close"
              className="absolute right-3 top-3 z-20 rounded-full border dark:border-neutral-700 bg-white/90 dark:bg-neutral-900/90 p-2 shadow"
            >
              ✕
            </button>

            <div className="p-4 border-b dark:border-neutral-800">
              <div className="text-base sm:text-lg font-semibold dark:text-white">Filter WIRs</div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2 space-y-4">              {/* Status pills */}
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Status</div>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_OPTIONS.map((s) => {
                    const on = fltStatuses.has(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() =>
                          setFltStatuses((prev) => {
                            const next = new Set(prev);
                            if (next.has(s)) next.delete(s);
                            else next.add(s);
                            return next;
                          })
                        }
                        className={
                          "text-xs px-2 py-1 rounded-full border " +
                          (on
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800")
                        }
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Discipline pills */}
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Discipline</div>
                <div className="flex flex-wrap gap-1.5">
                  {DISCIPLINES.map((d) => {
                    const on = fltDisciplines.has(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          setFltDisciplines((prev) => {
                            const next = new Set(prev);
                            if (next.has(d)) next.delete(d);
                            else next.add(d);
                            return next;
                          })
                        }
                        className={
                          "text-xs px-2 py-1 rounded-full border " +
                          (on
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800")
                        }
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Date range */}
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Date Range</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">From</div>
                    <input
                      type="date"
                      value={fltDateFrom}
                      onChange={(e) => setFltDateFrom(e.target.value)}
                      className="mt-1 w-full text-sm border rounded-lg px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                    />
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">To</div>
                    <input
                      type="date"
                      value={fltDateTo}
                      onChange={(e) => setFltDateTo(e.target.value)}
                      className="mt-1 w-full text-sm border rounded-lg px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer buttons */}
            <div className="p-3 sm:p-4 border-t dark:border-neutral-800 flex gap-2">
              <button
                onClick={resetFilters}
                className="w-full text-sm px-3 py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
              >
                Reset
              </button>
              <button
                onClick={() => setFilterOpen(false)}
                className="w-full text-sm px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {hodFinalizeOpen && selected && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setHodFinalizeOpen(false)}
        >
          <div
            className="relative w-full max-w-lg bg-white dark:bg-neutral-900 rounded-2xl border dark:border-neutral-800 shadow-2xl p-4 sm:p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold dark:text-white">
                  Finalize HOD Recommendation
                </div>
                <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Review Inspector recommendation and select final outcome.
                </div>
              </div>
              <button
                onClick={() => setHodFinalizeOpen(false)}
                aria-label="Close"
                className="rounded-full border dark:border-neutral-700 bg-white/90 dark:bg-neutral-900/90 p-1.5 text-xs"
              >
                ✕
              </button>
            </div>

            {/* Info rows */}
            <div className="space-y-2 text-sm">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  WIR
                </div>
                <div className="mt-0.5 font-medium dark:text-white">
                  {hodModalWirTitle}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Inspector
                  </div>
                  <div className="mt-0.5 dark:text-white">
                    {hodModalInspectorName}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Recommendation
                  </div>
                  <div className="mt-0.5 dark:text-white">
                    {hodModalRecommendation}
                  </div>
                </div>
              </div>
            </div>

            {/* Select Outcome */}
            <div>
              <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">
                Select Outcome
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleHodOutcomeClick("ACCEPT")}
                  className={
                    "text-xs px-3 py-1.5 rounded-full border dark:border-neutral-800 " +
                    (hodOutcome === "ACCEPT"
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "hover:bg-gray-50 dark:hover:bg-neutral-800 dark:text-white")
                  }
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={handleHodOutcomeClick("RETURN")}
                  className={
                    "text-xs px-3 py-1.5 rounded-full border dark:border-neutral-800 " +
                    (hodOutcome === "RETURN"
                      ? "bg-amber-600 text-white border-amber-600"
                      : "hover:bg-gray-50 dark:hover:bg-neutral-800 dark:text-white")
                  }
                >
                  Return
                </button>
                <button
                  type="button"
                  onClick={handleHodOutcomeClick("REJECT")}
                  className={
                    "text-xs px-3 py-1.5 rounded-full border dark:border-neutral-800 " +
                    (hodOutcome === "REJECT"
                      ? "bg-rose-600 text-white border-rose-600"
                      : "hover:bg-gray-50 dark:hover:bg-neutral-800 dark:text-white")
                  }
                >
                  Reject
                </button>
              </div>
            </div>

            {/* Notes input */}
            <div>
              <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                Notes
              </div>
              <input
                type="text"
                value={hodNotesText}
                onChange={(e) => setHodNotesText(e.target.value)}
                placeholder="Add notes for your final decision (optional)…"
                className="w-full text-sm border rounded-lg px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
              />
            </div>

            {/* Footer actions */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setHodFinalizeOpen(false)}
                className="text-sm px-3 py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleHodFinalizeConfirm}
                className="text-sm px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Finalize Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Read-only View Modal for Submitted/Locked WIR ===== */}
      {roViewOpen && selected && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-stretch justify-center p-0 sm:p-4"
          onClick={() => setRoViewOpen(false)}
        >
          {/* Panel */}
          <div
            className="relative w-full max-w-3xl h-dvh sm:h-auto sm:max-h-[90dvh] bg-white dark:bg-neutral-900 rounded-none sm:rounded-2xl border dark:border-neutral-800 shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {/* Floating Close (mobile) */}
            <button
              onClick={() => setRoViewOpen(false)}
              aria-label="Close"
              className="sm:hidden fixed right-3 top-3 z-20 rounded-full border dark:border-neutral-700 bg-white/90 dark:bg-neutral-900/90 p-2 shadow"
            >
              ✕
            </button>

            {/* Header (sticky) */}
            <div className="sticky top-0 z-10 p-3 sm:p-4 border-b dark:border-neutral-800 bg-white/95 dark:bg-neutral-900/95 backdrop-blur supports-[backdrop-filter]:bg-white/70">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">
                    {projectLabel}
                  </div>
                  <div className="text-base sm:text-lg font-semibold dark:text-white break-words">
                    {(selected.code ? `${selected.code} — ` : "") + (selected.title || "Inspection Request")}
                  </div>

                  {/* badges placed under title to avoid cropping */}
                  <div
                    className="mt-1 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap sm:flex-wrap sm:whitespace-normal"
                  >
                    <KpiPill value={selected?.status || "—"} tone={toneForStatus(selected?.status)} />
                    <KpiPill value={transmissionType || "—"} tone={toneForTransmission(transmissionType)} />
                    <KpiPill prefix="BIC" value={selected?.bicName || "—"} tone="neutral" />
                  </div>
                </div>
              </div>

              {/* NEW: Primary Tabs — Document / Discussion */}
              <div className="mt-3 flex items-center gap-1">
                {[
                  { k: 'document' as const, label: 'Document' },
                  { k: 'discussion' as const, label: 'Discussion' },
                ].map(t => {
                  const on = roTab === t.k;
                  return (
                    <button
                      key={t.k}
                      onClick={() => setRoTab(t.k)}
                      className={
                        "px-3 py-1.5 rounded-lg text-sm border transition " +
                        (on
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-white dark:bg-neutral-900 dark:text-white dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800")
                      }
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {/* NEW: Document Sub-Tabs — Overview / Runner (only show when Document is active) */}
              {roTab === 'document' && (
                <div className="mt-2 flex items-center gap-1">
                  {[
                    { k: 'overview' as const, label: 'Overview' },
                    { k: 'runner' as const, label: 'Runner' },
                  ].map(t => {
                    const on = docTab === t.k;
                    return (
                      <button
                        key={t.k}
                        onClick={() => setDocTab(t.k)}
                        className={
                          "px-2.5 py-1 rounded-md text-xs border transition " +
                          (on
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-white dark:bg-neutral-900 dark:text-white dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800")
                        }
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>


            {/* Body (scrollable) */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
              {/* DOCUMENT TABS */}
              {roTab === 'document' && (
                <>
                  {docTab === 'overview' && (
                    <>
                      {/* Submission Summary — unchanged content */}
                      <SectionCard title="Submission Summary">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                          <FieldRow
                            label="Activity & Area"
                            value={[
                              newForm.activityLabel || selected?.title || "—",
                              (newForm.location || selected?.cityTown || "").trim() || "—",
                            ].join(" — ")}
                          />
                          <FieldRow
                            label="Schedule"
                            value={
                              selected?.forDate
                                ? `${fmtDate(selected.forDate)}${selected?.forTime ? ` · ${selected.forTime}` : ""}`
                                : "—"
                            }
                          />
                          <FieldRow label="Discipline" value={selected?.discipline || "—"} />
                          <FieldRow label="Checklist" value={ovLoading ? "Calculating…" : ovError ? `— (error: ${ovError})` : ovStats ? `${ovStats.total} items · ${ovStats.mandatory} mandatory · ${ovStats.critical} critical` : "—"} />
                          <FieldRow label="Inspector of Record" value={selected?.inspectorName || "—"} />
                          <FieldRow label="Contractor" value={selected?.contractorName || "—"} />
                          <FieldRow label="HOD" value={selected?.hodName || "—"} />
                          <FieldRow label="Ball in Court" value={`BIC: ${selected?.bicName || "—"}`} />
                          <FieldRow label="Follow up" value="Not Required" />
                        </div>

                      </SectionCard>

                      {/* Actions — unchanged content */}
                      <SectionCard title="Actions">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={onOpenFilledForm}
                            className="px-3 py-2 rounded border dark:border-neutral-800 text-sm hover:bg-gray-50 dark:hover:bg-neutral-800"
                          >
                            Open Filled Form (read-only)
                          </button>
                          <button
                            onClick={onReschedule}
                            className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-sm"
                          >
                            Reschedule
                          </button>
                        </div>
                      </SectionCard>
                    </>
                  )}

                  {docTab === 'runner' && (
                    <SectionCard title={`Runner · Checklist Items (${runnerItems.length})`}>
                      {runnerLoading ? (
                        <div className="text-sm text-gray-700 dark:text-gray-300">Loading…</div>
                      ) : runnerError ? (
                        <div className="text-sm text-rose-700 dark:text-rose-400">{runnerError}</div>
                      ) : runnerItems.length === 0 ? (
                        <div className="text-sm text-gray-700 dark:text-gray-300">
                          No checklist items found for this WIR.
                        </div>
                      ) : (
                        <>
                          {/* All checklist items + Inspector tiles */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {runnerItems.map((it, i) => {
                              const tolStr =
                                formatTolerance(
                                  (it.tolerance as any) ?? null,
                                  it.base ?? null,
                                  it.plus ?? null,
                                  it.minus ?? null,
                                  it.unit || null
                                ) || (it.tolerance ? String(it.tolerance) : "");

                              const activityTitle =
                                (newForm.activityLabel || selected?.title || "Activity").toString();
                              const activityCode = (selected?.code || "").toString();
                              const reqLabel = requiredToLabel(it.required);

                              const inspector = getInspectorState(it.id);
                              const passOn = inspector.status === "PASS";
                              const failOn = inspector.status === "FAIL";
                              const photoCount = inspector.photos.length;
                              const hod = getHodState(it.id);

                              return (
                                <div
                                  key={it.id || `runner-${i}`}
                                  className="rounded-xl border dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 shadow-sm"
                                >
                                  {/* Heading: Title — Tol */}
                                  <div className="text-sm font-semibold dark:text-white break-words">
                                    {it.title}
                                    {tolStr ? <span className="opacity-70"> — {tolStr}</span> : null}
                                  </div>

                                  {/* Meta: Activity Title • Activity Code */}
                                  <div className="mt-0.5">
                                    <DotSep left={activityTitle} right={activityCode || "—"} />
                                  </div>

                                  {/* Pills */}
                                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                                    <SoftPill label={reqLabel} />
                                    {it.critical ? <SoftPill label="Critical" tone="danger" /> : null}
                                    <SoftPill label="Unit" value={it.unit || ""} />
                                    <SoftPill label="Tol" value={tolStr} tone="info" />
                                    {it.status ? (
                                      <SoftPill label="Status" value={String(it.status)} />
                                    ) : null}
                                  </div>

                                  {/* Tags */}
                                  <div className="mt-2">
                                    {it.tags && it.tags.length ? (
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        {it.tags.map((t, k) => (
                                          <span
                                            key={`${it.id}-tag-${k}`}
                                            className="text-[11px] px-2 py-0.5 rounded-md border dark:border-neutral-800 bg-gray-50 text-gray-800 dark:bg-neutral-800 dark:text-gray-200"
                                          >
                                            #{t}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="text-[11px] text-gray-500 dark:text-gray-400">
                                        No tags
                                      </div>
                                    )}
                                  </div>

                                  {/* ===== Tile - Inspector (per checklist item) ===== */}
                                  <div className="mt-3 pt-3 border-t dark:border-neutral-800">
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                                        Inspector
                                      </div>
                                      {inspector.status && (
                                        <span className="text-[11px] px-2 py-0.5 rounded-full border border-emerald-500 text-emerald-700 dark:border-emerald-400 dark:text-emerald-300">
                                          Marked: {inspector.status}
                                        </span>
                                      )}
                                    </div>

                                    {/* Row: Add Photo + PASS / FAIL buttons */}
                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                      {/* Add Photo */}
                                      <label className="inline-flex items-center text-xs px-2 py-1 rounded border dark:border-neutral-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-800">
                                        <input
                                          type="file"
                                          accept="image/*"
                                          capture="environment"      // 👈 ask mobile to open back camera
                                          // capture="user"          // (optional) front camera instead
                                          className="hidden"
                                          multiple={false}           // camera + multiple often not supported together
                                          onChange={handleInspectorPhotoChange(it.id)}
                                        />
                                        <span className="mr-1">📷</span>
                                        <span>Take Photo</span>
                                      </label>

                                      {photoCount > 0 && (
                                        <span className="text-[11px] px-2 py-0.5 rounded-full border dark:border-neutral-800">
                                          {photoCount} photo{photoCount === 1 ? "" : "s"} attached
                                        </span>
                                      )}

                                      <div className="flex items-center gap-1 ml-auto">
                                        <button
                                          type="button"
                                          onClick={handleInspectorMark(it.id, "PASS")}
                                          className={
                                            "text-xs px-2 py-1 rounded border dark:border-neutral-800 transition " +
                                            (passOn
                                              ? "bg-emerald-600 text-white border-emerald-600"
                                              : "hover:bg-gray-50 dark:hover:bg-neutral-800")
                                          }
                                        >
                                          Mark PASS
                                        </button>
                                        <button
                                          type="button"
                                          onClick={handleInspectorMark(it.id, "FAIL")}
                                          className={
                                            "text-xs px-2 py-1 rounded border dark:border-neutral-800 transition " +
                                            (failOn
                                              ? "bg-rose-600 text-white border-rose-600"
                                              : "hover:bg-gray-50 dark:hover:bg-neutral-800")
                                          }
                                        >
                                          Mark FAIL
                                        </button>
                                      </div>
                                    </div>
                                    {/* Measurement input */}
                                    <div className="mb-2">
                                      <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                                        Measurement
                                      </div>
                                      <input
                                        type="text"
                                        className="w-full text-xs border rounded-lg px-2 py-1 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                                        placeholder="Enter measurement (e.g., 19.8 mm/m)…"
                                        value={inspector.measurement}
                                        onChange={handleInspectorMeasurementChange(it.id)}
                                      />
                                    </div>
                                    {/* Remark input */}
                                    <div>
                                      <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                                        Inspector Remark
                                      </div>
                                      <textarea
                                        rows={2}
                                        className="w-full text-xs border rounded-lg px-2 py-1 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                                        placeholder="Write brief observation / measurement notes…"
                                        value={inspector.remark}
                                        onChange={handleInspectorRemarkChange(it.id)}
                                      />
                                    </div>
                                  </div>
                                  {/* ===== Tile - HOD (per checklist item) ===== */}
                                  <div className="mt-3 pt-3 border-t dark:border-neutral-800">
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                                        HOD
                                      </div>
                                      {hod.lastSavedAt && (
                                        <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                          Saved at {fmtDateTime(hod.lastSavedAt)}
                                        </span>
                                      )}
                                    </div>

                                    {/* Inspector remark (read-only) */}
                                    <div className="mb-2">
                                      <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                                        Inspector Remark (read-only)
                                      </div>
                                      <div className="text-xs px-2 py-1 rounded-lg border dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800 dark:text-gray-100 min-h-[2.25rem] whitespace-pre-wrap">
                                        {(inspector.remark || "").trim() || "—"}
                                      </div>
                                    </div>

                                    {/* HOD remark input */}
                                    <div className="mb-2">
                                      <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                                        HOD Remark
                                      </div>
                                      <textarea
                                        rows={2}
                                        className="w-full text-xs border rounded-lg px-2 py-1 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                                        placeholder="HOD comments / final decision…"
                                        value={hod.remark}
                                        onChange={handleHodRemarkChange(it.id)}
                                      />
                                    </div>

                                    {/* Save button */}
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        type="button"
                                        onClick={handleHodSave(it.id)}
                                        className="text-xs px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white"
                                      >
                                        Save
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* ===== Tile - Inspector Recommendation (for all items) ===== */}
                          <div className="mt-4 pt-4 border-t dark:border-neutral-800">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                                Inspector Recommendation
                              </div>
                            </div>

                            {(() => {
                              const rec = getInspectorRecommendation(OVERALL_REC_KEY);

                              const onClickChoice = (choice: InspectorRecommendationChoice) => () => {
                                const current = getInspectorRecommendation(OVERALL_REC_KEY);
                                updateInspectorRecommendation(
                                  OVERALL_REC_KEY,
                                  current === choice ? null : choice
                                );
                              };

                              const approveOn = rec === "APPROVE";
                              const approveWithCommentsOn = rec === "APPROVE_WITH_COMMENTS";
                              const rejectOn = rec === "REJECT";

                              return (
                                <>
                                  {/* Pills row */}
                                  <div className="flex flex-wrap items-center gap-2 mb-2">
                                    <button
                                      type="button"
                                      onClick={onClickChoice("APPROVE")}
                                      className={
                                        "text-xs px-3 py-1.5 rounded-full border dark:border-neutral-800 transition " +
                                        (approveOn
                                          ? "bg-emerald-600 text-white border-emerald-600"
                                          : "bg-white dark:bg-neutral-900 hover:bg-gray-50 dark:hover:bg-neutral-800")
                                      }
                                    >
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      onClick={onClickChoice("APPROVE_WITH_COMMENTS")}
                                      className={
                                        "text-xs px-3 py-1.5 rounded-full border dark:border-neutral-800 transition " +
                                        (approveWithCommentsOn
                                          ? "bg-indigo-600 text-white border-indigo-600"
                                          : "bg-white dark:bg-neutral-900 hover:bg-gray-50 dark:hover:bg-neutral-800")
                                      }
                                    >
                                      Approve with Comments
                                    </button>
                                    <button
                                      type="button"
                                      onClick={onClickChoice("REJECT")}
                                      className={
                                        "text-xs px-3 py-1.5 rounded-full border dark:border-neutral-800 transition " +
                                        (rejectOn
                                          ? "bg-rose-600 text-white border-rose-600"
                                          : "bg-white dark:bg-neutral-900 hover:bg-gray-50 dark:hover:bg-neutral-800")
                                      }
                                    >
                                      Reject
                                    </button>
                                  </div>

                                  <div className="text-[11px] text-gray-600 dark:text-gray-400">
                                    We will add relevant comment according to the approval status.
                                  </div>
                                  {/* Action buttons: Save Progress / Preview / Send to HOD */}
                                  <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => persistInspectorData("save")}
                                      disabled={inspectorSaving}
                                      className="text-xs px-3 py-1.5 rounded-md border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800 disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                      {inspectorSaving ? "Saving…" : "Save Progress"}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => persistInspectorData("preview")}
                                      disabled={inspectorSaving}
                                      className="text-xs px-3 py-1.5 rounded-md border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800 disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                      Preview
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => persistInspectorData("sendToHod")}
                                      disabled={inspectorSaving}
                                      className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                      Send to HOD
                                    </button>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                          {/* Tile - HOD Recommendation (overall) */}
                          <div className="mt-4 rounded-xl border dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 sm:p-4">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <div className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                                  HOD Recommendation
                                </div>
                                <div className="mt-1 text-sm text-gray-800 dark:text-gray-100">
                                  <span className="font-medium">Inspector recommendation:&nbsp;</span>
                                  <span className="text-gray-700 dark:text-gray-200">
                                    {overallInspectorRec || "Not yet provided"}
                                  </span>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={openHodFinalizeModal}
                                className="text-xs px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white"
                              >
                                Finalize Now
                              </button>

                            </div>
                          </div>

                        </>
                      )}
                    </SectionCard>
                  )}
                </>
              )}

              {/* DISCUSSION TAB */}
              {roTab === 'discussion' && selected && (
                <>
                  {/* COMMENT SECTION FIRST */}
                  <SectionCard title="Add a comment">
                    <div className="flex flex-col gap-2">
                      <textarea
                        rows={3}
                        placeholder="Write a message to the project team…"
                        className="w-full text-sm border rounded-lg px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                        value={discText}
                        onChange={(e) => setDiscText(e.target.value)}
                      />

                      {/* Attach: file OR camera photo */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* File picker */}
                        <label className="text-xs px-2 py-1 rounded border dark:border-neutral-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-800">
                          <input
                            type="file"
                            className="hidden"
                            onChange={(e) => setDiscFile(e.target.files?.[0] ?? null)}
                          />
                          📎 Attach file
                        </label>

                        {/* Camera capture (mobile-friendly) */}
                        <label className="text-xs px-2 py-1 rounded border dark:border-neutral-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-800">
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={(e) => setDiscFile(e.target.files?.[0] ?? null)}
                          />
                          📷 Take photo
                        </label>

                        {/* Show picked file name */}
                        {discFile && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full border dark:border-neutral-800">
                            {discFile.name}
                          </span>
                        )}

                        <div className="grow" />

                        <button
                          onClick={onDiscussionSend}
                          className="shrink-0 px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-sm"
                        >
                          Send
                        </button>
                      </div>
                    </div>
                  </SectionCard>

                  {/* THREAD BELOW COMMENT BOX */}
                  <SectionCard title="Thread">
                    {discLoading && (
                      <div className="text-sm text-gray-700 dark:text-gray-300">Loading…</div>
                    )}
                    {discError && !discLoading && (
                      <div className="text-sm text-rose-700 dark:text-rose-400">
                        {discError}
                      </div>
                    )}
                    {!discLoading && !discError && discMsgs.length === 0 && (
                      <div className="text-sm text-gray-700 dark:text-gray-300">
                        No messages yet.
                      </div>
                    )}

                    <div className="mt-2 space-y-3">
                      {discMsgs.map((m) => {
                        const who =
                          (m.authorName && m.authorName.trim()) ||
                          userNameById[m.authorId] ||
                          `User #${m.authorId}`;
                        return (
                          <div
                            key={m.id}
                            className="text-sm rounded-lg border dark:border-neutral-800 p-3 bg-white dark:bg-neutral-900"
                          >
                            <div className="font-medium dark:text-white break-words">
                              {who}
                            </div>
                            {m.notes && (
                              <div className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words mt-0.5">
                                {m.notes}
                              </div>
                            )}
                            {m.fileUrl && (
                              <div className="mt-2">
                                <a
                                  href={m.fileUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs underline text-emerald-700 dark:text-emerald-300"
                                >
                                  {m.fileName || "View attachment"}
                                </a>
                              </div>
                            )}
                            <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                              {fmtDateTime(m.createdAt)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </SectionCard>
                </>
              )}

            </div>

            {/* Footer (sticky) */}
            <div className="sticky bottom-0 z-10 p-3 sm:p-4 border-t dark:border-neutral-800 bg-white/95 dark:bg-neutral-900/95 backdrop-blur supports-[backdrop-filter]:bg-white/70">
              <div className="flex items-center justify-end">
                <button
                  onClick={() => setRoViewOpen(false)}
                  className="text-sm px-3 py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800 w-full sm:w-auto"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ===== WIR History modal ===== */}
      {histOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-stretch justify-end p-0"
          onClick={() => setHistOpen(false)}
        >
          <div
            className="relative w-full sm:w-[520px] max-w-[90vw] h-dvh sm:h-auto sm:max-h-[90dvh] bg-white dark:bg-neutral-900 rounded-none sm:rounded-l-2xl border-l dark:border-neutral-800 shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 p-4 border-b dark:border-neutral-800 bg-white/95 dark:bg-neutral-900/95 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">History</div>
                  <div className="text-base font-semibold dark:text-white">
                    {selected?.code ? `${selected.code} — ` : ''}{selected?.title || 'Inspection Request'}
                  </div>
                </div>
                <button
                  onClick={() => setHistOpen(false)}
                  className="text-sm px-3 py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {histLoading && (
                <div className="text-sm text-gray-700 dark:text-gray-300">Loading history…</div>
              )}
              {histError && !histLoading && (
                <div className="text-sm text-rose-700 dark:text-rose-400">{histError}</div>
              )}
              {!histLoading && !histError && histRows.length === 0 && (
                <div className="text-sm text-gray-600 dark:text-gray-400">No history yet.</div>
              )}

              {/* Timeline */}
              <ol className="relative border-l pl-4 dark:border-neutral-800">
                {histRows.map((r) => (
                  <li key={r.id} className="mb-6 ml-2">
                    <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full bg-emerald-500" />
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium dark:text-white">{r.action}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{fmtDateTime(r.date)}</div>
                    </div>
                    <div className="mt-0.5 text-xs text-gray-700 dark:text-gray-300">
                      {r.by ? `By: ${r.by}` : 'By: —'}
                    </div>
                    {(r.fromStatus || r.toStatus) && (
                      <div className="mt-1 text-xs">
                        <span className="px-1.5 py-0.5 rounded border dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800">
                          {r.fromStatus || '—'}
                        </span>
                        <span className="mx-1 opacity-60">→</span>
                        <span className="px-1.5 py-0.5 rounded border dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800">
                          {r.toStatus || '—'}
                        </span>
                      </div>
                    )}
                    {r.notes && (
                      <div className="mt-1 text-xs text-gray-600 dark:text-gray-400 break-words">
                        Notes: {r.notes}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* ===== Open Filled Form (Submitted WIR) ===== */}
      {filledOpen && selected && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-stretch justify-center p-0 sm:p-4"
          onClick={() => setFilledOpen(false)}
        >
          <div
            className="relative w-full max-w-3xl h-dvh sm:h-auto sm:max-h-[90dvh] bg-white dark:bg-neutral-900 rounded-none sm:rounded-2xl border dark:border-neutral-800 shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {/* Close (mobile) */}
            <button
              onClick={() => setFilledOpen(false)}
              aria-label="Close"
              className="sm:hidden absolute right-3 top-3 z-20 rounded-full border dark:border-neutral-700 bg-white/90 dark:bg-neutral-900/90 p-2 shadow"
            >
              ✕
            </button>

            {/* Header */}
            <div className="sticky top-0 z-10 p-3 sm:p-4 border-b dark:border-neutral-800 bg-white/95 dark:bg-neutral-900/95 backdrop-blur">
              <div className="min-w-0">
                <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">
                  {projectLabel}
                </div>
                <div className="text-base sm:text-lg font-semibold dark:text-white break-words">
                  {(selected.code ? `${selected.code} — ` : "") + (selected.title || "Inspection Request")}
                </div>
                <div className="mt-1 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap sm:flex-wrap sm:whitespace-normal">
                  <KpiPill value={selected?.status || "—"} tone={toneForStatus(selected?.status)} />
                  <KpiPill value={transmissionType || "—"} tone={toneForTransmission(transmissionType)} />
                  <KpiPill prefix="BIC" value={selected?.bicName || "—"} tone="neutral" />
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4" ref={filledRef}>
              {/* Project Details */}
              <SectionCard title="Project Details">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <FieldRow label="Project" wide value={
                    [selected?.projectCode, selected?.projectTitle].filter(Boolean).join(" — ") || projectLabel
                  } />
                  <FieldRow label="Status" value={selected?.status || "—"} />
                  <FieldRow label="Ball in Court" value={selected?.bicName || "—"} />
                  <FieldRow label="Contractor" value={selected?.contractorName || "—"} />
                </div>
              </SectionCard>

              {/* Activity / Discipline / Schedule */}
              <SectionCard title="Activity & Schedule">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <FieldRow label="Activity" value={newForm.activityLabel || selected?.title || "—"} />
                  <FieldRow label="Discipline" value={selected?.discipline || "—"} />
                  <FieldRow
                    label="Schedule"
                    value={
                      selected?.forDate
                        ? `${fmtDate(selected.forDate)}${selected?.forTime ? ` · ${selected.forTime}` : ""}`
                        : "—"
                    }
                  />
                  <FieldRow label="Transmission Type" value={transmissionType || "—"} />
                </div>
              </SectionCard>

              {/* Recipient */}
              <SectionCard title="Recipient">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <FieldRow label="Inspector of Record" value={selected?.inspectorName || "—"} />
                  <FieldRow label="HOD" value={selected?.hodName || "—"} />
                </div>
              </SectionCard>

              {/* Checklist Items
                            <SectionCard title={`Checklist Items (${selected?.items?.length || 0})`}>
                                {(!selected?.items || selected.items.length === 0) ? (
                                    <div className="text-sm text-gray-600 dark:text-gray-300">No items.</div>
                                ) : (
                                    <ul className="divide-y dark:divide-neutral-800 rounded-lg border dark:border-neutral-800 overflow-hidden">
                                        {selected.items.map((it: any, i: number) => {
                                            const raw = String(it?.name ?? "").trim();
                                            // Try to split "CODE: Title" -> show as "CODE • Title"
                                            const parts = raw.split(":");
                                            const code = parts.length > 1 ? parts[0].trim() : "";
                                            const title = parts.length > 1 ? parts.slice(1).join(":").trim() : (raw || "—");

                                            // Optional meta line (keeps UI tidy, but no extra functions)
                                            const meta: string[] = [];
                                            if (it?.spec) meta.push(String(it.spec));
                                            if (it?.required != null && it.required !== "") meta.push(`Required: ${it.required}`);
                                            if (it?.tolerance) meta.push(`Tol: ${it.tolerance}`);

                                            return (
                                                <li key={it.id ?? i} className="p-3 sm:p-3.5">
                                                    <div className="flex items-start gap-2">
                                                        <div className="pt-0.5 text-xs opacity-60 w-6 shrink-0">{i + 1}.</div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="text-sm font-medium dark:text-white break-words">
                                                                {code ? (
                                                                    <>
                                                                        <span className="font-mono">{code}</span>
                                                                        <span className="mx-1">•</span>
                                                                        <span>{title}</span>
                                                                    </>
                                                                ) : (
                                                                    <span>{title}</span>
                                                                )}
                                                            </div>

                                                            {meta.length > 0 && (
                                                                <div className="mt-0.5 text-xs text-gray-600 dark:text-gray-300 break-words">
                                                                    {meta.join(" · ")}
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="ml-2 shrink-0 text-xs px-2 py-1 rounded border dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800">
                                                            {it?.status ?? "—"}
                                                        </div>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </SectionCard>  */}

              {/* Notes/Description */}
              <SectionCard title="Description / Notes">
                <div className="text-sm whitespace-pre-wrap dark:text-white">
                  {selected?.description || "—"}
                </div>
              </SectionCard>

              {/* Footer meta inside printable area */}
            </div>

            {/* Footer buttons */}
            <div className="sticky bottom-0 z-10 p-3 sm:p-4 border-t dark:border-neutral-800 bg-white/95 dark:bg-neutral-900/95 backdrop-blur">
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setFilledOpen(false)}
                  className="text-sm px-3 py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800 w-full sm:w-auto"
                >
                  Close
                </button>
                <button
                  onClick={onExportFilledPdf}
                  className="text-sm px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto"
                >
                  Export (PDF)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Dispatch Work Inspection (mobile-first) ===== */}
      {dispatchOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-stretch justify-center p-0 sm:p-4">
          <div
            className="relative w-full max-w-md h-dvh sm:h-auto sm:max-h-[90dvh] bg-white dark:bg-neutral-900 rounded-none sm:rounded-2xl border dark:border-neutral-800 shadow-2xl flex flex-col"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close (top-right) */}
            <button
              onClick={() => setDispatchOpen(false)}
              aria-label="Close"
              className="absolute right-3 top-3 z-20 rounded-full border dark:border-neutral-700 bg-white/90 dark:bg-neutral-900/90 p-2 shadow"
            >
              ✕
            </button>

            {/* Header */}
            <div className="p-4 border-b dark:border-neutral-800">
              <div className="text-base sm:text-lg font-semibold dark:text-white">Dispatch Work Inspection</div>
            </div>

            {/* Body */}
            <div className="overflow-y-auto px-4 pt-4 pb-2 space-y-4">
              {/* Transmission pill (Transmission type) */}
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Transmission</div>
                <KpiPill value={transmissionType || "—"} tone={toneForTransmission(transmissionType)} />
              </div>

              {/* Recipients tile */}
              <SectionCard title="Recipients">
                {/* Selected inspector box (read-only) */}
                <div className="mb-3">
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                    Selected Inspector
                  </div>
                  <div
                    className="w-full text-sm border rounded-lg px-3 py-2 bg-gray-50 dark:bg-neutral-800
                  dark:text-white dark:border-neutral-800"
                  >
                    {pickedCandidate
                      ? `${displayNameLite(pickedCandidate)}${pickedCandidate.acting ? ` — ${pickedCandidate.acting}` : ""
                      }`
                      : "— None selected —"}
                  </div>
                </div>
                {/* Search */}
                <div className="flex items-center gap-2 mb-2">
                  <input
                    value={dispatchSearch}
                    onChange={(e) => setDispatchSearch(e.target.value)}
                    placeholder="Search by name or company"
                    className="w-full text-sm border rounded-lg px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                  />
                  <button
                    onClick={() => setDispatchSearch("")}
                    className="text-xs px-2 py-1 rounded border dark:border-neutral-800"
                  >
                    Clear
                  </button>
                </div>

                {/* Label moved below search */}
                <div className="text-xs text-gray-600 dark:text-gray-300 mb-2">AI Suggestions</div>

                {/* List (clickable items; no radios) */}
                <div className="max-h-72 overflow-auto rounded border dark:border-neutral-800">
                  {dispatchLoading ? (
                    <div className="p-3 text-sm text-gray-600 dark:text-gray-300">Loading…</div>
                  ) : dispatchErr ? (
                    <div className="p-3 text-sm text-rose-600 dark:text-rose-400">{dispatchErr}</div>
                  ) : dispatchCandidates.length === 0 ? (
                    <div className="p-3 text-sm text-gray-600 dark:text-gray-300">No suggestions.</div>
                  ) : (
                    <ul className="divide-y dark:divide-neutral-800">
                      {dispatchCandidates
                        .filter((u) => {
                          const q = dispatchSearch.trim().toLowerCase();
                          if (!q) return true;
                          const hay = [displayNameLite(u), u.companyName || "", u.email || ""]
                            .join(" ")
                            .toLowerCase();
                          return hay.includes(q);
                        })
                        .map((u) => {
                          const isPicked = String(dispatchPick || "") === String(u.userId);
                          return (
                            <li key={u.userId} className="p-0">
                              <button
                                type="button"
                                onClick={() => setDispatchPick(String(u.userId))}
                                aria-pressed={isPicked}
                                className={
                                  "w-full text-left p-2 flex items-start gap-3 transition rounded " +
                                  (isPicked
                                    ? "bg-emerald-50 dark:bg-emerald-900/20 ring-2 ring-emerald-500/60"
                                    : "hover:bg-gray-50 dark:hover:bg-neutral-800")
                                }
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium dark:text-white break-words">
                                    {displayNameLite(u)}
                                    {u.acting ? ` — ${u.acting}` : ""}
                                  </div>
                                  <div className="text-xs text-gray-600 dark:text-gray-300 break-words">
                                    {u.companyName || "—"}
                                  </div>
                                  <div className="text-xs text-gray-600 dark:text-gray-300 break-words">
                                    {[u.displayPhone, u.email].filter(Boolean).join(" • ") || "—"}
                                  </div>
                                </div>
                                {isPicked && <span className="ml-2 text-sm">✔</span>}
                              </button>
                            </li>
                          );
                        })}
                    </ul>
                  )}
                </div>
              </SectionCard>
              {/* AI Routing & Summary */}
              <SectionCard title="AI Routing & Summary">
                <div className="grid grid-cols-1 gap-3 text-sm">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                      Subject
                    </div>
                    <div className="w-full border rounded-lg px-3 py-2 bg-gray-50 dark:bg-neutral-800 dark:text-white dark:border-neutral-800">
                      {aiRouting.subject}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                      Auto-summary
                    </div>
                    <div className="w-full border rounded-lg px-3 py-2 bg-gray-50 dark:bg-neutral-800 dark:text-white dark:border-neutral-800">
                      {aiRouting.summary}
                    </div>
                  </div>
                </div>
              </SectionCard>
            </div>

            {/* Footer */}
            <div className="p-3 sm:p-4 border-t dark:border-neutral-800 flex gap-2">
              <button
                onClick={() => setDispatchOpen(false)}
                className="w-full text-sm px-3 py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                onClick={onDispatchSend}
                className="w-full text-sm px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
                disabled={!dispatchPick}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ===== Reschedule Modal (Submitted WIR view) ===== */}
      {resOpen && selected && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-stretch justify-center p-0 sm:p-4"
          onClick={() => setResOpen(false)}
        >
          <div
            className="relative w-full max-w-md h-dvh sm:h-auto sm:max-h-[90dvh] bg-white dark:bg-neutral-900 rounded-none sm:rounded-2xl border dark:border-neutral-800 shadow-2xl flex flex-col"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <button
              onClick={() => setResOpen(false)}
              aria-label="Close"
              className="absolute right-3 top-3 z-20 rounded-full border dark:border-neutral-700 bg-white/90 dark:bg-neutral-900/90 p-2 shadow"
            >
              ✕
            </button>

            {/* Header */}
            <div className="p-4 border-b dark:border-neutral-800">
              <div className="text-base sm:text-lg font-semibold dark:text-white">Reschedule Inspection</div>
              <div className="mt-1 text-xs text-gray-600 dark:text-gray-300 break-words">
                {projectLabel}
              </div>
              <div className="text-sm font-medium dark:text-white break-words">
                {(selected.code ? `${selected.code} — ` : "") + (selected.title || "Inspection Request")}
              </div>
            </div>

            {/* Body */}
            <div className="overflow-y-auto px-4 pt-4 pb-2 space-y-4">
              {/* Current schedule (read-only inputs for quick copy/reference) */}
              <SectionCard title="Current Schedule">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Date</div>
                    <input
                      type="date"
                      value={resCurDate}
                      readOnly
                      className="mt-1 w-full text-sm border rounded-lg px-3 py-2 bg-gray-50 dark:bg-neutral-800 dark:text-white dark:border-neutral-800"
                    />
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Time</div>
                    <input
                      readOnly
                      value={resCurTime}
                      className="mt-1 w-full text-sm border rounded-lg px-3 py-2 bg-gray-50 dark:bg-neutral-800 dark:text-white dark:border-neutral-800"
                    />
                  </div>
                </div>
              </SectionCard>

              {/* New schedule (editable) */}
              <SectionCard title="New Schedule">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">New Date</div>
                    <input
                      type="date"
                      value={resNewDate}
                      onChange={(e) => setResNewDate(e.target.value)}
                      className="mt-1 w-full text-sm border rounded-lg px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                    />
                  </div>
                  <div className="relative">
                    <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">New Time</div>
                    <input
                      readOnly
                      value={resNewTime}
                      onClick={() => openResTP("new")}
                      className="mt-1 w-full text-sm border rounded-lg px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800 cursor-pointer"
                    />
                    {/* Time picker popover */}
                    {resTPopen && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setResTPopen(null)} />
                        <div className="absolute z-40 mt-2 w-full max-w-xs rounded-xl border dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-lg p-3">
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Hour</div>
                              <select
                                className="w-full text-sm border rounded-lg px-2 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                                value={resTpHour}
                                onChange={(e) => setResTpHour(Math.min(12, Math.max(1, parseInt(e.target.value, 10) || 12)))}
                              >
                                {Array.from({ length: 12 }).map((_, i) => {
                                  const v = i + 1;
                                  return <option key={v} value={v}>{String(v).padStart(2, "0")}</option>;
                                })}
                              </select>
                            </div>
                            <div>
                              <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Minute</div>
                              <select
                                className="w-full text-sm border rounded-lg px-2 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                                value={resTpMinute}
                                onChange={(e) => setResTpMinute(Math.min(59, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                              >
                                {Array.from({ length: 60 }).map((_, i) => (
                                  <option key={i} value={i}>{String(i).padStart(2, "0")}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">AM/PM</div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => setResTpAP("AM")}
                                  className={"flex-1 text-sm px-2 py-2 rounded border dark:border-neutral-800 " + (resTpAP === "AM" ? "bg-emerald-600 text-white" : "hover:bg-gray-50 dark:hover:bg-neutral-800")}
                                >AM</button>
                                <button
                                  type="button"
                                  onClick={() => setResTpAP("PM")}
                                  className={"flex-1 text-sm px-2 py-2 rounded border dark:border-neutral-800 " + (resTpAP === "PM" ? "bg-emerald-600 text-white" : "hover:bg-gray-50 dark:hover:bg-neutral-800")}
                                >PM</button>
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setResTPopen(null)}
                              className="text-sm px-3 py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                            >Cancel</button>
                            <button
                              type="button"
                              onClick={confirmResTP}
                              className="text-sm px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white"
                            >Set Time</button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Notes */}
                <div className="mt-3">
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Notes</div>
                  <textarea
                    rows={4}
                    value={resNote}
                    onChange={(e) => setResNote(e.target.value)}
                    placeholder="Add a brief reason or additional info for rescheduling…"
                    className="w-full text-sm border rounded-lg px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                  />
                </div>
              </SectionCard>
            </div>

            {/* Footer */}
            <div className="p-3 sm:p-4 border-t dark:border-neutral-800 flex gap-2">
              <button
                onClick={() => setResOpen(false)}
                className="w-full text-sm px-3 py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                disabled={resSaving}
              >
                Cancel
              </button>
              <button
                onClick={onResSave}
                className="w-full text-sm px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
                disabled={resSaving}
              >
                {resSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}