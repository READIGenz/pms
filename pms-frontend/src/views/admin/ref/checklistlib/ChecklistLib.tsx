// pms-frontend/src/views/admin/ref/checklist/ChecklistLib.tsx

import { useEffect, useMemo, useState } from "react";
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
  Architecture: [
    "Architecture • Design",
    "Architecture • External Works",
    "Architecture • Interiors",
  ],
};

const itemsCount = (r: ChecklistLite) =>
  Number(
    (r as any).itemsCount ??
      (r as any)._count?.items ??
      (Array.isArray(r.items) ? r.items.length : 0)
  );

/* ========================= Types ========================= */
export type RefChecklist = {
  id: string;
  code: string | null; // prisma has code: String @unique
  title: string; // prisma: title
  discipline: Discipline; // prisma: Discipline
  stageLabel: string | null; // prisma: stageLabel
  tags?: string[] | null; // prisma: tags (string[])
  status: ChecklistStatus; // prisma: status
  version: number | null; // prisma: Int @default(1)

  versionLabel?: string | null;
  versionMajor?: number | null;
  versionMinor?: number | null;
  versionPatch?: number | null;
  items?: Array<any> | null;
  itemsCount?: number | null;
  _count?: { items?: number } | null;
  aiDefault?: boolean | null;
  updatedAt: string;
  createdAt?: string;
};

type ChecklistLite = RefChecklist;
type ListResp = { items: ChecklistLite[]; total: number } | ChecklistLite[];

/* ========================= UI tokens (match reference) ========================= */
const cls = {
  pageWrap: "min-h-screen w-full bg-white dark:bg-neutral-950",
  container: "mx-auto w-full max-w-6xl",
  headerRow:
    "mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
  title: "text-xl font-extrabold tracking-tight text-slate-900 dark:text-white",
  subtitle: "text-sm text-slate-600 dark:text-slate-300",
  meta: "text-xs text-slate-500 dark:text-slate-400",

  label:
    "block text-[11px] font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1",
  control:
    "h-8 w-full rounded-full border border-slate-200 bg-white px-3 text-[12.5px] text-slate-800 placeholder:text-slate-400 shadow-sm " +
    "focus:outline-none focus:border-transparent focus:ring-2 focus:ring-[#00379C]/20 " +
    "dark:border-white/10 dark:bg-neutral-950 dark:text-white",
  selectControl:
    "h-8 w-full rounded-full border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-700 shadow-sm " +
    "focus:outline-none focus:border-transparent focus:ring-2 focus:ring-[#00379C]/20 " +
    "dark:border-white/10 dark:bg-neutral-950 dark:text-white",

  btnBase:
    "inline-flex h-8 items-center justify-center rounded-full px-3 text-[12.5px] font-semibold shadow-sm " +
    "transition hover:brightness-110 active:translate-y-[0.5px] disabled:opacity-60",
  btnOutline:
    "inline-flex h-8 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-700 shadow-sm " +
    "transition hover:bg-slate-50 active:translate-y-[0.5px] disabled:opacity-60 " +
    "dark:border-white/10 dark:bg-neutral-950 dark:text-white dark:hover:bg-white/5",
  btnTeal:
    "inline-flex h-8 items-center justify-center rounded-full bg-[#23A192] px-3 text-[12.5px] font-semibold text-white shadow-sm " +
    "transition hover:brightness-110 active:translate-y-[0.5px] disabled:opacity-60",
  btnPrimary:
    "inline-flex h-8 items-center justify-center rounded-full bg-[#00379C] px-3 text-[12.5px] font-semibold text-white shadow-sm " +
    "transition hover:brightness-110 active:translate-y-[0.5px] disabled:opacity-60",

  kpiCard:
    "rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-neutral-950",
  kpiLabel:
    "text-[11px] font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400",
  kpiValue:
    "mt-1 text-xl font-semibold leading-none text-slate-900 dark:text-white",

  tableCard:
    "rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden " +
    "dark:border-white/10 dark:bg-neutral-950",
  tableWrap: "overflow-auto max-h-[62vh] thin-scrollbar",
  table:
    "w-full min-w-[1400px] text-[12.5px] table-fixed [word-break:break-word] [overflow-wrap:anywhere]",
  thead:
    "sticky top-0 z-10 bg-slate-50 dark:bg-neutral-900 border-b border-slate-200 dark:border-white/10",
  tr: "border-t border-slate-100/80 hover:bg-slate-50/60 dark:border-white/10 dark:hover:bg-white/5",
  thBtn:
    "inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-widest text-slate-600 dark:text-slate-200 select-none hover:underline",
  thCell: "px-3 py-2 align-middle",
  td: "px-3 py-2 align-middle",

  actionCellSticky: "",
  actionBtnBase:
    "inline-flex h-8 w-8 items-center justify-center rounded-full transition",
  actionView: "text-[#23A192] hover:bg-[#23A192]/10 dark:hover:bg-[#23A192]/15",
  actionEdit:
    "text-[#00379C] hover:bg-[#00379C]/10 dark:text-[#FCC020] dark:hover:bg-[#FCC020]/15",
};

