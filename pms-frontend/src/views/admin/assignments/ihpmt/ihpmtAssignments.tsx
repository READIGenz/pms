// src/views/admin/assignments/ihpmt/ihpmtAssignments.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../../api/client";

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
  return [u.firstName, u.middleName, u.lastName].filter(Boolean).join(" ").trim();
}
function phoneDisplay(u: UserLite) {
  return [u.countryCode, u.phone].filter(Boolean).join(" ").trim();
}
function projectsLabel(u: UserLite): string {
  const mem = Array.isArray(u.userRoleMemberships) ? u.userRoleMemberships : [];
  const set = new Set(
    mem
      .filter((m) => isRole(m?.role, ROLE_IH_PMT))
      .map((m) => m?.project?.title)
      .filter(Boolean) as string[]
  );
  return Array.from(set).join(", ");
}
function companiesLabel(u: UserLite): string {
  const mem = Array.isArray(u.userRoleMemberships) ? u.userRoleMemberships : [];
  const set = new Set(
    mem
      .filter((m) => isRole(m?.role, ROLE_IH_PMT))
      .map((m) => m?.company?.name)
      .filter(Boolean) as string[]
  );
  return Array.from(set).join(", ");
}

// ---- Role helpers (avoid IH_PMT / IH-PMT / ih_pmt mismatches)
const ROLE_IH_PMT = "IH_PMT";
function normalizeRole(v?: string | null) {
  if (!v) return "";
  const s = String(v).trim();
  if (/^ih[-_ ]?pmt$/i.test(s)) return ROLE_IH_PMT; // IH_PMT, IH-PMT, ih pmt, etc.
  return s.toUpperCase();
}
function isRole(v: string | null | undefined, role: string) {
  return normalizeRole(v) === normalizeRole(role);
}
function isRoleUser(u: UserLite, role: string): boolean {
  const mem = Array.isArray(u.userRoleMemberships) ? u.userRoleMemberships : [];
  return mem.some((m) => isRole(m?.role, role));
}
// detect dup for selected project (for this role)
function alreadyAssignedToSelectedProject(u: UserLite, projectId: string): boolean {
  if (!projectId) return false;
  const mems = Array.isArray(u.userRoleMemberships) ? u.userRoleMemberships : [];
  return mems.some(
    (m) => isRole(m?.role, ROLE_IH_PMT) && m?.project?.projectId === projectId
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
function ihpmtCompanyId(u: UserLite): string | null {
  const mems = Array.isArray(u.userRoleMemberships) ? u.userRoleMemberships : [];
  const m = mems.find((m) => isRole(m?.role, ROLE_IH_PMT) && m?.company?.companyId);
  return (m?.company?.companyId as string) || null;
}

// ---------- UI atoms (match reference) ----------
const TileHeader = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <div className="mb-3">
    <div className="text-sm font-semibold dark:text-white">{title}</div>
    {subtitle ? (
      <div className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</div>
    ) : null}
  </div>
);

const TILE_SHELL =
  "bg-white dark:bg-neutral-900 rounded-2xl shadow-sm " +
  "border border-[#c9ded3] dark:border-neutral-800 p-4 mb-4";

const SOFT_SELECT =
  "h-9 w-full rounded-full border border-[#c9ded3] dark:border-neutral-800 " +
  "bg-[#f7fbf9] dark:bg-neutral-900 px-3 pr-8 text-xs sm:text-sm " +
  "text-slate-800 dark:text-white shadow-sm " +
  "focus:outline-none focus:ring-2 focus:ring-emerald-400/60 focus:border-emerald-400/60 appearance-none";

const SOFT_INPUT =
  "h-9 w-full rounded-full border border-slate-200/80 dark:border-neutral-800 " +
  "bg-white dark:bg-neutral-900 px-3 text-xs sm:text-sm " +
  "text-slate-800 dark:text-white placeholder:text-gray-400 shadow-sm " +
  "focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-transparent";

const SOFT_DATE =
  "mt-1 h-9 w-full rounded-full border border-[#c9ded3] dark:border-neutral-800 " +
  "bg-[#f7fbf9] dark:bg-neutral-900 px-3 text-xs sm:text-sm " +
  "text-slate-800 dark:text-white shadow-sm " +
  "focus:outline-none focus:ring-2 focus:ring-emerald-400/60 focus:border-emerald-400/60";

export default function IhpmtsAssignments() {
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
        // intentionally NOT auto-selecting first project
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.response?.data?.error || e?.message || "Failed to load projects.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [selectedProjectId]);

  // Tile 3 (browse role users) — using /admin/users
  const [allUsers, setAllUsers] = useState<UserLite[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersErr, setUsersErr] = useState<string | null>(null);

  const [statesRef, setStatesRef] = useState<StateRef[]>([]);
  const [districtsRef, setDistrictsRef] = useState<DistrictRef[]>([]);
  const [companyFilter, setCompanyFilter] = useState<string>("");

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "Active" | "Inactive">("all");
  const [stateFilter, setStateFilter] = useState<string>("");
  const [districtFilter, setDistrictFilter] = useState<string>("");

  // Match reference: Sort By default Name + separate arrow button
  const [sortKey, setSortKey] = useState<
    "code" | "name" | "company" | "projects" | "mobile" | "email" | "state" | "zone" | "status" | "updated"
  >("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const companyOptions = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const u of allUsers) {
      const mems = Array.isArray(u.userRoleMemberships) ? u.userRoleMemberships : [];
      for (const m of mems) {
        if (!isRole(m?.role, ROLE_IH_PMT)) continue;
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
        const { data } = await api.get("/admin/users", { params: { includeMemberships: "1" } });
        const list = (Array.isArray(data) ? data : data?.users ?? []) as UserLite[];
        if (!alive) return;
        setAllUsers(list);
      } catch (e: any) {
        if (!alive) return;
        setUsersErr(e?.response?.data?.error || e?.message || "Failed to load users.");
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
        const s = (Array.isArray(data) ? data : data?.states ?? []) as StateRef[];
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
        const d = (Array.isArray(data) ? data : data?.districts ?? []) as DistrictRef[];
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
      .filter((u) => isRoleUser(u, ROLE_IH_PMT))
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
        const mems = Array.isArray(u.userRoleMemberships) ? u.userRoleMemberships : [];
        const companyNames = new Set(
          mems
            .filter((m) => isRole(m?.role, ROLE_IH_PMT))
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
      const an = Number(a), bn = Number(b);
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
  }, [totalPages]);

  // Submit (assign)
  const canSubmit =
    selectedProjectId &&
    selectedIds.size > 0 &&
    validFrom &&
    validTo &&
    !assignLoading;

  // ===== Robust membership refresh helpers (kept exactly) =====
  const refetchUsers = async (): Promise<UserLite[]> => {
    const { data } = await api.get("/admin/users", { params: { includeMemberships: "1" } });
    const list = Array.isArray(data) ? data : data?.users ?? [];
    setAllUsers(list as UserLite[]);
    return list as UserLite[];
  };

  const normalizeId = (v: any) => String(v ?? "").trim();

  /** Try to find the freshest IH-PMT membership id for (userId, projectId) */
  const findCurrentMembershipId = async (userId: string, projectId: string) => {
    const pickBest = (mems: any[]) => {
      const candidates = mems
        .filter((mem) => isRole(mem?.role, ROLE_IH_PMT))
        .filter((mem) => normalizeId(mem?.project?.projectId) === normalizeId(projectId));

      if (candidates.length === 0) return null;

      // Sort by updatedAt desc, then validFrom desc, then id for stability
      candidates.sort((a, b) => {
        const au = Date.parse(a?.updatedAt ?? "") || 0;
        const bu = Date.parse(b?.updatedAt ?? "") || 0;
        if (au !== bu) return -(au - bu);
        const af =
          Date.parse(
            a.validFrom ??
              a.validFromDate ??
              a.from ??
              a.startDate ??
              a.valid_from ??
              a.validFromAt ??
              a.valid_from_at ??
              ""
          ) || 0;
        const bf =
          Date.parse(
            b.validFrom ??
              b.validFromDate ??
              b.from ??
              b.startDate ??
              b.valid_from ??
              b.validFromAt ??
              b.valid_from_at ??
              ""
          ) || 0;
        if (af !== bf) return -(af - bf);
        return String(b?.id ?? "").localeCompare(String(a?.id ?? ""));
      });

      const best = candidates[0];
      return (best?.id ?? best?._id ?? best?.membershipId ?? null) as string | null;
    };

    const match = (u?: UserLite | null) => pickBest(u?.userRoleMemberships || []);

    let id = match(allUsers.find((u) => u.userId === userId));
    if (id) return id;

    const users = await refetchUsers();
    id = match(users.find((u) => u.userId === userId));
    return id ?? null;
  };

  const [deleting, setDeleting] = useState(false);

  // Assign action
  const onAssign = async () => {
    const project = projects.find((p) => p.projectId === selectedProjectId);
    const projectTitle = project?.title || "(Unknown Project)";
    const selected = picked.filter((u) => selectedIds.has(u.userId));
    const names = selected.map(displayName).filter(Boolean);

    const dupes = selected.filter((u) => alreadyAssignedToSelectedProject(u, selectedProjectId));
    if (dupes.length > 0) {
      const lines = dupes.map((u) => {
        const name = displayName(u) || "(No name)";
        return `${name} has already assigned ${projectTitle}. If you wish to make changes, edit the IH-PMTs Assignments.`;
      });
      alert(lines.join("\n"));
      return;
    }

    const ok = window.confirm(
      `Please Confirm your assignment:\n\n` +
        `Project: ${projectTitle}\n` +
        `IH-PMT(s): ${names.length ? names.join(", ") : "—"}\n` +
        `Validity: From ${validFrom} To ${validTo}\n\n` +
        `Press OK to assign, or Cancel to go back.`
    );
    if (!ok) return;

    const items = selected.map((u) => ({
      userId: u.userId,
      role: "IH_PMT",
      scopeType: "Project",
      projectId: selectedProjectId,
      companyId: ihpmtCompanyId(u),
      validFrom,
      validTo,
      isDefault: false,
    }));

    try {
      setAssignLoading(true);
      setErr(null);
      const { data } = await api.post("/admin/assignments/bulk", { items });
      alert(`Assigned ${data?.created ?? items.length} IH-PMT(s) to "${projectTitle}".`);

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

      const el = document.querySelector('[data-tile-name="Browse IH-PMTs"]');
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
        projects.find((p) => p.projectId === selectedProjectId)?.title || "(Selected Project)";
      const name = displayName(user) || "(No name)";
      alert(`${name} has already assigned ${projectTitle}. If you wish to make changes, edit the IH-PMT Assignments.`);
      return;
    }
    setPicked((prev) => (prev.some((u) => u.userId === user.userId) ? prev : [user, ...prev]));
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

  // ---- Tile 4 data: flatten IH-PMT assignments
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
      const mems = Array.isArray(u.userRoleMemberships) ? u.userRoleMemberships : [];
      for (const m of mems) {
        if (!isRole(m?.role, ROLE_IH_PMT)) continue;
        const pj = m?.project;
        if (!pj?.projectId || !pj?.title) continue;

        const vf = fmtLocalDateOnly(
          m.validFrom ??
            (m as any).validFromDate ??
            (m as any).from ??
            (m as any).startDate ??
            (m as any).end ??
            (m as any).valid_from ??
            (m as any).validFromAt ??
            (m as any).valid_from_at
        );
        const vt = fmtLocalDateOnly(
          m.validTo ??
            (m as any).validToDate ??
            (m as any).to ??
            (m as any).endDate ??
            (m as any).end ??
            (m as any).valid_to ??
            (m as any).validToAt ??
            (m as any).valid_to_at
        );

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
    "userName" | "company" | "projects" | "status" | "validFrom" | "validTo" | "updated"
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
      const an = Number(a), bn = Number(b);
      if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
      return String(a).localeCompare(String(b));
    };

    rows.sort((ra, rb) => {
      const delta = cmp((ra as any)[key]);
      const delta2 = cmp((ra as any)[key], (rb as any)[key]);
      return dir === "asc" ? delta2 : -delta2;
    });

    return rows;
  }, [assignedRows, aSortKey, aSortDir]);

  // ===== Assignments pagination (uses shared Rows selector) =====
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

  const openView = (row: AssignmentRow) => {
    setViewRow(row);
    setViewOpen(true);
  };

  const openEdit = (row: AssignmentRow) => {
    setDeleting(false);
    setEditRow(row);

    const currentFrom = fmtLocalDateOnly(row.validFrom) || "";
    const currentTo = fmtLocalDateOnly(row.validTo) || "";

    // keep existing behavior for initial values
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
        requestAnimationFrame(() => {
          alert(msg);
        });
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
    if (!editRow) return;

    const resolvedId =
      editRow.membershipId || (await findCurrentMembershipId(editRow.userId, editRow.projectId));

    if (!resolvedId) {
      await refetchUsers();
      setEditOpen(false);
      setEditRow(null);
      setPendingEditAlert("Assignment already removed.");
      return;
    }

    const msg =
      `Remove assignment?\n\n` +
      `IH-PMT: ${editRow.userName}\n` +
      `Project: ${editRow.projectTitle}\n\n` +
      `This will permanently delete the assignment.`;

    if (!window.confirm(msg)) return;

    try {
      setDeleting(true);
      await api.delete(`/admin/assignments/${encodeURIComponent(resolvedId)}`);
      await refetchUsers();
      setEditOpen(false);
      setEditRow(null);
      setPendingEditAlert(`Unassigned ${editRow.userName} from ${editRow.projectTitle}.`);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 404) {
        await refetchUsers();
        setEditOpen(false);
        setEditRow(null);
        setPendingEditAlert("Assignment already removed.");
      } else {
        const errMsg =
          e?.response?.data?.message ||
          e?.response?.data?.error ||
          e?.message ||
          "Unassign failed.";
        alert(errMsg);
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold dark:text-white">IH-PMT Assignments</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Projects · Roles & Options · <b>Browse IH-PMTs</b> · IH-PMT Assignments
        </p>
        {err && <p className="mt-2 text-sm text-red-700 dark:text-red-400">{err}</p>}
      </div>

      {/* Tile 1 — Projects */}
      <section className={TILE_SHELL} aria-label="Tile: Projects" data-tile-name="Projects">
        <TileHeader title="Projects" subtitle="Choose the project to assign." />
        <div className="max-w-xl mt-2">
          <label className="text-[11px] font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1 block">
            Project
          </label>
          <div className="relative">
            <select
              className={SOFT_SELECT}
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
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-emerald-600/80">
              ▼
            </span>
          </div>
        </div>
      </section>

      {/* Tile 2 — Roles & Options (IH-PMT) */}
      <section className={TILE_SHELL} aria-label="Tile: Roles & Options" data-tile-name="Roles & Options">
        <TileHeader title="Roles & Options" subtitle="Pick from moved IH-PMTs & set validity." />

        {/* Match reference: stacked layout */}
        <div className="mt-3 space-y-4">
          {/* Subtile: moved list */}
          <div className="space-y-3" aria-label="Subtile: Moved IH-PMTs">
            <label className="text-[11px] font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400">
              Moved IH-PMTs (select with checkbox)
            </label>

            <div
              className="border border-slate-200/80 dark:border-neutral-800 rounded-2xl overflow-auto bg-slate-50/40 dark:bg-neutral-900/60"
              style={{ maxHeight: 300 }}
            >
              {movedIds.size === 0 ? (
                <div className="p-3 text-sm text-gray-600 dark:text-gray-300">
                  <b>Move IH-PMTs</b> from list below to assign roles.
                </div>
              ) : (
                <ul className="divide-y dark:divide-neutral-800">
                  {movedList.map((u: UserLite) => {
                    const checked = selectedIds.has(u.userId);
                    return (
                      <li key={u.userId} className="flex items-center justify-between gap-3 px-3 py-2">
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input type="checkbox" checked={checked} onChange={() => toggleChecked(u.userId)} />
                          <div className="flex flex-col">
                            <div className="font-medium dark:text-white">
                              {displayName(u) || "(No name)"}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {u.code || ""}
                              {u.code ? " · " : ""}
                              {u.email || ""}
                              {u.email ? " · " : ""}
                              {phoneDisplay(u)}
                            </div>
                          </div>
                        </label>
                        <span className="text-[11px] px-2 py-0.5 rounded-full border border-slate-200 dark:border-neutral-700">
                          {u.userStatus || "—"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {movedList.length > 0 && (
              <div className="flex gap-2">
                <button
                  className="h-9 px-4 rounded-full border border-slate-200/80 dark:border-neutral-800 text-xs sm:text-sm bg-white dark:bg-neutral-900 hover:bg-slate-50 dark:hover:bg-neutral-800"
                  onClick={() => setSelectedIds(new Set(movedList.map((m) => m.userId)))}
                >
                  Select All
                </button>
                <button
                  className="h-9 px-4 rounded-full border border-slate-200/80 dark:border-neutral-800 text-xs sm:text-sm bg-white dark:bg-neutral-900 hover:bg-slate-50 dark:hover:bg-neutral-800"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* Subtile: Validity */}
          <div className="space-y-3" aria-label="Subtile: Validity">
            <label className="text-[11px] font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400">
              Validity
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-gray-600 dark:text-gray-300">Valid From</div>
                <input
                  type="date"
                  className={SOFT_DATE}
                  value={validFrom}
                  min={todayLocalISO()}
                  onChange={(e) => setValidFrom(e.target.value)}
                />
              </div>
              <div>
                <div className="text-xs text-gray-600 dark:text-gray-300">Valid To</div>
                <input
                  type="date"
                  className={SOFT_DATE}
                  value={validTo}
                  min={validFrom || todayLocalISO()}
                  onChange={(e) => setValidTo(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                className="h-9 px-4 rounded-full border border-slate-200/80 dark:border-neutral-800 text-xs sm:text-sm bg-white dark:bg-neutral-900 hover:bg-slate-50 dark:hover:bg-neutral-800"
                onClick={() => {
                  setValidFrom("");
                  setValidTo("");
                  setSelectedIds(new Set());
                  setMovedIds(new Set());
                  const el = document.querySelector('[data-tile-name="Browse IH-PMTs"]');
                  el?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                Cancel
              </button>
              <button
                className={
                  "h-9 px-4 rounded-full text-xs sm:text-sm text-white shadow-sm " +
                  (canSubmit ? "bg-emerald-600 hover:bg-emerald-700" : "bg-emerald-600/50 cursor-not-allowed")
                }
                onClick={onAssign}
                disabled={!canSubmit}
                title={canSubmit ? "Assign selected IH-PMTs to project" : "Select all required fields"}
              >
                {assignLoading ? "Assigning…" : "Assign"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Tile 3 — Browse IH-PMTs */}
      <section className={TILE_SHELL} aria-label="Tile: Browse IH-PMTs" data-tile-name="Browse IH-PMTs">
        <TileHeader
          title="Browse IH-PMTs"
          subtitle="Search and filter; sort columns; paginate. Use the up arrow to move IH-PMTs to Tile 2."
        />

        {/* === CONTROLS (match reference layout) === */}
        <div className="mb-3">
          {/* Line 1 */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1 block">
                Search
              </label>
              <input
                className={SOFT_INPUT}
                placeholder="Code, name, company, project, phone, email…"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            <div>
              <label className="text-[11px] font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1 block">
                Status
              </label>
              <div className="relative">
                <select
                  className={SOFT_SELECT}
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
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-emerald-600/80">
                  ▼
                </span>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1 block">
                State
              </label>
              <div className="relative">
                <select
                  className={SOFT_SELECT}
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
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-emerald-600/80">
                  ▼
                </span>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1 block">
                District
              </label>
              <div className="relative">
                <select
                  className={SOFT_SELECT}
                  value={districtFilter}
                  onChange={(e) => {
                    setDistrictFilter(e.target.value);
                    setPage(1);
                  }}
                  disabled={!stateFilter}
                  title={stateFilter ? "Filter by district" : "Select a state first"}
                >
                  <option value="">All Districts</option>
                  {districtsRef.map((d) => (
                    <option key={d.districtId} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-emerald-600/80">
                  ▼
                </span>
              </div>
            </div>

            {/* Company */}
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1 block">
                Company
              </label>
              <div className="relative">
                <select
                  className={SOFT_SELECT}
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
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-emerald-600/80">
                  ▼
                </span>
              </div>
            </div>
          </div>

          {/* Line 2 */}
          <div className="mt-3 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
            <div className="flex items-end gap-2">
              <div>
                <label className="text-[11px] font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1 block">
                  Sort By
                </label>
                <div className="relative">
                  <select
                    className={SOFT_SELECT}
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
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-emerald-600/80">
                    ▼
                  </span>
                </div>
              </div>

              <button
                className="inline-flex items-center justify-center h-9 w-9 rounded-full border border-slate-200/80 dark:border-neutral-800 text-xs bg-white dark:bg-neutral-900 hover:bg-gray-50 dark:hover:bg-neutral-800"
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                title="Toggle sort direction"
                aria-label="Toggle sort direction"
              >
                {sortDir === "asc" ? "▲" : "▼"}
              </button>

              <button
                className="h-9 px-3 rounded-full border border-slate-200/80 dark:border-neutral-800 text-xs bg-white dark:bg-neutral-900 hover:bg-gray-50 dark:hover:bg-neutral-800 disabled:opacity-50"
                onClick={clearFilters}
                disabled={!hasActiveFilters}
                title="Clear all filters"
              >
                Clear
              </button>
            </div>

            <div>
              <label className="text-[11px] font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1 block text-left md:text-right">
                Rows per page
              </label>
              <div className="relative">
                <select
                  className={SOFT_SELECT}
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
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-emerald-600/80">
                  ▼
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Table shell */}
        <div className="border border-slate-200/80 dark:border-neutral-800 rounded-2xl overflow-hidden">
          <div className="overflow-auto" style={{ maxHeight: "55vh" }}>
            {usersErr && (
              <div className="p-3 text-sm text-red-700 dark:text-red-400 border-b dark:border-neutral-800">
                {usersErr}
              </div>
            )}
            {usersLoading ? (
              <div className="p-4 text-sm text-gray-600 dark:text-gray-300">
                Loading IH-PMTs…
              </div>
            ) : rowsPaged.length === 0 ? (
              <div className="p-4 text-sm text-gray-600 dark:text-gray-300">
                No IH-PMTs match the selected criteria.
              </div>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-neutral-800 sticky top-0 z-10">
                  <tr>
                    {[
                      { key: "action", label: "Action" },
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
                      const sortable = h.key !== "action";
                      const active = sortKey === (h.key as any);
                      return (
                        <th
                          key={h.key}
                          className={
                            "text-left font-semibold px-3 py-2 border-b dark:border-neutral-700 whitespace-nowrap select-none " +
                            (sortable ? "cursor-pointer" : "")
                          }
                          title={sortable ? `Sort by ${h.label}` : undefined}
                          onClick={() => {
                            if (!sortable) return;
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
                            {sortable && (
                              <span className="text-xs opacity-70">
                                {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                              </span>
                            )}
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
                          type="button"
                          aria-label="Move IH-PMT"
                          title="Move to selection"
                          onClick={() => onMoveToTile2(r._raw!)}
                          className="
                            inline-flex items-center justify-center
                            w-8 h-8 rounded-full
                            border border-slate-200
                            bg-white text-slate-700
                            hover:bg-slate-50
                            dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800
                          "
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M12 19V5" />
                            <path d="M6.5 10.5L12 5l5.5 5.5" />
                          </svg>
                        </button>
                      </td>

                      <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap">
                        {r.code}
                      </td>
                      <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap">
                        {r.name}
                      </td>
                      <td className="px-3 py-2 border-b dark:border-neutral-800">
                        <div className="truncate max-w-[260px]">{r.company}</div>
                      </td>
                      <td className="px-3 py-2 border-b dark:border-neutral-800">
                        <div className="truncate max-w-[360px]">{r.projects}</div>
                      </td>
                      <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap">
                        {r.mobile}
                      </td>
                      <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap">
                        {r.email}
                      </td>
                      <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap">
                        {r.state}
                      </td>
                      <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap">
                        {r.zone}
                      </td>
                      <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap">
                        {r.status}
                      </td>
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
          <div className="flex items-center justify-between px-3 py-2 text-xs border-t dark:border-neutral-800 bg-white dark:bg-neutral-900">
            <div className="text-gray-600 dark:text-gray-300">
              Page <b>{pageSafe}</b> of <b>{totalPages}</b> · Showing{" "}
              <b>{rowsPaged.length}</b> of <b>{total}</b> IH-PMTs
              {stateFilter ? <> · State: <b>{stateFilter}</b></> : null}
              {districtFilter ? <> · District: <b>{districtFilter}</b></> : null}
              {statusFilter !== "all" ? <> · Status: <b>{statusFilter}</b></> : null}
              {companyFilter ? <> · Company: <b>{companyFilter}</b></> : null}
            </div>
            <div className="flex items-center gap-1">
              <button
                className="px-3 py-1 rounded-full border border-slate-200 dark:border-neutral-800 disabled:opacity-50"
                onClick={() => setPage(1)}
                disabled={pageSafe <= 1}
                title="First"
              >
                « First
              </button>
              <button
                className="px-3 py-1 rounded-full border border-slate-200 dark:border-neutral-800 disabled:opacity-50"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pageSafe <= 1}
                title="Previous"
              >
                ‹ Prev
              </button>
              <button
                className="px-3 py-1 rounded-full border border-slate-200 dark:border-neutral-800 disabled:opacity-50"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={pageSafe >= totalPages}
                title="Next"
              >
                Next ›
              </button>
              <button
                className="px-3 py-1 rounded-full border border-slate-200 dark:border-neutral-800 disabled:opacity-50"
                onClick={() => setPage(totalPages)}
                disabled={pageSafe >= totalPages}
                title="Last"
              >
                Last »
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Tile 4 — IH-PMTs Assignments */}
      <section
        className={TILE_SHELL.replace("mb-4", "")}
        aria-label="Tile: IH-PMTs Assignments"
        data-tile-name="IH-PMT Assignments"
      >
        <TileHeader title="IH-PMTs Assignments" subtitle="All IH-PMTs who have been assigned to projects." />

        <div className="border border-slate-200/80 dark:border-neutral-800 rounded-2xl overflow-hidden">
          <div className="overflow-auto" style={{ maxHeight: "55vh" }}>
            {assignedSortedRows.length === 0 ? (
              <div className="p-4 text-sm text-gray-600 dark:text-gray-300">
                No IH-PMT assignments found.
              </div>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-neutral-800 sticky top-0 z-10">
                  <tr>
                    <th className="text-left font-semibold px-3 py-2 border-b dark:border-neutral-700 whitespace-nowrap">
                      Action
                    </th>
                    {[
                      { key: "userName", label: "Name" },
                      { key: "company", label: "Company" },
                      { key: "projects", label: "Projects" },
                      { key: "status", label: "Status" },
                      { key: "validFrom", label: "Valid From" },
                      { key: "validTo", label: "Valid To" },
                      { key: "updated", label: "Last Updated" },
                    ].map((h) => {
                      const active = aSortKey === (h.key as any);
                      return (
                        <th
                          key={h.key}
                          className="text-left font-semibold px-3 py-2 border-b dark:border-neutral-700 whitespace-nowrap select-none cursor-pointer"
                          title={`Sort by ${h.label}`}
                          onClick={() => {
                            if (aSortKey !== (h.key as any)) {
                              setASortKey(h.key as any);
                              setASortDir("asc");
                            } else {
                              setASortDir((d) => (d === "asc" ? "desc" : "asc"));
                            }
                          }}
                        >
                          <span className="inline-flex items-center gap-1">
                            {h.label}
                            <span className="text-xs opacity-70">
                              {active ? (aSortDir === "asc" ? "▲" : "▼") : "↕"}
                            </span>
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody>
                  {assignedRowsPaged.map((r, i) => (
                    <tr
                      key={`${r.userId}-${r.projectId}-${i}`}
                      className="odd:bg-gray-50/50 dark:odd:bg-neutral-900/60"
                    >
                      <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {/* View icon */}
                          <button
                            type="button"
                            aria-label="View assignment"
                            title="View"
                            onClick={() => openView(r)}
                            className="inline-flex items-center justify-center w-7 h-7 bg-transparent text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.6}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Z" />
                              <circle cx="12" cy="12" r="2.5" />
                            </svg>
                          </button>

                          {/* Edit icon */}
                          <button
                            type="button"
                            aria-label="Edit assignment"
                            title="Edit"
                            onClick={() => openEdit(r)}
                            disabled={!r.membershipId}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-rose-500 hover:text-rose-600 hover:bg-rose-50/70 dark:hover:bg-rose-900/40 disabled:opacity-50"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              className="w-4 h-4"
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

                      <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap">
                        {r.userName}
                      </td>
                      <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap">
                        {r.company || "—"}
                      </td>
                      <td className="px-3 py-2 border-b dark:border-neutral-800">
                        <div className="truncate max-w-[360px]">{r.projects || "—"}</div>
                      </td>
                      <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap">
                        {r.status || "—"}
                      </td>
                      <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap">
                        {fmtLocalDateOnly(r.validFrom) || "—"}
                      </td>
                      <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap">
                        {fmtLocalDateOnly(r.validTo) || "—"}
                      </td>
                      <td className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap">
                        {fmtLocalDateTime(r.updated) || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination for assignments */}
          <div className="flex items-center justify-between px-3 py-2 text-xs border-t dark:border-neutral-800 bg-white dark:bg-neutral-900">
            <div className="text-gray-600 dark:text-gray-300">
              Page <b>{aPageSafe}</b> of <b>{aTotalPages}</b> · Showing{" "}
              <b>{assignedRowsPaged.length}</b> of <b>{aTotal}</b> IH-PMT assignments
            </div>
            <div className="flex items-center gap-1">
              <button
                className="px-3 py-1 rounded-full border border-slate-200 dark:border-neutral-800 disabled:opacity-50"
                onClick={() => setAPage(1)}
                disabled={aPageSafe <= 1}
                title="First"
              >
                « First
              </button>
              <button
                className="px-3 py-1 rounded-full border border-slate-200 dark:border-neutral-800 disabled:opacity-50"
                onClick={() => setAPage((p) => Math.max(1, p - 1))}
                disabled={aPageSafe <= 1}
                title="Previous"
              >
                ‹ Prev
              </button>
              <button
                className="px-3 py-1 rounded-full border border-slate-200 dark:border-neutral-800 disabled:opacity-50"
                onClick={() => setAPage((p) => Math.min(aTotalPages, p + 1))}
                disabled={aPageSafe >= aTotalPages}
                title="Next"
              >
                Next ›
              </button>
              <button
                className="px-3 py-1 rounded-full border border-slate-200 dark:border-neutral-800 disabled:opacity-50"
                onClick={() => setAPage(aTotalPages)}
                disabled={aPageSafe >= aTotalPages}
                title="Last"
              >
                Last »
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ===== View Modal ===== */}
      {viewOpen && viewRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setViewOpen(false)} />
          <div className="relative bg-white dark:bg-neutral-900 rounded-2xl shadow-lg border dark:border-neutral-800 w-full max-w-md p-4">
            <div className="text-lg font-semibold mb-2 dark:text-white">IH-PMT Assignment</div>
            <div className="text-xs text-gray-600 dark:text-gray-300 mb-3">
              {viewRow.userName} · {viewRow.projectTitle}
            </div>
            <div className="mb-4 overflow-hidden rounded-xl border dark:border-neutral-800">
              <table className="min-w-full text-sm">
                <tbody>
                  <tr className="odd:bg-gray-50/60 dark:odd:bg-neutral-900/60">
                    <td className="px-3 py-2 font-medium whitespace-nowrap">IH-PMT</td>
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
                className="h-9 px-4 rounded-full border border-slate-200/80 dark:border-neutral-800 text-xs sm:text-sm bg-white dark:bg-neutral-900 hover:bg-slate-50 dark:hover:bg-neutral-800"
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
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              if (!deleting) setEditOpen(false);
            }}
          />
          <div className="relative bg-white dark:bg-neutral-900 rounded-2xl shadow-lg border dark:border-neutral-800 w-full max-w-md p-4">
            {deleting && (
              <div className="absolute inset-0 rounded-2xl bg-white/40 dark:bg:black/30 backdrop-blur-[1px] cursor-wait" />
            )}

            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="text-lg font-semibold dark:text-white">Edit Validity</div>
              <button
                className="h-9 px-3 rounded-full text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                onClick={onHardDeleteFromEdit}
                disabled={deleting || !editRow?.membershipId}
                title={editRow?.membershipId ? "Permanently remove this assignment" : "Missing membership id"}
              >
                {deleting ? "Removing…" : "Remove"}
              </button>
            </div>

            <div className="text-xs text-gray-600 dark:text-gray-300 mb-3">
              {editRow.userName} · {editRow.projectTitle}
            </div>

            <div className="mb-4 overflow-hidden rounded-xl border dark:border-neutral-800">
              <table className="min-w-full text-sm">
                <tbody>
                  <tr className="odd:bg-gray-50/60 dark:odd:bg-neutral-900/60">
                    <td className="px-3 py-2 font-medium whitespace-nowrap">IH-PMT</td>
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
                  className={SOFT_DATE}
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
                <div className="text-xs text-gray-600 dark:text-gray-300">Valid To</div>
                <input
                  type="date"
                  className={SOFT_DATE}
                  value={editTo}
                  min={editFrom && editFrom > todayLocalISO() ? editFrom : todayLocalISO()}
                  onChange={(e) => setEditTo(e.target.value)}
                  disabled={deleting}
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="h-9 px-4 rounded-full border border-slate-200/80 dark:border-neutral-800 text-xs sm:text-sm bg-white dark:bg-neutral-900 hover:bg-slate-50 dark:hover:bg-neutral-800 disabled:opacity-50"
                onClick={() => setEditOpen(false)}
                disabled={deleting}
              >
                Cancel
              </button>

              <button
                className="h-9 px-4 rounded-full text-xs sm:text-sm text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
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
                      (editRow?._user ? ihpmtCompanyId(editRow._user) : null);

                    const payload: any = {
                      validTo: editTo,
                      scopeType: "Project",
                      projectId: editRow.projectId,
                      ...(companyId ? { companyId } : {}),
                    };
                    if (!origFrom || editFrom !== origFrom) {
                      payload.validFrom = editFrom;
                    }

                    await api.patch(`/admin/assignments/${editRow.membershipId}`, payload);

                    const successMsg = [
                      `Updated validity`,
                      ``,
                      `Project: ${editRow.projectTitle}`,
                      `IH-PMT: ${editRow.userName}`,
                      ``,
                      `Valid From: ${origFrom || "—"} → ${editFrom}`,
                      `Valid To:   ${origTo || "—"} → ${editTo}`,
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
    </div>
  );
}
