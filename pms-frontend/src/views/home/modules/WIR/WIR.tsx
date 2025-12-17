// pms-frontend/src/views/home/modules/WIR/WIR.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../../../../api/client";
import { useAuth } from "../../../../hooks/useAuth";
import { useProjectMembership } from "../../../../hooks/useProjectMembership";
import {
  getMembershipMe,
  type EffectivePermissions,
} from "../../../../api/memberships";
import { useBicNameMap, pickBicName } from "./wir.bicNames";

const LEGACY_ALLOW_VIEW = new Set([
  "Admin",
  "Contractor",
  "PMC",
  "IH-PMT",
  "Inspector",
  "HOD",
]);

// --- debug helper (log a safe clone + stash for quick access) ---
function logWir(label: string, obj: any) {
  try {
    console.info(`[WIR] ${label}:`, JSON.parse(JSON.stringify(obj)));
  } catch {
    console.info(`[WIR] ${label}:`, obj);
  }
  (window as any).__lastWirPayload = obj; // quick access in DevTools
}

/* ---------------- helpers ---------------- */
// toggle via Vite dev mode or ?dbg=1 in URL
const DBG_WIR_LIST =
  (typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("dbg")) ||
  (import.meta as any)?.env?.DEV;

function dbg(...args: any[]) {
  if (DBG_WIR_LIST) console.log("[WIR:list]", ...args);
}

const normalizeRole = (raw?: string) => {
  const norm = (raw || "")
    .toString()
    .trim()
    .replace(/[_\s-]+/g, "")
    .toLowerCase();
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

const isIsoLike = (v: any) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v);
const fmtDate = (v: any) =>
  isIsoLike(v) ? new Date(v).toLocaleString() : v ?? "";
const fmtTime12 = (t?: string | null) => {
  if (!t) return "";
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t));
  if (!m) return String(t);
  let h = Math.max(0, Math.min(23, parseInt(m[1]!, 10)));
  const mm = m[2]!;
  const ampm: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${String(h12).padStart(2, "0")}:${mm} ${ampm}`;
};

// Show only the base WIR code (strip everything after the first space)
const shortCode = (code?: string | null) =>
  code ? String(code).trim().split(/\s+/)[0] : "";

type WirStatusCanonical =
  | "Draft"
  | "Submitted"
  | "InspectorRecommended"
  | "HODApproved"
  | "HODRejected"
  | "OnHold"
  | "Closed"
  | "Unknown";

const canonicalWirStatus = (s?: string | null): WirStatusCanonical => {
  const n = (s || "").toString().trim().replace(/\s|_/g, "").toLowerCase();
  if (!n) return "Unknown";
  if (n.includes("draft")) return "Draft";
  if (n.includes("submit")) return "Submitted";
  if (n.includes("recommend")) return "InspectorRecommended";
  if (n.includes("approve")) return "HODApproved";
  if (n.includes("reject")) return "HODRejected";
  if (n.includes("hold")) return "OnHold";
  if (n.includes("close")) return "Closed";
  return "Unknown";
};

const canonicalDisc = (
  raw?: string | null
): "civil" | "finishes" | "mep" | "unknown" => {
  const n = (raw || "").toString().trim().toLowerCase();
  if (!n) return "unknown";
  if (n.includes("civil")) return "civil";
  if (n.includes("finish")) return "finishes";
  if (
    n.includes("mep") ||
    n.includes("elect") ||
    n.includes("plumb") ||
    n.includes("hvac")
  )
    return "mep";
  return "unknown";
};

function StatusBadge({ value }: { value?: string | null }) {
  const v = canonicalWirStatus(value);
  const map: Record<WirStatusCanonical, string> = {
    Draft:
      "bg-gray-100 text-gray-800 border-gray-200 dark:bg-neutral-800 dark:text-gray-200 dark:border-neutral-700",
    Submitted:
      "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
    InspectorRecommended:
      "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
    HODApproved:
      "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
    HODRejected:
      "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800",
    OnHold:
      "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-200 dark:border-yellow-800",
    Closed:
      "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-800",
    Unknown:
      "bg-gray-100 text-gray-800 border-gray-200 dark:bg-neutral-800 dark:text-gray-200 dark:border-neutral-700",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${map[v]}`}>
      {v}
    </span>
  );
}