function StatusPill({ value }: { value: ChecklistStatus }) {
  // Match reference mapping:
  // Active = teal, Draft = navy (gold in dark), Inactive = gold, Archived = rose
  const base =
    "inline-block rounded-full border px-2 py-0.5 text-xs font-semibold";
  const clsByValue =
    value === "Active"
      ? "bg-[#23A192]/10 text-[#23A192] border-[#23A192]/25 dark:bg-[#23A192]/15 dark:border-[#23A192]/25"
      : value === "Draft"
      ? "bg-[#00379C]/10 text-[#00379C] border-[#00379C]/25 dark:bg-[#FCC020]/15 dark:text-[#FCC020] dark:border-[#FCC020]/25"
      : value === "Inactive"
      ? "bg-[#FCC020]/15 text-[#8A5B00] border-[#FCC020]/30 dark:bg-[#FCC020]/15 dark:text-[#FCC020] dark:border-[#FCC020]/25"
      : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-300 dark:border-rose-900";
  return <span className={`${base} ${clsByValue}`}>{value}</span>;
}

const SortIcon = ({
  active,
  dir,
}: {
  active: boolean;
  dir: "asc" | "desc";
}) => (
  <span className="inline-block ml-1 text-[10px] opacity-70">
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
    <th className={`${cls.thCell} ${className}`}>
      <button
        type="button"
        onClick={onClick}
        className={cls.thBtn}
        title="Sort"
      >
        <span>{children}</span>
        <SortIcon active={active} dir={dir} />
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
      <span className={cls.label}>{label}</span>
      <input
        className={cls.control}
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
  placeholder = "All…",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className={cls.label}>{label}</span>
      <select
        className={cls.selectControl}
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

function fmt(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso!;
  }
}

