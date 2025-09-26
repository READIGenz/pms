// pms-frontend/src/views/admin/Projects.tsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../../../api/client";

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

/* ========================= utils/format ========================= */
const isIsoLike = (v: any) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v);
const fmtBool = (v: any) => (v === null || v === undefined ? "" : v ? "✓" : "✗");
const fmtDate = (v: any) => (isIsoLike(v) ? new Date(v).toLocaleString() : (v ?? ""));

function isPlainObject(x: any) {
  return x && typeof x === "object" && !Array.isArray(x);
}
function flatten(obj: any, prefix = ""): Record<string, any> {
  const out: Record<string, any> = {};
  Object.entries(obj || {}).forEach(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (isPlainObject(v)) Object.assign(out, flatten(v, key));
    else out[key] = v;
  });
  return out;
}
function formatCell(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return fmtBool(v);
  if (Array.isArray(v)) {
    return v
      .map((x) => (isPlainObject(x) ? JSON.stringify(x) : String(x ?? "")))
      .join("; ");
  }
  if (isPlainObject(v)) return JSON.stringify(v);
  if (isIsoLike(v)) return fmtDate(v);
  return String(v ?? "");
}

/* ========================= types ========================= */
type DisplayRow = Record<string, any> & { _id: string; action?: string };
type RawProject = any;

type StateRef = { stateId: string; name: string; code: string };
type DistrictRef = { districtId: string; name: string; stateId: string };
type CompanyRef = { companyId: string; name: string; companyRole?: string | null; status?: string | null };

/* ========================= Column spec (fixed order) ========================= */
const COLUMN_SPEC = [
  { key: "action",                 label: "Action" },
  { key: "code",              label: "Project Code" },
  { key: "title",                  label: "Title" },
  { key: "status",                 label: "Status" },
  { key: "stage",                  label: "Stage" },
  { key: "projectType",            label: "Type" },
  { key: "structureType",          label: "Structure" },
  { key: "clientCompany.name",     label: "Client" },
  { key: "cityTown",               label: "City" },
  { key: "state.name",             label: "State" },
  { key: "startDate",              label: "Start Date" },
  { key: "plannedCompletionDate",  label: "Planned End" },
  { key: "contractType",           label: "Contract" },
  { key: "health",                 label: "Health" },
] as const;

type ColumnKey = typeof COLUMN_SPEC[number]["key"];
const COLUMN_LABELS: Record<ColumnKey | string, string> =
  Object.fromEntries(COLUMN_SPEC.map(c => [c.key, c.label]));

/* ========================= View modal field spec ========================= */
type RowSpec = { key: string; label: string; span?: 1 | 2 };
type SectionSpec = { title: string; rows: RowSpec[] };

/** Exactly four columns in the modal: Summary, Location, Date and Cost, Attributes */
const VIEW_COLS: readonly SectionSpec[] = [
  {
    title: "Summary",
    rows: [
      { key: "title",                label: "Project Title", span: 2 },
      { key: "code",                 label: "Project Code" },
      { key: "stage",                label: "Stage" },
      { key: "projectType",          label: "Project Type" },
      { key: "structureType",        label: "Structure Type" },
      { key: "constructionType",     label: "Construction Mode" },
      { key: "contractType",         label: "Contract Type" },
      { key: "clientCompany.name",   label: "Client / Owner" },
    ],
  },
  {
    title: "Location",
    rows: [
      { key: "address",              label: "Address", span: 2 },
      { key: "state.name",           label: "State / UT" },
      { key: "district.name",        label: "District" },
      { key: "cityTown",             label: "City/Town" },
      { key: "pin",                  label: "PIN Code" },
      { key: "latitude",             label: "Latitude" },
      { key: "longitude",            label: "Longitude" },
    ],
  },
  {
    title: "Date and Cost",
    rows: [
      { key: "startDate",            label: "Start Date" },
      { key: "plannedCompletionDate",label: "Planned Completion" },
      { key: "currency",             label: "Currency" },
      { key: "contractValue",        label: "Contract Value" },
      { key: "description",          label: "Notes / Description", span: 2 },
    ],
  },
  {
    title: "Attributes",
    rows: [
      { key: "areaUnit",             label: "Area Units" },
      { key: "plotArea",             label: "Plot Area" },
      { key: "builtUpArea",          label: "Built-up Area" },
      { key: "floors",               label: "Floors" },
    ],
  },
];

