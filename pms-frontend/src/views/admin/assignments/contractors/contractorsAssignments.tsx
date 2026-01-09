// src/views/admin/assignments/contractors/contractorsAssignments.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../../api/client";
import {
  CARD,
  PILL_INPUT,
  PILL_SELECT,
  PILL_DATE,
  BTN_PRIMARY,
  BTN_SECONDARY,
  statusBadgeClass,
  ThinScrollbarStyle,
} from "../_ui/assignmentsUi";

// ---------- Types ----------
type ProjectLite = { projectId: string; title: string };
type MembershipLite = {
  id?: string | null;
  role?: string | null;
  project?: { projectId?: string; title?: string } | null;
  company?: { companyId?: string; name?: string } | null;
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
  userStatus?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  userRoleMemberships?: MembershipLite[];
};
type StateRef = { stateId: string; name: string; code: string };
type DistrictRef = { districtId: string; name: string; stateId: string };

// ---------- Local date helpers ----------
function formatLocalYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function todayLocalISO() {
  return formatLocalYMD(new Date());
}
function addDaysISO(dateISO: string, days: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return "";
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return "";
  dt.setDate(dt.getDate() + days);
  return formatLocalYMD(dt);
}
function fmtLocalDateTime(v: any) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v ?? "") : d.toLocaleString();
}
function fmtLocalDateOnly(v: any) {
  if (!v) return "";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : formatLocalYMD(d);
}

// ---------- Small utils ----------
function displayName(u: UserLite) {
  return [u.firstName, u.middleName, u.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
}
function phoneDisplay(u: UserLite) {
  return [u.countryCode, u.phone].filter(Boolean).join(" ").trim();
}
function projectsLabel(u: UserLite): string {
  const mem = Array.isArray(u.userRoleMemberships) ? u.userRoleMemberships : [];
  const set = new Set(
    mem
      .filter((m) => String(m?.role || "").toLowerCase() === "contractor")
      .map((m) => m?.project?.title)
      .filter(Boolean) as string[]
  );
  return Array.from(set).join(", ");
}
function companiesLabel(u: UserLite): string {
  const mem = Array.isArray(u.userRoleMemberships) ? u.userRoleMemberships : [];
  const set = new Set(
    mem.map((m) => m?.company?.name).filter(Boolean) as string[]
  );
  return Array.from(set).join(", ");
}
function isRoleUser(u: UserLite, role: string): boolean {
  const mem = Array.isArray(u.userRoleMemberships) ? u.userRoleMemberships : [];
  return mem.some(
    (m) => String(m?.role || "").toLowerCase() === role.toLowerCase()
  );
}
function alreadyAssignedToSelectedProject(
  u: UserLite,
  projectId: string
): boolean {
  if (!projectId) return false;
  const mems = Array.isArray(u.userRoleMemberships)
    ? u.userRoleMemberships
    : [];
  return mems.some(
    (m) =>
      String(m?.role || "").toLowerCase() === "contractor" &&
      m?.project?.projectId === projectId
  );
}
function computeValidityLabel(validFrom?: string, validTo?: string): string {
  const from = fmtLocalDateOnly(validFrom);
  const to = fmtLocalDateOnly(validTo);
  if (!from && !to) return "—";
  const today = todayLocalISO();
  if (from && today < from) return "Yet to Start";
  if (to && today > to) return "Expired";
  return "Valid";
}
function contractorCompanyId(u: UserLite): string | null {
  const mems = Array.isArray(u.userRoleMemberships)
    ? u.userRoleMemberships
    : [];
  const m = mems.find(
    (m) =>
      String(m?.role || "").toLowerCase() === "contractor" &&
      m?.company?.companyId
  );
  return (m?.company?.companyId as string) || null;
}

// ---------- UI atoms (aligned to Client Assignments look) ----------
const SectionKicker = ({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) => (
  <div className="mb-4">
    <div className="flex items-center gap-3">
      <span className="inline-block h-5 w-1.5 rounded-full bg-[#FCC020]" />
      <div className="text-[11px] sm:text-sm font-extrabold tracking-[0.18em] uppercase text-[#00379C] dark:text-[#FCC020]">
        {title}
      </div>
    </div>
    {subtitle ? (
      <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        {subtitle}
      </div>
    ) : null}
  </div>
);

const TableShell = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white dark:bg-neutral-950 dark:border-white/10">
    {children}
  </div>
);

const StickyThead = ({ children }: { children: React.ReactNode }) => (
  <thead className="bg-slate-50 dark:bg-white/5 sticky top-0 z-10">
    {children}
  </thead>
);

/**
 * ICONS — match Client Assignment page:
 * - MoveUp: plain teal arrow (no circular button)
 * - View: plain green eye (no circular button)
 * - Edit: plain blue pen (no circular button)
 */
const ICON_BASE =
  "inline-flex items-center justify-center p-1 rounded-md bg-transparent " +
  "hover:bg-transparent focus:outline-none focus:ring-0 active:scale-[0.98] transition";

const ICON_MOVE = `${ICON_BASE} text-teal-600 hover:text-teal-700`;
const ICON_VIEW = `${ICON_BASE} text-emerald-600 hover:text-emerald-700`;
const ICON_EDIT =
  `${ICON_BASE} text-blue-700 hover:text-blue-800 ` +
  "disabled:opacity-40 disabled:cursor-not-allowed";

const OUTLINE_PILL =
  "inline-flex items-center rounded-full border border-slate-200 dark:border-white/10 " +
  "bg-white dark:bg-neutral-950 px-3 py-1 text-xs font-medium " +
  "text-slate-700 dark:text-slate-200";

function MoveUpIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 19V5" />
      <path d="M6.5 10.5 12 5l5.5 5.5" />
    </svg>
  );
}

function EyeIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
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
  );
}

function PenIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
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
  );
}

