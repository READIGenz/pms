// pms-frontend/src/views/admin/companies/Companies.tsx
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
type RawCompany = any;

type StateRef = { stateId: string; name: string; code: string };
type DistrictRef = { districtId: string; name: string; stateId: string };

/* ========================= pinned columns ========================= */
/** Keep important columns up front; everything else is discovered dynamically */
const pinOrder = [
  "action",
  "name",
  "status",
  "companyRole",
  "website",
  "primaryContact",          // if your schema uses primaryContactName, we surface it below
  "primaryContactName",
  "contactMobile",
  "contactEmail",
  "address",
  "state.name",
  "district.name",
  "pin",
  "gstin",
  "pan",
  "cin",
  "createdAt",
  "updatedAt",
  "companyId",
];

/* ========================= component ========================= */
export default function CompanyEdit() {
  const nav = useNavigate();
  const params = useParams<{ id?: string }>();
  const location = useLocation();
  const modalCompanyId = params.id || null;

  // --- data state ---
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<DisplayRow[]>([]);
  const [rawById, setRawById] = useState<Record<string, RawCompany>>({});

  // --- refs (for filters/tooltips) ---
  const [statesRef, setStatesRef] = useState<StateRef[]>([]);
  const [districtsRef, setDistrictsRef] = useState<DistrictRef[]>([]);
  const [refsErr, setRefsErr] = useState<string | null>(null);

  // ---- Filters ----
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("");

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
  const loadRefs = async () => {
    setRefsErr(null);
    try {
      const { data: s } = await api.get("/admin/states");
      setStatesRef(Array.isArray(s) ? s : (s?.states || []));
    } catch (e: any) {
      const status = e?.response?.status;
      setStatesRef([]);
      setRefsErr(
        status === 404
          ? "States reference not found (filters may be limited)."
          : e?.response?.data?.error || "Failed to load reference data."
      );
    }

    try {
      const { data: dResp } = await api.get("/admin/districts");
      setDistrictsRef(Array.isArray(dResp) ? dResp : (dResp?.districts || []));
    } catch {
      setDistrictsRef([]);
    }
  };

  /* ========================= Load Companies ========================= */
  const loadCompanies = async () => {
    setErr(null);
    setLoading(true);
    try {
      // Accept either [] or {companies: []}
      const { data } = await api.get("/admin/companies");
      const list: any[] = Array.isArray(data) ? data : (Array.isArray(data?.companies) ? data.companies : []);

      const rawMap: Record<string, RawCompany> = {};
      const normalized: DisplayRow[] = list.map((c) => {
        rawMap[c.companyId] = c;
        const flat = flatten({
          ...c,
          // If backend exposes nested state/district objects, flatten will surface state.name etc.
        });

        // surface fallbacks if backend returned plain strings
        if (!("state.name" in flat) && typeof (flat as any).state === "string" && (flat as any).state.trim()) {
          (flat as any)["state.name"] = (flat as any).state;
        }
        if (!("district.name" in flat) && typeof (flat as any).district === "string" && (flat as any).district.trim()) {
          (flat as any)["district.name"] = (flat as any).district;
        }

        // allow either primaryContact or primaryContactName to show
        if (!("primaryContact" in flat) && "primaryContactName" in flat) {
          (flat as any).primaryContact = (flat as any).primaryContactName;
        }

        return {
          action: "",
          _id: c.companyId || c.id || crypto.randomUUID(),
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
          : e?.response?.data?.error || e?.message || "Failed to load companies.";
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
  useEffect(() => { loadCompanies(); /* eslint-disable-next-line */ }, []);

  /* ========================= Columns (dynamic) ========================= */
  const dynamicColumns = useMemo(() => {
    const allKeys = new Set<string>();
    rows.forEach((r) => Object.keys(r).forEach((k) => allKeys.add(k)));
    allKeys.delete("_id"); // internal
    // Build order: pinned first if present, then the rest sorted
    const pinned = pinOrder.filter((k) => allKeys.has(k));
    pinned.forEach((k) => allKeys.delete(k));
    const rest = Array.from(allKeys).sort((a, b) => a.localeCompare(b));
    return ["action", ...pinned.filter(k => k !== "action"), ...rest];
  }, [rows]);

  /* ========================= Derive filter options ========================= */
  const statusOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { const v = (r.status ?? "").toString().trim(); if (v) s.add(v); });
    return Array.from(s).sort((a,b)=>a.localeCompare(b));
  }, [rows]);

  const roleOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { const v = (r.companyRole ?? "").toString().trim(); if (v) s.add(v); });
    return Array.from(s).sort((a,b)=>a.localeCompare(b));
  }, [rows]);

  /* ========================= Filter, Search, Sort ========================= */
  const filteredByControls = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter && String(r.status ?? "").trim() !== statusFilter.trim()) return false;
      if (roleFilter && String(r.companyRole ?? "").trim() !== roleFilter.trim()) return false;
      return true;
    });
  }, [rows, statusFilter, roleFilter]);

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
  const onView = (id: string) => nav(`/admin/companies/${id}`);
  const onEdit = (id: string) => nav(`/admin/companies/${id}/edit`);

  const exportCsv = () => {
    const cols = dynamicColumns;
    const header = cols.map(c => c.replace(/\./g, " · ")).join(",");
    const lines = [
      header,
      ...sorted.map((r) =>
        cols.map((c) => JSON.stringify(c === "action" ? "" : (r as any)[c] ?? "")).join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "companies.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  /* ========================= Modal (view-only) ========================= */
  const selectedRaw: RawCompany | null = modalCompanyId ? rawById[modalCompanyId] ?? null : null;
  const modalFlat = selectedRaw ? flatten(selectedRaw) : null;

  const closeModal = () => {
    const base = "/admin/companies";
    if (location.pathname !== base) nav(base, { replace: true });
  };

  const filtersAreDefault = !statusFilter && !roleFilter;

  /* ========================= Render ========================= */
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-yellow-50 dark:from-neutral-900 dark:to-neutral-950 px-4 sm:px-6 lg:px-10 py-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold dark:text-white">Companies</h1>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Browse all companies. Every field returned by the API is listed in the table; pinned fields first.
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
              title="Filter by Specialisation"
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
            >
              <option value="">Specialisation: All</option>
              {roleOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <button
              type="button"
              className="px-3 py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800 text-sm"
              title="Clear all filters"
              onClick={() => {
                setStatusFilter("");
                setRoleFilter("");
                setPage(1);
                setQ("");
              }}
              disabled={filtersAreDefault && !q}
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
              onClick={() => { loadRefs(); loadCompanies(); }}
              className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={loading}
              title="Reload"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
            <button
              onClick={() => nav("/admin/companies/new")}
              className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white"
              title="Create a new company"
            >
              + New Company
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
              <div className="p-6 text-sm text-gray-600 dark:text-gray-300">Fetching companies…</div>
            ) : rows.length === 0 ? (
              <div className="p-6 text-sm text-gray-600 dark:text-gray-300">No companies found.</div>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-neutral-800 sticky top-0 z-10">
                  <tr>
                    {dynamicColumns.map((key) => {
                      const label = key.replace(/\./g, " · ");
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

        {/* -------- Modal (opens when route is /admin/companies/:id) -------- */}
        {modalFlat && (
          <div className="fixed inset-0 z-40">
            <div className="absolute inset-0 bg-black/40" onClick={closeModal} aria-hidden="true" />
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-neutral-900 border dark:border-neutral-800 shadow-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b dark:border-neutral-800">
                  <h3 className="text-lg font-semibold dark:text-white">
                    {modalFlat.name || "Company details"}
                  </h3>
                  <button
                    className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50 dark:hover:bg-neutral-800"
                    onClick={closeModal}
                  >
                    Close
                  </button>
                </div>

                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  {Object.entries(modalFlat).map(([k, v]) => (
                    <Field key={k} label={k.replace(/\./g, " · ")} value={formatCell(v)} />
                  ))}
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

/* ========================= Small modal field ========================= */
function Field({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex flex-col">
      <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-0.5 font-medium dark:text-white break-words">{value || ""}</div>
    </div>
  );
}
