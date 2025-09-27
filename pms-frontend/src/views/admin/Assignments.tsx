// pms-frontend/src/views/admin/assignments/Assignments.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";

// UI roles (map IH-PMT <-> Ava-PMT for DB)
const USER_ROLES = ["Client","Contractor","Consultant","PMC","Supplier","IH-PMT"] as const;
type UserRoleLite = typeof USER_ROLES[number];
const toServerRole = (r: string) => (r === "IH-PMT" ? "Ava-PMT" : r);
const fromServerRole = (r: string) => (r === "Ava-PMT" ? "IH-PMT" : r);

// --- Types (from prisma schema) ---
type ProjectLite = { projectId: string; title: string };
type MembershipLite = {
  role?: string | null;
  project?: { projectId?: string; title?: string } | null;
  company?: { companyId?: string; name?: string } | null;
};
type UserLite = {
  userId: string;
  code?: string | null;
  firstName: string;
  middleName?: string | null;
  lastName?: string | null;
  countryCode?: string | null;
  phone?: string | null;
  email?: string | null;
  state?: { stateId: string; name: string; code: string } | null;
  district?: { districtId: string; name: string } | null;
  operatingZone?: string | null;
  isClient?: boolean | null;
  userStatus?: string | null; // "Active" | "Inactive"
  createdAt?: string | null;
  updatedAt?: string | null;
  userRoleMemberships?: MembershipLite[];
};
type StateRef = { stateId: string; name: string; code: string };
type DistrictRef = { districtId: string; name: string; stateId: string };

function displayName(u: UserLite) {
  return [u.firstName, u.middleName, u.lastName].filter(Boolean).join(" ").trim();
}
function phoneDisplay(u: UserLite) {
  return [u.countryCode, u.phone].filter(Boolean).join(" ").trim();
}
function projectsLabel(u: UserLite): string {
  const mem = Array.isArray(u.userRoleMemberships) ? u.userRoleMemberships : [];
  const set = new Set(mem.map((m) => m?.project?.title).filter(Boolean) as string[]);
  return Array.from(set).join(", ");
}
function isClientUser(u: UserLite): boolean {
  if (u.isClient === true) return true;
  const mem = Array.isArray(u.userRoleMemberships) ? u.userRoleMemberships : [];
  return mem.some((m) => String(fromServerRole(String(m?.role || ""))).toLowerCase() === "client");
}
function todayISODate() { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString().slice(0, 10); }
function addDaysISO(dateISO: string, days: number) {
  const d = new Date(dateISO + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
const isIsoLike = (v: any) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v);
const fmtDate = (v: any) => (isIsoLike(v) ? new Date(v).toLocaleString() : (v ?? ""));

// Small tile header helper
const TileHeader = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <div className="mb-3">
    <div className="text-sm font-semibold dark:text-white">{title}</div>
    {subtitle ? <div className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</div> : null}
  </div>
);

