// pms-frontend/src/views/admin/assignments/Assignments.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../../api/client";

// ===== Role routing meta =====
const ROLE_META = {
  Client:       { slug: "clients",      singular: "Client",       plural: "Clients" },
  Contractor:   { slug: "contractors",  singular: "Contractor",   plural: "Contractors" },
  Consultant:   { slug: "consultants",  singular: "Consultant",   plural: "Consultants" },
  PMC:          { slug: "pmc",          singular: "PMC",          plural: "PMCs" },
  Supplier:     { slug: "suppliers",    singular: "Supplier",     plural: "Suppliers" },
  "IH-PMT":     { slug: "ih-pmt",       singular: "IH-PMT",       plural: "IH-PMT" },
} as const;

// UI roles — stored exactly the same in DB
const USER_ROLES = Object.keys(ROLE_META) as (keyof typeof ROLE_META)[];
type UserRoleLite = typeof USER_ROLES[number];

function slugToRole(slug?: string): UserRoleLite | null {
  if (!slug) return null;
  const found = USER_ROLES.find((r) => ROLE_META[r].slug.toLowerCase() === slug.toLowerCase());
  return found ?? null;
}
function roleToSlug(role: UserRoleLite): string {
  return ROLE_META[role].slug;
}

type ProjectLite = { projectId: string; title: string };
type MembershipLite = {
  id?: string | null; // membership id for edit
  role?: string | null;
  project?: { projectId?: string; title?: string } | null;
  company?: { companyId?: string; name?: string } | null;
  // dates carried through from backend if present
  validFrom?: string | null;
  validTo?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
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
  userStatus?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  userRoleMemberships?: MembershipLite[];
};
type StateRef = { stateId: string; name: string; code: string };
type DistrictRef = { districtId: string; name: string; stateId: string };

