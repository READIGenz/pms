// pms-frontend/src/views/admin/ref/activitylib/ActivityLib.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "../../../../api/client";

/* ========================= JWT helper (same as other admin screens) ========================= */
function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
    return JSON.parse(atob(b64 + pad));
  } catch {
    return null;
  }
}

/* ========================= Enums (align with Prisma) ========================= */
const DISCIPLINES = ["Civil", "MEP", "Finishes"] as const;
type Discipline = (typeof DISCIPLINES)[number];

const STATUS_OPTIONS = ["Active", "Draft", "Inactive", "Archived"] as const;
type ActivityStatus = (typeof STATUS_OPTIONS)[number];

/* Stage library (borrowed from the HTML prototype) */
const STAGE_LIBRARY: Record<string, string[]> = {
  Civil: [
    "Structural • Foundation",
    "Structural • Footing",
    "Structural • Column",
    "Structural • Beam",
    "Structural • Slab",
    "Structural • Staircase",
    "Masonry • Blockwork",
    "Masonry • Brickwork",
    "Plaster • Internal",
    "Plaster • External",
  ],
  MEP: [
    "Services • Electrical",
    "Services • Lighting",
    "Services • Conduits / Wiring",
    "Services • Plumbing",
    "Services • Drainage",
    "Services • Firefighting",
    "Services • HVAC",
    "Services • Earthing",
    "Services • BMS",
  ],
  Finishes: [
    "Finishes • Flooring",
    "Finishes • Tiling",
    "Finishes • Skirting",
    "Finishes • Painting",
    "Finishes • False Ceiling",
    "Finishes • Doors",
    "Finishes • Windows",
    "Finishes • Waterproofing",
  ],
};

/* Tag facets lifted from prototype; map to string[] columns in Prisma */
const FACETS = {
  System: [
    "SYS.ELE.LV",
    "SYS.ELE.ELV.CCTV",
    "SYS.PHE.WSUP",
    "SYS.PHE.DRAIN",
    "SYS.HVC.DUCT",
    "SYS.FLS.SPRINKLER",
    "SYS.SOLAR.PV",
  ],
  Nature: [
    "NAT.INSTALL",
    "NAT.INSPECT",
    "NAT.TEST",
    "NAT.POUR",
    "NAT.COMMISSION",
    "NAT.DOCUMENT",
    "NAT.CLEAN",
  ],
  Method: [
    "MET.CAST_IN_SITU",
    "MET.PRECAST",
    "MET.POST_TENSION",
    "MET.AAC_BLOCK",
    "MET.RAIL_MOUNT",
    "MET.BOLTED_SUPPORT",
  ],
  Phase: [
    "Substructure",
    "Superstructure",
    "Services",
    "Finishes",
    "Commissioning",
  ],
  Element: [
    "Footing",
    "Column",
    "Beam",
    "Slab",
    "Wall",
    "Staircase",
    "Door",
    "Window",
    "Duct",
    "Pipe",
  ],
};

/* ========================= Types ========================= */
export type RefActivity = {
  id: string;
  code: string | null; // optional unique
  title: string;
  discipline: Discipline;
  stageLabel: string | null; // nullable
  phase?: string[];
  element?: string[];
  system: string[];
  nature: string[];
  method: string[];
  version: number; // numeric in schema; UI uses text box but coerces to number
  versionLabel?: string | null;
  notes: string | null;
  status: ActivityStatus; // Active | Draft | Inactive | Archived
  updatedAt: string; // ISO
  createdAt?: string;
};

/* Minimal list item type to render table rows */
type ActivityLite = RefActivity;

/* Query params / server payload helpers */
type ListResp = { items: ActivityLite[]; total: number } | ActivityLite[];

