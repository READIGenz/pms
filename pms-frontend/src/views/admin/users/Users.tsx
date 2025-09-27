// pms-frontend/src/views/admin/users/Users.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { api } from "../../../api/client";

// --- JWT helper ---
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

const isIsoLike = (v: any) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v);
const fmtBool = (v: any) => (v === null || v === undefined ? "" : v ? "✓" : "✗");
const fmtDate = (v: any) => (isIsoLike(v) ? new Date(v).toLocaleString() : (v ?? ""));

// --- Photo helpers ---
function resolvePhotoUrl(path?: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = (api.defaults.baseURL || "").replace(/\/+$/, "");
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
}
function initialsFrom(first?: string, middle?: string, last?: string) {
  const parts = [first, middle, last].filter(Boolean).map(s => String(s).trim());
  const letters = parts.map(p => p[0]?.toUpperCase()).filter(Boolean);
  return (letters[0] || "") + (letters[1] || "");
}

// --- UI helper: status pill color ---
function statusBadgeClass(status?: string | null) {
  const s = String(status || "").toLowerCase();
  if (s === "active")
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-700/60";
  if (s === "inactive" || s === "disabled")
    return "bg-gray-100 text-gray-800 dark:bg-neutral-800/80 dark:text-gray-300 border-gray-200/60 dark:border-neutral-700/60";
  if (s === "blocked" || s === "suspended")
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200/60 dark:border-amber-700/60";
  if (s === "deleted")
    return "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200/60 dark:border-rose-700/60";
  return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200/60 dark:border-blue-700/60";
}

// ----- Types for the rendered table row -----
type DisplayRow = {
  action: string;
  code: string;
  name: string;
  isClient: boolean | null;
  projects: string;
  isServiceProvider: boolean | null;
  companies: string;
  email: string;
  mobile: string;
  state: string;
  zone: string;
  status: string;
  updated: string;
  _id: string;
};
type RawUser = any;

// ----- Ref types -----
type StateRef = { stateId: string; name: string; code: string };
type DistrictRef = { districtId: string; name: string; stateId: string };
type CompanyRef = { companyId: string; name: string; companyRole: string; status: string };

// ----- Column definition (order) -----
const headings: { key: keyof DisplayRow; label: string }[] = [
  { key: "action",            label: "Action" },
  { key: "code",              label: "Code" },
  { key: "name",              label: "Name" },
  { key: "isClient",          label: "Client?" },
  { key: "projects",          label: "Project(s)" },
  { key: "isServiceProvider", label: "ServiceProvider?" },
  { key: "companies",         label: "Company(ies)" },
  { key: "email",             label: "Email" },
  { key: "mobile",            label: "Mobile" },
  { key: "state",             label: "State" },
  { key: "zone",              label: "Zone" },
  { key: "status",            label: "Status" },
  { key: "updated",           label: "Updated" },
];

