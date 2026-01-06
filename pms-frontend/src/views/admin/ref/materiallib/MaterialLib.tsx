// pms-frontend/src/views/admin/ref/materiallib/MaterialLib.tsx
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
const DISCIPLINES = [
  "Civil",
  "Architecture",
  "MEP.ELE",
  "MEP.PHE",
  "MEP.HVC",
  "Finishes",
] as const;
type Discipline = (typeof DISCIPLINES)[number];

const CATEGORIES = [
  "Concrete",
  "Rebar & Steel",
  "Masonry Block",
  "Aggregates",
  "Formwork",
  "Waterproofing",
] as const;

const STATUS_OPTIONS = ["Active", "Draft", "Inactive", "Archived"] as const;
type MaterialStatus = (typeof STATUS_OPTIONS)[number];

/* ========================= Types ========================= */
export type RefMaterial = {
  id: string;
  code: string | null;
  name: string;
  discipline: Discipline | null;
  category: string | null;
  manufacturer: string | null;
  model: string | null;
  standards: string[] | null;
  fireRating: string | null;
  keyProps: string[] | null;
  version: number;
  versionLabel?: string | null;
  versionMajor?: number | null;
  versionMinor?: number | null;
  versionPatch?: number | null;
  notes: string | null;
  status: MaterialStatus;
  updatedAt: string;
  createdAt?: string;
};

type MaterialLite = RefMaterial;

/* ========================= Small UI bits ========================= */
function StatusPill({ value }: { value: MaterialStatus }) {
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
    <th className={`px-3 py-2 align-middle ${className}`}>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-200 select-none hover:underline"
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
      <span className="mb-1 block text-[11px] font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <input
        className="h-8 w-full rounded-full border border-slate-200 bg-white px-3 text-[12.5px] text-slate-900 placeholder:text-slate-400 shadow-sm outline-none transition focus:ring-2 focus:ring-[#00379C]/20 dark:bg-neutral-900 dark:text-white dark:border-neutral-700"
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
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400">
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

function fmt(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso!;
  }
}