/* ========================= Component ========================= */
export default function ActivityLib() {
  const location = useLocation();
  const nav = useNavigate();

  // Page title + shell subtitle
  useEffect(() => {
    document.title = "Trinity PMS — Activity Library";
    (window as any).__ADMIN_SUBTITLE__ =
      "Reusable activities that power inspections and workflows.";
    return () => {
      (window as any).__ADMIN_SUBTITLE__ = "";
    };
  }, []);

  /* ---- Admin gate ---- */
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      nav("/login", { replace: true });
      return;
    }
    const payload = decodeJwtPayload(token);
    const isAdmin = !!(
      payload &&
      (payload.isSuperAdmin ||
        payload.role === "Admin" ||
        payload.userRole === "Admin")
    );
    if (!isAdmin) nav("/landing", { replace: true });
  }, [nav]);

  /* ---- List state ---- */
  const [q, setQ] = useState("");
  const [discipline, setDiscipline] = useState<Discipline | "">("");
  const [stage, setStage] = useState<string>("");
  const [status, setStatus] = useState<ActivityStatus | "">("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [rows, setRows] = useState<ActivityLite[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  /* ---- Editor / View state ---- */
  const emptyForm: Partial<RefActivity> = {
    id: "",
    code: "",
    title: "",
    discipline: "Civil",
    stageLabel: "",
    phase: [],
    element: [],
    system: [],
    nature: [],
    method: [],
    version: 1,
    versionLabel: "1.0.0",
    notes: "",
    status: "Draft",
    updatedAt: new Date().toISOString(),
  };

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<RefActivity> | null>(
    emptyForm
  );
  const [saving, setSaving] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewItem, setViewItem] = useState<ActivityLite | null>(null);

  const openView = (row: ActivityLite) => {
    setViewItem(row);
    setViewOpen(true);
  };
  const closeView = () => {
    setViewOpen(false);
    setViewItem(null);
  };

  const isNew = !editing?.id;
  const canSave = useMemo(
    () => !!(editing && editing.title && editing.discipline),
    [editing?.title, editing?.discipline]
  );

  type ActivityStats = {
    total: number;
    byStatus: Record<ActivityStatus, number>;
  };

  const defaultStats: ActivityStats = {
    total: 0,
    byStatus: { Active: 0, Draft: 0, Inactive: 0, Archived: 0 },
  };

  const [stats, setStats] = useState<ActivityStats>(defaultStats);
  const [statsLoading, setStatsLoading] = useState(false);

  /* ---- Sorting (client-side) ---- */
  type SortKey =
    | "activity"
    | "discStage"
    | "phase"
    | "element"
    | "system"
    | "nature"
    | "method"
    | "version"
    | "updated"
    | "status";

  const [sortBy, setSortBy] = useState<SortKey>("updated");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const firstOrDash = (arr?: string[]) => (arr && arr.length ? arr[0] : "—");
  const cmp = (a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0);

  const statusCounts = useMemo(() => {
    const base = {
      Active: 0,
      Draft: 0,
      Inactive: 0,
      Archived: 0,
    } as Record<ActivityStatus, number>;
    for (const r of rows) {
      if (r.status in base) base[r.status as ActivityStatus] += 1;
    }
    return base;
  }, [rows]);

  function parseParts(v?: string | number | null) {
    const s = v == null ? "" : String(v);
    const m = s.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
    if (!m) return [0, 0, 0];
    return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)];
  }

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((A, B) => {
      let av: any = "";
      let bv: any = "";
      switch (sortBy) {
        case "activity":
          av = (A.code ? `${A.code} • ` : "") + (A.title || "");
          bv = (B.code ? `${B.code} • ` : "") + (B.title || "");
          break;
        case "discStage":
          av = `${A.discipline} • ${A.stageLabel ?? ""}`;
          bv = `${B.discipline} • ${B.stageLabel ?? ""}`;
          break;
        case "phase":
          av = firstOrDash(A.phase);
          bv = firstOrDash(B.phase);
          break;
        case "element":
          av = firstOrDash(A.element);
          bv = firstOrDash(B.element);
          break;
        case "system":
          av = firstOrDash(A.system);
          bv = firstOrDash(B.system);
          break;
        case "nature":
          av = firstOrDash(A.nature);
          bv = firstOrDash(B.nature);
          break;
        case "method":
          av = firstOrDash(A.method);
          bv = firstOrDash(B.method);
          break;
        case "version": {
          const [a1, a2, a3] = parseParts((A as any).versionLabel ?? A.version);
          const [b1, b2, b3] = parseParts((B as any).versionLabel ?? B.version);
          av = a1 * 1e6 + a2 * 1e3 + a3;
          bv = b1 * 1e6 + b2 * 1e3 + b3;
          break;
        }
        case "updated":
          av = new Date(A.updatedAt || 0).getTime();
          bv = new Date(B.updatedAt || 0).getTime();
          break;
        case "status":
          av = A.status || "";
          bv = B.status || "";
          break;
      }
      const res = cmp(av, bv);
      return sortDir === "asc" ? res : -res;
    });
    return copy;
  }, [rows, sortBy, sortDir]);

  const requestSort = (key: SortKey) => {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortDir("asc");
    }
  };

  /* ========================= API ========================= */
  const fetchList = async () => {
    setErr(null);
    setLoading(true);
    try {
      const { data } = await api
        .get("/admin/ref/activities", {
          params: { q, discipline, stageLabel: stage, status, page, pageSize },
        })
        .catch(async (e: any) => {
          // Fallback to GET all without pagination if backend doesn’t support it
          if (e?.response?.status === 404) {
            const { data: all } = await api.get("/admin/ref/activities");
            return { data: all };
          }
          throw e;
        });

      let items: ActivityLite[] = [];
      let ttl = 0;
      if (Array.isArray(data)) {
        items = data;
        ttl = data.length;
      } else {
        items = Array.isArray((data as any).items) ? (data as any).items : [];
        ttl =
          typeof (data as any).total === "number"
            ? (data as any).total
            : items.length;
      }

      setRows(items);
      setTotal(ttl);
    } catch (e: any) {
      setRows([]);
      setTotal(0);
      setErr(
        e?.response?.data?.error || e?.message || "Failed to load activities."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, discipline, stage, status, page, pageSize]);

  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const { data } = await api.get("/admin/ref/activitylib/stats");
      // Defensive merge
      setStats({
        total: Number(data?.total ?? 0),
        byStatus: {
          Active: Number(data?.byStatus?.Active ?? 0),
          Draft: Number(data?.byStatus?.Draft ?? 0),
          Inactive: Number(data?.byStatus?.Inactive ?? 0),
          Archived: Number(data?.byStatus?.Archived ?? 0),
        },
      });
    } catch (e) {
      setStats(defaultStats);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchOne = async (id: string): Promise<RefActivity | null> => {
    try {
      const { data } = await api.get(`/admin/ref/activities/${id}`);
      return data;
    } catch {
      return null;
    }
  };

  const handleSave = async (payloadFromChild: Partial<RefActivity>) => {
    const payload: any = normalizeForSubmit({
      ...payloadFromChild,
      phase: Array.isArray(payloadFromChild.phase)
        ? payloadFromChild.phase
        : [],
      element: Array.isArray(payloadFromChild.element)
        ? payloadFromChild.element
        : [],
      system: Array.isArray(payloadFromChild.system)
        ? payloadFromChild.system
        : [],
      nature: Array.isArray(payloadFromChild.nature)
        ? payloadFromChild.nature
        : [],
      method: Array.isArray(payloadFromChild.method)
        ? payloadFromChild.method
        : [],
    });
    setErr(null);
    setSaving(true);
    try {
      if (!payloadFromChild.id) {
        await api.post("/admin/ref/activities", payload);
      } else {
        await api.patch(
          `/admin/ref/activities/${payloadFromChild.id}`,
          payload
        );
      }
      setEditorOpen(false);
      setEditing(emptyForm);
      await fetchList();
    } catch (e: any) {
      const s = e?.response?.status;
      const msg =
        s === 401
          ? "Unauthorized (401). Please sign in again."
          : e?.response?.data?.error ||
            e?.message ||
            "Failed to save activity.";
      setErr(msg);
      if (s === 401) {
        localStorage.removeItem("token");
        setTimeout(() => nav("/login", { replace: true }), 250);
      }
    } finally {
      setSaving(false);
    }
  };

  /* ========================= Helpers ========================= */
  function normalizeForSubmit(p: Partial<RefActivity>) {
    const out: any = {};
    const copyFields = [
      "code",
      "title",
      "discipline",
      "stageLabel",
      "phase",
      "element",
      "system",
      "nature",
      "method",
      "notes",
      "status",
    ];
    copyFields.forEach((k) => (out[k] = (p as any)[k]));

    // arrays
    ["system", "nature", "method", "phase", "element"].forEach((k) => {
      out[k] = Array.isArray(out[k]) ? out[k] : [];
    });

    // strings
    ["code", "title", "stageLabel", "notes"].forEach((k) => {
      if (out[k] != null) out[k] = String(out[k]).trim();
    });

    // versionLabel preference
    const vl = (p as any).versionLabel;
    out.versionLabel =
      typeof vl === "string"
        ? vl.trim()
        : p.version != null
        ? String(p.version)
        : null;

    const vNum = Number((p as any).version);
    out.version = Number.isFinite(vNum) ? vNum : 1;

    if (out.code === "") out.code = null;
    if (out.stageLabel === "") out.stageLabel = null;
    if (!STATUS_OPTIONS.includes(out.status)) out.status = "Draft";

    return out;
  }

  const openNew = () => {
    nav("/admin/ref/activitylib/new");
  };

  const openEdit = async (id: string) => {
    nav(`/admin/ref/activitylib/${id}/edit`);
  };

  const setEdit = <K extends keyof RefActivity>(key: K, val: RefActivity[K]) =>
    setEditing((f) => ({ ...(f || {}), [key]: val }));

  const asList = (arr?: string[]) => (arr && arr.length ? arr.join(", ") : "—");

  const clearFilters = () => {
    setQ("");
    setDiscipline("");
    setStage("");
    setStatus("");
    setPage(1);
  };

  const refresh = () => {
    fetchList();
    fetchStats();
  };

  const exportCsv = () => {
    const header = [
      "Activity",
      "Discipline • Stage",
      "Phase",
      "Element",
      "System",
      "Nature",
      "Method",
      "Version",
      "Updated",
      "Status",
      "Id",
    ];

    const rowsToExport = sortedRows.map((r) => [
      r.code ? `${r.code} • ${r.title}` : r.title,
      `${r.discipline} • ${r.stageLabel || "—"}`,
      (r.phase || []).join("|"),
      (r.element || []).join("|"),
      (r.system || []).join("|"),
      (r.nature || []).join("|"),
      (r.method || []).join("|"),
      `v${(r as any).versionLabel ?? r.version}`,
      fmt(r.updatedAt),
      r.status,
      r.id,
    ]);

    const escapeCsv = (v: string) =>
      /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

    const csv =
      header.map(escapeCsv).join(",") +
      "\n" +
      rowsToExport.map((row) => row.map(escapeCsv).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const date = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.download = `activity-lib-${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* ========================= UI (new theme, no logic changes) ========================= */

  // Controls + buttons (match latest admin pages)
  const pillSelect =
    "h-8 rounded-full border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-700 shadow-sm " +
    "outline-none focus:border-transparent focus:ring-2 focus:ring-[#00379C]/20 " +
    "dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100";

  const pillInput =
    "h-8 w-full rounded-full border border-slate-200 bg-white px-3 text-[12.5px] text-slate-800 placeholder:text-slate-400 shadow-sm " +
    "outline-none focus:border-transparent focus:ring-2 focus:ring-[#00379C]/20 " +
    "dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-slate-500";

  const btnOutline =
    "inline-flex h-8 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-[12.5px] font-semibold " +
    "text-slate-700 shadow-sm transition hover:bg-slate-50 active:translate-y-[0.5px] " +
    "dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100 dark:hover:bg-white/5";

  const btnTeal =
    "inline-flex h-8 items-center justify-center rounded-full bg-[#23A192] px-3 text-[12.5px] font-semibold text-white " +
    "shadow-sm transition hover:brightness-110 active:translate-y-[0.5px] disabled:opacity-60";

  const btnPrimary =
    "inline-flex h-8 items-center justify-center rounded-full bg-[#00379C] px-3 text-[12.5px] font-semibold text-white " +
    "shadow-sm transition hover:brightness-110 active:translate-y-[0.5px] disabled:opacity-60";

  return (
    <div className="w-full">
      <div className="mx-auto max-w-6xl">
        {/* Actions row (right) */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {loading ? "Loading…" : `${total} item${total === 1 ? "" : "s"}`}
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-start sm:justify-end">
            <button className={btnOutline} onClick={exportCsv} type="button">
              Export CSV
            </button>
            <button
              className={btnTeal}
              onClick={refresh}
              type="button"
              title="Refresh"
            >
              Refresh
            </button>
            <button
              className={btnPrimary}
              onClick={openNew}
              type="button"
              title="Create Activity"
            >
              + Create
            </button>
          </div>
        </div>

        {err && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm dark:border-red-900/50 dark:bg-red-950/25 dark:text-red-200">
            {err}
          </div>
        )}

        {/* KPIs */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <KpiCard
            label="Active"
            value={statsLoading ? "…" : stats.byStatus.Active}
          />
          <KpiCard
            label="Draft"
            value={statsLoading ? "…" : stats.byStatus.Draft}
          />
          <KpiCard
            label="Inactive"
            value={statsLoading ? "…" : stats.byStatus.Inactive}
          />
          <KpiCard
            label="Archived"
            value={statsLoading ? "…" : stats.byStatus.Archived}
          />
        </div>

        {/* Filters (NO heading, NO boundary) */}
        <div className="mb-4">
          {/* Row 1: filters + clear */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Discipline
              </span>
              <select
                className={pillSelect}
                value={discipline}
                onChange={(e) => {
                  setDiscipline(e.target.value as Discipline | "");
                  setStage("");
                  setPage(1);
                }}
              >
                <option value="">All</option>
                {DISCIPLINES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Stage
              </span>
              <select
                className={pillSelect}
                value={stage}
                onChange={(e) => {
                  setStage(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All</option>
                {[
                  ...(discipline
                    ? STAGE_LIBRARY[discipline] || []
                    : Object.values(STAGE_LIBRARY).flat()),
                ].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Status
              </span>
              <select
                className={pillSelect}
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as ActivityStatus | "");
                  setPage(1);
                }}
              >
                <option value="">All</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-[18px]">
              <button
                className={btnOutline}
                onClick={clearFilters}
                type="button"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Row 2: search left, page size right */}
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <label className="block w-full sm:max-w-[520px]">
              <span className="mb-1 block text-[11px] font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Search
              </span>
              <input
                className={pillInput}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="id, code, title, stage…"
                type="text"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Page size
              </span>
              <select
                className={pillSelect}
                value={pageSize}
                onChange={(e) => {
                  setPageSize(parseInt(e.target.value, 10));
                  setPage(1);
                }}
              >
                {[10, 20, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}/page
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-neutral-950 overflow-hidden">
          <div className="overflow-auto max-h-[62vh] thin-scrollbar">
            <table className="w-full min-w-[1100px] text-[12.5px] table-auto">
              <colgroup>
                <col className="w-[140px]" />
                <col className="w-[300px]" />
                <col span={9} />
              </colgroup>

              <thead className="bg-slate-50 dark:bg-neutral-900">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-extrabold uppercase tracking-widest text-slate-600 border-b border-slate-200 dark:border-white/10 dark:text-slate-200">
                    Actions
                  </th>

                  <Th
                    className="border-b border-slate-200 dark:border-white/10 w-[320px]"
                    onClick={() => requestSort("activity")}
                    active={sortBy === "activity"}
                    dir={sortDir}
                  >
                    Activity
                  </Th>

                  <Th
                    className="border-b border-slate-200 dark:border-white/10"
                    onClick={() => requestSort("discStage")}
                    active={sortBy === "discStage"}
                    dir={sortDir}
                  >
                    Discipline • Stage
                  </Th>

                  <Th
                    className="border-b border-slate-200 dark:border-white/10"
                    onClick={() => requestSort("phase")}
                    active={sortBy === "phase"}
                    dir={sortDir}
                  >
                    Phase
                  </Th>

                  <Th
                    className="border-b border-slate-200 dark:border-white/10"
                    onClick={() => requestSort("element")}
                    active={sortBy === "element"}
                    dir={sortDir}
                  >
                    Element
                  </Th>

                  <Th
                    className="border-b border-slate-200 dark:border-white/10"
                    onClick={() => requestSort("system")}
                    active={sortBy === "system"}
                    dir={sortDir}
                  >
                    System
                  </Th>

                  <Th
                    className="border-b border-slate-200 dark:border-white/10"
                    onClick={() => requestSort("nature")}
                    active={sortBy === "nature"}
                    dir={sortDir}
                  >
                    Nature
                  </Th>

                  <Th
                    className="border-b border-slate-200 dark:border-white/10"
                    onClick={() => requestSort("method")}
                    active={sortBy === "method"}
                    dir={sortDir}
                  >
                    Method
                  </Th>

                  <Th
                    className="border-b border-slate-200 dark:border-white/10"
                    onClick={() => requestSort("version")}
                    active={sortBy === "version"}
                    dir={sortDir}
                  >
                    Version
                  </Th>

                  <Th
                    className="border-b border-slate-200 dark:border-white/10"
                    onClick={() => requestSort("updated")}
                    active={sortBy === "updated"}
                    dir={sortDir}
                  >
                    Updated
                  </Th>

                  <Th
                    className="border-b border-slate-200 dark:border-white/10"
                    onClick={() => requestSort("status")}
                    active={sortBy === "status"}
                    dir={sortDir}
                  >
                    Status
                  </Th>
                </tr>
              </thead>

              <tbody>
                {sortedRows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-slate-100/80 dark:border-white/10 hover:bg-slate-50/60 dark:hover:bg-white/5"
                  >
                    {/* Actions */}
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        {/* View */}
                        <button
                          type="button"
                          aria-label="View activity"
                          title="View"
                          onClick={() => openView(r)}
                          className="
                            inline-flex h-8 w-8 items-center justify-center rounded-full
                            text-[#23A192] hover:bg-[#23A192]/10
                            dark:hover:bg-[#23A192]/15
                          "
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.7}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Z" />
                            <circle cx="12" cy="12" r="2.5" />
                          </svg>
                        </button>

                        {/* Edit */}
                        <button
                          type="button"
                          aria-label="Edit activity"
                          title="Edit"
                          onClick={() => openEdit(r.id)}
                          className="
                            inline-flex h-8 w-8 items-center justify-center rounded-full
                            text-[#00379C] hover:bg-[#00379C]/10
                            dark:text-[#FCC020] dark:hover:bg-[#FCC020]/10
                          "
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M4 20h4l10.5-10.5-4-4L4 16v4z" />
                            <path d="M14.5 5.5l4 4" />
                          </svg>
                        </button>
                      </div>
                    </td>

                    {/* Activity */}
                    <td className="w-[300px] max-w-[300px] px-3 py-2">
                      <div className="line-clamp-2 break-words font-semibold text-slate-900 dark:text-slate-50">
                        {r.code ? `${r.code} • ${r.title}` : r.title}
                      </div>
                    </td>

                    <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                      {r.discipline} • {r.stageLabel || "—"}
                    </td>

                    <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                      {asList(r.phase)}
                    </td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                      {asList(r.element)}
                    </td>

                    <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                      {asList(r.system)}
                    </td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                      {asList(r.nature)}
                    </td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                      {asList(r.method)}
                    </td>

                    <td className="px-3 py-2 text-slate-700 dark:text-slate-100">
                      {`v${(r as any).versionLabel ?? r.version}`}
                    </td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                      {fmt(r.updatedAt)}
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill value={r.status} />
                    </td>
                  </tr>
                ))}

                {!sortedRows.length && !loading && (
                  <tr>
                    <td
                      className="px-3 py-8 text-center text-slate-500 dark:text-slate-400"
                      colSpan={11}
                    >
                      No activities found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination (match list pages) */}
          <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-slate-600 dark:text-slate-300">
              Page <b>{page}</b> of <b>{totalPages}</b>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                className={btnOutline}
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                type="button"
              >
                Prev
              </button>
              <button
                className={btnOutline}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                type="button"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* View Modal */}
        {viewOpen && viewItem && (
          <div className="fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={closeView}
              aria-hidden="true"
            />
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-neutral-950">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-white/10">
                  <div className="flex flex-col">
                    <div className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Activity
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                        {viewItem.code
                          ? `${viewItem.code} • ${viewItem.title}`
                          : viewItem.title}
                      </h3>
                      {viewItem.discipline ? (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                          {viewItem.discipline}
                        </span>
                      ) : null}
                      {viewItem.status ? (
                        <span className="text-xs">
                          <StatusPill value={viewItem.status} />
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <button
                    className={btnOutline}
                    onClick={closeView}
                    type="button"
                  >
                    Close
                  </button>
                </div>

                {/* Body */}
                <div className="grid grid-cols-1 gap-3 p-4 text-sm sm:grid-cols-2">
                  <KV k="Code" v={viewItem.code || "—"} />
                  <KV k="Title" v={viewItem.title || "—"} />
                  <KV
                    k="Discipline • Stage"
                    v={`${viewItem.discipline} • ${viewItem.stageLabel || "—"}`}
                  />
                  <KV k="Phase" v={viewItem.phase?.join(", ") || "—"} />
                  <KV k="Element" v={viewItem.element?.join(", ") || "—"} />
                  <KV k="System" v={viewItem.system?.join(", ") || "—"} />
                  <KV k="Nature" v={viewItem.nature?.join(", ") || "—"} />
                  <KV k="Method" v={viewItem.method?.join(", ") || "—"} />
                  <KV
                    k="Version"
                    v={`v${
                      (viewItem as any).versionLabel ?? viewItem.version ?? 1
                    }`}
                  />
                  <KV k="Updated" v={fmt(viewItem.updatedAt)} />
                  <KV k="Status" v={<StatusPill value={viewItem.status} />} />
                  <div className="sm:col-span-2">
                    <KV k="Notes" v={viewItem.notes || "—"} />
                  </div>
                </div>

                {/* Footer */}
                <div className="border-t border-slate-200 px-4 py-3 text-right dark:border-white/10">
                  <button
                    className={btnPrimary}
                    onClick={closeView}
                    type="button"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Thin scrollbar styling (consistent) */}
        <style>{`
          .thin-scrollbar::-webkit-scrollbar { height: 10px; width: 10px; }
          .thin-scrollbar::-webkit-scrollbar-track { background: transparent; }
          .thin-scrollbar::-webkit-scrollbar-thumb {
            background: rgba(148, 163, 184, 0.55);
            border-radius: 999px;
            border: 2px solid transparent;
            background-clip: padding-box;
          }
          .thin-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.8); }
          .thin-scrollbar { scrollbar-width: thin; scrollbar-color: rgba(148,163,184,0.55) transparent; }
        `}</style>
      </div>
    </div>
  );
}

/* ========================= UI helper blocks (theme-consistent) ========================= */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-white/10 dark:bg-neutral-950 sm:px-6 sm:py-5">
        <div className="mb-3 flex items-center gap-3">
          <span className="inline-block h-5 w-1 rounded-full bg-[#FCC020]" />
          <div className="text-xs font-extrabold uppercase tracking-widest text-[#00379C] dark:text-[#FCC020]">
            {title}
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}

function KpiCard({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-neutral-950">
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-0.5 text-xl font-extrabold text-slate-900 dark:text-white">
        {value}
      </div>
    </div>
  );
}

function StatusPill({ value }: { value: ActivityStatus }) {
  const cls =
    value === "Active"
      ? "bg-[#23A192]/10 text-[#23A192] border-[#23A192]/25"
      : value === "Draft"
      ? "bg-[#00379C]/10 text-[#00379C] border-[#00379C]/25 dark:text-[#FCC020] dark:border-[#FCC020]/25 dark:bg-[#FCC020]/10"
      : value === "Inactive"
      ? "bg-[#FCC020]/15 text-slate-800 border-[#FCC020]/35 dark:text-slate-100"
      : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/25 dark:text-rose-200 dark:border-rose-900/50";

  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}
    >
      {value}
    </span>
  );
}

function fmt(iso?: string) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso!;
  }
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-3">
      <div className="text-slate-500 dark:text-slate-400">{k}</div>
      <div className="text-slate-900 dark:text-white">{v}</div>
    </div>
  );
}

const SortIcon = ({
  active,
  dir,
}: {
  active: boolean;
  dir: "asc" | "desc";
}) => (
  <span className="ml-1 inline-block text-[10px] opacity-70">
    {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
  </span>
);

function Th({
  children,
  onClick,
  active,
  dir,
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: "asc" | "desc";
  className?: string;
}) {
  return (
    <th className={`px-3 py-3 align-middle ${className}`}>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex select-none items-center gap-1 text-[11px] font-extrabold uppercase tracking-widest text-slate-600 hover:underline dark:text-slate-200"
        title="Sort"
      >
        <span>{children}</span>
        <SortIcon active={active} dir={dir} />
      </button>
    </th>
  );
}
