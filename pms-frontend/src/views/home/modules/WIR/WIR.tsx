// pms-frontend/src/views/home/modules/WIR/WIR.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../../../../api/client";
import { useAuth } from "../../../../hooks/useAuth";
import { useProjectMembership } from "../../../../hooks/useProjectMembership";
import { getMembershipMe, type EffectivePermissions } from "../../../../api/memberships";
import { useBicNameMap, pickBicName } from "./wir.bicNames";

const LEGACY_ALLOW_VIEW = new Set(["Admin", "Contractor", "PMC", "IH-PMT", "Inspector", "HOD"]);

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
  (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("dbg")) ||
  (import.meta as any)?.env?.DEV;

function dbg(...args: any[]) {
  if (DBG_WIR_LIST) console.log("[WIR:list]", ...args);
}

const normalizeRole = (raw?: string) => {
  const norm = (raw || "").toString().trim().replace(/[_\s-]+/g, "").toLowerCase();
  switch (norm) {
    case "admin": return "Admin";
    case "client": return "Client";
    case "ihpmt": return "IH-PMT";
    case "contractor": return "Contractor";
    case "consultant": return "Consultant";
    case "pmc": return "PMC";
    case "supplier": return "Supplier";
    default: return raw || "";
  }
};

const isIsoLike = (v: any) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v);
const fmtDate = (v: any) => (isIsoLike(v) ? new Date(v).toLocaleString() : (v ?? ""));
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

