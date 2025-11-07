// pms-frontend/src/views/home/modules/WIR/WIR.IHPMT.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { api } from "../../../../api/client";
import { useAuth } from "../../../../hooks/useAuth";
import { getRoleBaseMatrix } from "../../../admin/permissions/AdminPermProjectOverrides";
import { getModuleSettings } from "../../../../api/adminModuleSettings";
import { normalizeSettings } from "../../../admin/moduleSettings/useModuleSettings";

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
  // Per your rule:
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

// NEW: fetch ALL PMCs active for this project on a date (sorted by most recently updated)
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

/* ========================= Main Component ========================= */
export default function WIR_IHPMT({ hideTopHeader, onBackOverride }: WIRProps) {
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
      alert("Please pick a recipient.");
      return;
    }

    // Guard: only Contractors can submit a Draft (server enforces this too)
    if (normalizeRole(role) !== "Contractor") {
      alert("Only Contractors can submit a WIR. Open this IR as Contractor (author).");
      return;
    }

    // (Optional) nice confirm text
    const candidate =
      dispatchCandidates.find((u) => String(u.userId) === String(dispatchPick)) || null;
    const wirMeta = state.list.find((w) => String(w.wirId) === String(dispatchWirId)) || null;
    const wirCodeTitle = [wirMeta?.code, wirMeta?.title || "Inspection Request"]
      .filter(Boolean)
      .join(" ");
    const ok = window.confirm(
      `Send ${wirCodeTitle} to ${candidate ? displayNameLite(candidate) : "selected inspector"
      }?`
    );
    if (!ok) return;

    try {
      // 1) Persist the chosen Inspector on the Draft (server allows author to edit Draft)
      await api.patch(`/projects/${projectId}/wir/${dispatchWirId}`, {
        inspectorId: dispatchPick, // <-- IMPORTANT
        // If you ever support "Inspector+HOD" pick, also set hodId here.
        // hodId: someHodUserId
      });

      // 2) Submit (server will set status=Submitted AND flip BIC to inspectorId/hodId)
      await api.post(`/projects/${projectId}/wir/${dispatchWirId}/submit`, { role: "Contractor" });

      // 3) Optimistic UI: reflect BIC name (server also returns it on next fetch)
      if (candidate) {
        const bicNameNow = displayNameLite(candidate);
        setState((s) => ({
          ...s,
          list: s.list.map((w) =>
            String(w.wirId) === String(dispatchWirId) ? { ...w, bicName: bicNameNow } : w
          ),
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

  function openDispatchModal(wirId: string, onDateISO: string) {
    setDispatchWirId(wirId);
    setDispatchPick(null);
    setDispatchSearch("");
    setDispatchOpen(true);
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

  const selected = useMemo(
    () => state.list.find((w) => String(w.wirId) === String(selectedId)) || null,
    [state.list, selectedId]
  );

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
    const { data } = await api.get(`/projects/${pid}/wir/${wid}`);
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
        const { data } = await api.get(`/projects/${projectId}/wir`);

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
          contractorName: x.contractor?.name ?? x.participants?.contractor ?? null,
          inspectorName: x.inspector?.name ?? x.participants?.inspector ?? null,
          hodName: x.hod?.name ?? x.participants?.hod ?? null,
          bicName: x.participants?.bic?.name ?? x.bic?.name ?? x.bicName ?? null,
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
        }));

        if (!cancelled) setState({ list, loading: false, error: null });
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
      await api.delete(`/projects/${projectId}/wir/${id}`);
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
        await api.post(`/projects/${projectId}/wir/${selected.wirId}/recommend`, { role: r });
        await reloadWirList();
        alert("Recommended.");
        goToList(true);
        return;
      }
      if (r === "Admin" || r === "Client") {
        await api.post(`/projects/${projectId}/wir/${selected.wirId}/approve`, { role: r });
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
      const full = await loadWirListIfNeededAndGet(id);
      status = full?.status || status;
      setNewForm(mapWirToForm(full || {}));
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

  const reloadWirList = async () => {
    const { data } = await api.get(`/projects/${projectId}/wir`);

    const arr: any[] = Array.isArray(data) ? data : Array.isArray(data?.records) ? data.records : [];
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
      stateName: x.state?.name ?? (typeof x.state === "string" ? x.state : null),
      contractorName: x.contractor?.name ?? x.participants?.contractor ?? null,
      inspectorName: x.inspector?.name ?? x.participants?.inspector ?? null,
      hodName: x.hod?.name ?? x.participants?.hod ?? null,
      bicName: x.participants?.bic?.name ?? x.bic?.name ?? x.bicName ?? null,
      authorId:
        x.authorId ?? x.createdBy?.userId ?? x.createdById ?? x.author?.userId ?? null,
      items: (x.items || []).map((it: any, i: number) => ({
        id: it.id ?? `it-${i}`,
        name: it.name ?? it.title ?? `Item ${i + 1}`,
        spec: it.spec ?? it.specification ?? null,
        required: it.required ?? it.requirement ?? null,
        tolerance: it.tolerance ?? null,
        photoCount: it.photoCount ?? (Array.isArray(it.photos) ? it.photos.length : null),
        status: it.status ?? null,
      })),
      description: x.description ?? x.notes ?? null,
      updatedAt: x.updatedAt ?? x.modifiedAt ?? x.createdAt ?? null,
    }));
    setState({ list, loading: false, error: null });
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
        await api.post(`/projects/${projectId}/wir`, body);
        alert("Draft created.");
        resetNewForm();
        goToList(true);
        return;
      }

      await api.patch(`/projects/${projectId}/wir/${selectedId}`, body);
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
        const { data } = await api.post(`/projects/${projectId}/wir`, buildWirPayload());
        id = String(data?.wirId || data?.id);
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
    const url = `/projects/${projectId}/wir/${selected.wirId}?readonly=1`;
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      navigate(url);
    }
  };

  const onReschedule = () => {
    if (!selected) return;
    alert("Reschedule (stub): open date/time picker here.");
  };

  const onOpenHistory = () => {
    if (!selected) return;
    const url = `/projects/${projectId}/wir/${selected.wirId}/history`;
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      navigate(url);
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

  useEffect(() => {
    if (!roViewOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [roViewOpen]);

  const checklistStats = useMemo(() => {
    const items = selected?.items || [];
    const total = items.length;
    const mandatory = items.filter((it: any) => {
      const v = String(it?.required ?? "").toLowerCase();
      return v === "mandatory" || v === "yes" || it?.required === true;
    }).length;
    const critical = items.filter((it: any) => {
      const s = String(it?.status ?? "").toLowerCase();
      const sev = String((it as any)?.severity ?? "").toLowerCase();
      return s === "ncr" || (it as any)?.critical === true || sev === "critical";
    }).length;
    return { total, mandatory, critical };
  }, [selected]);

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
    if (!dispatchOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [dispatchOpen]);

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

  /* ======== Custom Time Picker UI state ======== */
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [tpHour, setTpHour] = useState(12);
  const [tpMinute, setTpMinute] = useState(0);
  const [tpAP, setTpAP] = useState<"AM" | "PM">("AM");

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
                    <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                      {joinWithDots(
                        w.forDate ? fmtDate(w.forDate) : null,
                        w.forTime || null,
                        `${(w.items?.length ?? 0)} items`
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
                    if (!checklists.rows.length && !checklists.loading) loadChecklists();
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
            </div>

            {/* Body (scrollable) */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
              {/* Submission Summary */}
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
                  <FieldRow
                    label="Checklist"
                    value={`${checklistStats.total} items · ${checklistStats.mandatory} mandatory · ${checklistStats.critical} critical`}
                  />
                  <FieldRow label="Inspector" value={selected?.inspectorName || "—"} />
                  <FieldRow label="HOD" value={selected?.hodName || "—"} />
                  <FieldRow label="Ball in Court" value={`BIC: ${selected?.bicName || "—"}`} />
                  <FieldRow label="Follow up" value="Not Required" />
                </div>

                <div className="mt-3 text-xs text-gray-600 dark:text-gray-300">
                  Last update: <b>{selected?.status || "—"}</b>
                  {selected?.updatedAt ? ` — ${fmtDateTime(selected.updatedAt)}` : ""}{" "}
                  ·{" "}
                  <button
                    onClick={onOpenHistory}
                    className="underline underline-offset-2 text-emerald-700 dark:text-emerald-300 hover:opacity-90"
                  >
                    Open full history
                  </button>
                </div>
              </SectionCard>

              {/* Actions */}
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
    </section>
  );
}
