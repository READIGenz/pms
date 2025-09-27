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

/* ========================= utils/format & helpers ========================= */
const isIsoLike = (v: any) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v);

const fmtDate = (v: any) =>
  isIsoLike(v) ? new Date(v).toLocaleString() : (v ?? "");

function formatCell(v: any): string {
  if (v === null || v === undefined) return "";
  if (isIsoLike(v)) return fmtDate(v);
  return String(v ?? "");
}

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

/* ========================= types ========================= */
type RawCompany = {
  companyId: string;
  companyCode?: string | null;
  name?: string | null;
  status?: string | null;
  website?: string | null;
  companyRole?: string | null;

  gstin?: string | null;
  pan?: string | null;
  cin?: string | null;

  primaryContact?: string | null;
  contactMobile?: string | null;
  contactEmail?: string | null;

  address?: string | null;
  stateId?: string | null;
  districtId?: string | null;
  pin?: string | null;

  notes?: string | null;

  updatedAt?: string | null;

  // Relations (if controller includes them)
  state?: { stateId: string; name: string; code?: string } | null;
  district?: { districtId: string; name: string; stateId?: string } | null;
};

type DisplayRow = {
  _id: string;          // stable key for row
  action?: string;
  companyCode?: string | null;
  name?: string | null;
  companyRole?: string | null;
  city?: string | null;   // district.name
  state?: string | null;  // state.name
  status?: string | null;
  updatedAt?: string | null;
};

type ColKey =
  | "action"
  | "companyCode"
  | "name"
  | "companyRole"
  | "city"
  | "state"
  | "status"
  | "updatedAt";

/* ========================= fixed columns (order matters) ========================= */
const COLS: { key: ColKey; label: string }[] = [
  { key: "action",       label: "Action" },
  { key: "companyCode",  label: "Company Code" },
  { key: "name",         label: "Company Name" },
  { key: "companyRole",  label: "Primary Specialisation" },
  { key: "city",         label: "City" },   // district.name
  { key: "state",        label: "State" },  // state.name
  { key: "status",       label: "Status" },
  { key: "updatedAt",    label: "Updated" },
];

/* ========================= View modal sections ========================= */
type RowSpec = { key: string; label: string; span?: 1 | 2 };
type SectionSpec = { title: string; rows: RowSpec[] };

/** Same grouping as Create/Edit pages */
const VIEW_SECTIONS: readonly SectionSpec[] = [
  {
    title: "Summary",
    rows: [
      { key: "name",          label: "Company Name", span: 2 },
      { key: "status",        label: "Status" },
      { key: "companyRole",   label: "Primary Specialisation" },
      { key: "website",       label: "Website", span: 2 },
      { key: "companyCode",   label: "Company Code" },
      { key: "updatedAt",     label: "Last Updated" },
    ],
  },
  {
    title: "Registration and Contact",
    rows: [
      { key: "gstin",          label: "GSTIN" },
      { key: "pan",            label: "PAN" },
      { key: "cin",            label: "CIN" },
      { key: "primaryContact", label: "Primary Contact" },
      { key: "contactMobile",  label: "Contact Mobile" },
      { key: "contactEmail",   label: "Contact Email" },
    ],
  },
  {
    title: "Location",
    rows: [
      { key: "address",        label: "Address", span: 2 },
      { key: "state.name",     label: "State / UT" },
      { key: "district.name",  label: "District" },
      { key: "pin",            label: "PIN Code" },
    ],
  },
  {
    title: "Notes and Description",
    rows: [
      { key: "notes",          label: "Notes", span: 2 },
    ],
  },
];