function KPI({
  label,
  value,
  tone = "base",
}: {
  label: string;
  value: number | string;
  tone?: "base" | "info" | "warn" | "alert";
}) {
  const toneClasses =
    tone === "info"
      ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
      : tone === "warn"
      ? "bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
      : tone === "alert"
      ? "bg-rose-50 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200"
      : "bg-gray-50 text-gray-800 dark:bg-neutral-800 dark:text-neutral-200";

  return (
    <div
      className={`rounded-3xl border border-slate-200/80 dark:border-neutral-800 px-4 py-3 sm:px-5 sm:py-4 ${toneClasses}`}
    >
      <div className="text-xs sm:text-sm opacity-80">{label}</div>
      <div className="text-xl sm:text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

/* ---------------- types ---------------- */

type WirLite = {
  wirId: string;
  code?: string | null;
  title?: string | null;
  status?: string | null;
  itemsCount?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  lastActivity?: string | null;
  submittedAt?: string | null;
  version?: number | null;
  createdById?: string | null;
  forDate?: string | null;
  forTime?: string | null;
  discipline?: string | null;

  bicUserId?: string | null;
  bicFullName?: string | null;
  bicUser?: { fullName?: string | null } | null;

  rescheduleForDate?: string | null;
  rescheduleForTime?: string | null;
  rescheduleReason?: string | null;

  inspectorRecommendation?:
    | "APPROVE"
    | "APPROVE_WITH_COMMENTS"
    | "REJECT"
    | null;
  hodOutcome?: "ACCEPT" | "REJECT" | null;
};

type ProjectState = {
  projectId: string;
  code?: string | null;
  title?: string | null;
};

type NavState = {
  role?: string;
  project?: ProjectState;
};

/* -------- minimal WIR config shape for list pills -------- */
type WirListCfg = {
  transmissionType: "Public" | "Private" | "UserSet";
  redirectAllowed: boolean;
  exportPdfAllowed: boolean;
} | null;

/* -------- Quick tabs -------- */
type QuickTab = "all" | "today" | "upcoming";

/* -------- Filter sheet types -------- */
type StatusFilter =
  | "all"
  | "submitted"
  | "approved"
  | "approved_with_comments"
  | "rejected";
type DisciplineFilter = "all" | "civil" | "finishes" | "mep";

/* ---------------- date helpers ---------------- */
const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

function safeParseDate(v?: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function buildDateTime(
  dateStr?: string | null,
  timeStr?: string | null
): Date | null {
  const d = safeParseDate(dateStr);
  if (!d) return null;
  if (!timeStr) return d;
  const m = /^(\d{1,2}):(\d{2})/.exec(String(timeStr));
  if (!m) return d;
  const hh = Math.max(0, Math.min(23, parseInt(m[1]!, 10)));
  const mm = Math.max(0, Math.min(59, parseInt(m[2]!, 10)));
  d.setHours(hh, mm, 0, 0);
  return d;
}

// Priority: rescheduled datetime -> planned(forDate/forTime) -> plannedAt -> submittedAt -> createdAt
function wirWhen(w: WirLite): Date | null {
  const any = w as any;

  const res = buildDateTime(
    w.rescheduleForDate ?? any?.reschedule_for_date ?? null,
    w.rescheduleForTime ?? any?.reschedule_for_time ?? null
  );
  if (res) return res;

  const plan = buildDateTime(
    w.forDate ?? any?.for_date ?? null,
    w.forTime ?? any?.for_time ?? null
  );
  if (plan) return plan;

  const plannedAt = safeParseDate(any?.plannedAt ?? null);
  if (plannedAt) return plannedAt;

  const sub = safeParseDate(w.submittedAt ?? null);
  if (sub) return sub;

  const created = safeParseDate(w.createdAt ?? null);
  if (created) return created;

  return null;
}

export default function WIR() {
  const { user, claims } = useAuth();
  const loc = useLocation();

  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [hlEl, setHlEl] = useState<HTMLButtonElement | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(loc.search).get("hl");
    setHighlightId(id);
  }, [loc.search]);

  const navigate = useNavigate();
  const params = useParams<{ projectId: string }>();

  const role = normalizeRole(
    (user as any)?.role ??
      (claims as any)?.role ??
      (claims as any)?.userRole ??
      (claims as any)?.roleName ??
      (loc.state as NavState | undefined)?.role ??
      ""
  );
  const projectId =
    params.projectId ||
    (loc.state as NavState | undefined)?.project?.projectId ||
    "";
  const projectFromState = (loc.state as NavState | undefined)?.project;

  // current user id (stringify for stable comparisons)
  const currentUserId = String(
    (user as any)?.id ??
      (claims as any)?.userId ??
      (claims as any)?.sub ??
      (claims as any)?.id ??
      ""
  );

  // Member-safe role & matrix (server authoritative when ready)
  const {
    status: memStatus,
    role: srvRole,
    can,
  } = useProjectMembership(projectId);

  // Prefer server role when available; fallback to derived token/state role
  const effectiveRole = (srvRole || role) as string;

  logWir("list:context", {
    role,
    srvRole,
    effectiveRole,
    projectId,
    projectFromState,
    locationState: (loc.state as any) || null,
    params: params || null,
  });
  dbg("context", {
    role,
    srvRole,
    effectiveRole,
    projectId,
    projectFromState,
    locationState: (loc.state as any) || null,
    params: params || null,
  });

  const [list, setList] = useState<WirLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Sort
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // ✅ Quick tabs: All / Today / Upcoming
  const [quickTab, setQuickTab] = useState<QuickTab>("all");

  // Filter sheet open
  const [showFilter, setShowFilter] = useState(false);

  // Applied filters
  const [fStatus, setFStatus] = useState<StatusFilter>("all");
  const [fDisc, setFDisc] = useState<DisciplineFilter>("all");
  const [fFrom, setFFrom] = useState<string>(""); // yyyy-mm-dd
  const [fTo, setFTo] = useState<string>("");

  // Draft (sheet) filters
  const [dStatus, setDStatus] = useState<StatusFilter>("all");
  const [dDisc, setDDisc] = useState<DisciplineFilter>("all");
  const [dFrom, setDFrom] = useState<string>("");
  const [dTo, setDTo] = useState<string>("");

  const openFilterSheet = () => {
    setDStatus(fStatus);
    setDDisc(fDisc);
    setDFrom(fFrom);
    setDTo(fTo);
    setShowFilter(true);
  };

  // --- Permission dialog state ---
  const [permOpen, setPermOpen] = useState(false);
  const [permForWir, setPermForWir] = useState<WirLite | null>(null);
  const [permMsg, setPermMsg] = useState<string>("");

  // track which row we are preflighting to show a tiny spinner/disable
  const [preflightId, setPreflightId] = useState<string | null>(null);
  const [permReady, setPermReady] = useState(false);
  const [permMatrix, setPermMatrix] = useState<EffectivePermissions | null>(
    null
  );

  // project WIR config state for list pills
  const [wirCfg, setWirCfg] = useState<WirListCfg>(null);

  const bicNameMap = useBicNameMap(list);

  // normalized display name
  const creatorName =
    (user as any)?.fullName ||
    (user as any)?.name ||
    (user as any)?.displayName ||
    [(user as any)?.firstName, (user as any)?.lastName]
      .filter(Boolean)
      .join(" ") ||
    (claims as any)?.fullName ||
    (claims as any)?.name ||
    (claims as any)?.displayName ||
    "User";

  function canViewWir(currentRole: string): boolean {
    if (permReady && permMatrix) {
      // Trust BE: allow only if BE’s effective matrix says view:true for WIR
      return !!permMatrix.WIR?.view;
    }
    // Fallback (no matrix yet / endpoint failed): old allow-list keeps existing flows working
    return LEGACY_ALLOW_VIEW.has(currentRole);
  }

  const VIEW_REQUIREMENT_TEXT =
    "To open a Work Inspection Request, you must be signed in and assigned a project role with view permission (Admin, Contractor, PMC, IH-PMT, Inspector, or HOD) on this project.";

  useEffect(() => {
    document.title = "Trinity PMS — Work Inspection Requests";
  }, []);

  useEffect(() => {
    logWir("list:mounted", { path: loc.pathname, search: loc.search });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    dbg("mounted list view");
  }, []);

  const fetchList = useCallback(async () => {
    if (!projectId) {
      logWir("list:skip (no projectId)", { projectId });
      return;
    }
    setLoading(true);
    setErr(null);

    try {
      const url = `/projects/${projectId}/wir`;
      logWir("list:GET ->", { url });

      const { data } = await api.get(url);
      logWir("list:<- raw", data);

      const rows: any[] = Array.isArray(data)
        ? data
        : data?.list || data?.wirs || [];
      logWir("list:normalized rows[]", {
        count: rows.length,
        sample: rows.slice(0, 3),
      });

      const mapped: WirLite[] = rows.map((r) => ({
        wirId: r.wirId ?? r.id ?? r.uuid,
        code: r.code ?? r.wirCode ?? null,
        title: r.title ?? r.name ?? null,
        status: r.status ?? r.wirStatus ?? null,
        discipline: r.discipline ?? r.disciplineName ?? r.trade ?? null,
        itemsCount:
          r.itemsCount ?? (Array.isArray(r.items) ? r.items.length : null),
        createdAt: r.createdAt ?? r.created_on ?? r.createdAtUtc ?? null,
        updatedAt: r.updatedAt ?? r.updated_on ?? r.updatedAtUtc ?? null,
        lastActivity: r.lastActivity ?? r.latestActivityAt ?? null,
        submittedAt: r.submittedAt ?? null,
        version: r.version ?? r.wirVersion ?? null,
        createdById:
          (
            r.createdById ??
            r.created_by_id ??
            r.createdBy?.id ??
            r.created_by?.id ??
            null
          )?.toString() ?? null,
        forDate: r.forDate ?? r.for_date ?? null,
        forTime: r.forTime ?? r.for_time ?? null,
        rescheduleForDate: r.rescheduleForDate ?? r.reschedule_for_date ?? null,
        rescheduleForTime: r.rescheduleForTime ?? r.reschedule_for_time ?? null,
        rescheduleReason: r.rescheduleReason ?? r.reschedule_reason ?? null,
        bicUserId: r.bicUserId ?? r.bic_user_id ?? null,
        bicFullName:
          r.bicFullName ??
          r.bicUserFullName ??
          r.bic_user_full_name ??
          r.bicUser?.fullName ??
          null,
        bicUser: r.bicUser ? { fullName: r.bicUser.fullName ?? null } : null,
        inspectorRecommendation: r.inspectorRecommendation ?? null,
        hodOutcome: r.hodOutcome ?? null,
      }));

      logWir("list:mapped WirLite[]", {
        count: mapped.length,
        sample: mapped.slice(0, 3),
      });

      (window as any).__WIR_LAST_LIST__ = { projectId, rows, mapped };

      setList(mapped.filter((x) => x.wirId));
    } catch (e: any) {
      const payload = e?.response?.data ?? e?.message ?? e;
      console.error("[WIR] list:ERROR", payload);
      setErr(e?.response?.data?.error || e?.message || "Failed to load WIRs.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    let ignore = false;
    async function run() {
      if (!projectId) {
        setPermReady(false);
        setPermMatrix(null);
        return;
      }
      try {
        const me = await getMembershipMe(projectId);
        if (!ignore) {
          setPermMatrix(me.effectivePermissions || {});
          setPermReady(true);
        }
      } catch {
        if (!ignore) {
          setPermMatrix(null);
          setPermReady(true);
        }
      }
    }
    run();
    return () => {
      ignore = true;
    };
  }, [projectId]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  /* -------- map {code -> max version} to detect follow-up existence -------- */
  const maxVersionByCode = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of list) {
      const code = (w.code || "").toString().trim();
      if (!code) continue;
      const v = typeof w.version === "number" ? w.version : -Infinity;
      const prev = m.get(code);
      if (prev == null || v > prev) m.set(code, v);
    }
    return m;
  }, [list]);

  /* -------- fetch project-scoped WIR config once per project -------- */
  const fetchWirCfg = useCallback(async () => {
    if (!projectId) {
      setWirCfg(null);
      return;
    }
    try {
      const { data } = await api.get(`/admin/module-settings/${projectId}/WIR`);
      const ex = (data?.extra || {}) as Record<string, any>;
      setWirCfg({
        transmissionType:
          (ex.transmissionType as "Public" | "Private" | "UserSet") ?? "Public",
        redirectAllowed:
          typeof ex.redirectAllowed === "boolean" ? ex.redirectAllowed : true,
        exportPdfAllowed: !!ex.exportPdfAllowed,
      });
      dbg("wirCfg", { projectId, cfg: ex });
    } catch (e) {
      setWirCfg(null);
      dbg("wirCfg: failed to load", e);
    }
  }, [projectId]);

  useEffect(() => {
    fetchWirCfg();
  }, [fetchWirCfg]);

const matchStatusFilter = useCallback((w: WirLite, sf: StatusFilter) => {
  if (sf === "all") return true;

  const st = canonicalWirStatus(w.status);
  const ir = (w.inspectorRecommendation || "").toString().toUpperCase();

  if (sf === "submitted")
    return st === "Submitted" || st === "InspectorRecommended";

  if (sf === "rejected")
    return (
      st === "HODRejected" || (w.hodOutcome || "").toUpperCase() === "REJECT"
    );

  if (sf === "approved") {
    if (st !== "HODApproved" && st !== "Closed") return false;
    return ir === "APPROVE" || (!ir && st === "HODApproved");
  }

  if (sf === "approved_with_comments") {
    if (st !== "HODApproved" && st !== "Closed") return false;
    return ir === "APPROVE_WITH_COMMENTS";
  }

  return true;
}, []);

const matchDiscFilter = useCallback((w: WirLite, df: DisciplineFilter) => {
  if (df === "all") return true;
  const d = canonicalDisc(w.discipline ?? null);
  return d === df;
}, []);

const matchesRange = useCallback((w: WirLite, fromYmd: string, toYmd: string) => {
  if (!fromYmd && !toYmd) return true;
  const when = wirWhen(w);
  if (!when) return false;

  if (fromYmd) {
    const from = startOfDay(new Date(fromYmd));
    if (when.getTime() < from.getTime()) return false;
  }
  if (toYmd) {
    const to = endOfDay(new Date(toYmd));
    if (when.getTime() > to.getTime()) return false;
  }
  return true;
}, []);

  const filtered = useMemo(() => {
  const q = search.trim().toLowerCase();

  // 1) Search
  let out = q
    ? list.filter((w) => {
        const hay = [w.code, w.title, w.status].map((v) =>
          (v || "").toString().toLowerCase()
        );
        return hay.some((s) => s.includes(q));
      })
    : list;

  // 2) Hide Drafts not created by me (master logic)
  out = out.filter((w) => {
    const st = canonicalWirStatus(w.status);
    if (st !== "Draft") return true;
    if (!w.createdById) return false;
    return w.createdById.toString() === currentUserId;
  });

  // 3) Modal filters (your logic)
  out = out.filter((w) => matchStatusFilter(w, fStatus));
  out = out.filter((w) => matchDiscFilter(w, fDisc));
  out = out.filter((w) => matchesRange(w, fFrom, fTo));

  // 4) Quick tabs (your logic)
  if (quickTab !== "all") {
    const now = new Date();
    const sod = startOfDay(now).getTime();
    const eod = endOfDay(now).getTime();

    out = out.filter((w) => {
      const when = wirWhen(w);
      if (!when) return false;
      const t = when.getTime();
      if (quickTab === "today") return t >= sod && t <= eod;
      if (quickTab === "upcoming") return t > eod;
      return true;
    });
  }

  // 5) Sort + keep versions stacked within same code
  out.sort((a, b) => {
    const aa = (shortCode(a.code) || "").toLowerCase();
    const bb = (shortCode(b.code) || "").toLowerCase();

    if (aa < bb) return sortDir === "asc" ? -1 : 1;
    if (aa > bb) return sortDir === "asc" ? 1 : -1;

    const va = typeof a.version === "number" ? a.version : -Infinity;
    const vb = typeof b.version === "number" ? b.version : -Infinity;
    if (va !== vb) return vb - va;

    const at = (a.title || "").toLowerCase();
    const bt = (b.title || "").toLowerCase();
    if (at < bt) return sortDir === "asc" ? -1 : 1;
    if (at > bt) return sortDir === "asc" ? 1 : -1;

    const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return db - da;
  });

  return out;
}, [
  list,
  search,
  currentUserId,
  fStatus,
  fDisc,
  fFrom,
  fTo,
  quickTab,
  sortDir,
  matchStatusFilter,
  matchDiscFilter,
  matchesRange,
]);

  useEffect(() => {
    if (!highlightId || !hlEl) return;
    const t = setTimeout(() => {
      hlEl.scrollIntoView({ behavior: "smooth", block: "center" });
      const url = new URL(window.location.href);
      url.searchParams.delete("hl");
      window.history.replaceState({}, "", url.toString());
    }, 60);
    return () => clearTimeout(t);
  }, [highlightId, hlEl, filtered]);

  const kpis = useMemo(() => {
    const total = filtered.length;
    let submitted = 0,
      approved = 0,
      rejected = 0;
    for (const w of filtered) {
      const st = canonicalWirStatus(w.status);
      if (st === "Submitted" || st === "InspectorRecommended") submitted++;
      if (st === "HODApproved" || st === "Closed") approved++;
      if (st === "HODRejected") rejected++;
    }
    return { total, submitted, approved, rejected };
  }, [filtered]);

  const backToMyProjects = () => navigate("/home/my-projects");

  const openWirDetail = async (w: WirLite) => {
    const st = canonicalWirStatus(w.status);

    const canView = canViewWir(effectiveRole);
    if (!effectiveRole || !canView) {
      setPermForWir(w);
      setPermMsg(VIEW_REQUIREMENT_TEXT);
      setPermOpen(true);
      return;
    }

    setPreflightId(w.wirId);
    try {
      await api.get(`/projects/${projectId}/wir/${w.wirId}`, {
        params: { lite: 1 },
      });

      if (st === "Draft") {
        const baseCreate =
          effectiveRole === "Contractor"
            ? `/home/projects/${projectId}/wir/new`
            : effectiveRole === "PMC"
            ? `/home/pmc/projects/${projectId}/wir/new`
            : effectiveRole === "IH-PMT"
            ? `/home/ihpmt/projects/${projectId}/wir/new`
            : effectiveRole === "Client"
            ? `/home/client/projects/${projectId}/wir/new`
            : `/home/projects/${projectId}/wir/new`;

        navigate(`${baseCreate}?editId=${w.wirId}`, {
          state: {
            role: effectiveRole,
            project: projectFromState || { projectId },
            wir: { wirId: w.wirId, code: w.code, title: w.title },
            mode: "edit",
          },
        });
      } else {
        const docPath = `/home/projects/${projectId}/wir/${w.wirId}/doc`;
        navigate(docPath, {
          state: {
            role: effectiveRole,
            project: projectFromState || { projectId },
            wir: { wirId: w.wirId, code: w.code, title: w.title },
            mode: "view",
          },
        });
      }
    } catch (e: any) {
      const status = e?.response?.status;
      const msg =
        status === 401
          ? "You are not signed in or your session expired. Please sign in to view this WIR."
          : status === 403
          ? "You don’t have permission on this project to open this WIR. Ask an Admin to assign you a viewing role."
          : VIEW_REQUIREMENT_TEXT;

      setPermForWir(w);
      setPermMsg(msg);
      setPermOpen(true);
    } finally {
      setPreflightId(null);
    }
  };

  const legacyCreate =
    effectiveRole === "Contractor" ||
    effectiveRole === "PMC" ||
    effectiveRole === "IH-PMT" ||
    effectiveRole === "Admin";

  const serverGate = !!can("WIR").raise;
  const canCreate = memStatus === "ready" ? serverGate : legacyCreate;

  const createWir = () => {
    const base =
      effectiveRole === "Contractor"
        ? `/home/projects/${projectId}/wir/new`
        : effectiveRole === "PMC"
        ? `/home/pmc/projects/${projectId}/wir/new`
        : effectiveRole === "IH-PMT"
        ? `/home/ihpmt/projects/${projectId}/wir/new`
        : effectiveRole === "Client"
        ? `/home/client/projects/${projectId}/wir/new`
        : `/home/projects/${projectId}/wir/new`;

    navigate(base, {
      state: {
        role,
        project: projectFromState || { projectId },
      },
    });
  };
const applyFilterSheet = () => {
  setFStatus(dStatus);
  setFDisc(dDisc);
  setFFrom(dFrom);
  setFTo(dTo);
  setShowFilter(false);
};

const resetFilterSheet = () => {
  setDStatus("all");
  setDDisc("all");
  setDFrom("");
  setDTo("");
};
  // --- local helpers for stacked visual grouping by base WIR code ---
  let lastBaseCode: string | null = null;
  let stackDepth = 0;

  return (
    <section className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border border-slate-200/80 dark:border-neutral-800 p-4 sm:p-5 md:p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-lg sm:text-xl md:text-2xl font-semibold text-gray-900 dark:text-white">
            Work Inspection Requests
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-300 truncate">
            {projectFromState?.code ? `${projectFromState.code} — ` : ""}
            {projectFromState?.title || `Project: ${projectId}`}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={backToMyProjects}
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs sm:text-sm font-medium text-slate-700 shadow-sm
                       hover:bg-slate-50 hover:border-slate-300
                       dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
            title="Back to My Projects"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M14.707 5.293 9 11l5.707 5.707-1.414 1.414L6.172 11l7.121-7.121z"
                className="fill-current"
              />
            </svg>
            <span>Back</span>
          </button>

          {canCreate && (
            <button
              onClick={createWir}
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-xs sm:text-sm font-medium text-white shadow-sm
                         hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 dark:border-emerald-700"
              title="Create WIR"
            >
              <span className="text-base leading-none">+</span>
              <span>New WIR</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI strip */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Total" value={loading ? "—" : kpis.total} />
        <KPI
          label="Submitted"
          value={loading ? "—" : kpis.submitted}
          tone="warn"
        />
        <KPI
          label="Approved/Closed"
          value={loading ? "—" : kpis.approved}
          tone="info"
        />
        <KPI
          label="Rejected"
          value={loading ? "—" : kpis.rejected}
          tone="alert"
        />
      </div>

      {/* ✅ Search + Sort + Filter row (ABOVE quick tabs) */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-md">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  d="M10 4a6 6 0 014.472 9.938l3.795 3.795-1.414 1.414-3.795-3.795A6 6 0 1110 4zm0 2a4 4 0 100 8 4 4 0 000-8z"
                  className="fill-current"
                />
              </svg>
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by code, title, or status…"
              className="w-full rounded-full border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm text-gray-900
                         outline-none transition
                         focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-300
                         dark:bg-neutral-900 dark:border-neutral-800 dark:text-white"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 shadow-sm
                       hover:bg-slate-50 hover:border-slate-300
                       dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
            title="Sort"
          >
            {/* ✅ sort icon like MyProjects (↑↓) */}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              aria-hidden="true"
              fill="none"
              className="shrink-0"
            >
              <path
                d="M8 4v14M8 4l-3 3M8 4l3 3"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M16 20V6m0 14-3-3m3 3 3-3"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Sort</span>
          </button>

          <button
            type="button"
            onClick={openFilterSheet}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 shadow-sm
                       hover:bg-slate-50 hover:border-slate-300
                       dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
            title="Filter"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="shrink-0"
            >
              <path
                d="M4 5h16v2l-6 7v5l-4-2v-3L4 7V5z"
                className="fill-current"
              />
            </svg>
            <span>Filter</span>
          </button>
        </div>
      </div>

      {/* ✅ Quick tabs (All / Today / Upcoming) */}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
        <span className="text-gray-500 dark:text-gray-400">Quick</span>
        {[
          { id: "all", label: "All" },
          { id: "today", label: "Today" },
          { id: "upcoming", label: "Upcoming" },
        ].map((q) => {
          const active = quickTab === (q.id as QuickTab);
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => setQuickTab(q.id as QuickTab)}
              className={
                "px-3 py-1.5 rounded-full border text-xs sm:text-sm transition-colors " +
                (active
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                  : "bg-white text-gray-700 border-slate-200 hover:bg-slate-50 dark:bg-neutral-900 dark:border-neutral-700 dark:text-gray-100 dark:hover:bg-neutral-800")
              }
            >
              {q.label}
            </button>
          );
        })}
      </div>

      {/* Loading / Error / Empty */}
      {loading && (
        <div className="mt-4 text-sm text-gray-700 dark:text-gray-300">
          Loading WIRs…
        </div>
      )}
      {err && !loading && (
        <div className="mt-4 text-sm text-red-700 dark:text-red-400">{err}</div>
      )}
      {!loading && !err && filtered.length === 0 && (
        <div className="mt-6 text-sm text-gray-600 dark:text-gray-400">
          No WIRs found for this project.
        </div>
      )}


      {/* ✅ FULL-WIDTH TILES (like MyProjects) */}
      <div className="mt-6 space-y-4">
        {filtered.map((w) => {
          const busy = preflightId === w.wirId;
          const isHL = highlightId && w.wirId === highlightId;

          // --- stacked visual group by base code (shortCode) ---
          const baseCodeKey = shortCode(w.code) || w.code || w.wirId;
          if (baseCodeKey === lastBaseCode) {
            stackDepth += 1;
          } else {
            stackDepth = 0;
            lastBaseCode = baseCodeKey;
          }
          const isStackedSibling = stackDepth > 0;
          const stackClasses = isStackedSibling
            ? "relative z-[5] mt-[-10px] ml-4"
            : "relative z-[10]";

          const any = w as any;
          const bicName = pickBicName(w, bicNameMap);

          const forDateRaw =
            w.forDate ??
            any?.for_date ??
            (any?.plannedAt ? String(any.plannedAt) : null);
          const forDateDisp = forDateRaw
            ? new Date(forDateRaw).toLocaleDateString()
            : "—";

          const forTime = w.forTime ?? any?.for_time ?? null;
          const forTimeDisp = fmtTime12(forTime);

          const itemsDisp =
            typeof w.itemsCount === "number" ? w.itemsCount : "—";

          const isRescheduled = !!(w.rescheduleForDate || w.rescheduleForTime);
          const reschedTimeRaw =
            w.rescheduleForTime ?? any?.reschedule_for_time ?? null;
          const reschedTimeDisp = fmtTime12(reschedTimeRaw);

          const reschedTip = isRescheduled
            ? `Rescheduled → ${
                w.rescheduleForDate
                  ? new Date(w.rescheduleForDate).toLocaleDateString()
                  : "—"
              } • ${reschedTimeDisp || "—"}${
                w.rescheduleReason ? `\nReason: ${w.rescheduleReason}` : ""
              }`
            : "";

          const titleLine = [
            shortCode(w.code) || "WIR",
            w.title ? w.title : null,
            typeof w.version === "number" ? `v${w.version}` : null,
          ]
            .filter(Boolean)
            .join(" — ");

          const subtitleLine = [
            w.code ? w.code : null,
            `Items: ${itemsDisp}`,
            forDateDisp !== "—" || forTimeDisp
              ? `${forDateDisp} ${forTimeDisp ? `• ${forTimeDisp}` : ""}`
              : null,
          ]
            .filter(Boolean)
            .join(" • ");

          const st = canonicalWirStatus(w.status);
          const isAwdC =
            (w.inspectorRecommendation || "").toUpperCase() ===
            "APPROVE_WITH_COMMENTS";
          const hasChild =
            w.code &&
            typeof w.version === "number" &&
            (maxVersionByCode.get(w.code) ?? -Infinity) > w.version;

          return (
            <button
              key={w.wirId}
              ref={isHL ? setHlEl : undefined}
              type="button"
              onClick={() => !busy && openWirDetail(w)}
              disabled={busy}
              className={`group w-full text-left ${stackClasses} rounded-3xl border border-slate-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-4 sm:px-5 sm:py-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition focus:outline-none focus:ring-2 focus:ring-emerald-500/60 ${
                busy ? "opacity-60 cursor-wait" : ""
              }${
                isHL
                  ? " ring-2 ring-emerald-500 ring-offset-2 ring-offset-white dark:ring-offset-neutral-900"
                  : ""
              }`}

              title={isHL ? "New follow-up created" : undefined}
            >
              {/* Top row: title + status badges */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white truncate">
                    {titleLine}
                    {busy ? " • checking…" : ""}
                  </h2>
                  <p className="mt-0.5 text-xs sm:text-sm text-gray-600 dark:text-gray-400 truncate">
                    {subtitleLine || "—"}
                  </p>
                  {w.discipline && (
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">
                      Discipline: {w.discipline}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-1">
                  <StatusBadge value={w.status} />
                  {isHL && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border dark:border-emerald-700 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
                      New
                    </span>
                  )}
                </div>
              </div>

              {/* Chips row (like MyProjects) */}
              <div className="mt-3 flex flex-wrap gap-2">
                {/* Recommendation pill for approved states */}
                {(() => {
                  if (st !== "HODApproved" && st !== "Closed") return null;
                  const ir = (w.inspectorRecommendation || "")
                    .toString()
                    .toUpperCase();
                  const label =
                    ir === "APPROVE_WITH_COMMENTS"
                      ? "Approved with Comments"
                      : ir === "APPROVE"
                      ? "Approved"
                      : ir === "REJECT"
                      ? "Rejected"
                      : null;
                  return label ? (
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-gray-700 dark:bg-neutral-800 dark:border-neutral-700 dark:text-gray-200">
                      {label}
                    </span>
                  ) : null;
                })()}

                {isRescheduled && (
                  <span
                    title={reschedTip}
                    className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-medium text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200"
                  >
                    Rescheduled
                  </span>
                )}

                {wirCfg && (
                  <>
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-gray-700 dark:bg-neutral-800 dark:border-neutral-700 dark:text-gray-200">
                      {wirCfg.transmissionType}
                    </span>
                    {wirCfg.exportPdfAllowed && (
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-gray-700 dark:bg-neutral-800 dark:border-neutral-700 dark:text-gray-200">
                        PDF
                      </span>
                    )}
                    {!wirCfg.redirectAllowed && (
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-gray-700 dark:bg-neutral-800 dark:border-neutral-700 dark:text-gray-200">
                        No-Redirect
                      </span>
                    )}
                  </>
                )}

                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-gray-700 dark:bg-neutral-800 dark:border-neutral-700 dark:text-gray-200">
                  BIC: {bicName || "—"}
                </span>

                {st === "HODApproved" && isAwdC && !hasChild ? (
                  <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-200">
                    Follow-up Open
                  </span>
                ) : null}
              </div>

              {/* Open bar (full-width tile bottom like MyProjects) */}
              <div
                className="mt-4 rounded-full border border-slate-200 bg-white px-4 py-2 text-center text-sm font-medium text-gray-800 shadow-sm
                           dark:bg-neutral-900 dark:border-neutral-700 dark:text-gray-100"
              >
                Open
              </div>
            </button>
          );
        })}
      </div>

      {/* ✅ Filter bottom sheet (UI like screenshot) */}
      {showFilter && (
        <div className="fixed inset-0 z-40">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowFilter(false)}
            aria-hidden="true"
          />

          {/* Sheet */}
          <div className="absolute inset-0 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="w-full sm:max-w-lg bg-white dark:bg-neutral-900 rounded-t-3xl sm:rounded-3xl border border-slate-200/80 dark:border-neutral-800 shadow-xl max-h-[88vh] overflow-hidden flex flex-col">
              {/* drag handle */}
              <div className="pt-3 pb-1 flex justify-center">
                <div className="h-1 w-12 rounded-full bg-slate-200 dark:bg-neutral-700" />
              </div>

              {/* Header */}
              <div className="px-5 sm:px-6 pt-3 pb-2">
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  Filters
                </div>
              </div>

              {/* Body (scrollable) */}
              <div className="px-5 sm:px-6 pb-4 overflow-auto">
                {/* helper for pill */}
                {(() => null)()}

                {/* Status */}
                <div className="mt-4">
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    Status
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: "all", label: "All" },
                      { id: "submitted", label: "Submitted" },
                      { id: "approved", label: "Approved" },
                      {
                        id: "approved_with_comments",
                        label: "Approved with Comments",
                      },
                      { id: "rejected", label: "Rejected" },
                    ].map((opt) => {
                      const active = dStatus === (opt.id as StatusFilter);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setDStatus(opt.id as StatusFilter)}
                          className={
                            "px-4 py-2 rounded-full border text-sm font-medium transition-colors " +
                            (active
                              ? "bg-emerald-600 text-white border-emerald-600"
                              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800")
                          }
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Discipline */}
                <div className="mt-5">
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    Discipline
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: "all", label: "All" },
                      { id: "civil", label: "Civil" },
                      { id: "finishes", label: "Finishes" },
                      { id: "mep", label: "MEP" },
                    ].map((opt) => {
                      const active = dDisc === (opt.id as DisciplineFilter);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setDDisc(opt.id as DisciplineFilter)}
                          className={
                            "px-4 py-2 rounded-full border text-sm font-medium transition-colors " +
                            (active
                              ? "bg-emerald-600 text-white border-emerald-600"
                              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800")
                          }
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Schedule (From/To) */}
                <div className="mt-5">
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    Schedule
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                        From
                      </div>
                      <input
                        type="date"
                        value={dFrom}
                        onChange={(e) => setDFrom(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-gray-900
                             dark:bg-neutral-900 dark:border-neutral-700 dark:text-white"
                      />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                        To
                      </div>
                      <input
                        type="date"
                        value={dTo}
                        onChange={(e) => setDTo(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-gray-900
                             dark:bg-neutral-900 dark:border-neutral-700 dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* space so content doesn't hide behind footer buttons */}
                <div className="h-24" />
              </div>

              {/* Footer buttons (fixed) */}
              <div className="px-5 sm:px-6 pb-5 pt-3 border-t border-slate-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900">
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={resetFilterSheet}
                    className="w-full rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800
                         hover:bg-slate-50 dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={applyFilterSheet}
                    className="w-full rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white
                         hover:bg-emerald-700"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Permission modal (kept as-is) */}
      {permOpen && (
        <div className="fixed inset-0 z-50 bg-black/40">
          <div className="absolute inset-x-0 bottom-0 sm:static sm:mx-auto w-full sm:w-auto sm:max-w-xl sm:rounded-2xl bg-white dark:bg-neutral-900 border-t sm:border dark:border-neutral-800 p-4 sm:p-5 h-[70vh] sm:h-auto rounded-t-2xl sm:rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold dark:text-white">
                View Permission Required
              </div>
              <button
                onClick={() => setPermOpen(false)}
                className="text-sm px-3 py-2 rounded-full border border-slate-200 bg-white hover:bg-slate-50
                           dark:bg-neutral-900 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                Close
              </button>
            </div>

            <div className="mt-2 text-[12px] text-gray-500 dark:text-gray-400">
              {projectFromState?.code ? `${projectFromState.code} — ` : ""}
              {projectFromState?.title || `Project: ${projectId}`}
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-xl border dark:border-neutral-800 p-3">
                <div className="text-[12px] sm:text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                  Selected WIR
                </div>
                <div className="text-[15px] sm:text-sm dark:text-white break-all">
                  {permForWir?.code
                    ? `${permForWir.code}${permForWir.title ? " — " : ""}`
                    : ""}
                  {permForWir?.title || permForWir?.wirId || "—"}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border dark:border-neutral-800 p-3">
                  <div className="text-[12px] sm:text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                    Signed in as
                  </div>
                  <div className="text-[15px] sm:text-sm dark:text-white">
                    {creatorName}
                  </div>
                </div>

                <div className="rounded-xl border dark:border-neutral-800 p-3">
                  <div className="text-[12px] sm:text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                    Your Role (derived)
                  </div>
                  <div className="text-[15px] sm:text-sm dark:text-white">
                    {effectiveRole || "—"}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border dark:border-neutral-800 p-3 bg-amber-50/60 dark:bg-amber-900/20">
                <div className="text-[12px] sm:text-xs uppercase tracking-wide text-amber-800 dark:text-amber-200 mb-1">
                  Requirement
                </div>
                <div className="text-[13px] sm:text-sm text-amber-900 dark:text-amber-100">
                  {permMsg}
                </div>
                <div className="mt-2 text-[12px] text-amber-800/80 dark:text-amber-200/80">
                  Allowed roles: Admin, Contractor, PMC, IH-PMT, Inspector, HOD
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-end gap-2">
              <button
                onClick={() => setPermOpen(false)}
                className="w-full sm:w-auto text-sm px-3 py-3 sm:py-2 rounded-full border border-slate-200 bg-white hover:bg-slate-50
                           dark:bg-neutral-900 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>

              <button
                onClick={() => setPermOpen(false)}
                className="w-full sm:w-auto text-sm px-3 py-3 sm:py-2 rounded-full bg-emerald-600 text-white font-medium shadow-sm hover:bg-emerald-700 dark:border-emerald-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