/* ========================= component ========================= */
export default function Projects() {
  const nav = useNavigate();
  const params = useParams<{ id?: string }>();
  const location = useLocation();
  const modalProjectId = params.id || null;

  // --- data state ---
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<DisplayRow[]>([]);
  const [rawById, setRawById] = useState<Record<string, RawProject>>({});

  // --- refs (for filters/tooltips) ---
  const [statesRef, setStatesRef] = useState<StateRef[]>([]);
  const [districtsRef, setDistrictsRef] = useState<DistrictRef[]>([]);
  const [companiesRef, setCompaniesRef] = useState<CompanyRef[]>([]);
  const [refsErr, setRefsErr] = useState<string | null>(null);

  // ---- Filters (status/stage/state/health) ----
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [stageFilter, setStageFilter] = useState<string>("");
  const [stateFilter, setStateFilter] = useState<string>(""); // filter by state NAME
  const [healthFilter, setHealthFilter] = useState<string>("");

  // --- debounced search ---
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setQDebounced(q), 250);
    return () => clearTimeout(id);
  }, [q]);

  // --- sort & pagination ---
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  /* ========================= Auth gate (Admin) ========================= */
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { nav("/login", { replace: true }); return; }
    const payload = decodeJwtPayload(token);
    const isAdmin = !!(payload && (payload.isSuperAdmin || payload.role === "Admin" || payload.userRole === "Admin"));
    if (!isAdmin) nav("/landing", { replace: true });
  }, [nav]);

  /* ========================= Load Refs ========================= */
  const loadRefs = async (forStateName?: string) => {
    setRefsErr(null);
    const results = await Promise.allSettled([
      api.get("/admin/states"),
      api.get("/admin/companies-brief"),
    ]);

    if (results[0].status === "fulfilled") {
      const s: any = results[0].value.data;
      setStatesRef(Array.isArray(s) ? s : (s?.states || []));
    } else {
      const status = (results[0] as any)?.reason?.response?.status;
      setStatesRef([]);
      setRefsErr(
        status === 404
          ? "States reference not found (filters may be limited)."
          : ((results[0] as any)?.reason?.response?.data?.error || "Failed to load reference data.")
      );
    }

    if (results[1].status === "fulfilled") {
      const c: any = results[1].value.data;
      setCompaniesRef(Array.isArray(c) ? c : (c?.companies || []));
    } else {
      if (!refsErr) setRefsErr((results[1] as any)?.reason?.response?.data?.error || "Failed to load reference data.");
    }

    // districts (optional)
    try {
      let stateId: string | undefined;
      if (forStateName && statesRef.length > 0) {
        const match = statesRef.find(s => s.name?.trim() === forStateName.trim());
        stateId = match?.stateId;
      }
      const { data: dResp } = await api.get("/admin/districts", { params: stateId ? { stateId } : undefined });
      const dlist = Array.isArray(dResp) ? dResp : (dResp?.districts || []);
      setDistrictsRef(dlist);
    } catch {
      setDistrictsRef([]);
    }
  };

  /* ========================= Load Projects ========================= */
  const loadProjects = async () => {
    setErr(null);
    setLoading(true);
    try {
      // Accept either [] or {projects: []}
      const { data } = await api.get("/admin/projects");
      const list: any[] = Array.isArray(data) ? data : (Array.isArray(data?.projects) ? data.projects : []);
console.log({data});
      const rawMap: Record<string, RawProject> = {};
      const normalized: DisplayRow[] = list.map((p) => {
        rawMap[p.projectId] = p;

        const flat = flatten({
          ...p,
          clientUser: p?.clientUser
            ? {
                name: p.clientUser?.firstName
                  ? [p.clientUser.firstName, p.clientUser.lastName].filter(Boolean).join(" ")
                  : "",
              }
            : undefined,
          clientCompany: p?.clientCompany ? { name: p.clientCompany?.name ?? "" } : undefined,
        });

        // Fallbacks for state/district names if backend returns plain strings
        if (!("state.name" in flat) && typeof (flat as any).state === "string" && (flat as any).state.trim()) {
          (flat as any)["state.name"] = (flat as any).state;
        }
        if (!("district.name" in flat) && typeof (flat as any).district === "string" && (flat as any).district.trim()) {
          (flat as any)["district.name"] = (flat as any).district;
        }

        return {
          action: "",
          _id: p.projectId || p.id || crypto.randomUUID(),
          ...flat,
        };
      });

      setRawById(rawMap);
      setRows(normalized);
      setPage(1);
    } catch (e: any) {
      const s = e?.response?.status;
      const msg =
        s === 401
          ? "Unauthorized (401). Please sign in again."
          : e?.response?.data?.error || e?.message || "Failed to load projects.";
      setErr(msg);
      if (s === 401) {
        localStorage.removeItem("token");
        setTimeout(() => nav("/login", { replace: true }), 250);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRefs(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { loadProjects(); /* eslint-disable-next-line */ }, []);

  // refresh districts when state filter changes (if refs present)
  useEffect(() => {
    if (statesRef.length === 0) return;
    loadRefs(stateFilter || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateFilter]);

  /* ========================= Columns (fixed order, present-only) ========================= */
  const dynamicColumns = useMemo(() => {
    const keysPresent = new Set<string>();
    rows.forEach(r => Object.keys(r).forEach(k => keysPresent.add(k)));
    return COLUMN_SPEC
      .filter(c => c.key === "action" || keysPresent.has(c.key))
      .map(c => c.key as string);
  }, [rows]);

  /* ========================= Derive filter options ========================= */
  const statusOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { const v = (r.status ?? "").toString().trim(); if (v) s.add(v); });
    return Array.from(s).sort((a,b)=>a.localeCompare(b));
  }, [rows]);

  const stageOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { const v = (r.stage ?? "").toString().trim(); if (v) s.add(v); });
    return Array.from(s).sort((a,b)=>a.localeCompare(b));
  }, [rows]);

  const stateOptions = useMemo(() => {
    const names = statesRef.map(s => s.name).filter(Boolean);
    if (names.length > 0) return Array.from(new Set(names)).sort((a,b)=>a.localeCompare(b));
    const fallback = new Set<string>();
    rows.forEach(r => { const v = (r["state.name"] ?? r?.state ?? "").toString().trim(); if (v) fallback.add(v); });
    return Array.from(fallback).sort((a,b)=>a.localeCompare(b));
  }, [statesRef, rows]);

  const healthOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { const v = (r.health ?? "").toString().trim(); if (v) s.add(v); });
    return Array.from(s).sort((a,b)=>a.localeCompare(b));
  }, [rows]);

  /* ========================= Filter, Search, Sort ========================= */
  const filteredByControls = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter && String(r.status ?? "").trim() !== statusFilter.trim()) return false;
      if (stageFilter && String(r.stage ?? "").trim() !== stageFilter.trim()) return false;
      if (stateFilter) {
        const name = (r["state.name"] ?? r?.state ?? "").toString().trim();
        if (name !== stateFilter.trim()) return false;
      }
      if (healthFilter && String(r.health ?? "").trim() !== healthFilter.trim()) return false;
      return true;
    });
  }, [rows, statusFilter, stageFilter, stateFilter, healthFilter]);

  const [qState, setQState] = useState("");
  useEffect(() => setQState(qDebounced), [qDebounced]);

  const searched = useMemo(() => {
    const needle = qState.trim().toLowerCase();
    if (!needle) return filteredByControls;
    return filteredByControls.filter((r) =>
      Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(needle))
    );
  }, [filteredByControls, qState]);

  const cmp = (a: any, b: any) => {
    if (a === b) return 0;
    if (a === null || a === undefined) return -1;
    if (b === null || b === undefined) return 1;
    const aTime = (typeof a === "string" && isIsoLike(a)) ? new Date(a).getTime() : NaN;
    const bTime = (typeof b === "string" && isIsoLike(b)) ? new Date(b).getTime() : NaN;
    if (!Number.isNaN(aTime) && !Number.isNaN(bTime)) return aTime - bTime;
    if (typeof a === "boolean" && typeof b === "boolean") return (a ? 1 : 0) - (b ? 1 : 0);
    const an = Number(a); const bn = Number(b);
    if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
    return String(a).localeCompare(String(b));
  };

  const sorted = useMemo(() => {
    if (!sortKey || sortKey === "action") return searched;
    const copy = [...searched];
    copy.sort((ra, rb) => {
      const delta = cmp((ra as any)[sortKey], (rb as any)[sortKey]);
      return sortDir === "asc" ? delta : -delta;
    });
    return copy;
  }, [searched, sortKey, sortDir]);

  /* ========================= Pagination ========================= */
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageSafe = Math.min(Math.max(1, page), totalPages);
  const paged = useMemo(() => {
    const start = (pageSafe - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, pageSafe, pageSize]);

  useEffect(() => { if (page > totalPages) setPage(totalPages); /* eslint-disable-next-line */ }, [totalPages]);

  /* ========================= Actions & CSV ========================= */
  const onView = (id: string) => nav(`/admin/projects/${id}`);
  const onEdit = (id: string) => nav(`/admin/projects/${id}/edit`);

  const exportCsv = () => {
    const cols = dynamicColumns;
    const header = cols.map(c => COLUMN_LABELS[c] ?? c.replace(/\./g, " · ")).join(",");

    const lines = [
      header,
      ...sorted.map((r) =>
        cols.map((c) => JSON.stringify(c === "action" ? "" : (r as any)[c] ?? "")).join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "projects.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  /* ========================= Modal ========================= */
  const selectedRaw: RawProject | null = modalProjectId ? rawById[modalProjectId] ?? null : null;
  const modalFlat = selectedRaw ? flatten(selectedRaw) : null;

  const closeModal = () => {
    const base = "/admin/projects";
    if (location.pathname !== base) nav(base, { replace: true });
  };

  const filtersAreDefault =
    !statusFilter && !stageFilter && !stateFilter && !healthFilter;

  /* ========================= Render ========================= */
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-yellow-50 dark:from-neutral-900 dark:to-neutral-950 px-4 sm:px-6 lg:px-10 py-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold dark:text-white">Projects</h1>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Browse all projects.
            </p>
            {refsErr && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                {refsErr}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {/* Filters */}
            <select
              className="border rounded px-2 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
              title="Filter by Status"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            >
              <option value="">Status: All</option>
              {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              className="border rounded px-2 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
              title="Filter by Stage"
              value={stageFilter}
              onChange={(e) => { setStageFilter(e.target.value); setPage(1); }}
            >
              <option value="">Stage: All</option>
              {stageOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              className="border rounded px-2 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
              title="Filter by State"
              value={stateFilter}
              onChange={(e) => { setStateFilter(e.target.value); setPage(1); }}
            >
              <option value="">State: All</option>
              {stateOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              className="border rounded px-2 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
              title="Filter by Health"
              value={healthFilter}
              onChange={(e) => { setHealthFilter(e.target.value); setPage(1); }}
            >
              <option value="">Health: All</option>
              {healthOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <button
              type="button"
              className="px-3 py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800 text-sm"
              title="Clear all filters"
              onClick={() => {
                setStatusFilter("");
                setStageFilter("");
                setStateFilter("");
                setHealthFilter("");
                setPage(1);
              }}
              disabled={filtersAreDefault}
            >
              Clear
            </button>

            <input
              className="border rounded px-3 py-2 w-56 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
              placeholder="Search…"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
            />
            <select
              className="border rounded px-2 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              title="Rows per page"
            >
              {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
            </select>
            <button
              onClick={() => { loadRefs(stateFilter || undefined); loadProjects(); }}
              className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={loading}
              title="Reload"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
            <button
              onClick={() => nav("/admin/projects/new")}
              className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white"
              title="Create a new project"
            >
              + New Project
            </button>
            <button
              onClick={exportCsv}
              className="px-4 py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800 dark:text-white"
              title="Export filtered result as CSV"
            >
              Export CSV
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border dark:border-neutral-800 overflow-hidden">
          {err && (
            <div className="p-4 text-red-700 dark:text-red-400 text-sm border-b dark:border-neutral-800">
              {err}
            </div>
          )}

          <div className="overflow-auto" style={{ maxHeight: "65vh" }}>
            {loading ? (
              <div className="p-6 text-sm text-gray-600 dark:text-gray-300">Fetching projects…</div>
            ) : rows.length === 0 ? (
              <div className="p-6 text-sm text-gray-600 dark:text-gray-300">No projects found.</div>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-neutral-800 sticky top-0 z-10">
                  <tr>
                    {dynamicColumns.map((key) => {
                      const label = COLUMN_LABELS[key] ?? key.replace(/\./g, " · ");
                      const sortable = key !== "action";
                      const active = (sortKey ?? null) === key;
                      const dir = active ? sortDir : undefined;
                      return (
                        <th
                          key={key}
                          className={
                            "text-left font-semibold px-3 py-2 border-b dark:border-neutral-700 whitespace-nowrap select-none " +
                            (sortable ? "cursor-pointer" : "")
                          }
                          title={sortable ? `Sort by ${label}` : undefined}
                          onClick={() => {
                            if (!sortable) return;
                            if (sortKey !== key) { setSortKey(key); setSortDir("asc"); }
                            else { setSortDir(d => d === "asc" ? "desc" : "asc"); }
                          }}
                          aria-sort={
                            sortable ? (active ? (dir === "asc" ? "ascending" : "descending") : "none") : undefined
                          }
                        >
                          <span className="inline-flex items-center gap-1">
                            {label}
                            {sortable && (
                              <span className="text-xs opacity-70">
                                {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
                              </span>
                            )}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((row, idx) => (
                    <tr
                      key={row._id ?? idx}
                      className={idx % 2 ? "bg-white dark:bg-neutral-900" : "bg-gray-50/40 dark:bg-neutral-900/60"}
                    >
                      {dynamicColumns.map((c) => {
                        if (c === "action") {
                          return (
                            <td key={`${row._id}-action`} className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap">
                              <div className="flex gap-2">
                                <button
                                  className="px-2 py-1 rounded border text-xs hover:bg-gray-50 dark:hover:bg-neutral-800"
                                  onClick={() => onView(row._id)}
                                  title="View"
                                >
                                  View
                                </button>
                                <button
                                  className="px-2 py-1 rounded border text-xs hover:bg-gray-50 dark:hover:bg-neutral-800"
                                  onClick={() => onEdit(row._id)}
                                  title="Edit"
                                >
                                  Edit
                                </button>
                              </div>
                            </td>
                          );
                        }
                        return (
                          <td
                            key={`${row._id}-${c}`}
                            className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap"
                            title={formatCell((row as any)[c])}
                          >
                            {formatCell((row as any)[c])}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

        {/* Pagination footer */}
          <div className="flex items-center justify-between px-3 py-2 text-sm border-t dark:border-neutral-800">
            <div className="text-gray-600 dark:text-gray-300">
              Page <b>{pageSafe}</b> of <b>{totalPages}</b> · Showing{" "}
              <b>{paged.length}</b> of <b>{total}</b> records
            </div>
            <div className="flex items-center gap-1">
              <button className="px-3 py-1 rounded border dark:border-neutral-800 disabled:opacity-50"
                onClick={() => setPage(1)} disabled={pageSafe <= 1} title="First">« First</button>
              <button className="px-3 py-1 rounded border dark:border-neutral-800 disabled:opacity-50"
                onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pageSafe <= 1} title="Previous">‹ Prev</button>
              <button className="px-3 py-1 rounded border dark:border-neutral-800 disabled:opacity-50"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={pageSafe >= totalPages} title="Next">Next ›</button>
              <button className="px-3 py-1 rounded border dark:border-neutral-800 disabled:opacity-50"
                onClick={() => setPage(totalPages)} disabled={pageSafe >= totalPages} title="Last">Last »</button>
            </div>
          </div>
        </div>

        {/* -------- Modal (opens when route is /admin/projects/:id) -------- */}
        {modalFlat && (
          <div className="fixed inset-0 z-40">
            <div className="absolute inset-0 bg-black/40" onClick={closeModal} aria-hidden="true" />
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div className="w-full max-w-6xl rounded-2xl bg-white dark:bg-neutral-900 border dark:border-neutral-800 shadow-xl overflow-hidden">
                {/* Header with title, code & stickers */}
                <div className="flex items-center justify-between px-4 py-3 border-b dark:border-neutral-800">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-semibold dark:text-white truncate">
                        {modalFlat.title || "Untitled Project"}
                      </h3>
                      {modalFlat.code && (
                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-gray-100 dark:bg-neutral-800 border dark:border-neutral-700">
                          {modalFlat.code}
                        </span>
                      )}
                      <Badge
                        kind="status"
                        value={modalFlat.status}
                      />
                      <Badge
                        kind="health"
                        value={modalFlat.health}
                      />
                    </div>
                  </div>
                  <button
                    className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50 dark:hover:bg-neutral-800"
                    onClick={closeModal}
                  >
                    Close
                  </button>
                </div>

                {/* Body: 4 columns */}
                <div className="p-4 text-sm">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    {VIEW_COLS.map((section) => (
                      <div key={section.title} className="bg-gray-50/60 dark:bg-neutral-900 rounded-xl border dark:border-neutral-800 p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-3">
                          {section.title}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {section.rows.map(({ key, label, span }) => {
                            // fallbacks for state/district if API returned plain strings
                            let raw: any = (modalFlat as any)[key];
                            if (raw == null) {
                              if (key === "state.name" && (modalFlat as any).state) raw = (modalFlat as any).state;
                              if (key === "district.name" && (modalFlat as any).district) raw = (modalFlat as any).district;
                            }
                            return (
                              <div key={key} className={span === 2 ? "sm:col-span-2" : ""}>
                                <Field label={label} value={formatCell(raw)} />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="px-4 py-3 border-t dark:border-neutral-800 text-right">
                  <button
                    className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={closeModal}
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* -------- /Modal -------- */}
      </div>
    </div>
  );
}

/* ========================= Small components ========================= */
function Field({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex flex-col">
      <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-0.5 font-medium dark:text-white break-words">{value || "—"}</div>
    </div>
  );
}

function Badge({ kind, value }: { kind: "status" | "health"; value?: string }) {
  const v = (value || "").toString();
  if (!v) return null;

  let cls = "bg-gray-100 text-gray-800 border-gray-200 dark:bg-neutral-800 dark:text-gray-200 dark:border-neutral-700";
  if (kind === "status") {
    const map: Record<string, string> = {
      Draft: "bg-gray-100 text-gray-800 border-gray-200 dark:bg-neutral-800 dark:text-gray-200 dark:border-neutral-700",
      Active: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
      OnHold: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
      Completed: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
      Archived: "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-800",
    };
    cls = map[v] || cls;
  } else if (kind === "health") {
    const map: Record<string, string> = {
      Green: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
      Amber: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
      Red: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800",
      Unknown: "bg-gray-100 text-gray-800 border-gray-200 dark:bg-neutral-800 dark:text-gray-200 dark:border-neutral-700",
    };
    cls = map[v] || cls;
  }

  return (
    <span className={`text-xs px-2 py-0.5 rounded border ${cls}`}>
      {v}
    </span>
  );
}
