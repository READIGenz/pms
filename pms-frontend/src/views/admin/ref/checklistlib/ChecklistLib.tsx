// pms-frontend/src/views/admin/ref/checklist/ChecklistLib.tsx

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "../../../../api/client";

/* ========================= JWT helper ========================= */
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

/* ========================= Enums / Constants ========================= */
const DISCIPLINES = ["Civil", "MEP", "Finishes"] as const;
type Discipline = (typeof DISCIPLINES)[number];

const STATUS_OPTIONS = ["Active", "Draft", "Inactive", "Archived"] as const;
type ChecklistStatus = (typeof STATUS_OPTIONS)[number];

const STAGE_LIBRARY: Record<string, string[]> = {
  Civil: [
    "Structural • Foundation",
    "Structural • Footing",
    "Structural • Columns",
    "Structural • Slab",
    "Masonry • Brickwork",
    "Plaster • Internal",
    "Plaster • External",
  ],
  MEP: [
    "Electrical • Conduits",
    "Electrical • Wiring",
    "Plumbing • Piping",
    "Plumbing • Fixtures",
    "Fire • Sprinklers",
  ],
  Finishes: ["Flooring", "Painting", "Doors", "Windows", "Kitchen", "Toilets"],
};

type ChecklistRow = {
  id: string;
  code?: string | null;
  title: string;
  discipline?: string | null;
  stageLabel?: string | null;
  status: ChecklistStatus;
  aiDefault?: boolean | null;
  tags?: string[] | null;
  versionMajor?: number | null;
  versionMinor?: number | null;
  versionPatch?: number | null;
  itemsCount?: number | null;
  updatedAt?: string | null;
};

type SortKey =
  | "code"
  | "discStage"
  | "version"
  | "items"
  | "aiDefault"
  | "tags"
  | "updated"
  | "status";

/* ========================= Bits ========================= */
function StatusPill({ value }: { value: ChecklistStatus }) {
  const cls =
    value === "Active"
      ? "bg-[#23A192]/10 text-[#23A192] border-[#23A192]/25 dark:bg-[#23A192]/15 dark:text-[#23A192] dark:border-[#23A192]/30"
      : value === "Draft"
      ? "bg-[#FCC020]/15 text-[#8A5D00] border-[#FCC020]/35 dark:bg-[#FCC020]/10 dark:text-[#FCC020] dark:border-[#FCC020]/25"
      : value === "Inactive"
      ? "bg-slate-100 text-slate-700 border-slate-200 dark:bg-neutral-800 dark:text-slate-200 dark:border-neutral-700"
      : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-neutral-800 dark:text-slate-200 dark:border-neutral-700";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}
    >
      {value}
    </span>
  );
}

function Th({
  children,
  onClick,
  active,
  dir,
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  active: boolean;
  dir: "asc" | "desc";
  className?: string;
}) {
  return (
    <th className={`px-3 py-2 align-middle ${className}`}>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-200 select-none hover:underline"
        title="Sort"
      >
        {children}
        <span className="text-slate-400 dark:text-slate-500">
          {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
        {label}
      </span>
      <input
        className="h-8 w-full rounded-full border border-slate-200 bg-white px-3 text-[12.5px] text-slate-900 shadow-sm outline-none transition focus:ring-2 focus:ring-[#00379C]/20 dark:bg-neutral-900 dark:text-white dark:border-neutral-700"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
      />
    </label>
  );
}

function SelectStrict({
  label,
  value,
  onChange,
  options,
  placeholder = "All",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
        {label}
      </span>
      <select
        className="h-8 w-full rounded-full border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-700 shadow-sm outline-none transition focus:ring-2 focus:ring-[#00379C]/20 dark:bg-neutral-900 dark:text-white dark:border-neutral-700"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Kpi({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-300">
        {label}
      </div>
      <div className="mt-0.5 text-xl font-extrabold text-slate-900 dark:text-white tabular-nums">
        {value}
      </div>
    </div>
  );
}

function IconBtn({
  title,
  onClick,
  variant,
}: {
  title: string;
  onClick: () => void;
  variant: "view" | "edit";
}) {
  const base =
    "inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm transition hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-950 dark:hover:bg-neutral-800";
  const color = variant === "view" ? "text-[#23A192]" : "text-[#00379C]";

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className={`${base} ${color}`}
      onClick={onClick}
    >
      {variant === "view" ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      ) : (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      )}
    </button>
  );
}

function fmt(iso?: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function versionText(r: ChecklistRow) {
  const a = r.versionMajor ?? 0;
  const b = r.versionMinor ?? 0;
  const c = r.versionPatch ?? 0;
  return `v${a}.${b}.${c}`;
}

function itemsCountLocal(r: ChecklistRow) {
  return Number(r.itemsCount ?? 0);
}

function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="grid grid-cols-[140px,1fr] gap-3 rounded-xl border border-slate-200/70 bg-slate-50 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950/40">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
        {k}
      </div>
      <div className="text-slate-900 dark:text-white break-words">{v}</div>
    </div>
  );
}