export default function Users() {
  const nav = useNavigate();
  const params = useParams<{ id?: string }>();
  const location = useLocation();
  const modalUserId = params.id || null;

  // --- data state ---
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<DisplayRow[]>([]);
  const [rawById, setRawById] = useState<Record<string, RawUser>>({});

  // --- refs state (from /admin/*) ---
  const [statesRef, setStatesRef] = useState<StateRef[]>([]);
  const [districtsRef, setDistrictsRef] = useState<DistrictRef[]>([]);
  const [companiesRef, setCompaniesRef] = useState<CompanyRef[]>([]);
  const [refsErr, setRefsErr] = useState<string | null>(null);

  // ---- Filters (role/state/zone) ----
  const [isClientFilter, setIsClientFilter] = useState<"all" | "yes" | "no">("all");
  const [isServiceProviderFilter, setIsServiceProviderFilter] = useState<"all" | "yes" | "no">("all");
  const [stateFilter, setStateFilter] = useState<string>("");
  const [zoneFilter, setZoneFilter] = useState<string>("");

  // --- derive options from refs/data ---
  const stateOptions = useMemo(() => {
    const names = statesRef.map(s => s.name).filter(Boolean);
    if (names.length > 0) return Array.from(new Set(names)).sort((a,b)=>a.localeCompare(b));
    const fallback = new Set<string>();
    rows.forEach(r => { if (r.state?.trim()) fallback.add(r.state.trim()); });
    return Array.from(fallback).sort((a,b)=>a.localeCompare(b));
  }, [statesRef, rows]);

  const zoneOptions = useMemo(() => {
    const z = new Set<string>();
    rows.forEach(r => { if (r.zone?.trim()) z.add(r.zone.trim()); });
    return Array.from(z).sort((a,b)=>a.localeCompare(b));
  }, [rows]);

  // --- debounced search ---
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setQDebounced(q), 250);
    return () => clearTimeout(id);
  }, [q]);

  // --- sort & pagination ---
  const [sortKey, setSortKey] = useState<keyof DisplayRow | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // --- Auth gate ---
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { nav("/login", { replace: true }); return; }
    const payload = decodeJwtPayload(token);
    const isAdmin = !!(payload && (payload.isSuperAdmin || payload.role === "Admin" || payload.userRole === "Admin"));
    if (!isAdmin) nav("/landing", { replace: true });
  }, [nav]);

  // --- Load refs (states, districts, companies) with graceful degradation ---
  const loadRefs = async (districtsForStateName?: string) => {
    setRefsErr(null);
    const results = await Promise.allSettled([
      api.get("/admin/states"),
      api.get("/admin/companies-brief"),
    ]);

    // states
    if (results[0].status === "fulfilled") {
      const sdata: any = results[0].value.data;
      setStatesRef(Array.isArray(sdata) ? sdata : (sdata?.states || []));
    } else {
      const status = (results[0] as any)?.reason?.response?.status;
      setStatesRef([]);
      setRefsErr(
        status === 404
          ? "Not Found (showing discovered state names instead)"
          : ((results[0] as any)?.reason?.response?.data?.error || "Failed to load reference data.")
      );
    }

    // companies
    if (results[1].status === "fulfilled") {
      const cdata: any = results[1].value.data;
      setCompaniesRef(Array.isArray(cdata) ? cdata : (cdata?.companies || []));
    } else {
      if (!refsErr) {
        setRefsErr(
          (results[1] as any)?.reason?.response?.data?.error || "Failed to load reference data."
        );
      }
    }

    // districts (optional)
    try {
      let stateId: string | undefined;
      if (districtsForStateName && statesRef.length > 0) {
        const match = statesRef.find(s => s.name?.trim() === districtsForStateName.trim());
        stateId = match?.stateId;
      }
      const { data: dResp } = await api.get("/admin/districts", { params: stateId ? { stateId } : undefined });
      const dlist = Array.isArray(dResp) ? dResp : (dResp?.districts || []);
      setDistrictsRef(dlist);
    } catch {
      setDistrictsRef([]);
    }
  };

  // --- Users (with memberships) ---
  const loadUsers = async () => {
    setErr(null);
    setLoading(true);
    try {
      const { data } = await api.get("/admin/users", { params: { includeMemberships: "1" }});
      const list: any[] = Array.isArray(data) ? data : (Array.isArray(data?.users) ? data.users : []);

      const rawMap: Record<string, RawUser> = {};
      const normalized: DisplayRow[] = list.map((u) => {
        rawMap[u.userId] = u;

        const name = [u.firstName, u.middleName, u.lastName].filter(Boolean).join(" ").trim();
        const mobile = [u.countryCode, u.phone].filter(Boolean).join(" ").trim();

        const memberships: any[] = Array.isArray(u.userRoleMemberships) ? u.userRoleMemberships : [];
        const projectTitles = Array.from(
          new Set(memberships.map(m => m?.project?.title).filter((s:any)=>typeof s==="string" && s.trim()))
        );
        const companyNames = Array.from(
          new Set(memberships.map(m => m?.company?.name).filter((s:any)=>typeof s==="string" && s.trim()))
        );

        const row: DisplayRow = {
          action: "",
          code: u.code ?? "",
          name,
          isClient: typeof u.isClient === "boolean" ? u.isClient : null,
          projects: projectTitles.join(", "),
          isServiceProvider: typeof u.isServiceProvider === "boolean" ? u.isServiceProvider : null,
          companies: companyNames.join(", "),
          email: u.email ?? "",
          mobile,
          state: u?.state?.name ?? "",
          zone: u.operatingZone ?? "",
          status: u.userStatus ?? "",
          updated: u.updatedAt ?? "",
          _id: u.userId,
        };
        return row;
      });

      setRawById(rawMap);
      setRows(normalized);
      setPage(1);
    } catch (e: any) {
      const s = e?.response?.status;
      const msg = s === 401
        ? "Unauthorized (401). Please sign in again."
        : e?.response?.data?.error || e?.message || "Failed to load users.";
      setErr(msg);
      if (s === 401) {
        localStorage.removeItem("token");
        setTimeout(() => nav("/login", { replace: true }), 250);
      }
    } finally {
      setLoading(false);
    }
  };

  // initial loads
  useEffect(() => { loadRefs(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { loadUsers(); /* eslint-disable-next-line */ }, []);

  // If state filter changes and we have refs, refresh districts for that state name (safe no-op on failure)
  useEffect(() => {
    if (statesRef.length === 0) return;
    loadRefs(stateFilter || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateFilter]);

  // ----- Apply filters then search -----
  const filteredByControls = useMemo(() => {
    return rows.filter((r) => {
      if (isClientFilter !== "all") {
        const v = r.isClient === true ? "yes" : r.isClient === false ? "no" : "no";
        if (v !== isClientFilter) return false;
      }
      if (isServiceProviderFilter !== "all") {
        const v = r.isServiceProvider === true ? "yes" : r.isServiceProvider === false ? "no" : "no";
        if (v !== isServiceProviderFilter) return false;
      }
      if (stateFilter && r.state.trim() !== stateFilter.trim()) return false;
      if (zoneFilter && r.zone.trim() !== zoneFilter.trim()) return false;
      return true;
    });
  }, [rows, isClientFilter, isServiceProviderFilter, stateFilter, zoneFilter]);

  // client-side text search on top of filters
  const [sortKeyState, setSortKeyState] = useState<keyof DisplayRow | null>(null);
  const [qState, setQState] = useState("");
  useEffect(() => setQState(qDebounced), [qDebounced]);
  const filtered = useMemo(() => {
    const needle = qState.trim().toLowerCase();
    if (!needle) return filteredByControls;
    return filteredByControls.filter((r) =>
      Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(needle))
    );
  }, [filteredByControls, qState]);

  // sorting
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
    const key = sortKey ?? sortKeyState;
    if (!key || key === "action") return filtered;
    const copy = [...filtered];
    copy.sort((ra, rb) => {
      const delta = cmp((ra as any)[key], (rb as any)[key]);
      return sortDir === "asc" ? delta : -delta;
    });
    return copy;
  }, [filtered, sortKey, sortKeyState, sortDir]);

  // pagination
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageSafe = Math.min(Math.max(1, page), totalPages);
  const paged = useMemo(() => {
    const start = (pageSafe - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, pageSafe, pageSize]);

  useEffect(() => { if (page > totalPages) setPage(totalPages); /* eslint-disable-next-line */ }, [totalPages]);

  // actions
  const onView = (id: string) => nav(`/admin/users/${id}`);
  const onEdit = (id: string) => nav(`/admin/users/${id}/edit`);

  // export CSV
  const exportCsv = () => {
    const cols = headings.map(h => h.label);
    const lines = [
      cols.join(","),
      ...sorted.map((r) =>
        headings.map(h => JSON.stringify(h.key === "action" ? "" : (r as any)[h.key] ?? "")).join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "users.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // ------------- Modal -------------
  const selectedRaw: RawUser | null = modalUserId ? rawById[modalUserId] ?? null : null;
  const modalData = (() => {
    if (!selectedRaw) return null;
    const u = selectedRaw;
    const name = [u.firstName, u.middleName, u.lastName].filter(Boolean).join(" ").trim();
    const mobile = [u.countryCode, u.phone].filter(Boolean).join(" ").trim();
    const memberships: any[] = Array.isArray(u.userRoleMemberships) ? u.userRoleMemberships : [];
    const projectTitles = Array.from(new Set(memberships.map((m) => m?.project?.title).filter((s:any)=>typeof s==="string" && s.trim())));
    const companyNames = Array.from(new Set(memberships.map((m) => m?.company?.name).filter((s:any)=>typeof s==="string" && s.trim())));
    return {
      code: u.code ?? "",
      name,
      isClient: u.isClient ?? null,
      projects: projectTitles.join(", "),
      isServiceProvider: u.isServiceProvider ?? null,
      companies: companyNames.join(", "),
      email: u.email ?? "",
      mobile,
      state: u?.state?.name ?? "",
      zone: u.operatingZone ?? "",
      status: u.userStatus ?? "",
      created: u.createdAt ?? "",
      updated: u.updatedAt ?? "",
      profilePhoto: u.profilePhoto ?? null,
      firstName: u.firstName,
      middleName: u.middleName,
      lastName: u.lastName,
    };
  })();

  const closeModal = () => {
    const base = "/admin/users";
    if (location.pathname !== base) nav(base, { replace: true });
  };

  const filtersAreDefault =
    isClientFilter === "all" &&
    isServiceProviderFilter === "all" &&
    !stateFilter &&
    !zoneFilter;

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-yellow-50 dark:from-neutral-900 dark:to-neutral-950 px-4 sm:px-6 lg:px-10 py-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold dark:text-white">Users</h1>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              User&apos;s details can be viewed and updated.
            </p>
            {refsErr && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                {refsErr}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {/* role/state/zone filters */}
            <select
              className="border rounded px-2 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
              title="Filter: Client?"
              value={isClientFilter}
              onChange={(e) => { setIsClientFilter(e.target.value as any); setPage(1); }}
            >
              <option value="all">Client: All</option>
              <option value="yes">Client: Yes</option>
              <option value="no">Client: No</option>
            </select>

            <select
              className="border rounded px-2 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
              title="Filter: Service Provider?"
              value={isServiceProviderFilter}
              onChange={(e) => { setIsServiceProviderFilter(e.target.value as any); setPage(1); }}
            >
              <option value="all">ServiceProv: All</option>
              <option value="yes">ServiceProv: Yes</option>
              <option value="no">ServiceProv: No</option>
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

            <div className="flex items-center gap-2">
              <select
                className="border rounded px-2 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                title="Filter by Zone"
                value={zoneFilter}
                onChange={(e) => { setZoneFilter(e.target.value); setPage(1); }}
              >
                <option value="">Zone: All</option>
                {zoneOptions.map(z => <option key={z} value={z}>{z}</option>)}
              </select>

              <button
                type="button"
                className="px-3 py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800 text-sm"
                title="Clear all filters"
                onClick={() => {
                  setIsClientFilter("all");
                  setIsServiceProviderFilter("all");
                  setStateFilter("");
                  setZoneFilter("");
                  setPage(1);
                }}
                disabled={filtersAreDefault}
              >
                Clear
              </button>
            </div>

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
              onClick={() => { loadRefs(stateFilter || undefined); loadUsers(); }}
              className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={loading}
              title="Reload"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
            <button
              onClick={() => nav("/admin/users/new")}
              className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white"
              title="Create a new user"
            >
              + New User
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
              <div className="p-6 text-sm text-gray-600 dark:text-gray-300">Fetching users…</div>
            ) : rows.length === 0 ? (
              <div className="p-6 text-sm text-gray-600 dark:text-gray-300">No users found.</div>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-neutral-800 sticky top-0 z-10">
                  <tr>
                    {headings.map(({ key, label }) => {
                      const active = (sortKey ?? null) === key;
                      const dir = active ? sortDir : undefined;
                      const sortable = key !== "action";
                      return (
                        <th
                          key={String(key)}
                          className={"text-left font-semibold px-3 py-2 border-b dark:border-neutral-700 whitespace-nowrap select-none " +
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
                      key={row._id ?? idx}
                      className={idx % 2 ? "bg-white dark:bg-neutral-900" : "bg-gray-50/40 dark:bg-neutral-900/60"}
                    >
                      {/* Action */}
                      <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap">
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

                      <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap" title={row.code}>{row.code}</td>
                      <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap" title={row.name}>{row.name}</td>
                      <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap">{fmtBool(row.isClient)}</td>
                      <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap" title={row.projects}>{row.projects}</td>
                      <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap">{fmtBool(row.isServiceProvider)}</td>
                      <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap" title={row.companies}>{row.companies}</td>
                      <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap" title={row.email}>{row.email}</td>
                      <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap" title={row.mobile}>{row.mobile}</td>
                      <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap" title={row.state}>{row.state}</td>
                      <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap" title={row.zone}>{row.zone}</td>
                      <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap" title={row.status}>{row.status}</td>
                      <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap" title={fmtDate(row.updated)}>{fmtDate(row.updated)}</td>
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

        {/* -------- Modal -------- */}
        {modalData && (
          <div className="fixed inset-0 z-40">
            <div className="absolute inset-0 bg-black/40" onClick={closeModal} aria-hidden="true" />
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-neutral-900 border dark:border-neutral-800 shadow-xl overflow-hidden">
                {/* Header with PHOTO + Name + Code + Status */}
                <div className="flex items-center justify-between px-4 py-3 border-b dark:border-neutral-800">
                  <div className="flex items-center gap-3">
                    {(() => {
                      const url = resolvePhotoUrl((selectedRaw && selectedRaw.profilePhoto) || null);
                      const initials = initialsFrom(selectedRaw?.firstName, selectedRaw?.middleName, selectedRaw?.lastName) || "U";
                      return url ? (
                        <img
                          src={url}
                          alt={modalData.name || "User photo"}
                          className="h-14 w-14 rounded-full object-cover border dark:border-neutral-800"
                        />
                      ) : (
                        <div className="h-14 w-14 rounded-full grid place-items-center text-white font-semibold"
                             style={{ background: "linear-gradient(135deg,#22c55e,#facc15)" }}>
                          {initials}
                        </div>
                      );
                    })()}

                    <div className="flex flex-col">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold dark:text-white">
                          {modalData.name || "User details"}
                        </h3>

                        {modalData.code ? (
                          <span
                            className="text-xs px-2 py-0.5 rounded border dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 text-gray-700 dark:text-gray-200"
                            title="User Code"
                          >
                            {modalData.code}
                          </span>
                        ) : null}

                        {modalData.status ? (
                          <span
                            className={"text-xs px-2 py-0.5 rounded border " + statusBadgeClass(modalData.status)}
                            title="User Status"
                          >
                            {modalData.status}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <button
                    className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50 dark:hover:bg-neutral-800"
                    onClick={closeModal}
                  >
                    Close
                  </button>
                </div>

                {/* Body */}
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <Field label="Code"         value={modalData.code} />
                  <Field label="Name"         value={modalData.name} />
                  <Field label="Client?"      value={fmtBool(modalData.isClient)} />
                  <Field label="Project(s)"   value={modalData.projects} />
                  <Field label="ServiceProvider?" value={fmtBool(modalData.isServiceProvider)} />
                  <Field label="Company(ies)" value={modalData.companies} />
                  <Field label="Email"        value={modalData.email} />
                  <Field label="Mobile"       value={modalData.mobile} />
                  <Field label="State"        value={modalData.state} />
                  <Field label="Zone"         value={modalData.zone} />
                  <Field label="Status"       value={modalData.status} />
                  <Field label="Created"      value={fmtDate(modalData.created)} />
                  <Field label="Updated"      value={fmtDate(modalData.updated)} />
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

// Small presentational helper for modal fields
function Field({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex flex-col">
      <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-0.5 font-medium dark:text-white break-words">{value || ""}</div>
    </div>
  );
}