export default function ContractorsAssignments() {
  const nav = useNavigate();

  // --- Auth gate ---
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) nav("/login", { replace: true });
  }, [nav]);

  const [err, setErr] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  // Tile 2 (role assignment)
  const [picked, setPicked] = useState<UserLite[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [validFrom, setValidFrom] = useState<string>(todayLocalISO());
  const [validTo, setValidTo] = useState<string>("");

  const [movedIds, setMovedIds] = useState<Set<string>>(new Set());
  const [assignLoading, setAssignLoading] = useState(false);

  // Table styles (MATCH Client Assignments)
  const TABLE_SCROLL = `overflow-auto max-h-[55vh] thin-scrollbar`;

  const TH =
    "text-left px-3 py-2 border-b border-slate-200 dark:border-white/10 whitespace-nowrap select-none " +
    "text-[11px] font-extrabold tracking-[0.16em] uppercase text-slate-600 dark:text-slate-300";

  const TD =
    "px-3 py-2 border-b border-slate-200 dark:border-white/10 whitespace-nowrap text-sm text-slate-800 dark:text-slate-100";

  const TR =
    "odd:bg-white even:bg-slate-50/40 dark:odd:bg-neutral-950 dark:even:bg-white/5";

  const PILL =
    "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold leading-none " +
    "border shadow-sm";

  function pillClass(v: string) {
    const s = (v || "").toLowerCase();

    // defaults
    let cls =
      "bg-slate-100 text-slate-700 border-slate-200 dark:bg-white/10 dark:text-slate-200 dark:border-white/10";

    if (s === "active" || s === "valid") {
      cls =
        "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/30";
    } else if (s === "inactive" || s === "expired") {
      cls =
        "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-200 dark:border-rose-500/30";
    } else if (s.includes("yet")) {
      cls =
        "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/30";
    }

    return `${PILL} ${cls}`;
  }

  // Load projects
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setErr(null);
        const { data } = await api.get("/admin/projects");
        const list: any[] = Array.isArray(data) ? data : data?.projects ?? [];
        const minimal: ProjectLite[] = list
          .map((p: any) => ({
            projectId: p.projectId || p.id || p.uuid,
            title: p.title || p.name,
          }))
          .filter((p: ProjectLite) => p.projectId && p.title);
        if (!alive) return;
        setProjects(minimal);
      } catch (e: any) {
        if (!alive) return;
        setErr(
          e?.response?.data?.error || e?.message || "Failed to load projects."
        );
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Tile 3 (browse role users)
  const [allUsers, setAllUsers] = useState<UserLite[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersErr, setUsersErr] = useState<string | null>(null);

  const [statesRef, setStatesRef] = useState<StateRef[]>([]);
  const [districtsRef, setDistrictsRef] = useState<DistrictRef[]>([]);
  const [companyFilter, setCompanyFilter] = useState<string>("");

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "Active" | "Inactive"
  >("all");
  const [stateFilter, setStateFilter] = useState<string>("");
  const [districtFilter, setDistrictFilter] = useState<string>("");

  const [sortKey, setSortKey] = useState<
    | "code"
    | "name"
    | "company"
    | "projects"
    | "mobile"
    | "email"
    | "state"
    | "zone"
    | "status"
    | "updated"
  >("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const companyOptions = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const u of allUsers) {
      const mems = Array.isArray(u.userRoleMemberships)
        ? u.userRoleMemberships
        : [];
      for (const m of mems) {
        if (String(m?.role || "").toLowerCase() !== "contractor") continue;
        const name = (m?.company?.name || "").trim();
        if (name) set.add(name);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allUsers]);

  const hasActiveFilters =
    q.trim() !== "" ||
    statusFilter !== "all" ||
    stateFilter !== "" ||
    districtFilter !== "" ||
    companyFilter !== "";

  const clearFilters = () => {
    setQ("");
    setStatusFilter("all");
    setStateFilter("");
    setDistrictFilter("");
    setCompanyFilter("");
    setPage(1);
  };

  useEffect(() => {
    if (companyFilter && !companyOptions.includes(companyFilter)) {
      setCompanyFilter("");
    }
  }, [companyOptions, companyFilter]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setUsersLoading(true);
        setUsersErr(null);
        const { data } = await api.get("/admin/users", {
          params: { includeMemberships: "1" },
        });
        const list = (
          Array.isArray(data) ? data : data?.users ?? []
        ) as UserLite[];
        if (!alive) return;
        setAllUsers(list);
      } catch (e: any) {
        if (!alive) return;
        setUsersErr(
          e?.response?.data?.error || e?.message || "Failed to load users."
        );
      } finally {
        if (alive) setUsersLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get("/admin/states");
        const s = (
          Array.isArray(data) ? data : data?.states ?? []
        ) as StateRef[];
        if (!alive) return;
        setStatesRef(s);
      } catch {
        setStatesRef([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!stateFilter) {
          setDistrictsRef([]);
          return;
        }
        const st = statesRef.find((s) => s.name === stateFilter);
        const params = st?.stateId ? { stateId: st.stateId } : undefined;
        const { data } = await api.get("/admin/districts", { params });
        const d = (
          Array.isArray(data) ? data : data?.districts ?? []
        ) as DistrictRef[];
        if (!alive) return;
        setDistrictsRef(d);
      } catch {
        setDistrictsRef([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [stateFilter, statesRef]);

  type Row = {
    action: string;
    code: string;
    name: string;
    company: string;
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

  const rowsAll = useMemo<Row[]>(() => {
    const moved = movedIds;

    const onlyRole = allUsers
      .filter((u) => isRoleUser(u, "Contractor"))
      .filter((u) => !moved.has(u.userId));

    const filtered = onlyRole.filter((u) => {
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
      if (companyFilter) {
        const mems = Array.isArray(u.userRoleMemberships)
          ? u.userRoleMemberships
          : [];
        const companyNames = new Set(
          mems
            .filter((m) => String(m?.role || "").toLowerCase() === "contractor")
            .map((m) => (m?.company?.name || "").trim())
            .filter(Boolean) as string[]
        );
        if (!companyNames.has(companyFilter.trim())) return false;
      }
      return true;
    });

    const needle = q.trim().toLowerCase();
    const searched = needle
      ? filtered.filter((u) => {
          const hay = [
            u.code || "",
            displayName(u),
            companiesLabel(u),
            projectsLabel(u),
            phoneDisplay(u),
            u.email || "",
            u?.state?.name || "",
            u?.district?.name || "",
            u.operatingZone || "",
            u.userStatus || "",
            fmtLocalDateTime(u.updatedAt),
          ]
            .join(" ")
            .toLowerCase();
          return hay.includes(needle);
        })
      : filtered;

    const rows: Row[] = searched.map((u) => ({
      action: "",
      code: u.code || "",
      name: displayName(u),
      company: companiesLabel(u),
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

    const key = sortKey;
    const dir = sortDir;
    const cmp = (a: any, b: any) => {
      if (a === b) return 0;
      if (a == null) return -1;
      if (b == null) return 1;
      const aTime = Date.parse(String(a));
      const bTime = Date.parse(String(b));
      if (!Number.isNaN(aTime) && !Number.isNaN(bTime)) return aTime - bTime;
      const an = Number(a),
        bn = Number(b);
      if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
      return String(a).localeCompare(String(b));
    };
    rows.sort((ra, rb) => {
      const delta = cmp((ra as any)[key], (rb as any)[key]);
      return dir === "asc" ? delta : -delta;
    });

    return rows;
  }, [
    allUsers,
    statusFilter,
    stateFilter,
    districtFilter,
    q,
    sortKey,
    sortDir,
    movedIds,
    companyFilter,
  ]);

  const total = rowsAll.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageSafe = Math.min(Math.max(1, page), totalPages);
  const rowsPaged = useMemo<Row[]>(() => {
    const start = (pageSafe - 1) * pageSize;
    return rowsAll.slice(start, start + pageSize);
  }, [rowsAll, pageSafe, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  // Submit (assign)
  const canSubmit =
    selectedProjectId &&
    selectedIds.size > 0 &&
    validFrom &&
    validTo &&
    !assignLoading;

  const onAssign = async () => {
    const project = projects.find((p) => p.projectId === selectedProjectId);
    const projectTitle = project?.title || "(Unknown Project)";
    const selected = picked.filter((u) => selectedIds.has(u.userId));
    const names = selected.map(displayName).filter(Boolean);

    const dupes = selected.filter((u) =>
      alreadyAssignedToSelectedProject(u, selectedProjectId)
    );
    if (dupes.length > 0) {
      const lines = dupes.map((u) => {
        const name = displayName(u) || "(No name)";
        return `${name} has already assigned ${projectTitle}. If you wish to make changes, edit the Contractor Assignments.`;
      });
      alert(lines.join("\n"));
      return;
    }

    const ok = window.confirm(
      `Please Confirm your assignment:\n\n` +
        `Project: ${projectTitle}\n` +
        `Contractors: ${names.length ? names.join(", ") : "—"}\n` +
        `Validity: From ${validFrom} To ${validTo}\n\n` +
        `Press OK to assign, or Cancel to go back.`
    );
    if (!ok) return;

    const items = selected.map((u) => ({
      userId: u.userId,
      role: "Contractor",
      scopeType: "Project",
      projectId: selectedProjectId,
      companyId: contractorCompanyId(u),
      validFrom,
      validTo,
      isDefault: false,
    }));

    try {
      setAssignLoading(true);
      setErr(null);
      const { data } = await api.post("/admin/assignments/bulk", { items });
      alert(
        `Assigned ${
          data?.created ?? items.length
        } contractor(s) to "${projectTitle}".`
      );

      setSelectedIds(new Set());
      setMovedIds(new Set());
      setValidFrom("");
      setValidTo("");

      try {
        const { data: fresh } = await api.get("/admin/users", {
          params: { includeMemberships: "1" },
        });
        setAllUsers(Array.isArray(fresh) ? fresh : fresh?.users ?? []);
      } catch {}

      const el = document.querySelector(
        '[data-tile-name="Browse Contractors"]'
      );
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e: any) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        "Assign failed.";
      setErr(msg);
      alert(`Error: ${msg}`);
    } finally {
      setAssignLoading(false);
    }
  };

  // Move from Tile 3 to Tile 2
  const onMoveToTile2 = (user: UserLite) => {
    if (alreadyAssignedToSelectedProject(user, selectedProjectId)) {
      const projectTitle =
        projects.find((p) => p.projectId === selectedProjectId)?.title ||
        "(Selected Project)";
      const name = displayName(user) || "(No name)";
      alert(
        `${name} has already assigned ${projectTitle}. If you wish to make changes, edit the Contractor Assignments.`
      );
      return;
    }
    setPicked((prev) =>
      prev.some((u) => u.userId === user.userId) ? prev : [user, ...prev]
    );
    setMovedIds((prev) => {
      const next = new Set(prev);
      next.add(user.userId);
      return next;
    });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.add(user.userId);
      return next;
    });

    const el = document.querySelector('[data-tile-name="Roles & Options"]');
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const movedList = useMemo<UserLite[]>(() => {
    if (movedIds.size === 0) return [];
    return picked.filter((u) => movedIds.has(u.userId));
  }, [picked, movedIds]);

  const toggleChecked = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (validFrom && validTo && validTo <= validFrom) setValidTo("");
  }, [validFrom, validTo]);

  // ---- Tile 4 data: flatten Contractor assignments
  type AssignmentRow = {
    userId: string;
    userName: string;
    projectId: string;
    projectTitle: string;
    company: string;
    projects: string;
    status: string;
    validFrom: string;
    validTo: string;
    validity: string;
    updated: string;
    membershipId?: string | null;
    _user?: UserLite;
    _mem?: MembershipLite;
  };

  const assignedRows = useMemo<AssignmentRow[]>(() => {
    const rows: AssignmentRow[] = [];
    for (const u of allUsers) {
      const mems = Array.isArray(u.userRoleMemberships)
        ? u.userRoleMemberships
        : [];
      for (const m of mems) {
        if (String(m?.role || "").toLowerCase() !== "contractor") continue;
        const pj = m?.project;
        if (!pj?.projectId || !pj?.title) continue;

        const vf = fmtLocalDateOnly(m.validFrom);
        const vt = fmtLocalDateOnly(m.validTo);

        rows.push({
          userId: u.userId,
          userName: displayName(u) || "(No name)",
          projectId: pj.projectId,
          projectTitle: pj.title,
          company: m?.company?.name || "",
          projects: pj.title,
          status: u.userStatus || "",
          validFrom: vf,
          validTo: vt,
          validity: computeValidityLabel(vf, vt),
          updated: m?.updatedAt || u.updatedAt || "",
          membershipId: m?.id ?? null,
          _user: u,
          _mem: m,
        });
      }
    }
    return rows;
  }, [allUsers]);

  const [aSortKey, setASortKey] = useState<
    | "userName"
    | "company"
    | "projects"
    | "status"
    | "validFrom"
    | "validTo"
    | "updated"
  >("updated");
  const [aSortDir, setASortDir] = useState<"asc" | "desc">("desc");

  const assignedSortedRows = useMemo<AssignmentRow[]>(() => {
    const rows = [...assignedRows];
    const key = aSortKey;
    const dir = aSortDir;
    const cmp = (a: any, b: any) => {
      if (a === b) return 0;
      if (a == null) return -1;
      if (b == null) return 1;
      const aTime = Date.parse(String(a));
      const bTime = Date.parse(String(b));
      if (!Number.isNaN(aTime) && !Number.isNaN(bTime)) return aTime - bTime;
      const an = Number(a),
        bn = Number(b);
      if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
      return String(a).localeCompare(String(b));
    };
    rows.sort((ra, rb) => {
      const delta = cmp((ra as any)[key], (rb as any)[key]);
      return dir === "asc" ? delta : -delta;
    });
    return rows;
  }, [assignedRows, aSortKey, aSortDir]);

  // ===== Assignments pagination (shares same pageSize) =====
  const [aPage, setAPage] = useState(1);
  const aPageSize = pageSize;
  const aTotal = assignedSortedRows.length;
  const aTotalPages = Math.max(1, Math.ceil(aTotal / aPageSize));
  const aPageSafe = Math.min(Math.max(1, aPage), aTotalPages);

  const assignedRowsPaged = useMemo<AssignmentRow[]>(() => {
    const start = (aPageSafe - 1) * aPageSize;
    return assignedSortedRows.slice(start, start + aPageSize);
  }, [assignedSortedRows, aPageSafe, aPageSize]);

  useEffect(() => {
    if (aPage > aTotalPages) setAPage(aTotalPages);
  }, [aTotalPages, aPage]);

  // ===== Modals =====
  const [viewOpen, setViewOpen] = useState(false);
  const [viewRow, setViewRow] = useState<AssignmentRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<AssignmentRow | null>(null);
  const [editFrom, setEditFrom] = useState<string>("");
  const [editTo, setEditTo] = useState<string>("");
  const [origFrom, setOrigFrom] = useState<string>("");
  const [origTo, setOrigTo] = useState<string>("");
  const [pendingEditAlert, setPendingEditAlert] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openView = (row: AssignmentRow) => {
    setViewRow(row);
    setViewOpen(true);
  };
  const openEdit = (row: AssignmentRow) => {
    setDeleting(false);
    setEditRow(row);

    const currentFrom = fmtLocalDateOnly(row.validFrom) || "";
    const currentTo = fmtLocalDateOnly(row.validTo) || "";

    setEditFrom(currentFrom || todayLocalISO());
    setEditTo(currentTo || addDaysISO(todayLocalISO(), 1));

    setOrigFrom(currentFrom);
    setOrigTo(currentTo);

    setEditOpen(true);
  };

  useEffect(() => {
    if (!editOpen && pendingEditAlert) {
      const msg = pendingEditAlert;
      setPendingEditAlert(null);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => alert(msg));
      });
    }
  }, [editOpen, pendingEditAlert]);

  useEffect(() => {
    if (!editOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (deleting) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        setEditOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editOpen, deleting]);

  const onHardDeleteFromEdit = async () => {
    if (!editRow?.membershipId) {
      alert("Cannot remove: missing membership id.");
      return;
    }

    const confirm = window.confirm(
      [
        "This will permanently remove this Contractor assignment from the project.",
        "",
        `Contractor: ${editRow.userName}`,
        `Project:    ${editRow.projectTitle}`,
        "",
        "Are you sure you want to proceed?",
      ].join("\n")
    );
    if (!confirm) return;

    try {
      setDeleting(true);

      await api.delete(`/admin/assignments/${editRow.membershipId}`);

      const successMsg = [
        "Removed Contractor assignment",
        "",
        `Project:    ${editRow.projectTitle}`,
        `Contractor: ${editRow.userName}`,
      ].join("\n");

      const { data: fresh } = await api.get("/admin/users", {
        params: { includeMemberships: "1" },
      });
      setAllUsers(Array.isArray(fresh) ? fresh : fresh?.users ?? []);

      setEditOpen(false);
      setEditRow(null);
      setPendingEditAlert(successMsg);
    } catch (e: any) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        "Failed to remove assignment.";
      alert(msg);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      {/* Page Heading */}
      <div className="mb-4">
        <div className="text-xl font-extrabold text-slate-900 dark:text-white">
          Contractor Assignments
        </div>
        <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Assign contractors to projects and manage validity.
        </div>
        <div className="mt-2 h-1 w-10 rounded-full bg-[#FCC020]" />
      </div>

      {err && (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
          {err}
        </div>
      )}

      {/* Tile 1 — Projects */}
      <section
        className={`${CARD} mb-4`}
        aria-label="Tile: Projects"
        data-tile-name="Projects"
      >
        <SectionKicker
          title="Projects"
          subtitle="Choose the project to assign."
        />
        <div className="max-w-xl">
          <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-1 block">
            Project
          </label>
          <div className="relative">
            <select
              className={PILL_SELECT}
              value={selectedProjectId}
              onChange={(e) => {
                setSelectedProjectId(e.target.value);
                setPage(1);
                setAPage(1);
              }}
              title="Select project"
            >
              {projects.length === 0 ? (
                <option value="">Loading…</option>
              ) : (
                <>
                  <option value="">Select a project…</option>
                  {projects.map((p) => (
                    <option key={p.projectId} value={p.projectId}>
                      {p.title}
                    </option>
                  ))}
                </>
              )}
            </select>

            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-slate-500">
              ▼
            </span>
          </div>
        </div>
      </section>

      {/* Tile 2 — Roles & Options (Contractor) */}
      <section
        className={`${CARD} mb-5`}
        aria-label="Tile: Roles & Options"
        data-tile-name="Roles & Options"
      >
        <SectionKicker
          title="Roles & Options"
          subtitle="Pick from moved contractors & set validity."
        />

        <div className="space-y-5">
          {/* Subtile: moved list */}
          <div className="space-y-3" aria-label="Subtile: Moved Contractors">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Moved Contractors (select with checkbox)
              </label>

              <div className="text-xs text-slate-500 dark:text-slate-300">
                {selectedIds.size}/{movedList.length} selected
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/40 dark:bg-white/5 overflow-auto">
              {movedIds.size === 0 ? (
                <div className="p-4 text-sm text-slate-600 dark:text-slate-300">
                  <b>Move Contractors</b> from list below to assign roles.
                </div>
              ) : (
                <ul className="divide-y divide-slate-200 dark:divide-white/10">
                  {movedList.map((u: UserLite) => {
                    const checked = selectedIds.has(u.userId);
                    return (
                      <li
                        key={u.userId}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleChecked(u.userId)}
                            className="h-4 w-4 rounded-md border-slate-300 dark:border-white/20
             accent-[#00379C] focus:ring-2 focus:ring-[#00379C]/30 focus:ring-offset-0"
                          />
                          <div className="flex flex-col">
                            <div className="font-semibold text-slate-900 dark:text-white">
                              {displayName(u) || "(No name)"}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-300">
                              {u.code || ""}
                              {u.code ? " · " : ""}
                              {u.email || ""}
                              {u.email ? " · " : ""}
                              {phoneDisplay(u)}
                            </div>
                          </div>
                        </label>

                        <span className={OUTLINE_PILL}>
                          {u.userStatus || "—"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {movedList.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  className={BTN_SECONDARY}
                  onClick={() =>
                    setSelectedIds(new Set(movedList.map((m) => m.userId)))
                  }
                >
                  Select All
                </button>
                <button
                  className={BTN_SECONDARY}
                  onClick={() => setSelectedIds(new Set())}
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* Subtile: Validity */}
          <div className="space-y-3" aria-label="Subtile: Validity">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Validity
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  Valid From
                </div>
                <input
                  type="date"
                  className={PILL_DATE}
                  value={validFrom}
                  min={todayLocalISO()}
                  onChange={(e) => setValidFrom(e.target.value)}
                />
              </div>
              <div>
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  Valid To
                </div>
                <input
                  type="date"
                  className={PILL_DATE}
                  value={validTo}
                  min={validFrom || todayLocalISO()}
                  onChange={(e) => setValidTo(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-1 flex items-center justify-end gap-2">
              <button
                className={BTN_SECONDARY}
                onClick={() => {
                  setValidFrom("");
                  setValidTo("");
                  setSelectedIds(new Set());
                  setMovedIds(new Set());
                  const el = document.querySelector(
                    '[data-tile-name="Browse Contractors"]'
                  );
                  el?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                Cancel
              </button>

              <button
                className={`${BTN_PRIMARY} ${
                  !canSubmit ? "opacity-50 cursor-not-allowed" : ""
                }`}
                onClick={onAssign}
                disabled={!canSubmit}
                title={
                  canSubmit
                    ? "Assign selected contractors to project"
                    : "Select all required fields"
                }
              >
                {assignLoading ? "Assigning…" : "Assign"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Tile 3 — Browse Contractors */}
      <section
        className={`${CARD} mb-5`}
        aria-label="Tile: Browse Contractors"
        data-tile-name="Browse Contractors"
      >
        <SectionKicker
          title="Browse Contractors"
          subtitle="Search, filter, sort and move contractors into the selection."
        />

        {/* === CONTROLS === */}
        <div className="mb-4">
          {/* Line 1 */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1 block">
                Search
              </label>
              <input
                className={PILL_INPUT}
                placeholder="Code, name, company, project, phone, email…"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1 block">
                Status
              </label>
              <div className="relative">
                <select
                  className={PILL_SELECT}
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value as any);
                    setPage(1);
                  }}
                >
                  <option value="all">All</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-slate-500">
                  ▼
                </span>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1 block">
                State
              </label>
              <div className="relative">
                <select
                  className={PILL_SELECT}
                  value={stateFilter}
                  onChange={(e) => {
                    setStateFilter(e.target.value);
                    setDistrictFilter("");
                    setPage(1);
                  }}
                >
                  <option value="">All States</option>
                  {statesRef.map((s) => (
                    <option key={s.stateId} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-slate-500">
                  ▼
                </span>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1 block">
                District
              </label>
              <div className="relative">
                <select
                  className={PILL_SELECT}
                  value={districtFilter}
                  onChange={(e) => {
                    setDistrictFilter(e.target.value);
                    setPage(1);
                  }}
                  disabled={!stateFilter}
                  title={
                    stateFilter ? "Filter by district" : "Select a state first"
                  }
                >
                  <option value="">All Districts</option>
                  {districtsRef.map((d) => (
                    <option key={d.districtId} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-slate-500">
                  ▼
                </span>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1 block">
                Company
              </label>
              <div className="relative">
                <select
                  className={PILL_SELECT}
                  value={companyFilter}
                  onChange={(e) => {
                    setCompanyFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All Companies</option>
                  {companyOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-slate-500">
                  ▼
                </span>
              </div>
            </div>
          </div>

          {/* Line 2 */}
          <div className="mt-3 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1 block">
                  Sort By
                </label>
                <div className="relative">
                  <select
                    className={PILL_SELECT}
                    value={sortKey}
                    onChange={(e) => {
                      setSortKey(e.target.value as any);
                      setPage(1);
                    }}
                  >
                    <option value="name">Name</option>
                    <option value="code">Code</option>
                    <option value="company">Company</option>
                    <option value="projects">Projects</option>
                    <option value="mobile">Mobile</option>
                    <option value="email">Email</option>
                    <option value="state">State</option>
                    <option value="zone">Zone</option>
                    <option value="status">Status</option>
                    <option value="updated">Updated</option>
                  </select>
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-slate-500">
                    ▼
                  </span>
                </div>
              </div>

              <button
                className="h-8 w-8 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-neutral-950 shadow-sm hover:bg-slate-50 dark:hover:bg-white/5 flex items-center justify-center"
                onClick={() =>
                  setSortDir((d) => (d === "asc" ? "desc" : "asc"))
                }
                title="Toggle sort direction"
                aria-label="Toggle sort direction"
                type="button"
              >
                <span className="text-[12px] leading-none">
                  {sortDir === "asc" ? "▲" : "▼"}
                </span>
              </button>

              <button
                className={`${BTN_SECONDARY} ${
                  !hasActiveFilters ? "opacity-50 cursor-not-allowed" : ""
                }`}
                onClick={clearFilters}
                disabled={!hasActiveFilters}
                title="Clear all filters"
                type="button"
              >
                Clear
              </button>
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1 block text-left md:text-right">
                Rows per page
              </label>
              <div className="relative">
                <select
                  className={PILL_SELECT}
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                    setAPage(1);
                  }}
                >
                  {[10, 20, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-slate-500">
                  ▼
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <TableShell>
          <div className={TABLE_SCROLL}>
            {usersErr && (
              <div className="p-3 text-sm text-red-700 border-b border-slate-200 dark:border-white/10">
                {usersErr}
              </div>
            )}

            {usersLoading ? (
              <div className="p-4 text-sm text-slate-600 dark:text-slate-300">
                Loading contractors…
              </div>
            ) : rowsPaged.length === 0 ? (
              <div className="p-4 text-sm text-slate-600 dark:text-slate-300">
                No contractors match the selected criteria.
              </div>
            ) : (
              <table className="min-w-full text-xs">
                <StickyThead>
                  <tr>
                    <th className={TH}>Action</th>
                    {[
                      { key: "code", label: "Code" },
                      { key: "name", label: "Name" },
                      { key: "company", label: "Company" },
                      { key: "projects", label: "Project" },
                      { key: "mobile", label: "Mobile" },
                      { key: "email", label: "Email" },
                      { key: "state", label: "State" },
                      { key: "zone", label: "Zone" },
                      { key: "status", label: "Status" },
                      { key: "updated", label: "Updated" },
                    ].map((h) => {
                      const active = sortKey === (h.key as any);
                      return (
                        <th
                          key={h.key}
                          className={`${TH} cursor-pointer`}
                          title={`Sort by ${h.label}`}
                          onClick={() => {
                            if (sortKey !== (h.key as any)) {
                              setSortKey(h.key as any);
                              setSortDir("asc");
                            } else {
                              setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                            }
                            setPage(1);
                          }}
                        >
                          <span className="inline-flex items-center gap-1">
                            {h.label}
                            <span className="text-[10px] opacity-70">
                              {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                            </span>
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </StickyThead>

                <tbody>
                  {rowsPaged.map((r) => (
                    <tr key={r._id} className={TR}>
                      <td className={TD}>
                        <button
                          type="button"
                          aria-label="Move contractor"
                          title="Move to selection"
                          onClick={() => onMoveToTile2(r._raw!)}
                          className={ICON_MOVE}
                        >
                          <MoveUpIcon />
                        </button>
                      </td>

                      <td className={TD}>{r.code}</td>
                      <td className={TD}>{r.name}</td>

                      <td className="px-3 py-2 border-b border-slate-200 dark:border-white/10">
                        <div className="truncate max-w-[260px]">
                          {r.company}
                        </div>
                      </td>

                      <td className="px-3 py-2 border-b border-slate-200 dark:border-white/10">
                        <div className="truncate max-w-[360px]">
                          {r.projects}
                        </div>
                      </td>

                      <td className={TD}>{r.mobile}</td>
                      <td className={TD}>{r.email}</td>
                      <td className={TD}>{r.state}</td>
                      <td className={TD}>{r.zone}</td>

                      <td className={TD}>
                        <span className={pillClass(r.status || "—")}>
                          {r.status || "—"}
                        </span>
                      </td>

                      <td className={TD} title={fmtLocalDateTime(r.updated)}>
                        {fmtLocalDateTime(r.updated)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-3 py-2 text-xs border-t border-slate-200 dark:border-white/10 bg-white dark:bg-neutral-950">
            <div className="text-slate-500 dark:text-slate-300">
              Page <b className="text-slate-800 dark:text-white">{pageSafe}</b>{" "}
              of <b className="text-slate-800 dark:text-white">{totalPages}</b>{" "}
              · Showing{" "}
              <b className="text-slate-800 dark:text-white">
                {rowsPaged.length}
              </b>{" "}
              of <b className="text-slate-800 dark:text-white">{total}</b>{" "}
              contractors
            </div>
            <div className="flex items-center gap-1">
              <button
                className={BTN_SECONDARY}
                onClick={() => setPage(1)}
                disabled={pageSafe <= 1}
              >
                « First
              </button>
              <button
                className={BTN_SECONDARY}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pageSafe <= 1}
              >
                ‹ Prev
              </button>
              <button
                className={BTN_SECONDARY}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={pageSafe >= totalPages}
              >
                Next ›
              </button>
              <button
                className={BTN_SECONDARY}
                onClick={() => setPage(totalPages)}
                disabled={pageSafe >= totalPages}
              >
                Last »
              </button>
            </div>
          </div>
        </TableShell>
      </section>

      {/* Tile 4 — Contractor Assignments */}
      <section
        className={`${CARD}`}
        aria-label="Tile: Contractor Assignments"
        data-tile-name="Contractor Assignments"
      >
        <SectionKicker
          title="Contractor Assignments"
          subtitle="All contractors who have been assigned to projects."
        />

        <TableShell>
          <div className={TABLE_SCROLL}>
            {assignedRowsPaged.length === 0 ? (
              <div className="p-4 text-sm text-slate-600 dark:text-slate-300">
                No contractor assignments found.
              </div>
            ) : (
              <table className="min-w-full text-xs">
                <StickyThead>
                  <tr>
                    <th className={TH}>Action</th>
                    {[
                      { key: "userName", label: "Contractor" },
                      { key: "company", label: "Company" },
                      { key: "projects", label: "Project" },
                      { key: "status", label: "Status" },
                      { key: "validFrom", label: "Valid From" },
                      { key: "validTo", label: "Valid To" },
                      { key: "__validity", label: "Validity", noSort: true },
                      { key: "updated", label: "Updated" },
                    ].map((h) => {
                      const sortable = !(h as any).noSort;
                      const active = aSortKey === (h.key as any);
                      return (
                        <th
                          key={h.key}
                          className={`${TH} ${
                            sortable ? "cursor-pointer" : ""
                          }`}
                          title={sortable ? `Sort by ${h.label}` : h.label}
                          onClick={() => {
                            if (!sortable) return;
                            if (aSortKey !== (h.key as any)) {
                              setASortKey(h.key as any);
                              setASortDir("asc");
                            } else {
                              setASortDir((d) =>
                                d === "asc" ? "desc" : "asc"
                              );
                            }
                            setAPage(1);
                          }}
                        >
                          <span className="inline-flex items-center gap-1">
                            {h.label}
                            {sortable && (
                              <span className="text-[10px] opacity-70">
                                {active
                                  ? aSortDir === "asc"
                                    ? "▲"
                                    : "▼"
                                  : "↕"}
                              </span>
                            )}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </StickyThead>

                <tbody>
                  {assignedRowsPaged.map((r) => (
                    <tr
                      key={`${r.userId}-${r.projectId}-${r.membershipId || ""}`}
                      className={TR}
                    >
                      <td className={TD}>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            className={ICON_VIEW}
                            title="View"
                            aria-label="View assignment"
                            onClick={() => openView(r)}
                          >
                            <EyeIcon />
                          </button>

                          <button
                            type="button"
                            className={ICON_EDIT}
                            title="Edit validity"
                            aria-label="Edit assignment"
                            onClick={() => openEdit(r)}
                            disabled={!r.membershipId}
                          >
                            <PenIcon />
                          </button>
                        </div>
                      </td>

                      <td className={TD}>{r.userName}</td>

                      <td className="px-3 py-2 border-b border-slate-200 dark:border-white/10">
                        <div className="truncate max-w-[260px]">
                          {r.company || "—"}
                        </div>
                      </td>

                      <td className="px-3 py-2 border-b border-slate-200 dark:border-white/10">
                        <div className="truncate max-w-[360px]">
                          {r.projectTitle}
                        </div>
                      </td>

                      <td className={TD}>
                        <span className={pillClass(r.status || "—")}>
                          {r.status || "—"}
                        </span>
                      </td>

                      <td className={TD}>
                        {fmtLocalDateOnly(r.validFrom) || "—"}
                      </td>
                      <td className={TD}>
                        {fmtLocalDateOnly(r.validTo) || "—"}
                      </td>

                      <td className={TD}>
                        <span className={pillClass(r.validity || "—")}>
                          {r.validity || "—"}
                        </span>
                      </td>

                      <td className={TD} title={fmtLocalDateTime(r.updated)}>
                        {fmtLocalDateTime(r.updated)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-3 py-2 text-xs border-t border-slate-200 dark:border-white/10 bg-white dark:bg-neutral-950">
            <div className="text-slate-500 dark:text-slate-300">
              Page <b className="text-slate-800 dark:text-white">{aPageSafe}</b>{" "}
              of <b className="text-slate-800 dark:text-white">{aTotalPages}</b>{" "}
              · Showing{" "}
              <b className="text-slate-800 dark:text-white">
                {assignedRowsPaged.length}
              </b>{" "}
              of <b className="text-slate-800 dark:text-white">{aTotal}</b>{" "}
              assignments
            </div>

            <div className="flex items-center gap-1">
              <button
                className={BTN_SECONDARY}
                onClick={() => setAPage(1)}
                disabled={aPageSafe <= 1}
              >
                « First
              </button>
              <button
                className={BTN_SECONDARY}
                onClick={() => setAPage((p) => Math.max(1, p - 1))}
                disabled={aPageSafe <= 1}
              >
                ‹ Prev
              </button>
              <button
                className={BTN_SECONDARY}
                onClick={() => setAPage((p) => Math.min(aTotalPages, p + 1))}
                disabled={aPageSafe >= aTotalPages}
              >
                Next ›
              </button>
              <button
                className={BTN_SECONDARY}
                onClick={() => setAPage(aTotalPages)}
                disabled={aPageSafe >= aTotalPages}
              >
                Last »
              </button>
            </div>
          </div>
        </TableShell>
      </section>

      {/* ===== View Modal ===== */}
      {viewOpen && viewRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setViewOpen(false)}
          />
          <div className="relative bg-white dark:bg-neutral-950 rounded-2xl shadow-lg border border-slate-200 dark:border-white/10 w-full max-w-md p-5">
            <div className="text-lg font-bold text-slate-900 dark:text-white mb-1">
              Contractor Assignment
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-300 mb-4">
              {viewRow.userName} · {viewRow.projectTitle}
            </div>

            <div className="mb-4 overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
              <table className="min-w-full text-xs">
                <tbody>
                  {[
                    ["Contractor", viewRow.userName || "—"],
                    ["Project", viewRow.projectTitle || "—"],
                    ["Status", viewRow.status || "—"],
                    ["Valid From", fmtLocalDateOnly(viewRow.validFrom) || "—"],
                    ["Valid To", fmtLocalDateOnly(viewRow.validTo) || "—"],
                    ["Validity", viewRow.validity || "—"],
                    ["Last Updated", fmtLocalDateTime(viewRow.updated) || "—"],
                  ].map(([k, v]) => (
                    <tr
                      key={k}
                      className="odd:bg-slate-50/40 dark:odd:bg-white/5"
                    >
                      <td className="px-3 py-2 font-semibold whitespace-nowrap text-slate-700 dark:text-slate-200">
                        {k}
                      </td>
                      <td className="px-3 py-2 text-slate-800 dark:text-slate-100">
                        {v}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-2 flex justify-end">
              <button
                className={BTN_PRIMARY}
                onClick={() => setViewOpen(false)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Edit Modal ===== */}
      {editOpen && editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              if (!deleting) setEditOpen(false);
            }}
          />

          <div className="relative bg-white dark:bg-neutral-950 rounded-2xl shadow-lg border border-slate-200 dark:border-white/10 w-full max-w-md p-5">
            {deleting && (
              <div className="absolute inset-0 rounded-2xl bg-white/50 dark:bg-black/30 backdrop-blur-[1px] cursor-wait" />
            )}

            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="text-lg font-bold text-slate-900 dark:text-white">
                Edit Validity
              </div>
              <button
                className="h-9 px-3 rounded-full text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                onClick={onHardDeleteFromEdit}
                disabled={deleting || !editRow?.membershipId}
                title={
                  editRow?.membershipId
                    ? "Permanently remove this assignment"
                    : "Missing membership id"
                }
              >
                {deleting ? "Removing…" : "Remove"}
              </button>
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-300 mb-4">
              {editRow.userName} · {editRow.projectTitle}
            </div>

            <div className="mb-4 overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
              <table className="min-w-full text-xs">
                <tbody>
                  {[
                    ["Contractor", editRow.userName || "—"],
                    ["Project", editRow.projectTitle || "—"],
                    ["Status", editRow.status || "—"],
                  ].map(([k, v]) => (
                    <tr
                      key={k}
                      className="odd:bg-slate-100 dark:odd:bg-white/10"
                    >
                      <td className="px-3 py-2 font-semibold whitespace-nowrap text-slate-700 dark:text-slate-200">
                        {k}
                      </td>
                      <td className="px-3 py-2 text-slate-800 dark:text-slate-100">
                        {v}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  Valid From
                </div>
                <input
                  type="date"
                  className={PILL_DATE}
                  value={editFrom}
                  min={todayLocalISO()}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEditFrom(v);
                    if (editTo && editTo < v) setEditTo(v);
                  }}
                  disabled={deleting}
                />
              </div>

              <div>
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  Valid To
                </div>
                <input
                  type="date"
                  className={PILL_DATE}
                  value={editTo}
                  min={
                    editFrom && editFrom > todayLocalISO()
                      ? editFrom
                      : todayLocalISO()
                  }
                  onChange={(e) => setEditTo(e.target.value)}
                  disabled={deleting}
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                className={BTN_SECONDARY}
                onClick={() => setEditOpen(false)}
                disabled={deleting}
              >
                Cancel
              </button>

              <button
                className={`${BTN_PRIMARY} ${
                  !editRow?.membershipId || deleting
                    ? "opacity-50 cursor-not-allowed"
                    : ""
                }`}
                onClick={async () => {
                  const today = todayLocalISO();
                  if (!editFrom || !editTo) {
                    alert("Both Valid From and Valid To are required.");
                    return;
                  }
                  if (editTo < today) {
                    alert("Valid To cannot be before today.");
                    return;
                  }
                  if (editTo < editFrom) {
                    alert("Valid To must be on or after Valid From.");
                    return;
                  }
                  if (!editRow?.membershipId) {
                    alert("Cannot update: missing membership id.");
                    return;
                  }

                  try {
                    const companyId =
                      editRow?._mem?.company?.companyId ||
                      (editRow?._user
                        ? contractorCompanyId(editRow._user)
                        : null);

                    const payload: any = {
                      validTo: editTo,
                      scopeType: "Project",
                      projectId: editRow.projectId,
                      ...(companyId ? { companyId } : {}),
                    };
                    if (!origFrom || editFrom !== origFrom) {
                      payload.validFrom = editFrom;
                    }

                    await api.patch(
                      `/admin/assignments/${editRow.membershipId}`,
                      payload
                    );

                    const successMsg = [
                      `Updated validity`,
                      ``,
                      `Project: ${editRow.projectTitle}`,
                      `Contractor: ${editRow.userName}`,
                      ``,
                      `Valid From: ${origFrom || "—"} → ${editFrom}`,
                      `Valid To:   ${origTo || "—"} → ${editTo}`,
                    ].join("\n");

                    const { data: fresh } = await api.get("/admin/users", {
                      params: { includeMemberships: "1" },
                    });
                    setAllUsers(
                      Array.isArray(fresh) ? fresh : fresh?.users ?? []
                    );

                    setEditOpen(false);
                    setEditRow(null);
                    setPendingEditAlert(successMsg);
                  } catch (e: any) {
                    const msg =
                      e?.response?.data?.message ||
                      e?.response?.data?.error ||
                      e?.message ||
                      "Update failed.";
                    alert(msg);
                  }
                }}
                title="Update validity dates"
                disabled={!editRow?.membershipId || deleting}
              >
                Update
              </button>
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
  );
}