/* ========================= Page ========================= */
export default function ChecklistLib() {
  const location = useLocation();
  const nav = useNavigate();

  // Set page title/subtitle in the shared Admin header
  useEffect(() => {
    document.title = "Trinity PMS — Checklist Library";
    (window as any).__ADMIN_SUBTITLE__ =
      "Reusable checklists that power inspections and workflows.";
    return () => {
      // optional cleanup
      if ((window as any).__ADMIN_SUBTITLE__) (window as any).__ADMIN_SUBTITLE__ = "";
    };
  }, []);

  useEffect(() => {
    const refreshFlag = (location.state as any)?.refresh;
    if (refreshFlag) {
      fetchList();
      fetchStats();
      nav(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  // ---------- auth guard ----------
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const payload = decodeJwtPayload(token);
    const isSuperAdmin = Boolean(payload?.isSuperAdmin);
    if (!isSuperAdmin) {
      nav("/admin", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- filters ----------
  const [q, setQ] = useState("");
  const [discipline, setDiscipline] = useState<Discipline | "">("");
  const [stageLabel, setStageLabel] = useState("");
  const [status, setStatus] = useState<ChecklistStatus | "">("");
  const [aiDefault, setAiDefault] = useState<"on" | "off" | "">("");

  // ---------- pagination ----------
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // ---------- data ----------
  const [rows, setRows] = useState<ChecklistRow[]>([]);
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // ---------- status / errors ----------
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /* ---- KPIs ---- */
  const [stats, setStats] = useState({
    total: 0,
    byStatus: { Active: 0, Draft: 0, Inactive: 0, Archived: 0 },
  });
  const [statsLoading, setStatsLoading] = useState(false);

  async function fetchStats() {
    setStatsLoading(true);
    try {
      const { data } = await api.get("/admin/ref/checklists/stats");
      setStats({
        total: Number(data?.total ?? 0),
        byStatus: {
          Active: Number(data?.byStatus?.Active ?? 0),
          Draft: Number(data?.byStatus?.Draft ?? 0),
          Inactive: Number(data?.byStatus?.Inactive ?? 0),
          Archived: Number(data?.byStatus?.Archived ?? 0),
        },
      });
    } catch {
      // ignore KPI errors
    } finally {
      setStatsLoading(false);
    }
  }

  async function fetchList() {
    setLoading(true);
    setErr(null);

    try {
      const { data } = await api.get("/admin/ref/checklists", {
        params: {
          q: q || undefined,
          discipline: discipline || undefined,
          stageLabel: stageLabel || undefined,
          status: status || undefined,
          aiDefault: aiDefault || undefined,
          page,
          pageSize,
        },
      });

      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setTotal(Number(data?.total ?? 0));
    } catch (e: any) {
      setErr(e?.response?.data?.message || "Failed to load checklists.");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  function refresh() {
    fetchList();
    fetchStats();
  }

  function clearFilters() {
    setQ("");
    setDiscipline("");
    setStageLabel("");
    setStatus("");
    setAiDefault("");
    setPage(1);
  }

  function openNew() {
    nav("/admin/ref/checklistlib/new");
  }
  function openEdit(id: string) {
    nav(`/admin/ref/checklistlib/${id}/edit`);
  }

  // ---------- sorting ----------
  const [sortBy, setSortBy] = useState<SortKey>("updated");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function requestSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
  }

  const sortedRows = useMemo(() => {
    const copy = [...rows];

    const dir = sortDir === "asc" ? 1 : -1;
    const safe = (v: any) => (v ?? "").toString().toLowerCase();

    copy.sort((a, b) => {
      let av: any = "";
      let bv: any = "";

      switch (sortBy) {
        case "code":
          av = safe(a.code || a.title);
          bv = safe(b.code || b.title);
          break;
        case "discStage":
          av = safe(`${a.discipline || ""} ${a.stageLabel || ""}`);
          bv = safe(`${b.discipline || ""} ${b.stageLabel || ""}`);
          break;
        case "version":
          av = `${a.versionMajor ?? 0}.${a.versionMinor ?? 0}.${a.versionPatch ?? 0}`;
          bv = `${b.versionMajor ?? 0}.${b.versionMinor ?? 0}.${b.versionPatch ?? 0}`;
          break;
        case "items":
          av = itemsCountLocal(a);
          bv = itemsCountLocal(b);
          break;
        case "aiDefault":
          av = a.aiDefault ? 1 : 0;
          bv = b.aiDefault ? 1 : 0;
          break;
        case "tags":
          av = safe((a.tags || []).join(","));
          bv = safe((b.tags || []).join(","));
          break;
        case "updated":
          av = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          bv = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          break;
        case "status":
          av = safe(a.status);
          bv = safe(b.status);
          break;
        default:
          av = safe(a.title);
          bv = safe(b.title);
      }

      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return av > bv ? dir : av < bv ? -dir : 0;
    });

    return copy;
  }, [rows, sortBy, sortDir]);

  // ---------- export ----------
  function exportCsv() {
    const headers = [
      "id",
      "code",
      "title",
      "discipline",
      "stageLabel",
      "status",
      "aiDefault",
      "version",
      "itemsCount",
      "tags",
      "updatedAt",
    ];

    const csv = [
      headers.join(","),
      ...sortedRows.map((r) => {
        const line = [
          r.id,
          r.code || "",
          r.title || "",
          r.discipline || "",
          r.stageLabel || "",
          r.status || "",
          r.aiDefault ? "on" : "off",
          versionText(r),
          String(itemsCountLocal(r)),
          (r.tags || []).join("|"),
          r.updatedAt || "",
        ]
          .map((x) => `"${String(x).replaceAll('"', '""')}"`)
          .join(",");
        return line;
      }),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `checklists_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();

    URL.revokeObjectURL(url);
  }

  // ---------- view modal ----------
  const [viewOpen, setViewOpen] = useState(false);
  const [viewItem, setViewItem] = useState<ChecklistRow | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  async function openView(id: string) {
    setViewOpen(true);
    setViewLoading(true);
    setViewItem(null);
    try {
      const { data } = await api.get(`/admin/ref/checklists/${id}`);
      setViewItem(data as ChecklistRow);
    } catch {
      setViewItem(null);
    } finally {
      setViewLoading(false);
    }
  }

  function closeView() {
    setViewOpen(false);
    setViewItem(null);
    setViewLoading(false);
  }

  // initial load
  useEffect(() => {
    fetchList();
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  /* ========================= UI ========================= */
  const btnOutline =
    "inline-flex h-8 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800";
  const btnTeal =
    "inline-flex h-8 items-center justify-center rounded-full bg-[#23A192] px-3 text-[12.5px] font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60";
  const btnPrimary =
    "inline-flex h-8 items-center justify-center rounded-full bg-[#00379C] px-3 text-[12.5px] font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60";

  const pagerBtn =
    "h-8 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800";
  const iconCloseBtn =
    "inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:hover:bg-neutral-800";

  return (
    <div className="min-h-screen px-0 py-0 sm:px-0 lg:px-0">
      <div className="mx-auto max-w-7xl">
        {/* Error */}
        {err && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {err}
          </div>
        )}

        {/* ===== Top row: count left, actions right (like screenshot) ===== */}
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-500 dark:text-slate-400">
            {loading ? "Loading…" : `${total} item${total === 1 ? "" : "s"}`}
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <button
              className={btnOutline}
              onClick={exportCsv}
              type="button"
              disabled={sortedRows.length === 0}
              title={sortedRows.length === 0 ? "No rows to export" : "Export CSV"}
            >
              Export CSV
            </button>

            <button className={btnTeal} onClick={refresh} type="button">
              Refresh
            </button>

            <button className={btnPrimary} onClick={openNew} type="button">
              + Create
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Active" value={statsLoading ? "…" : stats.byStatus.Active} />
          <Kpi label="Draft" value={statsLoading ? "…" : stats.byStatus.Draft} />
          <Kpi
            label="Inactive"
            value={statsLoading ? "…" : stats.byStatus.Inactive}
          />
          <Kpi
            label="Archived"
            value={statsLoading ? "…" : stats.byStatus.Archived}
          />
        </div>

        {/* ===== Filters arranged like screenshot ===== */}
        <div className="mb-4">
          {/* Row 1: filters + clear (same line) */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-[170px] shrink-0">
              <SelectStrict
                label="Discipline"
                value={discipline}
                onChange={(v) => {
                  setDiscipline(v as Discipline | "");
                  setStageLabel("");
                  setPage(1);
                }}
                options={["", ...DISCIPLINES].map((d) => ({
                  value: d as any,
                  label: d || "All",
                }))}
              />
            </div>

            <div className="w-[170px] shrink-0">
              <SelectStrict
                label="Stage"
                value={stageLabel}
                onChange={(v) => {
                  setStageLabel(v);
                  setPage(1);
                }}
                options={[
                  "",
                  ...(discipline
                    ? STAGE_LIBRARY[discipline] || []
                    : Object.values(STAGE_LIBRARY).flat()),
                ].map((s) => ({ value: s, label: s || "All" }))}
              />
            </div>

            <div className="w-[170px] shrink-0">
              <SelectStrict
                label="Status"
                value={status}
                onChange={(v) => {
                  setStatus((v as ChecklistStatus) || "");
                  setPage(1);
                }}
                options={["", ...STATUS_OPTIONS].map((s) => ({
                  value: s as any,
                  label: s || "All",
                }))}
              />
            </div>

            <div className="w-[170px] shrink-0">
              <SelectStrict
                label="AI Default"
                value={aiDefault}
                onChange={(v) => {
                  setAiDefault((v as any) || "");
                  setPage(1);
                }}
                options={[
                  { value: "on", label: "On" },
                  { value: "off", label: "Off" },
                ]}
                placeholder="Any"
              />
            </div>

            <button className={btnOutline} onClick={clearFilters} type="button">
              Clear
            </button>
          </div>

          {/* Row 2: search left, page size right */}
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="w-full sm:max-w-[520px]">
              <Input
                label="Search"
                value={q}
                onChange={(v) => {
                  setQ(v);
                  setPage(1);
                }}
                placeholder="id/code, title, stage…"
              />
            </div>

            <label className="block w-[100px] shrink-0">
              <span className="block text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                Page size
              </span>
              <select
                className="h-8 w-full rounded-full border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-700 shadow-sm outline-none transition focus:ring-2 focus:ring-[#00379C]/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                {[10, 20, 30, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}/page
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-slate-200/70 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="overflow-x-auto thin-scrollbar">
            <table className="min-w-[1100px] w-full text-[12.5px]">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-600 dark:bg-neutral-800/60 dark:text-slate-200">
                <tr>
                  <th className="px-3 py-2">ACTIONS</th>

                  <Th
                    active={sortBy === "code"}
                    dir={sortDir}
                    onClick={() => requestSort("code")}
                  >
                    CHECKLIST
                  </Th>

                  <Th
                    active={sortBy === "discStage"}
                    dir={sortDir}
                    onClick={() => requestSort("discStage")}
                  >
                    DISCIPLINE • STAGE
                  </Th>

                  <Th
                    active={sortBy === "version"}
                    dir={sortDir}
                    onClick={() => requestSort("version")}
                    className="w-[120px]"
                  >
                    VERSION
                  </Th>

                  <Th
                    active={sortBy === "items"}
                    dir={sortDir}
                    onClick={() => requestSort("items")}
                    className="w-[90px] text-right"
                  >
                    ITEMS
                  </Th>

                  <Th
                    active={sortBy === "aiDefault"}
                    dir={sortDir}
                    onClick={() => requestSort("aiDefault")}
                    className="w-[110px]"
                  >
                    AI DEFAULT
                  </Th>

                  <Th
                    active={sortBy === "tags"}
                    dir={sortDir}
                    onClick={() => requestSort("tags")}
                    className="min-w-[240px]"
                  >
                    TAGS
                  </Th>

                  <Th
                    active={sortBy === "updated"}
                    dir={sortDir}
                    onClick={() => requestSort("updated")}
                    className="w-[160px]"
                  >
                    UPDATED
                  </Th>

                  <Th
                    active={sortBy === "status"}
                    dir={sortDir}
                    onClick={() => requestSort("status")}
                    className="w-[140px]"
                  >
                    STATUS
                  </Th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                {loading ? (
                  <tr>
                    <td
                      className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-300"
                      colSpan={9}
                    >
                      Loading…
                    </td>
                  </tr>
                ) : sortedRows.length === 0 ? (
                  <tr>
                    <td
                      className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-300"
                      colSpan={9}
                    >
                      No checklists found.
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((r) => (
                    <tr
                      key={r.id}
                      className="hover:bg-slate-50/60 dark:hover:bg-neutral-800/40"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <IconBtn
                            title="View"
                            onClick={() => openView(r.id)}
                            variant="view"
                          />
                          <IconBtn
                            title="Edit"
                            onClick={() => openEdit(r.id)}
                            variant="edit"
                          />
                        </div>
                      </td>

                      <td className="px-3 py-2">
                        <div className="font-semibold text-slate-900 dark:text-slate-50 line-clamp-2 break-words">
                          {r.code ? `${r.code} • ${r.title}` : r.title}
                        </div>
                      </td>

                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                        {(r.discipline || "—") + " • " + (r.stageLabel || "—")}
                      </td>

                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                        {versionText(r)}
                      </td>

                      <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-200">
                        {itemsCountLocal(r)}
                      </td>

                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                        {r.aiDefault ? (
                          <span className="inline-flex rounded-full bg-[#23A192]/10 px-2 py-0.5 text-[11px] font-semibold text-[#23A192] dark:bg-[#23A192]/20">
                            On
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-neutral-800 dark:text-slate-200">
                            Off
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                        {r.tags?.length ? (
                          <div className="flex flex-wrap gap-1.5">
                            {r.tags.slice(0, 6).map((t) => (
                              <span
                                key={t}
                                className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700 dark:border-neutral-700 dark:bg-neutral-950 dark:text-slate-200"
                              >
                                {t}
                              </span>
                            ))}
                            {r.tags.length > 6 && (
                              <span className="text-[11px] text-slate-500 dark:text-slate-300">
                                +{r.tags.length - 6}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                        {fmt(r.updatedAt)}
                      </td>

                      <td className="px-3 py-2">
                        <StatusPill value={r.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-200/70 px-4 py-3 text-sm text-slate-600 dark:border-neutral-800 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between">
            <div>
              Page <b>{page}</b> of <b>{totalPages}</b> · Showing{" "}
              <b>{sortedRows.length}</b> of <b>{total}</b> records
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                className={pagerBtn}
                disabled={page <= 1}
                onClick={() => setPage(1)}
              >
                « First
              </button>
              <button
                className={pagerBtn}
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ‹ Prev
              </button>
              <button
                className={pagerBtn}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next ›
              </button>
              <button
                className={pagerBtn}
                disabled={page >= totalPages}
                onClick={() => setPage(totalPages)}
              >
                Last »
              </button>
            </div>
          </div>
        </div>

        {/* View Modal */}
        {viewOpen && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/40" onClick={closeView} />
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-neutral-800">
                  <div className="flex flex-col">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                      Checklist
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-base font-semibold text-slate-900 dark:text-white">
                        {viewItem?.code
                          ? `${viewItem.code} • ${viewItem.title}`
                          : viewItem?.title || "—"}
                      </div>
                      {viewItem?.status && <StatusPill value={viewItem.status} />}
                    </div>
                  </div>

                  <button
                    className={iconCloseBtn}
                    onClick={closeView}
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-4">
                  {viewLoading ? (
                    <div className="py-10 text-center text-slate-500 dark:text-slate-300">
                      Loading…
                    </div>
                  ) : viewItem ? (
                    <div className="grid gap-3">
                      <KV k="Discipline" v={viewItem.discipline || "—"} />
                      <KV k="Stage" v={viewItem.stageLabel || "—"} />
                      <KV k="Version" v={versionText(viewItem)} />
                      <KV k="Items" v={itemsCountLocal(viewItem)} />
                      <KV k="AI Default" v={viewItem.aiDefault ? "On" : "Off"} />
                      <KV k="Tags" v={(viewItem.tags || []).join(", ") || "—"} />
                      <KV k="Updated" v={fmt(viewItem.updatedAt)} />
                      <KV k="Id" v={viewItem.id} />
                    </div>
                  ) : (
                    <div className="py-10 text-center text-red-600">
                      Failed to load.
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-200 px-4 py-3 text-right dark:border-neutral-800">
                  <button className={btnPrimary} onClick={closeView}>
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Thin scrollbar styling */}
        <style>
          {`
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
            .thin-scrollbar::-webkit-scrollbar-button { width: 0; height: 0; display: none; }
            .thin-scrollbar::-webkit-scrollbar-corner { background: transparent; }
          `}
        </style>
      </div>
    </div>
  );
}