function StatusBadge({ value }: { value?: string | null }) {
  const v = canonicalWirStatus(value);
  const map: Record<WirStatusCanonical, string> = {
    Draft: "bg-gray-100 text-gray-800 border-gray-200 dark:bg-neutral-800 dark:text-gray-200 dark:border-neutral-700",
    Submitted: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
    InspectorRecommended: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
    HODApproved: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
    HODRejected: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800",
    OnHold: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-200 dark:border-yellow-800",
    Closed: "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-800",
    Unknown: "bg-gray-100 text-gray-800 border-gray-200 dark:bg-neutral-800 dark:text-gray-200 dark:border-neutral-700",
  };
  return <span className={`text-[10px] px-1.5 py-0.5 rounded border ${map[v]}`}>{v}</span>;
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
    <div className={`rounded-xl border dark:border-neutral-800 p-3 sm:p-4 ${toneClasses}`}>
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
  version?: number | null;   // <-- ADD THIS LINE
  createdById?: string | null;  // <-- ADD: used to hide others' drafts
  forDate?: string | null;
  forTime?: string | null;
  bicUserId?: string | null;
  bicFullName?: string | null;
  bicUser?: { fullName?: string | null } | null;
  rescheduleForDate?: string | null;
  rescheduleForTime?: string | null;
  rescheduleReason?: string | null;
  inspectorRecommendation?: "APPROVE" | "APPROVE_WITH_COMMENTS" | "REJECT" | null;
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

/* -------- NEW: minimal WIR config shape for list pills -------- */
type WirListCfg = {
  transmissionType: "Public" | "Private" | "UserSet";
  redirectAllowed: boolean;
  exportPdfAllowed: boolean;
} | null;

/* ---------------- main ---------------- */

export default function WIR() {
  const { user, claims } = useAuth();
  const loc = useLocation();
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
  const projectId = params.projectId || (loc.state as NavState | undefined)?.project?.projectId || "";
  const projectFromState = (loc.state as NavState | undefined)?.project;
  // current user id (stringify for stable comparisons)
  const currentUserId =
    String(
      (user as any)?.id ??
      (claims as any)?.userId ??
      (claims as any)?.sub ??
      (claims as any)?.id ??
      ""
    );
  // Member-safe role & matrix (server authoritative when ready)
  const { status: memStatus, role: srvRole, can } = useProjectMembership(projectId);

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

  // --- Permission dialog state ---
  const [permOpen, setPermOpen] = useState(false);
  const [permForWir, setPermForWir] = useState<WirLite | null>(null);
  const [permMsg, setPermMsg] = useState<string>("");

  // track which row we are preflighting to show a tiny spinner/disable
  const [preflightId, setPreflightId] = useState<string | null>(null);
  const [permReady, setPermReady] = useState(false);
  const [permMatrix, setPermMatrix] = useState<EffectivePermissions | null>(null);

  // -------- NEW: project WIR config state for list pills --------
  const [wirCfg, setWirCfg] = useState<WirListCfg>(null);

  const bicNameMap = useBicNameMap(list);

  // normalized display name
  const creatorName =
    (user as any)?.fullName ||
    (user as any)?.name ||
    (user as any)?.displayName ||
    [(user as any)?.firstName, (user as any)?.lastName].filter(Boolean).join(" ") ||
    (claims as any)?.fullName ||
    (claims as any)?.name ||
    (claims as any)?.displayName ||
    "User";

  // roles allowed to open a WIR detail (tweak as needed)
  const ALLOWED_VIEW_ROLES = new Set([
    "Admin",
    "Contractor",
    "PMC",
    "IH-PMT",
    "Inspector",
    "HOD",
    // add others if needed: "Client", "Consultant", "Supplier"
  ]);

  function canViewWir(currentRole: string): boolean {
    if (permReady && permMatrix) {
      // Trust BE: allow only if BE’s effective matrix says view:true for WIR
      return !!permMatrix.WIR?.view;
    }
    // Fallback (no matrix yet / endpoint failed): old allow-list keeps existing flows working
    return LEGACY_ALLOW_VIEW.has(currentRole);
  }

  // human text describing requirement (kept in one place)
  const VIEW_REQUIREMENT_TEXT =
    "To open a Work Inspection Request, you must be signed in and assigned a project role with view permission (Admin, Contractor, PMC, IH-PMT, Inspector, or HOD) on this project.";

  useEffect(() => {
    document.title = "Trinity PMS — Work Inspection Requests";
  }, []);

  useEffect(() => {
    logWir("list:mounted", { path: loc.pathname, search: loc.search });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- DEBUG: mount ping ---
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

      const rows: any[] = Array.isArray(data) ? data : data?.list || data?.wirs || [];
      logWir("list:normalized rows[]", { count: rows.length, sample: rows.slice(0, 3) });

      const mapped: WirLite[] = rows.map((r) => ({
        wirId: r.wirId ?? r.id ?? r.uuid,
        code: r.code ?? r.wirCode ?? null,
        title: r.title ?? r.name ?? null,
        status: r.status ?? r.wirStatus ?? null,
        itemsCount: r.itemsCount ?? (Array.isArray(r.items) ? r.items.length : null),
        createdAt: r.createdAt ?? r.created_on ?? r.createdAtUtc ?? null,
        updatedAt: r.updatedAt ?? r.updated_on ?? r.updatedAtUtc ?? null,
        lastActivity: r.lastActivity ?? r.latestActivityAt ?? null,
        submittedAt: r.submittedAt ?? null,
        version: r.version ?? r.wirVersion ?? null,   // <-- ADD THIS LINE
        createdById:
          (r.createdById ??
            r.created_by_id ??
            r.createdBy?.id ??
            r.created_by?.id ??
            null)?.toString() ?? null,
        // NEW: pull-throughs (support snake_case fallbacks)
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
          (r.bicUser?.fullName ?? null),
        bicUser: r.bicUser ? { fullName: r.bicUser.fullName ?? null } : null,
        inspectorRecommendation: r.inspectorRecommendation ?? null,
        hodOutcome: r.hodOutcome ?? null,
      }));

      logWir("list:mapped WirLite[]", { count: mapped.length, sample: mapped.slice(0, 3) });

      // Stash for quick DevTools inspection
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
      if (!projectId) { setPermReady(false); setPermMatrix(null); return; }
      try {
        const me = await getMembershipMe(projectId);
        if (!ignore) { setPermMatrix(me.effectivePermissions || {}); setPermReady(true); }
      } catch {
        // If endpoint fails, we’ll gracefully fall back to legacy local role gates
        if (!ignore) { setPermMatrix(null); setPermReady(true); }
      }
    }
    run();
    return () => { ignore = true; };
  }, [projectId]);

  // just under the useEffect that calls getMembershipMe(...)
  useEffect(() => {
    if (!projectId) return;
    const snap = {
      projectId,
      memStatus,
      srvRole,
      derivedRole: role,
      effectiveRole,
      permReady,
      wir: permMatrix?.WIR ?? null,
      wirRaise: permMatrix?.WIR?.raise,
    };
    console.info("[WIR] perms:change1", snap);
  }, [projectId, memStatus, srvRole, role, effectiveRole, permReady, permMatrix]);

  useEffect(() => {
    if (!projectId) return;
    console.info("[WIR] perms:change2", {
      projectId,
      memStatus,
      srvRole,
      derivedRole: role,
      effectiveRole,
      permReady,
      wir: permMatrix?.WIR ?? null,
      wirRaise: permMatrix?.WIR?.raise,
    });
  }, [projectId, memStatus, srvRole, role, effectiveRole, permReady, permMatrix]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  /* -------- NEW: fetch project-scoped WIR config once per project -------- */
  const fetchWirCfg = useCallback(async () => {
    if (!projectId) { setWirCfg(null); return; }
    try {
      const { data } = await api.get(`/admin/module-settings/${projectId}/WIR`);
      const ex = (data?.extra || {}) as Record<string, any>;
      setWirCfg({
        transmissionType: (ex.transmissionType as "Public" | "Private" | "UserSet") ?? "Public",
        redirectAllowed: typeof ex.redirectAllowed === "boolean" ? ex.redirectAllowed : true,
        exportPdfAllowed: !!ex.exportPdfAllowed,
      });
      dbg("wirCfg", { projectId, cfg: ex });
    } catch (e) {
      // Non-blocking; hide pills if unavailable
      setWirCfg(null);
      dbg("wirCfg: failed to load", e);
    }
  }, [projectId]);

  useEffect(() => { fetchWirCfg(); }, [fetchWirCfg]);

  // Visible list = search-filtered AND hide Drafts not created by me
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? list.filter((w) => {
        const hay = [w.code, w.title, w.status].map((v) =>
          (v || "").toString().toLowerCase()
        );
        return hay.some((s) => s.includes(q));
      })
      : list;
    return base.filter((w) => {
      const st = canonicalWirStatus(w.status);
      if (st !== "Draft") return true; // non-drafts always visible
      // Drafts are visible only if createdById matches me (if present)
      if (!w.createdById) return false; // be strict if BE provides no owner
      return w.createdById.toString() === currentUserId;
    });
  }, [list, search, currentUserId]);

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

    // Gate by permission (server matrix preferred)
    const canView = canViewWir(effectiveRole);
    if (!effectiveRole || !canView) {
      setPermForWir(w);
      setPermMsg(VIEW_REQUIREMENT_TEXT);
      setPermOpen(true);
      return;
    }

    setPreflightId(w.wirId);
    try {
      // light preflight (authz + existence)
      await api.get(`/projects/${projectId}/wir/${w.wirId}`, { params: { lite: 1 } });

      if (st === "Draft") {
        // open editor (existing behavior)
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
        // open Document/Discussion screen (neutral route; no role segment)
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

  // If server matrix is ready, prefer it; otherwise keep legacy role rule
  // (same logic, just split for logging)
  const legacyCreate =
    effectiveRole === "Contractor" ||
    effectiveRole === "PMC" ||
    effectiveRole === "IH-PMT" ||
    effectiveRole === "Admin";

  const serverGate = !!can("WIR").raise; // when memStatus === "ready"

  const canCreate =
    memStatus === "ready"
      ? serverGate
      : legacyCreate;

  // ---- DEBUG SNAPSHOT (render-time) ----
  console.info("[WIR] NewWIR:renderGate", {
    memStatus,
    effectiveRole,
    srvRole,
    legacyCreate,
    serverGate,
    canCreate,
    permReady,
    wirBlock: permMatrix?.WIR ?? null,
    wirRaise: permMatrix?.WIR?.raise,
  });

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

  return (
    <section className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border dark:border-neutral-800 p-4 sm:p-5 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-lg sm:text-xl md:text-2xl font-semibold dark:text-white">
            Work Inspection Requests
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-300 truncate">
            {projectFromState?.code ? `${projectFromState.code} — ` : ""}
            {projectFromState?.title || `Project: ${projectId}`}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={backToMyProjects}
            className="text-sm px-3 py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
            title="Back"
          >
            Back
          </button>
          {canCreate && (
            <button
              onClick={createWir}
              onMouseEnter={() =>
                console.info("[WIR] NewWIR:hover", {
                  memStatus,
                  effectiveRole,
                  srvRole,
                  wirRaise: permMatrix?.WIR?.raise,
                  canCreate,
                })
              }
              className="text-sm px-3 py-2 rounded-lg border bg-emerald-600 text-white hover:bg-emerald-700 dark:border-emerald-700"
              title="Create WIR"
              data-debug-cancreate={String(canCreate)}
            >
              + New WIR
            </button>
          )}

        </div>
      </div>

      {/* KPI strip */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Total" value={loading ? "—" : kpis.total} />
        <KPI label="Submitted" value={loading ? "—" : kpis.submitted} tone="warn" />
        <KPI label="Approved/Closed" value={loading ? "—" : kpis.approved} tone="info" />
        <KPI label="Rejected" value={loading ? "—" : kpis.rejected} tone="alert" />
      </div>

      {/* Search */}
      <div className="mt-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by code, title, or status…"
          className="w-full text-sm border rounded-lg px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
        />
      </div>

      {/* Loading / Error / Empty */}
      {loading && (
        <div className="mt-4 text-sm text-gray-700 dark:text-gray-300">Loading WIRs…</div>
      )}
      {err && !loading && (
        <div className="mt-4 text-sm text-red-700 dark:text-red-400">{err}</div>
      )}
      {!loading && !err && filtered.length === 0 && (
        <div className="mt-6 text-sm text-gray-600 dark:text-gray-400">
          No WIRs found for this project.
        </div>
      )}

      {/* List (TILES) */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((w) => {
          const busy = preflightId === w.wirId;

          // Prefer normalized fields (now preserved in mapping), with light fallbacks:
          const any = w as any;
          const bicName = pickBicName(w, bicNameMap);

          const forDateRaw =
            w.forDate ?? any?.for_date ?? (any?.plannedAt ? String(any.plannedAt) : null);
          // Show local **date** only (payload is ISO string like "2025-11-30T04:50:00.000Z")
          const forDateDisp = forDateRaw ? new Date(forDateRaw).toLocaleDateString() : "—";

          const forTime = w.forTime ?? any?.for_time ?? null;
          const forTimeDisp = fmtTime12(forTime);

          const itemsDisp =
            typeof w.itemsCount === "number" ? w.itemsCount : "—";

          // --- Reschedule flags ---
          const isRescheduled = !!(w.rescheduleForDate || w.rescheduleForTime);
          const reschedTimeRaw = w.rescheduleForTime ?? any?.reschedule_for_time ?? null;
          const reschedTimeDisp = fmtTime12(reschedTimeRaw);

          const reschedTip = isRescheduled
            ? `Rescheduled → ${w.rescheduleForDate ? new Date(w.rescheduleForDate).toLocaleDateString() : "—"
            } • ${reschedTimeDisp || "—"}${w.rescheduleReason ? `\nReason: ${w.rescheduleReason}` : ""
            }`
            : "";

          return (
            <button
              key={w.wirId}
              onClick={() => !busy && openWirDetail(w)}
              disabled={busy}
              className={`text-left group ${busy ? "opacity-60 cursor-wait" : ""}`}
            >
              <div
                className="
                  h-full rounded-2xl border dark:border-neutral-800
                  p-4 sm:p-5
                  bg-white dark:bg-neutral-900
                  transition
                  hover:bg-gray-50 dark:hover:bg-neutral-800
                "
              >
                {/* Heading */}
                <div className="min-w-0">
                  <div className="text-sm sm:text-base font-semibold dark:text-white truncate">
                    {[
                      w.code || undefined,
                      (w.title || w.wirId || undefined),
                      (typeof w.version === "number" ? `v${w.version}` : undefined),
                    ]
                      .filter(Boolean)
                      .join(" — ")}
                    {busy ? " • checking…" : ""}
                  </div>
                </div>

                {/* Status + pills + BIC */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <StatusBadge value={w.status} />
                  {(() => {
                    const st = canonicalWirStatus(w.status);
                    // For Approved, reflect what exactly was accepted (Approve / Approve w/ comments / Reject)
                    if (st === "HODApproved") {
                      const ir = (w.inspectorRecommendation || "").toString().toUpperCase();
                      const label =
                        ir === "APPROVE_WITH_COMMENTS" ? "Approve w/ comments" :
                          ir === "APPROVE" ? "Approve" :
                            ir === "REJECT" ? "Reject" : null;
                      return label ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border dark:border-neutral-700 bg-gray-50 text-gray-800 dark:bg-neutral-800 dark:text-gray-200">
                          {label}
                        </span>
                      ) : null;
                    }
                    // For Rejected, keep it explicit
                    if (st === "HODRejected") {
                      return (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border dark:border-neutral-700 bg-gray-50 text-gray-800 dark:bg-neutral-800 dark:text-gray-200">
                          Reject
                        </span>
                      );
                    }
                    return null;
                  })()}

                  {isRescheduled && (
                    <span
                      title={reschedTip}
                      className="text-[10px] px-1.5 py-0.5 rounded border dark:border-neutral-700
               bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                    >
                      Rescheduled
                    </span>
                  )}

                  {wirCfg && (
                    <>
                      <span className="text-[10px] px-1.5 py-0.5 rounded border dark:border-neutral-700 bg-gray-50 text-gray-800 dark:bg-neutral-800 dark:text-gray-200">
                        {wirCfg.transmissionType}
                      </span>
                      {wirCfg.exportPdfAllowed && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border dark:border-neutral-700 bg-gray-50 text-gray-800 dark:bg-neutral-800 dark:text-gray-200">
                          PDF
                        </span>
                      )}
                      {!wirCfg.redirectAllowed && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border dark:border-neutral-700 bg-gray-50 text-gray-800 dark:bg-neutral-800 dark:text-gray-200">
                          No-Redirect
                        </span>
                      )}
                    </>
                  )}
                  {/* BIC pill (full name preferred; fallback to id; final fallback dash) */}
                  <span className="text-[10px] px-1.5 py-0.5 rounded border dark:border-neutral-700 bg-gray-50 text-gray-800 dark:bg-neutral-800 dark:text-gray-200">
                    BIC: {bicName || "—"}
                  </span>
                </div>

                {/* Details line: forDate • forTime • items */}
                <div className="mt-2 text-[12px] text-gray-600 dark:text-gray-300">
                  {forDateDisp} <span className="mx-1.5">•</span> {forTimeDisp || "—"}{" "}
                  <span className="mx-1.5">•</span> Items: {itemsDisp}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {permOpen && (
        <div className="fixed inset-0 z-50 bg-black/40">
          <div className="absolute inset-x-0 bottom-0 sm:static sm:mx-auto w-full sm:w-auto sm:max-w-xl sm:rounded-2xl bg-white dark:bg-neutral-900 border-t sm:border dark:border-neutral-800 p-4 sm:p-5 h-[70vh] sm:h-auto rounded-t-2xl sm:rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold dark:text-white">
                View Permission Required
              </div>
              <button
                onClick={() => setPermOpen(false)}
                className="text-sm px-3 py-2 rounded border dark:border-neutral-800"
              >
                Close
              </button>
            </div>

            {/* Context */}
            <div className="mt-2 text-[12px] text-gray-500 dark:text-gray-400">
              {projectFromState?.code ? `${projectFromState.code} — ` : ""}
              {projectFromState?.title || `Project: ${projectId}`}
            </div>

            {/* Body */}
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border dark:border-neutral-800 p-3">
                <div className="text-[12px] sm:text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                  Selected WIR
                </div>
                <div className="text-[15px] sm:text-sm dark:text-white break-all">
                  {permForWir?.code ? `${permForWir.code}${permForWir.title ? " — " : ""}` : ""}
                  {permForWir?.title || permForWir?.wirId || "—"}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border dark:border-neutral-800 p-3">
                  <div className="text-[12px] sm:text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                    Signed in as
                  </div>
                  <div className="text-[15px] sm:text-sm dark:text-white">{creatorName}</div>
                </div>

                <div className="rounded-xl border dark:border-neutral-800 p-3">
                  <div className="text-[12px] sm:text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                    Your Role (derived)
                  </div>
                  <div className="text-[15px] sm:text-sm dark:text-white">
                    {effectiveRole || "—"}
                    {srvRole && srvRole !== role ? (
                      <span className="ml-2 text-[11px] opacity-70">(server)</span>
                    ) : null}
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

            {/* Footer */}
            <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-end gap-2">
              <button
                onClick={() => setPermOpen(false)}
                className="w-full sm:w-auto text-sm px-3 py-3 sm:py-2 rounded-lg border dark:border-neutral-800"
              >
                Cancel
              </button>

              {/* OK can optionally take them to a neutral page or open a help doc. 
            For now, just close the dialog. If you prefer, navigate to /home/my-projects. */}
              <button
                onClick={() => setPermOpen(false)}
                className="w-full sm:w-auto text-sm px-3 py-3 sm:py-2 rounded-lg border bg-emerald-600 text-white hover:bg-emerald-700 dark:border-emerald-700"
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