/* ========================= component ========================= */
export default function Companies() {
  const nav = useNavigate();
  const params = useParams<{ id?: string }>();
  const location = useLocation();
  const modalCompanyId = params.id || null;

  // --- data state ---
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<DisplayRow[]>([]);
  const [rawById, setRawById] = useState<Record<string, RawCompany>>({});

  // --- filters/search/sort/pagination ---
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("");

  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setQDebounced(q), 250);
    return () => clearTimeout(id);
  }, [q]);

  const [sortKey, setSortKey] = useState<ColKey | null>(null);
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

  /* ========================= Load Companies ========================= */
  const loadCompanies = async () => {
    setErr(null);
    setLoading(true);
    try {
      const { data } = await api.get("/admin/companies");
      // Accept either [] or { companies: [] }
      const list: RawCompany[] = Array.isArray(data)
        ? data
        : (Array.isArray(data?.companies) ? data.companies : []);

      // Build raw map for modal use
      const rawMap: Record<string, RawCompany> = {};
      list.forEach((c) => { rawMap[c.companyId] = c; });

      // Normalize to show names for state/district
      const normalized: DisplayRow[] = list.map((c) => {
        // Prefer related names; fallback to blank if missing
        const stateName =
          (c as any)?.state?.name ??
          (typeof (c as any)?.state === "string" ? (c as any).state : "") ??
          "";

        const districtName =
          (c as any)?.district?.name ??
          (typeof (c as any)?.district === "string" ? (c as any).district : "") ??
          "";

        return {
          _id: c.companyId,
          action: "",
          companyCode: c.companyCode ?? "",
          name: c.name ?? "",
          companyRole: c.companyRole ?? "",
          city: districtName,
          state: stateName,
          status: c.status ?? "",
          updatedAt: c.updatedAt ?? "",
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

  useEffect(() => { loadCompanies(); /* eslint-disable-next-line */ }, []);

  /* ========================= Filter options ========================= */
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
  const filtered = useMemo(() => {
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
    if (!needle) return filtered;
    return filtered.filter((r) =>
      [
        r.companyCode,
        r.name,
        r.companyRole,
        r.city,
        r.state,
        r.status,
        r.updatedAt,
      ].some((v) => String(v ?? "").toLowerCase().includes(needle))
    );
  }, [filtered, qState]);

  const cmp = (a: any, b: any) => {
    if (a === b) return 0;
    if (a === null || a === undefined) return -1;
    if (b === null || b === undefined) return 1;
    const aTime = (typeof a === "string" && isIsoLike(a)) ? new Date(a).getTime() : NaN;
    const bTime = (typeof b === "string" && isIsoLike(b)) ? new Date(b).getTime() : NaN;
    if (!Number.isNaN(aTime) && !Number.isNaN(bTime)) return aTime - bTime;
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
    const header = COLS.map(c => c.label).join(",");
    const lines = [
      header,
      ...sorted.map((r) =>
        COLS.map((c) => JSON.stringify(c.key === "action" ? "" : (r as any)[c.key] ?? "")).join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "companies.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const filtersAreDefault = !statusFilter && !roleFilter;

  /* ========================= Modal state ========================= */
  const selectedRaw: RawCompany | null = modalCompanyId ? rawById[modalCompanyId] ?? null : null;
  const modalFlat = selectedRaw ? flatten(selectedRaw) : null;

  const closeModal = () => {
    const base = "/admin/companies";
    if (location.pathname !== base) nav(base, { replace: true });
  };

  /* ========================= Render ========================= */
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-yellow-50 dark:from-neutral-900 dark:to-neutral-950 px-4 sm:px-6 lg:px-10 py-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold dark:text-white">Companies</h1>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Browse all companies.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {/* Filters like Users.tsx */}
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
              title="Filter by Role"
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
            >
              <option value="">Role: All</option>
              {roleOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <button
              type="button"
              className="px-3 py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800 text-sm"
              title="Clear all filters"
              onClick={() => { setStatusFilter(""); setRoleFilter(""); setPage(1); }}
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
              onClick={() => loadCompanies()}
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

          <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: "65vh" }}>
            {loading ? (
              <div className="p-6 text-sm text-gray-600 dark:text-gray-300">Fetching companies…</div>
            ) : rows.length === 0 ? (
              <div className="p-6 text-sm text-gray-600 dark:text-gray-300">No companies found.</div>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-neutral-800 sticky top-0 z-10">
                  <tr>
                    {COLS.map(({ key, label }) => {
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
                          aria-sort={sortable ? (active ? (dir === "asc" ? "ascending" : "descending") : "none") : undefined}
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
                      key={row._id || idx}
                      className={idx % 2 ? "bg-white dark:bg-neutral-900" : "bg-gray-50/40 dark:bg-neutral-900/60"}
                    >
                      {COLS.map(({ key }) => {
                        if (key === "action") {
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
                        const value = (row as any)[key];
                        return (
                          <td
                            key={`${row._id}-${key}`}
                            className="px-3 py-2 border-b dark:border-neutral-800 whitespace-pre-wrap break-words max-w-[28rem]"
                            title={formatCell(value)}
                          >
                            {formatCell(value)}
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

        {/* -------- View Modal (opens when route is /admin/companies/:id) -------- */}
        {modalFlat && (
          <div className="fixed inset-0 z-40">
            <div className="absolute inset-0 bg-black/40" onClick={closeModal} aria-hidden="true" />
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div className="w-full max-w-5xl rounded-2xl bg-white dark:bg-neutral-900 border dark:border-neutral-800 shadow-xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b dark:border-neutral-800">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-semibold dark:text-white truncate">
                        {modalFlat.name || "Untitled Company"}
                      </h3>
                      {modalFlat.companyCode && (
                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-gray-100 dark:bg-neutral-800 border dark:border-neutral-700">
                          {modalFlat.companyCode}
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
                  <div className="flex gap-2">
                    <button
                      className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50 dark:hover:bg-neutral-800"
                      onClick={closeModal}
                    >
                      Close
                    </button>
                  </div>
                </div>

                {/* Body: sections like Create/Edit */}
                <div className="p-4 text-sm">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-4">
                    {VIEW_SECTIONS.map((section) => (
                      <div key={section.title} className="bg-gray-50/60 dark:bg-neutral-900 rounded-xl border dark:border-neutral-800 p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-3">
                          {section.title}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {section.rows.map(({ key, label, span }) => {
                            // Provide fallbacks for state/district if backend returned plain IDs/strings
                            let raw: any = (modalFlat as any)[key];
                            if (raw == null) {
                              if (key === "state.name") {
                                raw = (modalFlat as any)?.state?.name || (modalFlat as any)?.state || "";
                              } else if (key === "district.name") {
                                raw = (modalFlat as any)?.district?.name || (modalFlat as any)?.district || "";
                              }
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
        {/* -------- /View Modal -------- */}
      </div>
    </div>
  );
}

/* ========================= Small components ========================= */
function Field({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex flex-col">
      <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-0.5 font-medium dark:text-white break-words">
        {value || "—"}
      </div>
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
      Inactive: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800",
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