// ---------- Local date helpers (no UTC conversions) ----------
function formatLocalYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`; // local YYYY-MM-DD
}
function todayLocalISO() {
  return formatLocalYMD(new Date());
}
/** Add days to a local YYYY-MM-DD and return local YYYY-MM-DD */
function addDaysISO(dateISO: string, days: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return "";
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return "";
  dt.setDate(dt.getDate() + days);
  return formatLocalYMD(dt);
}
/** Render any input as local date-time string (for display only) */
function fmtLocalDateTime(v: any) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v ?? "") : d.toLocaleString();
}
/** Normalize any input to local YYYY-MM-DD (for date-only UI) */
function fmtLocalDateOnly(v: any) {
  if (!v) return "";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v; // already date-only
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : formatLocalYMD(d);
}

// ---------- Small utils ----------
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
  return mem.some((m) => String(m?.role || "").toLowerCase() === "client");
}

// robustly read membership dates regardless of API key shape -> always local YYYY-MM-DD
function pickMembershipDate(m: any, primary: "validFrom" | "validTo"): string {
  if (!m) return "";
  const candidates = [
    primary,                          // validFrom / validTo
    `${primary}Date`,                 // validFromDate / validToDate
    primary === "validFrom" ? "from" : "to",
    primary === "validFrom" ? "startDate" : "endDate",
    primary === "validFrom" ? "start" : "end",
    `${primary}_date`,
    `${primary}At`,
    `${primary}_at`,
  ];
  for (const key of candidates) {
    if (m[key] != null && m[key] !== "") return fmtLocalDateOnly(m[key]);
  }
  return "";
}

// prevent duplicate assignment to selected project
function alreadyAssignedToSelectedProject(u: UserLite, projectId: string): boolean {
  if (!projectId) return false;
  const mems = Array.isArray(u.userRoleMemberships) ? u.userRoleMemberships : [];
  return mems.some(m =>
    String(m?.role || "").toLowerCase() === "client" &&
    m?.project?.projectId === projectId
  );
}

// validity badge computation (inclusive range) — all local YYYY-MM-DD
function computeValidityLabel(validFrom?: string, validTo?: string): string {
  const from = fmtLocalDateOnly(validFrom);
  const to = fmtLocalDateOnly(validTo);
  if (!from && !to) return "—";
  const today = todayLocalISO();
  if (from && today < from) return "Yet to Start";
  if (to && today > to) return "Expired";
  return "Valid";
}

const TileHeader = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <div className="mb-3">
    <div className="text-sm font-semibold dark:text-white">{title}</div>
    {subtitle ? <div className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</div> : null}
  </div>
);

export default function Assignments() {
  const nav = useNavigate();
  const { role: roleSlug } = useParams();

  // --- Auth gate ---
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) nav("/login", { replace: true });
  }, [nav]);

  // ===== Role state derived from route =====
  const derived = slugToRole(roleSlug) ?? "Client";
  const [role, setRole] = useState<UserRoleLite>(derived);

  // keep state and URL in sync
  useEffect(() => {
    const fromUrl = slugToRole(roleSlug);
    if (!fromUrl) {
      nav(`/admin/assignments/${ROLE_META["Client"].slug}`, { replace: true });
      return;
    }
    if (fromUrl !== role) setRole(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleSlug]);

  const onPickRole = (r: UserRoleLite) => {
    if (r === role) return;
    nav(`/admin/assignments/${roleToSlug(r)}`);
    // setRole handled by the effect via URL
  };

  // Common state
  const [err, setErr] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  // Tile 2 (assignment for active role)
  const [clients, setClients] = useState<UserLite[]>([]);
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());
  const [validFrom, setValidFrom] = useState<string>(todayLocalISO());
  const [validTo, setValidTo] = useState<string>("");

  const [movedClientIds, setMovedClientIds] = useState<Set<string>>(new Set());
  const [assignLoading, setAssignLoading] = useState(false);

  // Load projects
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

  // Tile 3 (browse users) data + refs — for now still fetching /admin/users
  const [allUsers, setAllUsers] = useState<UserLite[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersErr, setUsersErr] = useState<string | null>(null);

  const [statesRef, setStatesRef] = useState<StateRef[]>([]);
  const [districtsRef, setDistrictsRef] = useState<DistrictRef[]>([]);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "Active" | "Inactive">("all");
  const [stateFilter, setStateFilter] = useState<string>("");
  const [districtFilter, setDistrictFilter] = useState<string>("");

  const [sortKey, setSortKey] = useState<"code"|"name"|"projects"|"mobile"|"email"|"state"|"zone"|"status"|"updated">("name");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setUsersLoading(true);
        setUsersErr(null);
        // STEP-4 NOTE:
        // For non-Client roles, we will switch to role-specific endpoints.
        // For now, keep using /admin/users so the page keeps working.
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
  }, [role]); // refetch when role changes (will swap endpoint in next step)

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
    updated: string; // raw from API
    _id: string;
    _raw?: UserLite;
  };

  // For now, the “moved list” and assign button remain Client-only.
  const isActiveRoleClient = role === "Client";

  const roleFilterFunc = (u: UserLite) => {
    if (role === "Client") return isClientUser(u);
    // STEP-4 NOTE: Replace with role-specific predicates or separate entity lists
    // to support Contractor, Consultant, PMC, Supplier, IH-PMT views.
    return false; // show empty until we wire the real data
  };

  const clientsRows = useMemo<Row[]>(() => {
    const moved = movedClientIds;
    const onlyRoleUsers = allUsers
      .filter(roleFilterFunc)
      .filter((u) => !moved.has(u.userId));

    const filtered = onlyRoleUsers.filter((u) => {
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
            fmtLocalDateTime(u.updatedAt),
          ].join(" ").toLowerCase();
          return hay.includes(needle);
        })
      : filtered;

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
      updated: u.updatedAt || "", // keep raw; format on render
      _id: u.userId,
      _raw: u,
    }));

    const key = sortKey;
    const dir = sortDir;
    const cmp = (a: any, b: any) => {
      if (a === b) return 0;
      if (a === null || a === undefined) return -1;
      if (b === null || b === undefined) return 1;
      const aTime = Date.parse(String(a));
      const bTime = Date.parse(String(b));
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
  }, [allUsers, statusFilter, stateFilter, districtFilter, q, sortKey, sortDir, movedClientIds, role]);

  const total = clientsRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageSafe = Math.min(Math.max(1, page), totalPages);
  const rowsPaged = useMemo<Row[]>(() => {
    const start = (pageSafe - 1) * pageSize;
    return clientsRows.slice(start, start + pageSize);
  }, [clientsRows, pageSafe, pageSize]);

  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages]); // keep in bounds

  // Submit (assign) — currently Client-only
  const canSubmit =
    selectedProjectId &&
    role &&
    (role !== "Client" || (selectedClientIds.size > 0 && validFrom && validTo)) &&
    !assignLoading;

  const onAssign = async () => {
    if (role !== "Client") {
      alert("Only Client assignment is wired in this step. We'll enable this role next.");
      return;
    }

    const project = projects.find(p => p.projectId === selectedProjectId);
    const projectTitle = project?.title || "(Unknown Project)";
    const selectedClients = clients.filter(u => selectedClientIds.has(u.userId));
    const names = selectedClients.map(displayName).filter(Boolean);

    // duplicate guard
    const dupes = selectedClients.filter(u => alreadyAssignedToSelectedProject(u, selectedProjectId));
    if (dupes.length > 0) {
      const lines = dupes.map(u => {
        const name = displayName(u) || "(No name)";
        return `${name} has already assigned ${projectTitle}. If you wish to make changes, edit the ${ROLE_META["Client"].singular} Assignments.`;
      });
      alert(lines.join("\n"));
      return;
    }

    const summary =
      `Please Confirm your assignment:\n\n` +
      `Project: ${projectTitle}\n` +
      `Clients: ${names.length ? names.join(", ") : "—"}\n` +
      `Validity: From ${validFrom} To ${validTo}\n\n` +
      `Press OK to assign, or Cancel to go back.`;

    const ok = window.confirm(summary);
    if (!ok) return;

    const items = selectedClients.map((u) => ({
      userId: u.userId,
      role: "Client",
      scopeType: "Project",
      projectId: selectedProjectId,
      companyId: null,
      validFrom, // "YYYY-MM-DD" (local)
      validTo,   // "YYYY-MM-DD" (local)
      isDefault: false,
    }));

    try {
      setAssignLoading(true);
      setErr(null);
      const { data } = await api.post("/admin/assignments/bulk", { items });

      alert(`Assigned ${data?.created ?? items.length} client(s) to "${projectTitle}".`);

      // Reset Tile 2
      setSelectedClientIds(new Set());
      setMovedClientIds(new Set());
      setValidFrom("");
      setValidTo("");

      // Refresh users list, so Tile 4 shows the new assignments immediately
      try {
        const { data: fresh } = await api.get("/admin/users", { params: { includeMemberships: "1" } });
        setAllUsers(Array.isArray(fresh) ? fresh : (fresh?.users ?? []));
      } catch {}

      const el = document.querySelector('[data-tile-name="Browse Clients"]');
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || "Assign failed.";
      setErr(msg);
      alert(`Error: ${msg}`);
    } finally {
      setAssignLoading(false);
    }
  };

  // Move user from Tile 3 to Tile 2
  const onMoveToTile2 = (user: UserLite) => {
    if (role !== "Client") {
      alert("Move/select flow is wired for Client in this step.");
      return;
    }
    if (alreadyAssignedToSelectedProject(user, selectedProjectId)) {
      const projectTitle = projects.find(p => p.projectId === selectedProjectId)?.title || "(Selected Project)";
      const name = displayName(user) || "(No name)";
      alert(`${name} has already assigned ${projectTitle}. If you wish to make changes, edit the ${ROLE_META["Client"].singular} Assignments.`);
      return;
    }

    setClients((prev) => (prev.some((u) => u.userId === user.userId) ? prev : [user, ...prev]));
    setMovedClientIds((prev) => { const next = new Set(prev); next.add(user.userId); return next; });
    setSelectedClientIds((prev) => { const next = new Set(prev); next.add(user.userId); return next; });
    const el = document.querySelector('[data-tile-name="Roles & Options"]');
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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

  const validToMin = validFrom ? addDaysISO(validFrom, 1) : "";
  useEffect(() => {
    if (validFrom && validTo && validTo <= validFrom) setValidTo("");
  }, [validFrom, validTo]);

  const onCancelTile2 = () => {
    setValidFrom("");
    setValidTo("");
    setSelectedClientIds(new Set());
    setMovedClientIds(new Set());
    const el = document.querySelector('[data-tile-name="Browse Clients"]');
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ---- Tile 4 data: flatten "Client" memberships with a project
  type AssignmentRow = {
    userId: string;
    userName: string;
    projectId: string;
    projectTitle: string;
    status: string;
    validFrom: string; // local YYYY-MM-DD
    validTo: string;   // local YYYY-MM-DD
    validity: string;
    updated: string;   // raw ISO/string from API; format on render
    membershipId?: string | null;
    _user?: UserLite;
    _mem?: MembershipLite;
  };

  // For now, only compute rows for Client role
  const assignedClientRows = useMemo<AssignmentRow[]>(() => {
    if (role !== "Client") return [];
    const rows: AssignmentRow[] = [];
    for (const u of allUsers) {
      const mems = Array.isArray(u.userRoleMemberships) ? u.userRoleMemberships : [];
      for (const m of mems) {
        if (String(m?.role || "").toLowerCase() !== "client") continue;
        const pj = m?.project;
        if (!pj?.projectId || !pj?.title) continue;

        const vf = pickMembershipDate(m, "validFrom"); // local YYYY-MM-DD
        const vt = pickMembershipDate(m, "validTo");   // local YYYY-MM-DD

        rows.push({
          userId: u.userId,
          userName: displayName(u) || "(No name)",
          projectId: pj.projectId,
          projectTitle: pj.title,
          status: u.userStatus || "",
          validFrom: vf,
          validTo: vt,
          validity: computeValidityLabel(vf, vt),
          updated: (m?.updatedAt || u.updatedAt || ""),
          membershipId: m?.id ?? null,
          _user: u,
          _mem: m,
        });
      }
    }
    return rows;
  }, [allUsers, role]);

  // modal state
const [viewOpen, setViewOpen] = useState(false);
const [viewRow, setViewRow] = useState<AssignmentRow | null>(null);

const [editOpen, setEditOpen] = useState(false);
const [editRow, setEditRow] = useState<AssignmentRow | null>(null);
const [editFrom, setEditFrom] = useState<string>("");
const [editTo, setEditTo] = useState<string>("");

// helpers
const openView = (row: AssignmentRow) => {
  setViewRow(row);
  setViewOpen(true);
};

const openEdit = (row: AssignmentRow) => {
  setEditRow(row);
  setEditFrom(fmtLocalDateOnly(row.validFrom) || todayLocalISO());
  setEditTo(fmtLocalDateOnly(row.validTo) || addDaysISO(todayLocalISO(), 1));
  setEditOpen(true);
};

  // ===== Tile 4 sort state + sorted rows =====
  const [aSortKey, setASortKey] = useState<"userName"|"projectTitle"|"status"|"validFrom"|"validTo"|"validity"|"updated">("updated");
  const [aSortDir, setASortDir] = useState<"asc"|"desc">("desc");

  const assignedSortedRows = useMemo<AssignmentRow[]>(() => {
    const rows = [...assignedClientRows];
    const key = aSortKey;
    const dir = aSortDir;
    const cmp = (a: any, b: any) => {
      if (a === b) return 0;
      if (a == null) return -1;
      if (b == null) return 1;
      // date-like?
      const aTime = Date.parse(String(a));
      const bTime = Date.parse(String(b));
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
  }, [assignedClientRows, aSortKey, aSortDir]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-yellow-50 dark:from-neutral-900 dark:to-neutral-950 px-4 sm:px-6 lg:px-10 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold dark:text-white">Assignments</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Tiles: Projects · Roles & Options · <b>Browse {ROLE_META[role].plural}</b> · {ROLE_META[role].singular} Assignments
          </p>
          {err && <p className="mt-2 text-sm text-red-700 dark:text-red-400">{err}</p>}
        </div>

        {/* Tile 1 — Projects */}
        <section className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border dark:border-neutral-800 p-4 mb-4" aria-label="Tile: Projects" data-tile-name="Projects">
          <TileHeader title="Tile 1 — Projects" subtitle={`Choose the project to assign ${ROLE_META[role].plural} to.`} />
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

        {/* Tile 2 — Roles & Options */}
        <section className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border dark:border-neutral-800 p-4 mb-4" aria-label="Tile: Roles & Options" data-tile-name="Roles & Options">
          <TileHeader title="Tile 2 — Roles & Options" subtitle="Pick a role. If Client, pick from moved users & set validity." />

          {/* roles row */}
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 block">Role</label>
            <div className="flex-1 overflow-x-auto">
              <div className="flex flex-nowrap gap-2 pb-1">
                {USER_ROLES.map((r) => (
                  <label
                    key={r}
                    className={
                      "whitespace-nowrap cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-2xl border dark:border-neutral-800 " +
                      (role === r ? "bg-emerald-600 text-white" : "hover:bg-gray-50 dark:hover:bg-neutral-800")
                    }
                    onClick={() => onPickRole(r)}
                  >
                    <input type="radio" name="role" className="hidden" checked={role === r} readOnly />
                    <span className="whitespace-nowrap">{r}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* role=Client: moved users + dates + actions */}
          {isActiveRoleClient ? (
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* moved users list */}
              <div className="space-y-3" aria-label={`Subtile: Moved ${ROLE_META[role].plural}`}>
                <label className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Moved {ROLE_META[role].plural} (select with checkbox)
                </label>

                <div className="border rounded-lg dark:border-neutral-800 overflow-auto" style={{ maxHeight: 300 }}>
                  {movedClientIds.size === 0 ? (
                    <div className="p-3 text-sm text-gray-600 dark:text-gray-300">
                      <b>Move {ROLE_META[role].plural}</b> from list below to assign roles.
                    </div>
                  ) : (
                    <ul className="divide-y dark:divide-neutral-800">
                      {movedClientsList.map((u: UserLite) => {
                        const checked = selectedClientIds.has(u.userId);
                        return (
                          <li key={u.userId} className="flex items-center justify-between gap-3 px-3 py-2">
                            <label className="flex items-center gap-3 cursor-pointer">
                              <input type="checkbox" checked={checked} onChange={() => toggleClientChecked(u.userId)} />
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

              {/* dates */}
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
                      min={todayLocalISO()}
                      onChange={(e) => setValidFrom(e.target.value)}
                    />
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 dark:text-gray-300">Valid To</div>
                    <input
                      type="date"
                      className="mt-1 w-full border rounded px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                      value={validTo}
                      min={(validFrom || todayLocalISO()) || undefined}
                      onChange={(e) => setValidTo(e.target.value)}
                      title={validFrom ? `Choose a date on/after ${validFrom}` : "Choose end date"}
                    />
                    {validFrom && !validTo && (
                      <div className="mt-1 text-xs text-gray-500">
                        Choose a date on or after <b>{validFrom}</b>.
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    className="px-4 py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                    onClick={onCancelTile2}
                    title={`Clear dates and move ${ROLE_META[role].plural} back to Browse ${ROLE_META[role].plural}`}
                  >
                    Cancel
                  </button>
                  <button
                    className={"px-4 py-2 rounded text-white " + (canSubmit ? "bg-emerald-600 hover:bg-emerald-700" : "bg-emerald-600/50 cursor-not-allowed")}
                    onClick={onAssign}
                    disabled={!canSubmit}
                    title={canSubmit ? `Assign selected ${ROLE_META[role].plural} to project` : "Select all required fields"}
                  >
                    {assignLoading ? "Assigning…" : "Assign"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            // Placeholder for non-client roles (we’ll wire these in the next step)
            <div className="mt-2 p-3 text-xs rounded-lg border dark:border-neutral-800 bg-amber-50 dark:bg-neutral-800/40 text-amber-900 dark:text-amber-300">
              {ROLE_META[role].singular} assignment flow will be enabled next. You can already browse & sort below.
            </div>
          )}
        </section>

        {/* Tile 3 — Browse (role) */}
        <section className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border dark:border-neutral-800 p-4 mb-4" aria-label={`Tile: Browse ${ROLE_META[role].plural}`} data-tile-name={`Browse ${ROLE_META[role].plural}`}>
          <TileHeader title={`Tile 3 — Browse ${ROLE_META[role].plural}`} subtitle={`Search and filter; sort columns; paginate. Use ‘Move’ to add ${ROLE_META[role].plural} to Tile 2.`} />

          {/* Controls */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-3 mb-3">
            <div className="lg:w-80">
              <label className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1 block">Search</label>
              <input
                className="w-full border rounded px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                placeholder={`Code, name, project, phone, email…`}
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
                <div className="p-4 text-sm text-gray-600 dark:text-gray-300">Loading {ROLE_META[role].plural.toLowerCase()}…</div>
              ) : rowsPaged.length === 0 ? (
                <div className="p-4 text-sm text-gray-600 dark:text-gray-300">No {ROLE_META[role].plural.toLowerCase()} match the selected criteria.</div>
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
                        <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap">
                          <button
                            className="px-2 py-1 rounded border text-xs hover:bg-gray-50 dark:hover:bg-neutral-800"
                            title={isActiveRoleClient ? `Move this ${ROLE_META[role].singular.toLowerCase()} to selection` : "Move flow is Client-only for now"}
                            onClick={() => onMoveToTile2(r._raw!)}
                            disabled={!isActiveRoleClient}
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
                        <td
                          className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap"
                          title={fmtLocalDateTime(r.updated)}
                        >
                          {fmtLocalDateTime(r.updated)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-3 py-2 text-xs border-t dark:border-neutral-800">
              <div className="text-gray-600 dark:text-gray-300">
                Page <b>{pageSafe}</b> of <b>{totalPages}</b> · Showing <b>{rowsPaged.length}</b> of <b>{total}</b> {ROLE_META[role].plural.toLowerCase()}
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

        {/* Tile 4 — (Role) Assignments */}
        <section className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border dark:border-neutral-800 p-4" aria-label={`Tile: ${ROLE_META[role].singular} Assignments`} data-tile-name={`${ROLE_META[role].singular} Assignments`}>
          <TileHeader title={`Tile 4 — ${ROLE_META[role].singular} Assignments`} subtitle={`All ${ROLE_META[role].plural.toLowerCase()} who have been assigned to projects.`} />

          <div className="border rounded-xl dark:border-neutral-800 overflow-hidden">
            <div className="overflow-auto" style={{ maxHeight: "55vh" }}>
              {role !== "Client" ? (
                <div className="p-4 text-sm text-gray-600 dark:text-gray-300">
                  {ROLE_META[role].singular} assignments list will be wired next.
                </div>
              ) : assignedSortedRows.length === 0 ? (
                <div className="p-4 text-sm text-gray-600 dark:text-gray-300">No {ROLE_META[role].plural.toLowerCase()} assignments found.</div>
              ) : (
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-neutral-800 sticky top-0 z-10">
                    <tr>
                      <th className="text-left font-semibold px-3 py-2 border-b dark:border-neutral-700 whitespace-nowrap">Action</th>
                      {[
                        { key: "userName",      label: ROLE_META[role].singular },
                        { key: "projectTitle",  label: "Project" },
                        { key: "status",        label: "Status" },
                        { key: "validFrom",     label: "Valid From" },
                        { key: "validTo",       label: "Valid To" },
                        { key: "validity",      label: "Validity" },
                        { key: "updated",       label: "Last Updated" },
                      ].map((h) => {
                        const active = aSortKey === (h.key as any);
                        return (
                          <th
                            key={h.key}
                            className="text-left font-semibold px-3 py-2 border-b dark:border-neutral-700 whitespace-nowrap select-none cursor-pointer"
                            title={`Sort by ${h.label}`}
                            onClick={() => {
                              if (aSortKey !== (h.key as any)) { setASortKey(h.key as any); setASortDir("asc"); }
                              else { setASortDir(d => d === "asc" ? "desc" : "asc"); }
                            }}
                          >
                            <span className="inline-flex items-center gap-1">
                              {h.label}
                              <span className="text-xs opacity-70">{active ? (aSortDir === "asc" ? "▲" : "▼") : "↕"}</span>
                            </span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {assignedSortedRows.map((r, i) => (
                      <tr key={`${r.userId}-${r.projectId}-${i}`} className="odd:bg-gray-50/50 dark:odd:bg-neutral-900/60">
                        <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap">
                          <div className="flex gap-2">
                            <button
                              className="px-2 py-1 rounded border text-xs hover:bg-gray-50 dark:hover:bg-neutral-800"
                              title="View assignment"
                              onClick={() => openView(r)}
                            >
                              View
                            </button>
                            <button
                              className="px-2 py-1 rounded border text-xs hover:bg-gray-50 dark:hover:bg-neutral-800 disabled:opacity-50"
                              title="Edit validity dates"
                              onClick={() => openEdit(r)}
                              disabled={!r.membershipId}
                            >
                              Edit
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap" title={r.userName}>{r.userName}</td>
                        <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap" title={r.projectTitle}>{r.projectTitle}</td>
                        <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap">{r.status || "—"}</td>
                        <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap">{fmtLocalDateOnly(r.validFrom) || "—"}</td>
                        <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap">{fmtLocalDateOnly(r.validTo) || "—"}</td>
                        <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap">{r.validity || "—"}</td>
                        <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap">{fmtLocalDateTime(r.updated) || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* ===== View Modal (read-only) ===== */}
      {/* Note: Only meaningful for Client in this step */}
      {/* We keep modals as-is; they’re triggered only from wired rows/buttons */}
      {viewOpen && viewRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setViewOpen(false)} />
          <div className="relative bg-white dark:bg-neutral-900 rounded-2xl shadow-lg border dark:border-neutral-800 w-full max-w-md p-4">
            <div className="text-lg font-semibold mb-2 dark:text-white">{ROLE_META[role].singular} Assignment</div>
            <div className="text-xs text-gray-600 dark:text-gray-300 mb-3">
              {viewRow.userName} · {viewRow.projectTitle}
            </div>

            {/* Details table */}
            <div className="mb-4 overflow-hidden rounded-lg border dark:border-neutral-800">
              <table className="min-w-full text-sm">
                <tbody>
                  <tr className="odd:bg-gray-50/60 dark:odd:bg-neutral-900/60">
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{ROLE_META[role].singular}</td>
                    <td className="px-3 py-2">{viewRow.userName || "—"}</td>
                  </tr>
                  <tr className="odd:bg-gray-50/60 dark:odd:bg-neutral-900/60">
                    <td className="px-3 py-2 font-medium whitespace-nowrap">Project</td>
                    <td className="px-3 py-2">{viewRow.projectTitle || "—"}</td>
                  </tr>
                  <tr className="odd:bg-gray-50/60 dark:odd:bg-neutral-900/60">
                    <td className="px-3 py-2 font-medium whitespace-nowrap">Status</td>
                    <td className="px-3 py-2">{viewRow.status || "—"}</td>
                  </tr>
                  <tr className="odd:bg-gray-50/60 dark:odd:bg-neutral-900/60">
                    <td className="px-3 py-2 font-medium whitespace-nowrap">Valid From</td>
                    <td className="px-3 py-2">{fmtLocalDateOnly(viewRow.validFrom) || "—"}</td>
                  </tr>
                  <tr className="odd:bg-gray-50/60 dark:odd:bg-neutral-900/60">
                    <td className="px-3 py-2 font-medium whitespace-nowrap">Valid To</td>
                    <td className="px-3 py-2">{fmtLocalDateOnly(viewRow.validTo) || "—"}</td>
                  </tr>
                  <tr className="odd:bg-gray-50/60 dark:odd:bg-neutral-900/60">
                    <td className="px-3 py-2 font-medium whitespace-nowrap">Validity</td>
                    <td className="px-3 py-2">{viewRow.validity || "—"}</td>
                  </tr>
                  <tr className="odd:bg-gray-50/60 dark:odd:bg-neutral-900/60">
                    <td className="px-3 py-2 font-medium whitespace-nowrap">Last Updated</td>
                    <td className="px-3 py-2">{fmtLocalDateTime(viewRow.updated) || "—"}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-2 flex justify-end">
              <button
                className="px-4 py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                onClick={() => setViewOpen(false)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Edit Modal (with date updates) ===== */}
      {editOpen && editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditOpen(false)} />
          <div className="relative bg-white dark:bg-neutral-900 rounded-2xl shadow-lg border dark:border-neutral-800 w-full max-w-md p-4">
            <div className="text-lg font-semibold mb-2 dark:text-white">Edit Validity</div>
            <div className="text-xs text-gray-600 dark:text-gray-300 mb-3">
              {editRow.userName} · {editRow.projectTitle}
            </div>

            {/* Details table */}
            <div className="mb-4 overflow-hidden rounded-lg border dark:border-neutral-800">
              <table className="min-w-full text-sm">
                <tbody>
                  <tr className="odd:bg-gray-50/60 dark:odd:bg-neutral-900/60">
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{ROLE_META[role].singular}</td>
                    <td className="px-3 py-2">{editRow.userName || "—"}</td>
                  </tr>
                  <tr className="odd:bg-gray-50/60 dark:odd:bg-neutral-900/60">
                    <td className="px-3 py-2 font-medium whitespace-nowrap">Project</td>
                    <td className="px-3 py-2">{editRow.projectTitle || "—"}</td>
                  </tr>
                  <tr className="odd:bg-gray-50/60 dark:odd:bg-neutral-900/60">
                    <td className="px-3 py-2 font-medium whitespace-nowrap">Status</td>
                    <td className="px-3 py-2">{editRow.status || "—"}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-gray-600 dark:text-gray-300">Valid From</div>
                <input
                  type="date"
                  className="mt-1 w-full border rounded px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                  value={editFrom}
                  min={todayLocalISO()}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEditFrom(v);
                    if (editTo && editTo < v) setEditTo(v);
                  }}
                />
              </div>
              <div>
                <div className="text-xs text-gray-600 dark:text-gray-300">Valid To</div>
                <input
                  type="date"
                  className="mt-1 w-full border rounded px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                  value={editTo}
                  min={editFrom || todayLocalISO()}
                  onChange={(e) => setEditTo(e.target.value)}
                />
              </div>
            </div>

            {/* Client-only update in this step */}
            {/* We keep the button enabled only when membershipId exists (client rows) */}
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                onClick={() => setEditOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                onClick={async () => {
                  // reuse onUpdateValidity logic inline to avoid dangling function if role!=Client
                  const today = todayLocalISO();
                  if (!editFrom || !editTo) { alert("Both Valid From and Valid To are required."); return; }
                  if (editFrom < today) { alert("Valid From cannot be before today."); return; }
                  if (editTo < editFrom) { alert("Valid To must be on or after Valid From."); return; }
                  if (!editRow?.membershipId) { alert("Cannot update: missing membership id."); return; }

                  try {
                    await api.patch(`/admin/assignments/${editRow.membershipId}`, {
                      validFrom: editFrom,
                      validTo: editTo,
                    });
                    const { data: fresh } = await api.get("/admin/users", { params: { includeMemberships: "1" } });
                    setAllUsers(Array.isArray(fresh) ? fresh : (fresh?.users ?? []));
                    setEditOpen(false);
                  } catch (e: any) {
                    const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || "Update failed.";
                    alert(msg);
                  }
                }}
                title="Update validity dates"
                disabled={!editRow?.membershipId}
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