export default function Assignments() {
  const nav = useNavigate();

  // --- Auth gate ---
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) nav("/login", { replace: true });
  }, [nav]);

  // --- Common state ---
  const [err, setErr] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  const [role, setRole] = useState<UserRoleLite>("Client");

  // Tile 2 (client assignment) bits
  const [clients, setClients] = useState<UserLite[]>([]);
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set()); // multi-select via checkboxes
  const [validFrom, setValidFrom] = useState<string>(todayISODate());
  const [validTo, setValidTo] = useState<string>("");

  // Keep track of users moved from Tile 3 to Tile 2
  const [movedClientIds, setMovedClientIds] = useState<Set<string>>(new Set());

  // --- Load projects ---
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setErr(null);
        const { data } = await api.get("/admin/projects");
        const list: any[] = Array.isArray(data) ? data : (data?.projects ?? []);
        const minimal: ProjectLite[] = list
          .map((p: any) => ({ projectId: p.projectId || p.id || p.uuid, title: p.title || p.name }))
          .filter((p: ProjectLite) => p.projectId && p.title);
        if (!alive) return;
        setProjects(minimal);
        if (minimal.length > 0 && !selectedProjectId) setSelectedProjectId(minimal[0].projectId);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.response?.data?.error || e?.message || "Failed to load projects.");
      }
    })();
    return () => { alive = false; };
  }, [selectedProjectId]);

  // --- Tile 3 (Browse Clients) data + refs ---
  const [allUsers, setAllUsers] = useState<UserLite[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersErr, setUsersErr] = useState<string | null>(null);

  const [statesRef, setStatesRef] = useState<StateRef[]>([]);
  const [districtsRef, setDistrictsRef] = useState<DistrictRef[]>([]);

  // filters (Tile 3)
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "Active" | "Inactive">("all");
  const [stateFilter, setStateFilter] = useState<string>("");
  const [districtFilter, setDistrictFilter] = useState<string>("");

  // sorting & pagination (Tile 3)
  const [sortKey, setSortKey] = useState<"code"|"name"|"projects"|"mobile"|"email"|"state"|"zone"|"status"|"updated">("name");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Load users (with memberships) for the table
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setUsersLoading(true);
        setUsersErr(null);
        const { data } = await api.get("/admin/users", { params: { includeMemberships: "1" } });
        const list = (Array.isArray(data) ? data : (data?.users ?? [])) as UserLite[];
        if (!alive) return;
        setAllUsers(list);
      } catch (e: any) {
        if (!alive) return;
        setUsersErr(e?.response?.data?.error || e?.message || "Failed to load users.");
      } finally {
        if (alive) setUsersLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Load states
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get("/admin/states");
        const s = (Array.isArray(data) ? data : (data?.states ?? [])) as StateRef[];
        if (!alive) return;
        setStatesRef(s);
      } catch {
        setStatesRef([]);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Load districts whenever a concrete state is selected
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!stateFilter) { setDistrictsRef([]); return; }
        const st = statesRef.find(s => s.name === stateFilter);
        const params = st?.stateId ? { stateId: st.stateId } : undefined;
        const { data } = await api.get("/admin/districts", { params });
        const d = (Array.isArray(data) ? data : (data?.districts ?? [])) as DistrictRef[];
        if (!alive) return;
        setDistrictsRef(d);
      } catch {
        setDistrictsRef([]);
      }
    })();
    return () => { alive = false; };
  }, [stateFilter, statesRef]);

  // --- Tile 3 transform (Clients table) ---
  type Row = {
    action: string;
    code: string;
    name: string;
    projects: string;
    mobile: string;
    email: string;
    state: string;
    zone: string;
    status: string;
    updated: string;
    _id: string;
    _raw?: UserLite;
  };

  const clientsRows = useMemo<Row[]>(() => {
    const moved = movedClientIds;

    const onlyClients = allUsers
      .filter(isClientUser)
      // Hide users that have been "moved" to Tile 2
      .filter((u) => !moved.has(u.userId));

    // Apply filters
    const filtered = onlyClients.filter((u) => {
      if (statusFilter !== "all") {
        if (String(u.userStatus || "") !== statusFilter) return false;
      }
      if (stateFilter) {
        const sName = u?.state?.name || "";
        if (sName.trim() !== stateFilter.trim()) return false;
      }
      if (districtFilter) {
        const dName = u?.district?.name || "";
        if (dName.trim() !== districtFilter.trim()) return false;
      }
      return true;
    });

    // Text search
    const needle = q.trim().toLowerCase();
    const searched = needle
      ? filtered.filter((u) => {
          const hay = [
            u.code || "",
            displayName(u),
            projectsLabel(u),
            phoneDisplay(u),
            u.email || "",
            u?.state?.name || "",
            u?.district?.name || "",
            u.operatingZone || "",
            u.userStatus || "",
            fmtDate(u.updatedAt),
          ].join(" ").toLowerCase();
          return hay.includes(needle);
        })
      : filtered;

    // Map to display rows
    const rows: Row[] = searched.map((u) => ({
      action: "",
      code: u.code || "",
      name: displayName(u),
      projects: projectsLabel(u),
      mobile: phoneDisplay(u),
      email: u.email || "",
      state: u?.state?.name || "",
      zone: u.operatingZone || "",
      status: u.userStatus || "",
      updated: u.updatedAt || "",
      _id: u.userId,
      _raw: u,
    }));

    // Sort
    const key = sortKey;
    const dir = sortDir;
    const cmp = (a: any, b: any) => {
      if (a === b) return 0;
      if (a === null || a === undefined) return -1;
      if (b === null || b === undefined) return 1;
      const aTime = (typeof a === "string" && isIsoLike(a)) ? new Date(a).getTime() : NaN;
      const bTime = (typeof b === "string" && isIsoLike(b)) ? new Date(b).getTime() : NaN;
      if (!Number.isNaN(aTime) && !Number.isNaN(bTime)) return aTime - bTime;
      const an = Number(a), bn = Number(b);
      if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
      return String(a).localeCompare(String(b));
    };
    rows.sort((ra, rb) => {
      const delta = cmp((ra as any)[key], (rb as any)[key]);
      return dir === "asc" ? delta : -delta;
    });

    return rows;
  }, [allUsers, statusFilter, stateFilter, districtFilter, q, sortKey, sortDir, movedClientIds]);

  // Pagination
  const total = clientsRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageSafe = Math.min(Math.max(1, page), totalPages);
  const rowsPaged = useMemo<Row[]>(() => {
    const start = (pageSafe - 1) * pageSize;
    return clientsRows.slice(start, start + pageSize);
  }, [clientsRows, pageSafe, pageSize]);

  useEffect(() => { if (page > totalPages) setPage(totalPages); /* keep in bounds */ }, [totalPages]); // eslint-disable-line

  // --- Submit (preview for now) ---
  const canSubmit =
    selectedProjectId &&
    role &&
    (role !== "Client" || (selectedClientIds.size > 0 && validFrom && validTo));

  const onAssign = async () => {
    const selectedIds = Array.from(selectedClientIds);
    const payload: any = {
      scopeType: "Project",
      projectId: selectedProjectId,
      role: toServerRole(role),
    };
    if (role === "Client") {
      if (selectedIds.length > 1) {
        payload.userIds = selectedIds; // multi-select
      } else {
        payload.userId = selectedIds[0]; // single
      }
      payload.validFrom = validFrom || null;
      payload.validTo = validTo || null;
      // server will compute status
    }
    alert("Preview payload (no DB write yet):\n" + JSON.stringify(payload, null, 2));
  };

  // --- Move handler: move user from Tile 3 table to Tile 2 list ---
  const onMoveToTile2 = (user: UserLite) => {
    setClients((prev) => (prev.some((u) => u.userId === user.userId) ? prev : [user, ...prev]));
    setMovedClientIds((prev) => { const next = new Set(prev); next.add(user.userId); return next; });
    setSelectedClientIds((prev) => { const next = new Set(prev); next.add(user.userId); return next; });
    const el = document.querySelector('[data-tile-name="Roles & Options"]');
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ---- UI helpers for Tile 2 (moved list)
  const movedClientsList = useMemo<UserLite[]>(() => {
    if (movedClientIds.size === 0) return [];
    return clients.filter((u) => movedClientIds.has(u.userId));
  }, [clients, movedClientIds]);

  const toggleClientChecked = (id: string) => {
    setSelectedClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Keep Valid To strictly greater than Valid From
  const validToMin = validFrom ? addDaysISO(validFrom, 1) : "";
  useEffect(() => {
    if (validFrom && validTo && validTo <= validFrom) {
      // If currently invalid, clear Valid To
      setValidTo("");
    }
  }, [validFrom, validTo]);

  // --- Cancel behavior in Tile 2 ---
  const onCancelTile2 = () => {
    // Clear dates completely (both fields)
    setValidFrom("");
    setValidTo("");
    // Unselect all moved clients
    setSelectedClientIds(new Set());
    // Send all moved clients back to the table (clear moved set)
    setMovedClientIds(new Set());
    // Optional: scroll to Browse Clients
    const el = document.querySelector('[data-tile-name="Browse Clients"]');
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-yellow-50 dark:from-neutral-900 dark:to-neutral-950 px-4 sm:px-6 lg:px-10 py-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold dark:text-white">Assignments</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Tiles: Projects · Roles & Options · <b>Browse Clients</b>
          </p>
          {err && <p className="mt-2 text-sm text-red-700 dark:text-red-400">{err}</p>}
        </div>

        {/* ===== Tile 1 — Projects ===== */}
        <section className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border dark:border-neutral-800 p-4 mb-4" aria-label="Tile: Projects" data-tile-name="Projects">
          <TileHeader title="Tile 1 — Projects" subtitle="Choose the project to assign." />
          <div className="max-w-xl">
            <label className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1 block">Project</label>
            <select
              className="w-full border rounded px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
              value={selectedProjectId}
              onChange={(e) => { setSelectedProjectId(e.target.value); setPage(1); }}
              title="Select project"
            >
              {projects.length === 0 ? (
                <option value="">Loading…</option>
              ) : (
                projects.map((p) => <option key={p.projectId} value={p.projectId}>{p.title}</option>)
              )}
            </select>
          </div>
        </section>

        {/* ===== Tile 2 — Roles & Options (with Assign/Cancel) ===== */}
        <section className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border dark:border-neutral-800 p-4 mb-4" aria-label="Tile: Roles & Options" data-tile-name="Roles & Options">
          <TileHeader title="Tile 2 — Roles & Options" subtitle="Pick a role. If Client, pick from moved users & set validity." />

          {/* roles row */}
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 block">Role</label>
            <div className="flex-1 overflow-x-auto">
              <div className="flex flex-nowrap gap-2 pb-1">
                {USER_ROLES.map((r) => (
                  <label key={r} className={"whitespace-nowrap cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-2xl border dark:border-neutral-800 " + (role === r ? "bg-emerald-600 text-white" : "hover:bg-gray-50 dark:hover:bg-neutral-800")}>
                    <input type="radio" name="role" className="hidden" checked={role === r} onChange={() => setRole(r)} />
                    <span className="whitespace-nowrap">{r}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* role=Client: MOVED USERS LIST (checkboxes) + dates */}
          {role === "Client" && (
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* moved users list with checkboxes */}
              <div className="space-y-3" aria-label="Subtile: Moved Clients">
                <label className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Moved Clients (select with checkbox)
                </label>

                <div className="border rounded-lg dark:border-neutral-800 overflow-auto" style={{ maxHeight: 300 }}>
                  {movedClientIds.size === 0 ? (
                    <div className="p-3 text-sm text-gray-600 dark:text-gray-300">
                      <b>Move Clients</b> from list below to assign roles.
                    </div>
                  ) : (
                    <ul className="divide-y dark:divide-neutral-800">
                      {movedClientsList.map((u: UserLite) => {
                        const checked = selectedClientIds.has(u.userId);
                        return (
                          <li key={u.userId} className="flex items-center justify-between gap-3 px-3 py-2">
                            <label className="flex items-center gap-3 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleClientChecked(u.userId)}
                              />
                              <div className="flex flex-col">
                                <div className="font-medium dark:text-white">{displayName(u) || "(No name)"}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {u.code || ""}{u.code ? " · " : ""}{u.email || ""}{u.email ? " · " : ""}{phoneDisplay(u)}
                                </div>
                              </div>
                            </label>
                            <span className="text-xs px-2 py-0.5 rounded border dark:border-neutral-700">{u.userStatus || "—"}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {movedClientsList.length > 0 && (
                  <div className="flex gap-2">
                    <button
                      className="px-3 py-1.5 rounded border text-sm dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                      onClick={() => setSelectedClientIds(new Set(movedClientsList.map(m => m.userId)))}
                    >
                      Select All
                    </button>
                    <button
                      className="px-3 py-1.5 rounded border text-sm dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                      onClick={() => setSelectedClientIds(new Set())}
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {/* dates (Valid To must be > Valid From) */}
              <div className="space-y-3" aria-label="Subtile: Validity">
                <label className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Validity
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-gray-600 dark:text-gray-300">Valid From</div>
                    <input
                      type="date"
                      className="mt-1 w-full border rounded px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                      value={validFrom}
                      onChange={(e) => setValidFrom(e.target.value)}
                    />
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 dark:text-gray-300">Valid To</div>
                    <input
                      type="date"
                      className="mt-1 w-full border rounded px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                      value={validTo}
                      min={validToMin || undefined} // disable older or same dates; strictly greater than Valid From
                      onChange={(e) => setValidTo(e.target.value)}
                      title={validFrom ? `Choose a date after ${validFrom}` : "Choose end date"}
                    />
                    {validFrom && !validTo && (
                      <div className="mt-1 text-xs text-gray-500">
                        Choose a date after <b>{validFrom}</b>.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              className="px-4 py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
              onClick={onCancelTile2}
              title="Clear dates and move clients back to Browse Clients"
            >
              Cancel
            </button>
            <button
              className={"px-4 py-2 rounded text-white " + (canSubmit ? "bg-emerald-600 hover:bg-emerald-700" : "bg-emerald-600/50 cursor-not-allowed")}
              onClick={onAssign}
              disabled={!canSubmit}
              title={canSubmit ? "Create assignment (preview only in Step 1)" : "Select all required fields"}
            >
              Assign
            </button>
          </div>
        </section>

        {/* ===== Tile 3 — Browse Clients (with Move) ===== */}
        <section className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border dark:border-neutral-800 p-4 mb-4" aria-label="Tile: Browse Clients" data-tile-name="Browse Clients">
          <TileHeader title="Tile 3 — Browse Clients" subtitle="Search and filter; sort columns; paginate. Use ‘Move’ to add clients to Tile 2." />

          {/* Controls row: Search, Status, State, District */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-3 mb-3">
            <div className="lg:w-80">
              <label className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1 block">Search</label>
              <input
                className="w-full border rounded px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                placeholder="Code, name, project, phone, email…"
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1); }}
              />
            </div>

            <div className="lg:w-44">
              <label className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1 block">Status</label>
              <select
                className="w-full border rounded px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value as any); setPage(1); }}
              >
                <option value="all">All</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>

            <div className="lg:w-56">
              <label className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1 block">State</label>
              <select
                className="w-full border rounded px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                value={stateFilter}
                onChange={(e) => { setStateFilter(e.target.value); setDistrictFilter(""); setPage(1); }}
              >
                <option value="">All States</option>
                {statesRef.map((s) => <option key={s.stateId} value={s.name}>{s.name}</option>)}
              </select>
            </div>

            <div className="lg:w-56">
              <label className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1 block">District</label>
              <select
                className="w-full border rounded px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                value={districtFilter}
                onChange={(e) => { setDistrictFilter(e.target.value); setPage(1); }}
                disabled={!stateFilter}
                title={stateFilter ? "Filter by district" : "Select a state first"}
              >
                <option value="">All Districts</option>
                {districtsRef.map((d) => <option key={d.districtId} value={d.name}>{d.name}</option>)}
              </select>
            </div>

            {/* sort + rows/page on the far right */}
            <div className="flex-1" />
            <div className="flex items-end gap-2">
              <div>
                <label className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1 block">Sort</label>
                <div className="flex gap-2">
                  <select
                    className="border rounded px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                    value={sortKey}
                    onChange={(e) => { setSortKey(e.target.value as any); setPage(1); }}
                  >
                    <option value="code">Code</option>
                    <option value="name">Name</option>
                    <option value="projects">Projects</option>
                    <option value="mobile">Mobile</option>
                    <option value="email">Email</option>
                    <option value="state">State</option>
                    <option value="zone">Zone</option>
                    <option value="status">Status</option>
                    <option value="updated">Updated</option>
                  </select>
                  <button
                    className="px-3 py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                    onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                    title="Toggle sort direction"
                  >
                    {sortDir === "asc" ? "▲" : "▼"}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1 block">Rows</label>
                <select
                  className="border rounded px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                >
                  {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="border rounded-xl dark:border-neutral-800 overflow-hidden">
            <div className="overflow-auto" style={{ maxHeight: "55vh" }}>
              {usersErr && (
                <div className="p-3 text-sm text-red-700 dark:text-red-400 border-b dark:border-neutral-800">
                  {usersErr}
                </div>
              )}
              {usersLoading ? (
                <div className="p-4 text-sm text-gray-600 dark:text-gray-300">Loading clients…</div>
              ) : rowsPaged.length === 0 ? (
                <div className="p-4 text-sm text-gray-600 dark:text-gray-300">No clients match the selected criteria.</div>
              ) : (
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-neutral-800 sticky top-0 z-10">
                    <tr>
                      {[
                        { key: "action",   label: "Action"   },
                        { key: "code",     label: "Code"     },
                        { key: "name",     label: "Name"     },
                        { key: "projects", label: "Projects" },
                        { key: "mobile",   label: "Mobile"   },
                        { key: "email",    label: "Email"    },
                        { key: "state",    label: "State"    },
                        { key: "zone",     label: "Zone"     },
                        { key: "status",   label: "Status"   },
                        { key: "updated",  label: "Updated"  },
                      ].map((h) => {
                        const sortable = h.key !== "action";
                        const active = sortKey === (h.key as any);
                        return (
                          <th
                            key={h.key}
                            className={"text-left font-semibold px-3 py-2 border-b dark:border-neutral-700 whitespace-nowrap select-none " + (sortable ? "cursor-pointer" : "")}
                            title={sortable ? `Sort by ${h.label}` : undefined}
                            onClick={() => {
                              if (!sortable) return;
                              if (sortKey !== (h.key as any)) { setSortKey(h.key as any); setSortDir("asc"); }
                              else { setSortDir(d => d === "asc" ? "desc" : "asc"); }
                              setPage(1);
                            }}
                          >
                            <span className="inline-flex items-center gap-1">
                              {h.label}
                              {sortable && <span className="text-xs opacity-70">{active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}</span>}
                            </span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {rowsPaged.map((r) => (
                      <tr key={r._id} className="odd:bg-gray-50/50 dark:odd:bg-neutral-900/60">
                        {/* Action */}
                        <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap">
                          <button
                            className="px-2 py-1 rounded border text-xs hover:bg-gray-50 dark:hover:bg-neutral-800"
                            title="Move this client to selection"
                            onClick={() => onMoveToTile2(r._raw!)}
                          >
                            Move
                          </button>
                        </td>
                        <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap" title={r.code}>{r.code}</td>
                        <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap" title={r.name}>{r.name}</td>
                        <td className="px-3 py-2 border-b dark:border-neutral-800" title={r.projects}><div className="truncate max-w-[360px]">{r.projects}</div></td>
                        <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap" title={r.mobile}>{r.mobile}</td>
                        <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap" title={r.email}>{r.email}</td>
                        <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap" title={r.state}>{r.state}</td>
                        <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap" title={r.zone}>{r.zone}</td>
                        <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap" title={r.status}>{r.status}</td>
                        <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap" title={fmtDate(r.updated)}>{fmtDate(r.updated)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination footer */}
            <div className="flex items-center justify-between px-3 py-2 text-xs border-t dark:border-neutral-800">
              <div className="text-gray-600 dark:text-gray-300">
                Page <b>{pageSafe}</b> of <b>{totalPages}</b> · Showing <b>{rowsPaged.length}</b> of <b>{total}</b> clients
                {stateFilter ? <> · State: <b>{stateFilter}</b></> : null}
                {districtFilter ? <> · District: <b>{districtFilter}</b></> : null}
                {statusFilter !== "all" ? <> · Status: <b>{statusFilter}</b></> : null}
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
        </section>
      </div>
    </div>
  );
}