/* ========================= Page ========================= */
export default function ChecklistLib() {
  const location = useLocation();
  const nav = useNavigate();

  // Page title + shell subtitle
  useEffect(() => {
    document.title = "Trinity PMS — Checklist Library";
    (window as any).__ADMIN_SUBTITLE__ =
      "Standardised checklists for PMS modules.";
    return () => {
      (window as any).__ADMIN_SUBTITLE__ = "";
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
  const [stageLabel, setStageLabel] = useState<string>("");
  const [status, setStatus] = useState<ChecklistStatus | "">("");
  const [aiDefault, setAiDefault] = useState<"" | "on" | "off">("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [rows, setRows] = useState<ChecklistLite[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

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
    } finally {
      setStatsLoading(false);
    }
  }

  /* ---- Sorting ---- */
  type SortKey =
    | "checklist"
    | "discStage"
    | "version"
    | "items"
    | "aiDefault"
    | "tags"
    | "updated"
    | "status";

  const [sortBy, setSortBy] = useState<SortKey>("updated");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const cmp = (a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0);
  function parseSemverParts(v?: string | number | null) {
    const s = v == null ? "" : String(v);
    const m = s.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
    if (!m) return [0, 0, 0];
    return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)];
  }

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((A, B) => {
      let av: any = "",
        bv: any = "";
      switch (sortBy) {
        case "checklist":
          av = `${A.code ? A.code + " • " : ""}${A.title || ""}`;
          bv = `${B.code ? B.code + " • " : ""}${B.title || ""}`;
          break;
        case "discStage":
          av = `${A.discipline || ""} • ${A.stageLabel || ""}`;
          bv = `${B.discipline || ""} • ${B.stageLabel || ""}`;
          break;
        case "version": {
          const [a1, a2, a3] = parseSemverParts(
            (A as any).versionLabel ?? A.version
          );
          const [b1, b2, b3] = parseSemverParts(
            (B as any).versionLabel ?? B.version
          );
          av = a1 * 1e6 + a2 * 1e3 + a3;
          bv = b1 * 1e6 + b2 * 1e3 + b3;
          break;
        }
        case "items": {
          const ai = Number(
            A.itemsCount ?? (Array.isArray(A.items) ? A.items.length : 0)
          );
          const bi = Number(
            B.itemsCount ?? (Array.isArray(B.items) ? B.items.length : 0)
          );
          av = ai;
          bv = bi;
          break;
        }
        case "aiDefault":
          av = A.aiDefault ? 1 : 0;
          bv = B.aiDefault ? 1 : 0;
          break;
        case "tags":
          av = (A.tags || []).join(", ");
          bv = (B.tags || []).join(", ");
          break;
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
      const params: any = { page, pageSize };

      const qq = (q ?? "").trim();
      if (qq) params.q = qq;

      if (discipline) params.discipline = discipline;

      // ✅ keep as stageLabel (not "stage")
      if (stageLabel) params.stageLabel = stageLabel;

      if (status) params.status = status;

      if (aiDefault) params.aiDefault = aiDefault === "on";

      const { data } = await api.get("/admin/ref/checklists", { params });

      let items: ChecklistLite[] = [];
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
      const s = e?.response?.status;
      if (s === 401) {
        localStorage.removeItem("token");
        nav("/login", { replace: true });
        return;
      }
      setRows([]);
      setTotal(0);
      setErr(
        e?.response?.data?.error || e?.message || "Failed to load checklists."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, discipline, stageLabel, status, aiDefault, page, pageSize]);
  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /* ---- View Modal ---- */
  const [viewOpen, setViewOpen] = useState(false);
  const [viewItem, setViewItem] = useState<ChecklistLite | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  async function openView(id: string) {
    setViewOpen(true);
    setViewLoading(true);
    try {
      const { data } = await api.get(`/admin/ref/checklists/${id}`);
      setViewItem(data);
    } catch {
      setViewItem(null);
    } finally {
      setViewLoading(false);
    }
  }
  function closeView() {
    setViewOpen(false);
    setViewItem(null);
  }

  const versionText = (r: ChecklistLite) =>
    `v${(r as any).versionLabel ?? r.version ?? 1}`;

  const itemsCountLocal = (r: ChecklistLite) =>
    Number(r.itemsCount ?? (Array.isArray(r.items) ? r.items.length : 0));

  /* ---- UI actions ---- */
  const openNew = () =>
    nav("/admin/ref/checklistlib/new", {
      state: { from: location.pathname },
    });

  const openEdit = (id: string) =>
    nav(`/admin/ref/checklistlib/${id}/edit`, {
      state: { from: location.pathname },
    });

  const exportCsv = () => {
    const header = [
      "Checklist",
      "Discipline • Stage",
      "Version",
      "Items",
      "AI Default",
      "Tags",
      "Updated",
      "Status",
      "Id",
    ];
    const rowsToExport = sortedRows.map((r) => [
      r.code ? `${r.code} • ${r.title}` : r.title,
      `${r.discipline || ""} • ${r.stageLabel || "—"}`,
      versionText(r),
      String(itemsCountLocal(r)),
      r.aiDefault ? "On" : "Off",
      (r.tags || []).join("|"),
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
    a.download = `checklist-lib-${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setQ("");
    setDiscipline("");
    setStageLabel("");
    setStatus("");
    setAiDefault("");
    setPage(1);
  };

  const refresh = () => {
    fetchList();
    fetchStats();
  };

  /* ========================= UI ========================= */
  return (
    <div className={cls.pageWrap}>
      <div className={cls.container}>
        {/* Header */}
        {/* Top header (same placement as ActivityLib) */}
        {/* Header */}
        <div className={cls.headerRow}>
          <div>
            <div className={cls.meta}>
              {loading ? "Loading…" : `${total} item${total === 1 ? "" : "s"}`}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 justify-start sm:justify-end">
            <button
              className={cls.btnOutline}
              onClick={exportCsv}
              type="button"
            >
              Export CSV
            </button>
            <button className={cls.btnTeal} onClick={refresh} type="button">
              Refresh
            </button>
            <button className={cls.btnPrimary} onClick={openNew} type="button">
              + Create
            </button>
          </div>
        </div>

        {err && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
            {err}
          </div>
        )}

        {/* KPIs */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className={cls.kpiCard}>
            <div className={cls.kpiLabel}>Active</div>
            <div className={cls.kpiValue}>
              {statsLoading ? "…" : stats.byStatus.Active}
            </div>
          </div>
          <div className={cls.kpiCard}>
            <div className={cls.kpiLabel}>Draft</div>
            <div className={cls.kpiValue}>
              {statsLoading ? "…" : stats.byStatus.Draft}
            </div>
          </div>
          <div className={cls.kpiCard}>
            <div className={cls.kpiLabel}>Inactive</div>
            <div className={cls.kpiValue}>
              {statsLoading ? "…" : stats.byStatus.Inactive}
            </div>
          </div>
          <div className={cls.kpiCard}>
            <div className={cls.kpiLabel}>Archived</div>
            <div className={cls.kpiValue}>
              {statsLoading ? "…" : stats.byStatus.Archived}
            </div>
          </div>
        </div>

        {/* Filters (no outer box, matches reference pattern) */}
        <div className="mb-4">
          {/* Row 1: filters + Clear (same line) */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-wrap items-end gap-3 sm:flex-1">
              {/* Discipline */}
              <div className="w-full sm:w-[100px]">
                <SelectStrict
                  label="Discipline"
                  value={discipline}
                  onChange={(v) => {
                    setDiscipline(v as Discipline | "");
                    setStageLabel("");
                    setPage(1);
                  }}
                  options={DISCIPLINES.map((d) => ({ value: d, label: d }))}
                  placeholder="All"
                />
              </div>

              {/* Stage */}
              <div className="w-full sm:w-[200px]">
                <SelectStrict
                  label="Stage"
                  value={stageLabel}
                  onChange={(v) => {
                    setStageLabel(v);
                    setPage(1);
                  }}
                  options={(discipline
                    ? STAGE_LIBRARY[discipline] || []
                    : Object.values(STAGE_LIBRARY).flat()
                  ).map((s) => ({ value: s, label: s }))}
                  placeholder="All"
                />
              </div>

              {/* Status */}
              <div className="w-full sm:w-[130px]">
                <SelectStrict
                  label="Status"
                  value={status}
                  onChange={(v) => {
                    setStatus((v as ChecklistStatus) || "");
                    setPage(1);
                  }}
                  options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
                  placeholder="All"
                />
              </div>

              {/* AI Default */}
              <div className="w-full sm:w-[80px]">
                <SelectStrict
                  label="AI Default"
                  value={aiDefault}
                  onChange={(v) => setAiDefault((v as any) || "")}
                  options={[
                    { value: "on", label: "On" },
                    { value: "off", label: "Off" },
                  ]}
                  placeholder="Any"
                />
              </div>

              {/* Clear */}
              <div className="mt-[18px]">
                <button
                  className={`${cls.btnOutline} h-7 px-2 text-[12px]`}
                  onClick={clearFilters}
                  type="button"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

          {/* Row 2: search left, page size right (same as Activity layout) */}
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            {/* Search - fixed width like Activity */}
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

            {/* Page size */}
            <div className="w-full sm:w-[100px]">
              <label className="block">
                <span className={cls.label}>Page Size</span>
                <select
                  className={`${cls.selectControl} h-7 text-[12px]`}
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
        </div>

        {/* Table */}
        <div className={cls.tableCard}>
          <div className={cls.tableWrap}>
            <table className={cls.table}>
              <colgroup>
                <col className="w-[160px]" />
                <col className="w-[360px]" />
                <col span={7} />
              </colgroup>

              <thead className={cls.thead}>
                <tr>
                  <th
                    className={`${cls.thCell} text-left text-[10px] font-extrabold uppercase tracking-widest text-slate-600 dark:text-slate-200`}
                  >
                    Actions
                  </th>

                  <Th
                    className="border-b border-slate-200 dark:border-white/10"
                    onClick={() => requestSort("checklist")}
                    active={sortBy === "checklist"}
                    dir={sortDir}
                  >
                    Checklist (Code • Title)
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
                    onClick={() => requestSort("version")}
                    active={sortBy === "version"}
                    dir={sortDir}
                  >
                    Version
                  </Th>

                  <Th
                    className="border-b border-slate-200 dark:border-white/10"
                    onClick={() => requestSort("items")}
                    active={sortBy === "items"}
                    dir={sortDir}
                  >
                    Items
                  </Th>

                  <Th
                    className="border-b border-slate-200 dark:border-white/10"
                    onClick={() => requestSort("aiDefault")}
                    active={sortBy === "aiDefault"}
                    dir={sortDir}
                  >
                    AI (Default)
                  </Th>

                  <Th
                    className="border-b border-slate-200 dark:border-white/10"
                    onClick={() => requestSort("tags")}
                    active={sortBy === "tags"}
                    dir={sortDir}
                  >
                    Tags
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
                  <tr key={r.id} className={cls.tr}>
                    {/* Actions */}
                    <td className={`${cls.td} ${cls.actionCellSticky}`}>
                      <div className="flex items-center gap-2">
                        {/* View */}
                        <button
                          type="button"
                          aria-label="View checklist"
                          title="View"
                          onClick={() => openView(r.id)}
                          className={`${cls.actionBtnBase} ${cls.actionView}`}
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
                          aria-label="Edit checklist"
                          title="Edit"
                          onClick={() => openEdit(r.id)}
                          className={`${cls.actionBtnBase} ${cls.actionEdit}`}
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

                    {/* Checklist (Code • Title) */}
                    <td className={cls.td}>
                      <div className="font-semibold text-slate-900 dark:text-slate-50 line-clamp-2 break-words">
                        {r.code ? `${r.code} • ${r.title}` : r.title}
                      </div>
                    </td>

                    {/* Discipline • Stage */}
                    <td
                      className={`${cls.td} text-slate-700 dark:text-slate-200`}
                    >
                      {(r.discipline || "—") + " • " + (r.stageLabel || "—")}
                    </td>

                    {/* Version */}
                    <td
                      className={`${cls.td} text-slate-700 dark:text-slate-100`}
                    >
                      {versionText(r)}
                    </td>

                    {/* Items */}
                    <td
                      className={`${cls.td} text-slate-700 dark:text-slate-200`}
                    >
                      {itemsCountLocal(r)}
                    </td>

                    {/* AI (Default) */}
                    <td className={cls.td}>
                      {r.aiDefault ? (
                        <span className="inline-block rounded-full border px-2 py-0.5 text-xs font-semibold bg-[#23A192]/10 text-[#23A192] border-[#23A192]/25 dark:bg-[#23A192]/15 dark:border-[#23A192]/25">
                          On
                        </span>
                      ) : (
                        <span className="inline-block rounded-full border px-2 py-0.5 text-xs font-semibold bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-300 dark:border-rose-900">
                          Off
                        </span>
                      )}
                    </td>

                    {/* Tags */}
                    <td
                      className={`${cls.td} text-slate-700 dark:text-slate-200`}
                    >
                      {r.tags && r.tags.length ? r.tags.join(", ") : "—"}
                    </td>

                    {/* Updated */}
                    <td
                      className={`${cls.td} text-slate-700 dark:text-slate-200`}
                    >
                      {fmt(r.updatedAt)}
                    </td>

                    {/* Status */}
                    <td className={cls.td}>
                      <StatusPill value={r.status} />
                    </td>
                  </tr>
                ))}

                {!sortedRows.length && !loading && (
                  <tr>
                    <td
                      className="px-3 py-6 text-center text-slate-500 dark:text-slate-400"
                      colSpan={9}
                    >
                      No checklists found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        <div className="mt-3 flex items-center justify-between">
          <div className={cls.meta}>
            Page <b>{page}</b> of <b>{totalPages}</b>
          </div>

          <div className="flex items-center gap-2">
            <button
              className={cls.btnOutline}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              type="button"
            >
              Prev
            </button>

            <button
              className={cls.btnOutline}
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
      {viewOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={closeView} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden dark:border-white/10 dark:bg-neutral-950">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/10">
                <div className="flex flex-col">
                  <div className={cls.label}>Checklist</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                      {viewItem?.code
                        ? `${viewItem.code} • ${viewItem.title}`
                        : viewItem?.title || "—"}
                    </h3>
                    {viewItem?.status ? (
                      <span className="text-xs">
                        <StatusPill value={viewItem.status} />
                      </span>
                    ) : null}
                  </div>
                </div>

                <button
                  className={cls.btnOutline}
                  onClick={closeView}
                  type="button"
                >
                  Close
                </button>
              </div>

              <div className="p-4 text-sm">
                {viewLoading ? (
                  <div className="py-10 text-center text-slate-500 dark:text-slate-400">
                    Loading…
                  </div>
                ) : viewItem ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <KV k="Code" v={viewItem.code || "—"} />
                    <KV k="Title" v={viewItem.title || "—"} />
                    <KV
                      k="Discipline • Stage"
                      v={`${viewItem.discipline} • ${
                        viewItem.stageLabel || "—"
                      }`}
                    />
                    <KV k="Version" v={versionText(viewItem)} />
                    <KV k="Items" v={String(itemsCountLocal(viewItem))} />
                    <KV k="AI Default" v={viewItem.aiDefault ? "On" : "Off"} />
                    <KV
                      k="Tags"
                      v={
                        viewItem.tags && viewItem.tags.length
                          ? viewItem.tags.join(", ")
                          : "—"
                      }
                    />
                    <KV k="Updated" v={fmt(viewItem.updatedAt)} />
                    <div className="sm:col-span-2">
                      <KV
                        k="Status"
                        v={<StatusPill value={viewItem.status} />}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="py-10 text-center text-rose-600 dark:text-rose-300">
                    Failed to load.
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200 px-4 py-3 text-right dark:border-white/10">
                <button
                  className={cls.btnPrimary}
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

      {/* Thin scrollbar styling */}
      <style>
        {`
          .thin-scrollbar::-webkit-scrollbar {
            height: 6px;
            width: 6px;
          }
          .thin-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }
          .thin-scrollbar::-webkit-scrollbar-thumb {
            background-color: rgba(148, 163, 184, 0.7);
            border-radius: 999px;
          }
          .thin-scrollbar::-webkit-scrollbar-thumb:hover {
            background-color: rgba(100, 116, 139, 0.9);
          }
        `}
      </style>
    </div>
  );
}

/* ========================= Bits ========================= */
function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-3">
      <div className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400">
        {k}
      </div>
      <div className="text-slate-900 dark:text-white">{v}</div>
    </div>
  );
}