function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
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
    "inline-flex h-8 w-8 items-center justify-center rounded-full transition";
  const tone =
    variant === "view"
      ? "text-[#23A192] hover:bg-[#23A192]/10 dark:hover:bg-[#23A192]/15"
      : "text-[#00379C] hover:bg-[#00379C]/10 dark:text-[#FCC020] dark:hover:bg-[#FCC020]/15";

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className={`${base} ${tone}`}
      onClick={onClick}
    >
      {variant === "view" ? (
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Z" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
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

/* ========================= Component ========================= */
export default function MaterialLib() {
  const location = useLocation();
  const nav = useNavigate();

  // Shared Admin header title/subtitle (like your other themed pages)
  useEffect(() => {
    document.title = "Trinity PMS — Material Library";
    (window as any).__ADMIN_SUBTITLE__ =
      "Reference materials for activities, inspections, and submissions.";
    return () => {
      if ((window as any).__ADMIN_SUBTITLE__)
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
  const [category, setCategory] = useState<string>("");
  const [status, setStatus] = useState<MaterialStatus | "">("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [rows, setRows] = useState<MaterialLite[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // counts KPI
  type MaterialStats = {
    total: number;
    byStatus: {
      Active: number;
      Draft: number;
      Inactive: number;
      Archived: number;
    };
  };

  const [stats, setStats] = useState<MaterialStats>({
    total: 0,
    byStatus: { Active: 0, Draft: 0, Inactive: 0, Archived: 0 },
  });
  const [statsLoading, setStatsLoading] = useState(false);

  async function fetchStats() {
    setStatsLoading(true);
    try {
      const { data } = await api.get("/admin/ref/materials/stats");
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
      // keep previous stats on error
    } finally {
      setStatsLoading(false);
    }
  }

  // --- view modal state ---
  const [viewOpen, setViewOpen] = useState(false);
  const [viewItem, setViewItem] = useState<MaterialLite | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  async function openView(id: string) {
    setViewOpen(true);
    setViewLoading(true);
    try {
      const { data } = await api.get(`/admin/ref/materials/${id}`);
      setViewItem(data);
    } catch (e) {
      setViewItem(null);
    } finally {
      setViewLoading(false);
    }
  }
  function closeView() {
    setViewOpen(false);
    setViewItem(null);
  }

  /* ---- Sorting (client-side) ---- */
  type SortKey =
    | "material"
    | "discCat"
    | "manModel"
    | "standards"
    | "fireRating"
    | "keyProps"
    | "version"
    | "updated"
    | "status";

  const [sortBy, setSortBy] = useState<SortKey>("updated");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const cmp = (a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0);

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
        case "material":
          av = `${A.code ? A.code + " • " : ""}${A.name}`;
          bv = `${B.code ? B.code + " • " : ""}${B.name}`;
          break;
        case "discCat":
          av = `${A.discipline || ""} • ${A.category || ""}`;
          bv = `${B.discipline || ""} • ${B.category || ""}`;
          break;
        case "manModel":
          av = `${A.manufacturer || ""} • ${A.model || ""}`;
          bv = `${B.manufacturer || ""} • ${B.model || ""}`;
          break;
        case "standards":
          av = (A.standards || []).join(", ");
          bv = (B.standards || []).join(", ");
          break;
        case "fireRating":
          av = A.fireRating || "";
          bv = B.fireRating || "";
          break;
        case "keyProps":
          av = (A.keyProps || []).join(" | ");
          bv = (B.keyProps || []).join(" | ");
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
        .get("/admin/ref/materials", {
          params: { q, discipline, category, status, page, pageSize },
        })
        .catch(async (e: any) => {
          // Fallback to GET all without pagination if backend doesn’t support it
          if (e?.response?.status === 404) {
            const { data: all } = await api.get("/admin/ref/materials");
            return { data: all };
          }
          throw e;
        });

      let items: MaterialLite[] = [];
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
        e?.response?.data?.error || e?.message || "Failed to load materials."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, discipline, category, status, page, pageSize]);

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- UI actions ---- */
  const openNew = () => nav("/admin/ref/materiallib/new");
  const openEdit = (id: string) => nav(`/admin/ref/materiallib/${id}/edit`);

  const exportCsv = () => {
    const header = [
      "Material",
      "Discipline • Category",
      "Manufacturer • Model",
      "Standards",
      "Fire Rating",
      "Key Properties",
      "Version",
      "Updated",
      "Status",
      "Id",
    ];
    const rowsToExport = sortedRows.map((r) => [
      r.code ? `${r.code} • ${r.name}` : r.name,
      `${r.discipline || ""} • ${r.category || "—"}`,
      `${r.manufacturer || ""}${r.model ? " • " + r.model : ""}`,
      (r.standards || []).join("|"),
      r.fireRating || "",
      (r.keyProps || []).join("|"),
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
    a.download = `material-lib-${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const asBullets = (arr?: string[] | null, sep = " • ") =>
    arr && arr.length ? arr.join(sep) : "—";

  /* ========================= UI ========================= */
  const btnOutline =
    "inline-flex h-8 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800";
  const btnTeal =
    "inline-flex h-8 items-center justify-center rounded-full bg-[#23A192] px-3 text-[12.5px] font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60";
  const btnPrimary =
    "inline-flex h-8 items-center justify-center rounded-full bg-[#00379C] px-3 text-[12.5px] font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60";

  const pagerBtn =
    "h-8 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800";

  return (
    <div className="min-h-screen px-0 py-0">
      <div className="mx-auto w-full max-w-none px-0">
        {/* Error */}
        {err && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {err}
          </div>
        )}

        {/* Top row: count left, actions right */}
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {loading ? "Loading…" : `${total} item${total === 1 ? "" : "s"}`}
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <button
              className={btnOutline}
              onClick={exportCsv}
              type="button"
              title="Export CSV"
              disabled={sortedRows.length === 0}
            >
              Export CSV
            </button>

            <button
              className={btnTeal}
              onClick={() => {
                fetchList();
                fetchStats();
              }}
              type="button"
              title="Refresh"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>

            <button
              className={btnPrimary}
              onClick={openNew}
              type="button"
              title="Create Material"
            >
              + Create
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Active"
            value={statsLoading ? "…" : stats.byStatus.Active}
          />
          <Kpi
            label="Draft"
            value={statsLoading ? "…" : stats.byStatus.Draft}
          />
          <Kpi
            label="Inactive"
            value={statsLoading ? "…" : stats.byStatus.Inactive}
          />
          <Kpi
            label="Archived"
            value={statsLoading ? "…" : stats.byStatus.Archived}
          />
        </div>

        {/* Filters (no box / no "Find" heading) */}
        <div className="mb-4">
          {/* Row 1 */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-[100px] shrink-0">
              <SelectStrict
                label="Discipline"
                value={discipline}
                onChange={(v) => {
                  setDiscipline(v as Discipline | "");
                  setPage(1);
                }}
                options={["", ...DISCIPLINES].map((d) => ({
                  value: d as any,
                  label: d || "All",
                }))}
              />
            </div>

            <div className="w-[130px] shrink-0">
              <SelectStrict
                label="Category"
                value={category}
                onChange={(v) => {
                  setCategory(v);
                  setPage(1);
                }}
                options={["", ...CATEGORIES].map((c) => ({
                  value: c as any,
                  label: c || "All",
                }))}
              />
            </div>

            <div className="w-[100px] shrink-0">
              <SelectStrict
                label="Status"
                value={status || ""}
                onChange={(v) => {
                  setStatus((v || "") as any);
                  setPage(1);
                }}
                options={["", ...STATUS_OPTIONS].map((s) => ({
                  value: s as any,
                  label: s || "All",
                }))}
              />
            </div>

            <button
              className={`${btnOutline} shrink-0`}
              onClick={() => {
                setQ("");
                setDiscipline("");
                setCategory("");
                setStatus("");
                setPage(1);
              }}
              type="button"
            >
              Clear
            </button>
          </div>

          {/* Row 2 */}
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="w-full sm:max-w-[520px]">
              <Input
                label="Search"
                value={q}
                onChange={(v) => {
                  setQ(v);
                  setPage(1);
                }}
                placeholder="id, code, name, standard, manufacturer…"
              />
            </div>

            <label className="block w-[100px] shrink-0">
              <span className="mb-1 block text-[11px] font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Page size
              </span>
              <select
                className="h-8 w-full rounded-full border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-700 shadow-sm outline-none transition focus:ring-2 focus:ring-[#00379C]/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
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
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900 overflow-hidden">
          <div className="overflow-auto max-h-[70vh] thin-scrollbar">
            <table className="w-full min-w-[1400px] text-[12.5px] table-fixed [word-break:break-word] [overflow-wrap:anywhere]">
              <colgroup>
                <col className="w-[120px]" />
                <col className="w-[300px]" />
                <col span={8} />
              </colgroup>

              <thead className="bg-slate-50 dark:bg-neutral-800/60">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600 border-b border-slate-200 dark:text-slate-200 dark:border-neutral-700">
                    Actions
                  </th>

                  <Th
                    className="border-b border-slate-200 dark:border-neutral-700"
                    onClick={() => requestSort("material")}
                    active={sortBy === "material"}
                    dir={sortDir}
                  >
                    Material
                  </Th>

                  <Th
                    className="border-b border-slate-200 dark:border-neutral-700"
                    onClick={() => requestSort("discCat")}
                    active={sortBy === "discCat"}
                    dir={sortDir}
                  >
                    Discipline • Category
                  </Th>

                  <Th
                    className="border-b border-slate-200 dark:border-neutral-700"
                    onClick={() => requestSort("manModel")}
                    active={sortBy === "manModel"}
                    dir={sortDir}
                  >
                    Manufacturer • Model
                  </Th>

                  <Th
                    className="border-b border-slate-200 dark:border-neutral-700"
                    onClick={() => requestSort("standards")}
                    active={sortBy === "standards"}
                    dir={sortDir}
                  >
                    Standards
                  </Th>

                  <Th
                    className="border-b border-slate-200 dark:border-neutral-700"
                    onClick={() => requestSort("fireRating")}
                    active={sortBy === "fireRating"}
                    dir={sortDir}
                  >
                    Fire Rating
                  </Th>

                  <Th
                    className="border-b border-slate-200 dark:border-neutral-700"
                    onClick={() => requestSort("keyProps")}
                    active={sortBy === "keyProps"}
                    dir={sortDir}
                  >
                    Key Properties
                  </Th>

                  <Th
                    className="border-b border-slate-200 dark:border-neutral-700"
                    onClick={() => requestSort("version")}
                    active={sortBy === "version"}
                    dir={sortDir}
                  >
                    Version
                  </Th>

                  <Th
                    className="border-b border-slate-200 dark:border-neutral-700"
                    onClick={() => requestSort("updated")}
                    active={sortBy === "updated"}
                    dir={sortDir}
                  >
                    Updated
                  </Th>

                  <Th
                    className="border-b border-slate-200 dark:border-neutral-700"
                    onClick={() => requestSort("status")}
                    active={sortBy === "status"}
                    dir={sortDir}
                  >
                    Status
                  </Th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                {loading ? (
                  <tr>
                    <td
                      className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-300"
                      colSpan={10}
                    >
                      Loading…
                    </td>
                  </tr>
                ) : sortedRows.length === 0 ? (
                  <tr>
                    <td
                      className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-300"
                      colSpan={10}
                    >
                      No materials found.
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((r) => (
                    <tr
                      key={r.id}
                      className="hover:bg-slate-50/60 dark:hover:bg-neutral-800/40"
                    >
                      {/* Actions (NOT sticky) */}
                      <td className="px-3 py-2">
                        {/* View */}
                        <button
                          type="button"
                          aria-label="View"
                          title="View"
                          onClick={() => openView(r.id)}
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
                          aria-label="Edit"
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
                      </td>

                      {/* Material */}
                      <td className="w-[300px] max-w-[300px] px-3 py-2">
                        <div className="font-semibold text-slate-900 dark:text-slate-50 line-clamp-2 break-words">
                          {r.code ? `${r.code} • ${r.name}` : r.name}
                        </div>
                      </td>

                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                        {`${r.discipline || "—"} • ${r.category || "—"}`}
                      </td>

                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                        {r.manufacturer || "—"}
                        {r.model ? ` • ${r.model}` : ""}
                      </td>

                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                        {asBullets(r.standards, ", ")}
                      </td>

                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                        {r.fireRating || "—"}
                      </td>

                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                        {asBullets(r.keyProps)}
                      </td>

                      <td className="px-3 py-2 text-slate-700 dark:text-slate-100">
                        {`v${(r as any).versionLabel ?? r.version ?? 1}`}
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
        </div>

        {/* Pagination */}
        <div className="mt-3 flex items-center justify-between text-sm">
          <div className="text-slate-600 dark:text-slate-300">
            Page <b>{page}</b> of <b>{totalPages}</b>
          </div>

          <div className="flex items-center gap-2">
            <button
              className={pagerBtn}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <button
              className={pagerBtn}
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>

        {/* View Modal (kept same logic; themed buttons) */}
        {viewOpen && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/40" onClick={closeView} />
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-neutral-900 border border-slate-200/80 dark:border-neutral-800 shadow-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-neutral-800">
                  <div className="flex flex-col">
                    <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Material
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold dark:text-white">
                        {viewItem?.code
                          ? `${viewItem.code} • ${viewItem.name}`
                          : viewItem?.name || "—"}
                      </h3>
                      {viewItem?.status ? (
                        <StatusPill value={viewItem.status} />
                      ) : null}
                    </div>
                  </div>
                  <button className={btnOutline} onClick={closeView}>
                    Close
                  </button>
                </div>

                <div className="p-4 text-sm">
                  {viewLoading ? (
                    <div className="py-10 text-center text-gray-500 dark:text-gray-400">
                      Loading…
                    </div>
                  ) : viewItem ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-3">
                        <div className="text-gray-500 dark:text-gray-400">
                          Code
                        </div>
                        <div className="dark:text-white">
                          {viewItem.code || "—"}
                        </div>
                      </div>
                      <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-3">
                        <div className="text-gray-500 dark:text-gray-400">
                          Discipline • Category
                        </div>
                        <div className="dark:text-white">
                          {(viewItem.discipline || "—") +
                            " • " +
                            (viewItem.category || "—")}
                        </div>
                      </div>
                      <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-3">
                        <div className="text-gray-500 dark:text-gray-400">
                          Manufacturer • Model
                        </div>
                        <div className="dark:text-white">
                          {(viewItem.manufacturer || "—") +
                            (viewItem.model ? ` • ${viewItem.model}` : "")}
                        </div>
                      </div>
                      <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-3">
                        <div className="text-gray-500 dark:text-gray-400">
                          Standards
                        </div>
                        <div className="dark:text-white">
                          {viewItem.standards && viewItem.standards.length ?
                          viewItem.standards.join(", ") : "—"}
                        </div>
                      </div>
                      <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-3">
                        <div className="text-gray-500 dark:text-gray-400">
                          Fire Rating
                        </div>
                        <div className="dark:text-white">
                          {viewItem.fireRating || "—"}
                        </div>
                      </div>
                      <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-3">
                        <div className="text-gray-500 dark:text-gray-400">
                          Key Properties
                        </div>
                        <div className="dark:text-white">
                          {viewItem.keyProps && viewItem.keyProps.length
                            ? viewItem.keyProps.join(" • ")
                            : "—"}
                        </div>
                      </div>
                      <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-3">
                        <div className="text-gray-500 dark:text-gray-400">
                          Version
                        </div>
                        <div className="dark:text-white">
                          {`v${viewItem.versionLabel ?? viewItem.version ?? 1}`}
                        </div>
                      </div>
                      <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-3">
                        <div className="text-gray-500 dark:text-gray-400">
                          Updated
                        </div>
                        <div className="dark:text-white">
                          {fmt(viewItem.updatedAt)}
                        </div>
                      </div>
                      <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-3 sm:col-span-2">
                        <div className="text-gray-500 dark:text-gray-400">
                          Notes
                        </div>
                        <div className="whitespace-pre-wrap dark:text-white">
                          {viewItem.notes || "—"}
                        </div>
                      </div>
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
