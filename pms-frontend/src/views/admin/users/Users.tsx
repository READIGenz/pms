// pms-frontend/src/views/admin/users/Users.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { api } from "../../../api/client";

declare global {
  interface Window {
    __ADMIN_SUBTITLE__?: string;
  }
}

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
const fmtBool = (v: any) =>
  v === null || v === undefined ? "" : v ? "✓" : "✗";
const fmtDate = (v: any) =>
  isIsoLike(v) ? new Date(v).toLocaleString() : v ?? "";

// --- Photo helpers ---
function resolvePhotoUrl(path?: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = (api.defaults.baseURL || "").replace(/\/+$/, "");
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
}
function initialsFrom(first?: string, middle?: string, last?: string) {
  const parts = [first, middle, last]
    .filter(Boolean)
    .map((s) => String(s).trim());
  const letters = parts
    .map((p) => p[0]?.toUpperCase())
    .filter(Boolean) as string[];
  return (letters[0] || "") + (letters[1] || "");
}

// --- UI helper: status pill color ---
function statusBadgeClass(status?: string | null) {
  const s = String(status || "").toLowerCase();
  if (s === "active")
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/25 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-700/60";
  if (s === "inactive" || s === "disabled")
    return "bg-slate-100 text-slate-800 dark:bg-neutral-800/70 dark:text-slate-200 border-slate-200/60 dark:border-white/10";
  if (s === "blocked" || s === "suspended")
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/25 dark:text-amber-300 border-amber-200/60 dark:border-amber-700/60";
  if (s === "deleted")
    return "bg-rose-100 text-rose-800 dark:bg-rose-900/25 dark:text-rose-300 border-rose-200/60 dark:border-rose-700/60";
  return "bg-blue-100 text-blue-800 dark:bg-blue-900/25 dark:text-blue-300 border-blue-200/60 dark:border-blue-700/60";
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
type CompanyRef = {
  companyId: string;
  name: string;
  companyRole: string;
  status: string;
};

// ----- Column definition (order) -----
const headings: { key: keyof DisplayRow; label: string }[] = [
  { key: "action", label: "Action" },
  { key: "code", label: "Code" },
  { key: "name", label: "Name" },
  { key: "isClient", label: "Client?" },
  { key: "projects", label: "Project(s)" },
  { key: "isServiceProvider", label: "ServiceProvider?" },
  { key: "companies", label: "Company(ies)" },
  { key: "email", label: "Email" },
  { key: "mobile", label: "Mobile" },
  { key: "state", label: "State" },
  { key: "zone", label: "Zone" },
  { key: "status", label: "Status" },
  { key: "updated", label: "Updated" },
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
  const [isClientFilter, setIsClientFilter] = useState<"all" | "yes" | "no">(
    "all"
  );
  const [isServiceProviderFilter, setIsServiceProviderFilter] = useState<
    "all" | "yes" | "no"
  >("all");
  const [stateFilter, setStateFilter] = useState<string>("");
  const [zoneFilter, setZoneFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // --- derive options from refs/data ---
  const stateOptions = useMemo(() => {
    const names = statesRef.map((s) => s.name).filter(Boolean);
    if (names.length > 0)
      return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
    const fallback = new Set<string>();
    rows.forEach((r) => {
      if (r.state?.trim()) fallback.add(r.state.trim());
    });
    return Array.from(fallback).sort((a, b) => a.localeCompare(b));
  }, [statesRef, rows]);

  const zoneOptions = useMemo(() => {
    const z = new Set<string>();
    rows.forEach((r) => {
      if (r.zone?.trim()) z.add(r.zone.trim());
    });
    return Array.from(z).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const statusOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => {
      const v = (r.status ?? "").toString().trim();
      if (v) s.add(v);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
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

  // --- Page title/subtitle (AdminHome header bar uses this) ---
  useEffect(() => {
    document.title = "Trinity PMS — Users";
    window.__ADMIN_SUBTITLE__ =
      "Browse user records, filter, search, export, and manage user details.";
    return () => {
      window.__ADMIN_SUBTITLE__ = "";
    };
  }, []);

  // --- Load refs (states, districts, companies) with graceful degradation ---
  const loadRefs = async (districtsForStateName?: string) => {
    setRefsErr(null);
    const results = await Promise.allSettled([
      api.get("/admin/states"),
      api.get("/admin/companies-brief"),
    ]);

    if (results[0].status === "fulfilled") {
      const sdata: any = results[0].value.data;
      setStatesRef(Array.isArray(sdata) ? sdata : sdata?.states || []);
    } else {
      const status = (results[0] as any)?.reason?.response?.status;
      setStatesRef([]);
      setRefsErr(
        status === 404
          ? "Not Found (showing discovered state names instead)"
          : (results[0] as any)?.reason?.response?.data?.error ||
              "Failed to load reference data."
      );
    }

    if (results[1].status === "fulfilled") {
      const cdata: any = results[1].value.data;
      setCompaniesRef(Array.isArray(cdata) ? cdata : cdata?.companies || []);
    } else {
      if (!refsErr) {
        setRefsErr(
          (results[1] as any)?.reason?.response?.data?.error ||
            "Failed to load reference data."
        );
      }
    }

    try {
      let stateId: string | undefined;
      if (districtsForStateName && statesRef.length > 0) {
        const match = statesRef.find(
          (s) => s.name?.trim() === districtsForStateName.trim()
        );
        stateId = match?.stateId;
      }
      const { data: dResp } = await api.get("/admin/districts", {
        params: stateId ? { stateId } : undefined,
      });
      const dlist = Array.isArray(dResp) ? dResp : dResp?.districts || [];
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
      const { data } = await api.get("/admin/users", {
        params: { includeMemberships: "1" },
      });
      const list: any[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.users)
        ? data.users
        : [];

      const rawMap: Record<string, RawUser> = {};
      const normalized: DisplayRow[] = list.map((u) => {
        rawMap[u.userId] = u;

        const name = [u.firstName, u.middleName, u.lastName]
          .filter(Boolean)
          .join(" ")
          .trim();
        const mobile = [u.countryCode, u.phone]
          .filter(Boolean)
          .join(" ")
          .trim();

        const memberships: any[] = Array.isArray(u.userRoleMemberships)
          ? u.userRoleMemberships
          : [];
        const projectTitles = Array.from(
          new Set(
            memberships
              .map((m) => m?.project?.title)
              .filter((s: any) => typeof s === "string" && s.trim())
          )
        );
        const companyNames = Array.from(
          new Set(
            memberships
              .map((m) => m?.company?.name)
              .filter((s: any) => typeof s === "string" && s.trim())
          )
        );

        const row: DisplayRow = {
          action: "",
          code: u.code ?? "",
          name,
          isClient: typeof u.isClient === "boolean" ? u.isClient : null,
          projects: projectTitles.join(", "),
          isServiceProvider:
            typeof u.isServiceProvider === "boolean"
              ? u.isServiceProvider
              : null,
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
      const msg =
        s === 401
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

  useEffect(() => {
    loadRefs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (statesRef.length === 0) return;
    loadRefs(stateFilter || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateFilter]);

  const filteredByControls = useMemo(() => {
    return rows.filter((r) => {
      if (isClientFilter !== "all") {
        const v =
          r.isClient === true ? "yes" : r.isClient === false ? "no" : "no";
        if (v !== isClientFilter) return false;
      }
      if (isServiceProviderFilter !== "all") {
        const v =
          r.isServiceProvider === true
            ? "yes"
            : r.isServiceProvider === false
            ? "no"
            : "no";
        if (v !== isServiceProviderFilter) return false;
      }
      if (stateFilter && r.state.trim() !== stateFilter.trim()) return false;
      if (zoneFilter && r.zone.trim() !== zoneFilter.trim()) return false;
      if (statusFilter && r.status.trim() !== statusFilter.trim()) return false;
      return true;
    });
  }, [
    rows,
    isClientFilter,
    isServiceProviderFilter,
    stateFilter,
    zoneFilter,
    statusFilter,
  ]);

  const filtered = useMemo(() => {
    const needle = qDebounced.trim().toLowerCase();
    if (!needle) return filteredByControls;
    return filteredByControls.filter((r) =>
      Object.values(r).some((v) =>
        String(v ?? "")
          .toLowerCase()
          .includes(needle)
      )
    );
  }, [filteredByControls, qDebounced]);

  const cmp = (a: any, b: any) => {
    if (a === b) return 0;
    if (a === null || a === undefined) return -1;
    if (b === null || b === undefined) return 1;
    const aTime =
      typeof a === "string" && isIsoLike(a) ? new Date(a).getTime() : NaN;
    const bTime =
      typeof b === "string" && isIsoLike(b) ? new Date(b).getTime() : NaN;
    if (!Number.isNaN(aTime) && !Number.isNaN(bTime)) return aTime - bTime;
    if (typeof a === "boolean" && typeof b === "boolean")
      return (a ? 1 : 0) - (b ? 1 : 0);
    const an = Number(a);
    const bn = Number(b);
    if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
    return String(a).localeCompare(String(b));
  };

  const sorted = useMemo(() => {
    if (!sortKey || sortKey === "action") return filtered;
    const copy = [...filtered];
    copy.sort((ra, rb) => {
      const delta = cmp((ra as any)[sortKey], (rb as any)[sortKey]);
      return sortDir === "asc" ? delta : -delta;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageSafe = Math.min(Math.max(1, page), totalPages);

  const paged = useMemo(() => {
    const start = (pageSafe - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, pageSafe, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPages]);

  const onView = (id: string) => nav(`/admin/users/${id}`);
  const onEdit = (id: string) => nav(`/admin/users/${id}/edit`);

  const exportCsv = () => {
    const cols = headings.map((h) => h.label);
    const lines = [
      cols.join(","),
      ...sorted.map((r) =>
        headings
          .map((h) =>
            JSON.stringify(h.key === "action" ? "" : (r as any)[h.key] ?? "")
          )
          .join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "users.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedRaw: RawUser | null = modalUserId
    ? rawById[modalUserId] ?? null
    : null;

  const modalData = (() => {
    if (!selectedRaw) return null;
    const u = selectedRaw;
    const name = [u.firstName, u.middleName, u.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    const mobile = [u.countryCode, u.phone].filter(Boolean).join(" ").trim();

    const memberships: any[] = Array.isArray(u.userRoleMemberships)
      ? u.userRoleMemberships
      : [];
    const projectTitles = Array.from(
      new Set(
        memberships
          .map((m) => m?.project?.title)
          .filter((s: any) => typeof s === "string" && s.trim())
      )
    );
    const companyNames = Array.from(
      new Set(
        memberships
          .map((m) => m?.company?.name)
          .filter((s: any) => typeof s === "string" && s.trim())
      )
    );

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
    !zoneFilter &&
    !statusFilter;

  /* ========================= UI-only tokens ========================= */
  // smaller buttons like Companies page
  const pill =
    "h-8 rounded-full border px-3 text-[11px] font-semibold shadow-sm transition " +
    "focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-neutral-950 active:scale-[0.98]";
  const pillLight =
    "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 " +
    "dark:border-white/10 dark:bg-neutral-950 dark:text-slate-200 dark:hover:bg-white/5";
  const pillPrimary =
    "bg-[#00379C] text-white hover:brightness-110 border-transparent focus:ring-[#00379C]/35";
  const pillTeal =
    "bg-[#23A192] text-white hover:brightness-110 border-transparent focus:ring-[#23A192]/35";
  const pillGold =
    "bg-[#FCC020] text-slate-900 hover:brightness-105 border-transparent focus:ring-[#FCC020]/40";

  return (
    <div className="w-full">
      <div className="mx-auto max-w-6xl">
        {/* Top controls block */}
        <div className="mb-4">
          <div className="flex flex-col gap-3 mt-4">
            {/* Row 1: LEFT (3/5) filters + RIGHT (2/5) actions */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
              {/* LEFT 3/5 */}
              <div className="lg:basis-3/5 lg:pr-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className={`${pill} ${pillLight}`}
                    title="Filter: Client?"
                    value={isClientFilter}
                    onChange={(e) => {
                      setIsClientFilter(e.target.value as any);
                      setPage(1);
                    }}
                  >
                    <option value="all">Client: All</option>
                    <option value="yes">Client: Yes</option>
                    <option value="no">Client: No</option>
                  </select>

                  <select
                    className={`${pill} ${pillLight}`}
                    title="Filter: Service Provider?"
                    value={isServiceProviderFilter}
                    onChange={(e) => {
                      setIsServiceProviderFilter(e.target.value as any);
                      setPage(1);
                    }}
                  >
                    <option value="all">ServiceProv: All</option>
                    <option value="yes">ServiceProv: Yes</option>
                    <option value="no">ServiceProv: No</option>
                  </select>

                  <select
                    className={`${pill} ${pillLight}`}
                    title="Filter by State"
                    value={stateFilter}
                    onChange={(e) => {
                      setStateFilter(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">State: All</option>
                    {stateOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>

                  <select
                    className={`${pill} ${pillLight}`}
                    title="Filter by Zone"
                    value={zoneFilter}
                    onChange={(e) => {
                      setZoneFilter(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">Zone: All</option>
                    {zoneOptions.map((z) => (
                      <option key={z} value={z}>
                        {z}
                      </option>
                    ))}
                  </select>

                  <select
                    className={`${pill} ${pillLight}`}
                    title="Filter by Status"
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">Status: All</option>
                    {statusOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    className={`${pill} ${pillLight}`}
                    title="Clear all filters"
                    onClick={() => {
                      setIsClientFilter("all");
                      setIsServiceProviderFilter("all");
                      setStateFilter("");
                      setZoneFilter("");
                      setStatusFilter("");
                      setPage(1);
                    }}
                    disabled={filtersAreDefault}
                  >
                    Clear
                  </button>

                  {refsErr ? (
                    <span className="ml-1 text-xs text-amber-700 dark:text-amber-300">
                      {refsErr}
                    </span>
                  ) : null}
                </div>
              </div>

              {/* RIGHT 2/5 */}
              <div className="lg:basis-2/5 lg:pl-3">
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 lg:justify-end">
                  <select
                    className={`${pill} ${pillLight}`}
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    title="Rows per page"
                  >
                    {[10, 20, 50, 100].map((n) => (
                      <option key={n} value={n}>
                        {n} / page
                      </option>
                    ))}
                  </select>

                  {/* Refresh text button (no icon) */}
                  <button
                    onClick={() => {
                      loadRefs(stateFilter || undefined);
                      loadUsers();
                    }}
                    className={`${pill} ${pillTeal}`}
                    disabled={loading}
                    title="Refresh"
                    type="button"
                  >
                    Refresh
                  </button>

                  <button
                    onClick={() => nav("/admin/users/new")}
                    className={`${pill} ${pillPrimary}`}
                    title="Create a new user"
                    type="button"
                  >
                    + New User
                  </button>
                </div>
              </div>
            </div>

            {/* Row 2: Search + Export aligned */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="w-full sm:w-[360px]">
                <input
                  className={
                    "h-8 w-full rounded-full border border-slate-200 bg-white px-4 text-[12px] text-slate-800 placeholder:text-slate-400 shadow-sm " +
                    "focus:outline-none focus:ring-2 focus:ring-[#00379C]/30 focus:border-transparent " +
                    "dark:border-white/10 dark:bg-neutral-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:ring-[#FCC020]/25"
                  }
                  placeholder="Search..."
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(1);
                  }}
                />
              </div>

              <div className="flex items-center justify-end">
                <button
                  onClick={exportCsv}
                  className={`${pill} ${pillLight}`}
                  title="Export filtered result as CSV"
                  type="button"
                >
                  Export CSV
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-white/10 dark:bg-neutral-950">
          {err && (
            <div className="p-4 text-sm text-rose-700 dark:text-rose-300 border-b border-slate-200 dark:border-white/10">
              {err}
            </div>
          )}

          <div
            className="overflow-auto thin-scrollbar"
            style={{ maxHeight: "65vh" }}
          >
            {loading ? (
              <div className="p-6 text-sm text-slate-600 dark:text-slate-300">
                Fetching users…
              </div>
            ) : rows.length === 0 ? (
              <div className="p-6 text-sm text-slate-600 dark:text-slate-300">
                No users found.
              </div>
            ) : (
              <table className="min-w-full border-separate border-spacing-0 text-[13px]">
                <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur dark:bg-neutral-950/95">
                  <tr>
                    {headings.map(({ key, label }) => {
                      const active = sortKey === key;
                      const dir = active ? sortDir : undefined;
                      const sortable = key !== "action";
                      return (
                        <th
                          key={String(key)}
                          className={
                            "text-left font-extrabold text-[11px] uppercase tracking-wide " +
                            "text-slate-600 dark:text-slate-200 " +
                            "px-3 py-2.5 border-b border-slate-200 dark:border-white/10 whitespace-nowrap select-none " +
                            (sortable ? "cursor-pointer" : "")
                          }
                          title={sortable ? `Sort by ${label}` : undefined}
                          onClick={() => {
                            if (!sortable) return;
                            if (sortKey !== key) {
                              setSortKey(key);
                              setSortDir("asc");
                            } else {
                              setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                            }
                          }}
                          aria-sort={
                            sortable
                              ? active
                                ? dir === "asc"
                                  ? "ascending"
                                  : "descending"
                                : "none"
                              : undefined
                          }
                        >
                          <span className="inline-flex items-center gap-1">
                            {label}
                            {sortable && (
                              <span
                                className="text-[10px] opacity-70"
                                style={{ color: active ? "#00379C" : undefined }}
                              >
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
                      className="border-b border-slate-100/80 dark:border-white/5 hover:bg-[#00379C]/[0.03] dark:hover:bg-white/[0.03]"
                    >
                      <td className="px-2 py-1.5 whitespace-nowrap align-middle">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#23A192] hover:bg-[#23A192]/10 active:scale-[0.98] dark:hover:bg-[#23A192]/15"
                            onClick={() => onView(row._id)}
                            title="View user"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.7"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M2.5 12C4 8.5 7.6 6 12 6s8 2.5 9.5 6c-1.5 3.5-5.1 6-9.5 6s-8-2.5-9.5-6z" />
                              <circle cx="12" cy="12" r="3.25" />
                            </svg>
                          </button>

                          <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#00379C] hover:bg-[#00379C]/10 active:scale-[0.98] dark:hover:bg-[#00379C]/15"
                            onClick={() => onEdit(row._id)}
                            title="Edit user"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.7"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M4 20h4l10.5-10.5-4-4L4 16v4z" />
                              <path d="M14.5 5.5l4 4" />
                            </svg>
                          </button>
                        </div>
                      </td>

                      <td className="px-3 py-1.5 whitespace-nowrap align-middle text-slate-800 dark:text-slate-100">
                        {row.code}
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap align-middle text-slate-800 dark:text-slate-100">
                        {row.name}
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap align-middle">
                        {fmtBool(row.isClient)}
                      </td>
                      <td
                        className="px-3 py-1.5 whitespace-nowrap align-middle"
                        title={row.projects}
                      >
                        {row.projects}
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap align-middle">
                        {fmtBool(row.isServiceProvider)}
                      </td>
                      <td
                        className="px-3 py-1.5 whitespace-nowrap align-middle"
                        title={row.companies}
                      >
                        {row.companies}
                      </td>
                      <td
                        className="px-3 py-1.5 whitespace-nowrap align-middle"
                        title={row.email}
                      >
                        {row.email}
                      </td>
                      <td
                        className="px-3 py-1.5 whitespace-nowrap align-middle"
                        title={row.mobile}
                      >
                        {row.mobile}
                      </td>
                      <td
                        className="px-3 py-1.5 whitespace-nowrap align-middle"
                        title={row.state}
                      >
                        {row.state}
                      </td>
                      <td
                        className="px-3 py-1.5 whitespace-nowrap align-middle"
                        title={row.zone}
                      >
                        {row.zone}
                      </td>
                      <td
                        className="px-3 py-1.5 whitespace-nowrap align-middle"
                        title={row.status}
                      >
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(
                            row.status
                          )}`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td
                        className="px-3 py-1.5 whitespace-nowrap align-middle"
                        title={fmtDate(row.updated)}
                      >
                        {fmtDate(row.updated)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination footer */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 py-2 text-sm border-t border-slate-200 dark:border-white/10">
            <div className="text-slate-600 dark:text-slate-300">
              Page <b>{pageSafe}</b> of <b>{totalPages}</b> · Showing{" "}
              <b>{paged.length}</b> of <b>{total}</b> records
            </div>

            <div className="flex flex-wrap items-center gap-1 justify-end">
              <button
                className={`${pill} ${pillLight}`}
                onClick={() => setPage(1)}
                disabled={pageSafe <= 1}
                title="First"
              >
                « First
              </button>
              <button
                className={`${pill} ${pillLight}`}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pageSafe <= 1}
                title="Previous"
              >
                ‹ Prev
              </button>
              <button
                className={`${pill} ${pillLight}`}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={pageSafe >= totalPages}
                title="Next"
              >
                Next ›
              </button>
              <button
                className={`${pill} ${pillLight}`}
                onClick={() => setPage(totalPages)}
                disabled={pageSafe >= totalPages}
                title="Last"
              >
                Last »
              </button>
            </div>
          </div>
        </div>

        {/* Modal (UPDATED: categorized blocks like Companies) */}
        {modalData && (
          <div className="fixed inset-0 z-40">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={closeModal}
              aria-hidden="true"
            />
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden dark:border-white/10 dark:bg-neutral-950">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/10">
                  <div className="flex items-center gap-3">
                    {(() => {
                      const url = resolvePhotoUrl(
                        (selectedRaw && selectedRaw.profilePhoto) || null
                      );
                      const initials =
                        initialsFrom(
                          selectedRaw?.firstName,
                          selectedRaw?.middleName,
                          selectedRaw?.lastName
                        ) || "U";
                      return url ? (
                        <img
                          src={url}
                          alt={modalData.name || "User photo"}
                          className="h-14 w-14 rounded-full object-cover border border-slate-200 dark:border-white/10"
                        />
                      ) : (
                        <div
                          className="h-14 w-14 rounded-full grid place-items-center text-white font-extrabold"
                          style={{
                            background:
                              "linear-gradient(135deg,#00379C,#23A192)",
                          }}
                        >
                          {initials}
                        </div>
                      );
                    })()}
                    <div className="flex flex-col">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                          {modalData.name || "User details"}
                        </h3>
                        {modalData.code ? (
                          <span className="text-xs px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200">
                            {modalData.code}
                          </span>
                        ) : null}
                        {modalData.status ? (
                          <span
                            className={
                              "text-xs px-2 py-0.5 rounded-full border " +
                              statusBadgeClass(modalData.status)
                            }
                          >
                            {modalData.status}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 h-1 w-10 rounded-full bg-[#FCC020]" />
                    </div>
                  </div>

                  <button className={`${pill} ${pillLight}`} onClick={closeModal}>
                    Close
                  </button>
                </div>

                <div className="p-4 max-h-[70vh] overflow-auto thin-scrollbar">
                  <div className="flex flex-col gap-4">
                    <SectionBlock title="Basic">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <Field label="Code" value={modalData.code} />
                        <Field label="Status" value={modalData.status} />
                        <div className="sm:col-span-2">
                          <Field label="Name" value={modalData.name} />
                        </div>
                        <Field label="Client?" value={fmtBool(modalData.isClient)} />
                        <Field
                          label="Service Provider?"
                          value={fmtBool(modalData.isServiceProvider)}
                        />
                      </div>
                    </SectionBlock>

                    <SectionBlock title="Assignments">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div className="sm:col-span-2">
                          <Field label="Project(s)" value={modalData.projects} />
                        </div>
                        <div className="sm:col-span-2">
                          <Field label="Company(ies)" value={modalData.companies} />
                        </div>
                      </div>
                    </SectionBlock>

                    <SectionBlock title="Contact">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <Field label="Email" value={modalData.email} />
                        <Field label="Mobile" value={modalData.mobile} />
                      </div>
                    </SectionBlock>

                    <SectionBlock title="Operational">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <Field label="State" value={modalData.state} />
                        <Field label="Zone" value={modalData.zone} />
                      </div>
                    </SectionBlock>

                    <SectionBlock title="Audit">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <Field label="Created" value={fmtDate(modalData.created)} />
                        <Field label="Updated" value={fmtDate(modalData.updated)} />
                      </div>
                    </SectionBlock>
                  </div>
                </div>

                <div className="px-4 py-3 border-t border-slate-200 dark:border-white/10 text-right">
                  <button className={`${pill} ${pillGold}`} onClick={closeModal}>
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <style>
          {`
            .thin-scrollbar::-webkit-scrollbar { height: 6px; width: 6px; }
            .thin-scrollbar::-webkit-scrollbar-track { background: transparent; }
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
    </div>
  );
}

function SectionBlock({ title, children }: { title: string; children: any }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-950">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-1 w-5 rounded-full bg-[#FCC020]" />
        <div className="text-[12px] font-extrabold uppercase tracking-wide text-slate-700 dark:text-slate-200">
          {title}
        </div>
      </div>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex flex-col">
      <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-0.5 font-medium dark:text-white break-words">
        {value || ""}
      </div>
    </div>
  );
}
