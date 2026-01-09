// src/views/admin/assignments/consultants/consultantsAssignments.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../../api/client";

// ---------- Types ----------
type ProjectLite = { projectId: string; title: string };

type MembershipLite = {
  id?: string | null; // membership id for edit/delete
  role?: string | null;
  project?: { projectId?: string; title?: string } | null;
  company?: { companyId?: string; name?: string; code?: string } | null;
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

  isConsultant?: boolean | null;
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
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : formatLocalYMD(d);
}
function isYmd(s?: string) {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function floorForEditFrom(existingFrom: string): string {
  const today = todayLocalISO();
  // lock to existing date only if it's already in the past
  return existingFrom && existingFrom < today ? existingFrom : "";
}

// ---------- Small utils ----------
function displayName(u: UserLite) {
  return [u.firstName, u.middleName, u.lastName].filter(Boolean).join(" ").trim();
}
function phoneDisplay(u: UserLite) {
  const cc = String(u.countryCode ?? "").trim().replace(/^\+/, "");
  const ph = String(u.phone ?? "").trim();
  if (cc && ph) return `+${cc}${ph}`;
  if (ph) return ph;
  return "";
}

// robustly read membership dates regardless of API key shape -> always local YYYY-MM-DD
function pickMembershipDate(m: any, primary: "validFrom" | "validTo"): string {
  if (!m) return "";
  const candidates = [
    primary,
    `${primary}Date`,
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

function isConsultantUser(u: UserLite): boolean {
  if (u.isConsultant === true) return true;
  const mem = Array.isArray(u.userRoleMemberships) ? u.userRoleMemberships : [];
  return mem.some((m) => String(m?.role || "").toLowerCase() === "consultant");
}

function projectsLabel(u: UserLite): string {
  const mem = Array.isArray(u.userRoleMemberships) ? u.userRoleMemberships : [];
  const set = new Set(
    mem
      .filter((m) => String(m?.role || "").toLowerCase() === "consultant")
      .map((m) => m?.project?.title)
      .filter(Boolean) as string[]
  );
  return Array.from(set).join(", ");
}

// prevent duplicate assignment to selected project
function alreadyAssignedToSelectedProject(u: UserLite, projectId: string): boolean {
  if (!projectId) return false;
  const mems = Array.isArray(u.userRoleMemberships) ? u.userRoleMemberships : [];
  return mems.some(
    (m) =>
      String(m?.role || "").toLowerCase() === "consultant" &&
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

/** CompanyEdit-style section header */
const SectionHeader = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <div className="mb-4">
    <div className="flex items-center gap-3">
      <span className="h-5 w-1.5 rounded-full bg-[#FCC020]" />
      <div className="text-[11px] sm:text-sm font-extrabold tracking-[0.18em] uppercase text-[#00379C] dark:text-[#FCC020]">
        {title}
      </div>
    </div>
    {subtitle ? (
      <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{subtitle}</div>
    ) : null}
  </div>
);

// --- UI helper: status pill color (same as Companies/Users table) ---
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

function ValidityBadge({ value }: { value: string }) {
  const v = (value || "").toLowerCase();
  let cls =
    "bg-slate-100 text-slate-700 border-slate-200 dark:bg-white/5 dark:text-slate-200 dark:border-white/10";

  if (v === "valid") {
    cls =
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-200 dark:border-emerald-900/40";
  } else if (v === "yet to start") {
    cls =
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-200 dark:border-amber-900/40";
  } else if (v === "expired") {
    cls =
      "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-200 dark:border-rose-900/40";
  }

  return (
    <span
      className={
        "inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium " +
        cls
      }
    >
      {value || "—"}
    </span>
  );
}

// ===== UI constants (CompanyEdit look) =====
const CARD =
  "bg-white dark:bg-neutral-950 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm p-5";

// Smaller pills (more compact + cleaner)
const PILL_INPUT =
  "h-9 w-full rounded-full border border-slate-200 dark:border-white/10 " +
  "bg-white dark:bg-neutral-950 px-3 text-[13px] text-slate-900 dark:text-slate-100 shadow-sm " +
  "placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00379C]/20 dark:focus:ring-[#FCC020]/20 focus:border-transparent";

const PILL_SELECT =
  "h-9 w-full rounded-full border border-slate-200 dark:border-white/10 " +
  "bg-white dark:bg-neutral-950 px-3 pr-9 text-[13px] text-slate-900 dark:text-slate-100 shadow-sm " +
  "focus:outline-none focus:ring-2 focus:ring-[#00379C]/20 dark:focus:ring-[#FCC020]/20 focus:border-transparent appearance-none";

const PILL_DATE = PILL_INPUT;

// Buttons EXACT same sizing as CompanyEdit/UserEdit pages
const btnSmBase =
  "h-8 px-3 rounded-full text-[11px] font-semibold shadow-sm hover:brightness-105 " +
  "focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-neutral-950 " +
  "disabled:opacity-60 disabled:cursor-not-allowed";
const BTN_SECONDARY =
  `${btnSmBase} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 ` +
  "dark:border-white/10 dark:bg-neutral-950 dark:text-slate-200 dark:hover:bg-white/5";
const BTN_PRIMARY = `${btnSmBase} bg-[#00379C] text-white hover:brightness-110 focus:ring-[#00379C]/35`;

const ICON_BTN =
  "inline-flex items-center justify-center h-8 w-8 rounded-full border border-slate-200 dark:border-white/10 " +
  "bg-white dark:bg-neutral-950 hover:bg-slate-50 dark:hover:bg-white/5";

// Companies-table style tiny controls (used for pagination)
const ctl =
  "h-8 rounded-full border px-3 text-[11px] font-semibold shadow-sm transition " +
  "focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-neutral-950 active:scale-[0.98]";
const ctlLight =
  "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 " +
  "dark:border-white/10 dark:bg-neutral-950 dark:text-slate-200 dark:hover:bg-white/5";

export default function ConsultantsAssignments() {
  const nav = useNavigate();

  // --- Auth gate only (keep Assignments page heading consistent) ---
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) nav("/login", { replace: true });
  }, [nav]);

  // Common state
  const [err, setErr] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  // Tile 2 (consultant selection + validity)
  const [consultants, setConsultants] = useState<UserLite[]>([]);
  const [selectedConsultantIds, setSelectedConsultantIds] = useState<Set<string>>(new Set());
  const [validFrom, setValidFrom] = useState<string>(todayLocalISO());
  const [validTo, setValidTo] = useState<string>("");

  const [movedConsultantIds, setMovedConsultantIds] = useState<Set<string>>(new Set());
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
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.response?.data?.error || e?.message || "Failed to load projects.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Tile 3 (browse consultants) data + refs
  const [allUsers, setAllUsers] = useState<UserLite[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersErr, setUsersErr] = useState<string | null>(null);

  const [statesRef, setStatesRef] = useState<StateRef[]>([]);
  const [districtsRef, setDistrictsRef] = useState<DistrictRef[]>([]);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "Active" | "Inactive">("all");
  const [stateFilter, setStateFilter] = useState<string>("");
  const [districtFilter, setDistrictFilter] = useState<string>("");

  const [sortKey, setSortKey] = useState<
    "code" | "name" | "projects" | "mobile" | "email" | "state" | "district" | "zone" | "status" | "updated"
  >("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [origFrom, setOrigFrom] = useState<string>("");
  const [origTo, setOrigTo] = useState<string>("");
  const [pendingEditAlert, setPendingEditAlert] = useState<string | null>(null);

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
    projects: string;
    mobile: string;
    email: string;
    state: string;
    district: string;
    zone: string;
    status: string;
    updated: string; // raw from API
    _id: string;
    _raw?: UserLite;
  };

  const consultantsRows = useMemo<Row[]>(() => {
    const moved = movedConsultantIds;

    const onlyConsultants = allUsers
      .filter(isConsultantUser)
      .filter((u) => !moved.has(u.userId));

    const filtered = onlyConsultants.filter((u) => {
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
      projects: projectsLabel(u),
      mobile: phoneDisplay(u),
      email: u.email || "",
      state: u?.state?.name || "",
      district: u?.district?.name || "",
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
      if (a === null || a === undefined) return -1;
      if (b === null || b === undefined) return 1;
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
    movedConsultantIds,
  ]);

  const total = consultantsRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageSafe = Math.min(Math.max(1, page), totalPages);

  const rowsPaged = useMemo<Row[]>(() => {
    const start = (pageSafe - 1) * pageSize;
    return consultantsRows.slice(start, start + pageSize);
  }, [consultantsRows, pageSafe, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  // Submit (assign)
  const canSubmit =
    selectedProjectId &&
    selectedConsultantIds.size > 0 &&
    validFrom &&
    validTo &&
    !assignLoading;

  const onAssign = async () => {
    const project = projects.find((p) => p.projectId === selectedProjectId);
    const projectTitle = project?.title || "(Unknown Project)";
    const selected = consultants.filter((u) => selectedConsultantIds.has(u.userId));
    const names = selected.map(displayName).filter(Boolean);

    // duplicate guard
    const dupes = selected.filter((u) => alreadyAssignedToSelectedProject(u, selectedProjectId));
    if (dupes.length > 0) {
      const lines = dupes.map((u) => {
        const name = displayName(u) || "(No name)";
        return `${name} has already assigned ${projectTitle}. If you wish to make changes, edit the Consultant Assignments.`;
      });
      alert(lines.join("\n"));
      return;
    }

    const summary =
      `Please Confirm your assignment:\n\n` +
      `Project: ${projectTitle}\n` +
      `Consultants: ${names.length ? names.join(", ") : "—"}\n` +
      `Validity: From ${validFrom} To ${validTo}\n\n` +
      `Press OK to assign, or Cancel to go back.`;

    const ok = window.confirm(summary);
    if (!ok) return;

    const items = selected.map((u) => ({
      userId: u.userId,
      role: "Consultant",
      scopeType: "Project",
      projectId: selectedProjectId,
      companyId: null,
      validFrom, // "YYYY-MM-DD" (local)
      validTo, // "YYYY-MM-DD" (local)
      isDefault: false,
    }));

    try {
      setAssignLoading(true);
      setErr(null);
      const { data } = await api.post("/admin/assignments/bulk", { items });

      alert(
        `Assigned ${data?.created ?? items.length} consultant(s) to "${projectTitle}".`
      );

      // Reset Tile 2
      setSelectedConsultantIds(new Set());
      setMovedConsultantIds(new Set());
      setValidFrom("");
      setValidTo("");

      // Refresh users list, so Tile 4 shows the new assignments immediately
      try {
        const { data: fresh } = await api.get("/admin/users", {
          params: { includeMemberships: "1" },
        });
        setAllUsers(Array.isArray(fresh) ? fresh : fresh?.users ?? []);
      } catch {}

      const el = document.querySelector('[data-tile-name="Browse Consultants"]');
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

  // Move user from Tile 3 to Tile 2
  const onMoveToTile2 = (user: UserLite) => {
    if (!selectedProjectId) {
      alert("Please select a project first.");
      return;
    }

    if (alreadyAssignedToSelectedProject(user, selectedProjectId)) {
      const projectTitle =
        projects.find((p) => p.projectId === selectedProjectId)?.title || "(Selected Project)";
      const name = displayName(user) || "(No name)";
      alert(
        `${name} has already assigned ${projectTitle}. If you wish to make changes, edit the Consultant Assignments.`
      );
      return;
    }

    setConsultants((prev) =>
      prev.some((u) => u.userId === user.userId) ? prev : [user, ...prev]
    );
    setMovedConsultantIds((prev) => {
      const next = new Set(prev);
      next.add(user.userId);
      return next;
    });
    setSelectedConsultantIds((prev) => {
      const next = new Set(prev);
      next.add(user.userId);
      return next;
    });

    const el = document.querySelector('[data-tile-name="Roles & Options"]');
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const movedConsultantsList = useMemo<UserLite[]>(() => {
    if (movedConsultantIds.size === 0) return [];
    return consultants.filter((u) => movedConsultantIds.has(u.userId));
  }, [consultants, movedConsultantIds]);

  const toggleConsultantChecked = (id: string) => {
    setSelectedConsultantIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (validFrom && validTo && validTo <= validFrom) setValidTo("");
  }, [validFrom, validTo]);

  const onCancelTile2 = () => {
    setValidFrom("");
    setValidTo("");
    setSelectedConsultantIds(new Set());
    setMovedConsultantIds(new Set());
    const el = document.querySelector('[data-tile-name="Browse Consultants"]');
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const hasActiveFilters =
    q.trim() !== "" ||
    statusFilter !== "all" ||
    stateFilter !== "" ||
    districtFilter !== "";

  const clearFilters = () => {
    setQ("");
    setStatusFilter("all");
    setStateFilter("");
    setDistrictFilter("");
    setPage(1);
  };

  // ---- Tile 4 data: flatten "Consultant" memberships with a project
  type AssignmentRow = {
    userId: string;
    userName: string;
    projectId: string;
    projectTitle: string;
    companyName: string;
    status: string;
    validFrom: string; // local YYYY-MM-DD
    validTo: string; // local YYYY-MM-DD
    validity: string;
    updated: string; // raw ISO/string from API; format on render
    membershipId?: string | null;
    _user?: UserLite;
    _mem?: MembershipLite;
  };

  const assignedConsultantRows = useMemo<AssignmentRow[]>(() => {
    const rows: AssignmentRow[] = [];
    for (const u of allUsers) {
      const mems = Array.isArray(u.userRoleMemberships) ? u.userRoleMemberships : [];
      for (const m of mems) {
        if (String(m?.role || "").toLowerCase() !== "consultant") continue;
        const pj = m?.project;
        if (!pj?.projectId || !pj?.title) continue;

        const vf = pickMembershipDate(m, "validFrom");
        const vt = pickMembershipDate(m, "validTo");

        rows.push({
          userId: u.userId,
          userName: displayName(u) || "(No name)",
          projectId: pj.projectId,
          projectTitle: pj.title,
          companyName: m?.company?.name || "—",
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

  // ===== Tile 4 sort state + sorted rows =====
  const [aSortKey, setASortKey] = useState<
    "userName" | "projectTitle" | "companyName" | "status" | "validFrom" | "validTo" | "validity" | "updated"
  >("updated");
  const [aSortDir, setASortDir] = useState<"asc" | "desc">("desc");

  const assignedSortedRows = useMemo<AssignmentRow[]>(() => {
    const rows = [...assignedConsultantRows];
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
  }, [assignedConsultantRows, aSortKey, aSortDir]);

  // ===== Tile 4 pagination =====
  const [aPage, setAPage] = useState(1);
  const aPageSize = pageSize; // use same selector value as Browse
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
  const [deleting, setDeleting] = useState(false);

  const openView = (row: AssignmentRow) => {
    setViewRow(row);
    setViewOpen(true);
  };

  const openEdit = (row: AssignmentRow) => {
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

  // ---- Helpers for refreshing and robust membership resolution (for delete) ----
  const refetchUsers = async (): Promise<UserLite[]> => {
    const { data } = await api.get("/admin/users", { params: { includeMemberships: "1" } });
    const list = Array.isArray(data) ? data : data?.users ?? [];
    setAllUsers(list);
    return list as UserLite[];
  };

  const normalizeId = (v: any) => String(v ?? "").trim();

  /** Try to find the freshest membership id for (userId, projectId) */
  const findCurrentMembershipId = async (userId: string, projectId: string) => {
    const pickBest = (mems: any[]) => {
      const candidates = mems
        .filter((mem) => String(mem?.role || "").toLowerCase() === "consultant")
        .filter((mem) => normalizeId(mem?.project?.projectId) === normalizeId(projectId));

      if (candidates.length === 0) return null;

      candidates.sort((a, b) => {
        const au = Date.parse(a?.updatedAt ?? "") || 0;
        const bu = Date.parse(b?.updatedAt ?? "") || 0;
        if (au !== bu) return bu - au;
        const af = Date.parse(pickMembershipDate(a, "validFrom")) || 0;
        const bf = Date.parse(pickMembershipDate(b, "validFrom")) || 0;
        if (af !== bf) return bf - af;
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
      `Consultant: ${editRow.userName}\n` +
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

  const existingFromForMin = fmtLocalDateOnly(editRow?.validFrom || "");
  const _editFromMin = floorForEditFrom(existingFromForMin);

  // ----- Render -----
  return (
    <div className="w-full">
      {/* Page Heading */}
      <div className="mb-4">
        <div className="text-xl font-extrabold text-slate-900 dark:text-white">
          Consultant Assignments
        </div>
        <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Assign consultants to projects and manage validity.
        </div>
        <div className="mt-2 h-1 w-10 rounded-full bg-[#FCC020]" />
      </div>

      {err && (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
          {err}
        </div>
      )}

      {/* Section 1 — Projects */}
      <section className={CARD + " mb-4"} aria-label="Projects" data-tile-name="Projects">
        <SectionHeader title="Projects" subtitle="Choose the project to assign consultants to." />

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
              }}
              title="Select project"
            >
              <option value="">Select a project…</option>
              {projects.map((p) => (
                <option key={p.projectId} value={p.projectId}>
                  {p.title}
                </option>
              ))}
            </select>

            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-slate-500 dark:text-slate-300">
              ▼
            </span>
          </div>
        </div>
      </section>

      {/* Section 2 — Roles & Options */}
      <section
        className={CARD + " mb-4"}
        aria-label="Roles & Options"
        data-tile-name="Roles & Options"
      >
        <SectionHeader title="Roles & Options" subtitle="Pick from moved consultants and set validity." />

        <div className="mt-2 space-y-5">
          {/* Moved consultants */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300">
                Moved Consultants
              </div>

              {movedConsultantsList.length > 0 && (
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {selectedConsultantIds.size}/{movedConsultantsList.length} selected
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-auto bg-slate-50/60 dark:bg-white/5">
              {movedConsultantIds.size === 0 ? (
                <div className="p-3 text-sm text-slate-600 dark:text-slate-300">
                  <b>Move consultants</b> from the list below to assign them for the selected project.
                </div>
              ) : (
                <ul className="divide-y divide-slate-200 dark:divide-white/10">
                  {movedConsultantsList.map((u) => {
                    const checked = selectedConsultantIds.has(u.userId);
                    return (
                      <li key={u.userId} className="px-3 py-2 flex items-center justify-between gap-3">
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 dark:border-white/20 accent-[#00379C]"
                            checked={checked}
                            onChange={() => toggleConsultantChecked(u.userId)}
                          />
                          <div className="flex flex-col">
                            <div className="text-sm font-semibold text-slate-900 dark:text-white">
                              {displayName(u) || "(No name)"}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              {u.code || ""}
                              {u.code ? " · " : ""}
                              {u.email || ""}
                              {u.email ? " · " : ""}
                              {phoneDisplay(u)}
                            </div>
                          </div>
                        </label>

                        <span className="inline-flex items-center rounded-full border border-slate-200 dark:border-white/10 px-2 py-0.5 text-[11px] text-slate-700 dark:text-slate-200 bg-white dark:bg-neutral-950">
                          {u.userStatus || "—"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {movedConsultantsList.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  className={BTN_SECONDARY}
                  onClick={() => setSelectedConsultantIds(new Set(movedConsultantsList.map((m) => m.userId)))}
                >
                  Select All
                </button>
                <button className={BTN_SECONDARY} onClick={() => setSelectedConsultantIds(new Set())}>
                  Clear Selection
                </button>
              </div>
            )}
          </div>

          {/* Validity */}
          <div className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300">
              Validity
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-medium text-slate-600 dark:text-slate-300">Valid From</div>
                <input
                  type="date"
                  className={PILL_DATE + " mt-1"}
                  value={validFrom}
                  min={todayLocalISO()}
                  onChange={(e) => setValidFrom(e.target.value)}
                />
              </div>

              <div>
                <div className="text-xs font-medium text-slate-600 dark:text-slate-300">Valid To</div>
                <input
                  type="date"
                  className={PILL_DATE + " mt-1"}
                  value={validTo}
                  min={validFrom || todayLocalISO() || undefined}
                  onChange={(e) => setValidTo(e.target.value)}
                  title={validFrom ? `Choose a date on/after ${validFrom}` : "Choose end date"}
                />
                {validFrom && !validTo && (
                  <div className="mt-1 text-[11px] text-slate-500">
                    Choose a date on or after <b>{validFrom}</b>.
                  </div>
                )}
              </div>
            </div>

            <div className="mt-1 flex items-center justify-end gap-2">
              <button
                className={BTN_SECONDARY}
                onClick={onCancelTile2}
                title="Clear dates and move consultants back to Browse Consultants"
              >
                Cancel
              </button>

              <button
                className={BTN_PRIMARY}
                onClick={onAssign}
                disabled={!canSubmit}
                title={canSubmit ? "Assign selected consultants to project" : "Select project, consultants and validity dates"}
              >
                {assignLoading ? "Assigning…" : "Assign"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3 — Browse Consultants */}
      <section className={CARD + " mb-4"} aria-label="Browse Consultants" data-tile-name="Browse Consultants">
        <SectionHeader title="Browse Consultants" subtitle="Search, filter, sort and move consultants into the selection." />

        {/* Controls */}
        <div className="mb-4 space-y-3">
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
            {/* Search */}
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-1 block">
                Search
              </label>
              <input
                className={PILL_INPUT}
                placeholder="Code, name, project, phone, email…"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            {/* Status */}
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-1 block">
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
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-slate-500 dark:text-slate-300">
                  ▼
                </span>
              </div>
            </div>

            {/* State */}
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-1 block">
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
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-slate-500 dark:text-slate-300">
                  ▼
                </span>
              </div>
            </div>

            {/* District */}
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-1 block">
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
                  title={stateFilter ? "Filter by district" : "Select a state first"}
                >
                  <option value="">All Districts</option>
                  {districtsRef.map((d) => (
                    <option key={d.districtId} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-slate-500 dark:text-slate-300">
                  ▼
                </span>
              </div>
            </div>
          </div>

          {/* Bottom controls */}
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-1 block">
                  Sort By
                </label>

                <div className="flex gap-2">
                  <div className="relative">
                    <select
                      className={PILL_SELECT}
                      value={sortKey}
                      onChange={(e) => {
                        setSortKey(e.target.value as any);
                        setPage(1);
                      }}
                    >
                      <option value="code">Code</option>
                      <option value="name">Name</option>
                      <option value="projects">Projects</option>
                      <option value="mobile">Mobile</option>
                      <option value="email">Email</option>
                      <option value="state">State</option>
                      <option value="district">District</option>
                      <option value="zone">Zone</option>
                      <option value="status">Status</option>
                      <option value="updated">Updated</option>
                    </select>
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-slate-500 dark:text-slate-300">
                      ▼
                    </span>
                  </div>

                  <button
                    className={ICON_BTN}
                    onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                    title="Toggle sort direction"
                  >
                    <span className="text-[12px]">{sortDir === "asc" ? "▲" : "▼"}</span>
                  </button>
                </div>
              </div>

              <button
                className={BTN_SECONDARY}
                onClick={clearFilters}
                disabled={!hasActiveFilters}
                title="Clear all filters"
              >
                Clear
              </button>
            </div>

            <div className="flex items-end gap-2">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-1 block">
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
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-slate-500 dark:text-slate-300">
                    ▼
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-white/10 dark:bg-neutral-950">
          {usersErr && (
            <div className="p-4 text-sm text-rose-700 dark:text-rose-300 border-b border-slate-200 dark:border-white/10">
              {usersErr}
            </div>
          )}

          <div className="overflow-auto thin-scrollbar" style={{ maxHeight: "65vh" }}>
            {usersLoading ? (
              <div className="p-6 text-sm text-slate-600 dark:text-slate-300">Loading consultants…</div>
            ) : rowsPaged.length === 0 ? (
              <div className="p-6 text-sm text-slate-600 dark:text-slate-300">
                No consultants match the selected criteria.
              </div>
            ) : (
              <table className="min-w-full border-separate border-spacing-0 text-[13px]">
                <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur dark:bg-neutral-950/95">
                  <tr>
                    {[
                      { key: "action", label: "Action" },
                      { key: "code", label: "Code" },
                      { key: "name", label: "Name" },
                      { key: "projects", label: "Projects" },
                      { key: "mobile", label: "Mobile" },
                      { key: "email", label: "Email" },
                      { key: "state", label: "State" },
                      { key: "district", label: "District" },
                      { key: "zone", label: "Zone" },
                      { key: "status", label: "Status" },
                      { key: "updated", label: "Updated" },
                    ].map(({ key, label }) => {
                      const sortable = key !== "action";
                      const active = sortKey === (key as any);
                      const dir = active ? sortDir : undefined;

                      return (
                        <th
                          key={key}
                          className={
                            "text-left font-extrabold text-[11px] uppercase tracking-wide " +
                            "text-slate-600 dark:text-slate-200 " +
                            "px-3 py-2.5 border-b border-slate-200 dark:border-white/10 whitespace-nowrap select-none " +
                            (sortable ? "cursor-pointer" : "")
                          }
                          title={sortable ? `Sort by ${label}` : undefined}
                          onClick={() => {
                            if (!sortable) return;
                            if (sortKey !== (key as any)) {
                              setSortKey(key as any);
                              setSortDir("asc");
                            } else {
                              setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                            }
                            setPage(1);
                          }}
                          aria-sort={
                            sortable ? (active ? (dir === "asc" ? "ascending" : "descending") : "none") : undefined
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
                  {rowsPaged.map((r, idx) => (
                    <tr
                      key={r._id ?? idx}
                      className="border-b border-slate-100/80 dark:border-white/5 hover:bg-[#00379C]/[0.03] dark:hover:bg-white/[0.03]"
                    >
                      {/* Action */}
                      <td className="px-2 py-1.5 whitespace-nowrap align-middle">
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#23A192] hover:bg-[#23A192]/10 active:scale-[0.98] dark:hover:bg-[#23A192]/15"
                          title="Move this consultant to selection"
                          aria-label="Move this consultant to selection"
                          onClick={() => r._raw && onMoveToTile2(r._raw)}
                        >
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
                        </button>
                      </td>

                      <td className="px-3 py-1.5 whitespace-nowrap align-middle text-slate-800 dark:text-slate-100">
                        {r.code}
                      </td>

                      <td className="px-3 py-1.5 whitespace-nowrap align-middle text-slate-800 dark:text-slate-100">
                        {r.name}
                      </td>

                      <td className="px-3 py-1.5 align-middle" title={r.projects}>
                        <div className="truncate max-w-[360px]">{r.projects}</div>
                      </td>

                      <td className="px-3 py-1.5 whitespace-nowrap align-middle">{r.mobile}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap align-middle">{r.email}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap align-middle">{r.state}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap align-middle">{r.district}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap align-middle">{r.zone}</td>

                      {/* Status pill like Companies */}
                      <td className="px-3 py-1.5 whitespace-nowrap align-middle" title={r.status}>
                        {r.status ? (
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(
                              r.status
                            )}`}
                          >
                            {r.status}
                          </span>
                        ) : (
                          ""
                        )}
                      </td>

                      <td className="px-3 py-1.5 whitespace-nowrap align-middle" title={fmtLocalDateTime(r.updated)}>
                        {fmtLocalDateTime(r.updated)}
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
              Page <b>{pageSafe}</b> of <b>{totalPages}</b> · Showing <b>{rowsPaged.length}</b> of <b>{total}</b>{" "}
              consultants
              {stateFilter ? (
                <>
                  {" "}
                  · State: <b>{stateFilter}</b>
                </>
              ) : null}
              {districtFilter ? (
                <>
                  {" "}
                  · District: <b>{districtFilter}</b>
                </>
              ) : null}
              {statusFilter !== "all" ? (
                <>
                  {" "}
                  · Status: <b>{statusFilter}</b>
                </>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-1 justify-end">
              <button className={`${ctl} ${ctlLight} disabled:opacity-50`} onClick={() => setPage(1)} disabled={pageSafe <= 1}>
                « First
              </button>
              <button
                className={`${ctl} ${ctlLight} disabled:opacity-50`}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pageSafe <= 1}
              >
                ‹ Prev
              </button>
              <button
                className={`${ctl} ${ctlLight} disabled:opacity-50`}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={pageSafe >= totalPages}
              >
                Next ›
              </button>
              <button
                className={`${ctl} ${ctlLight} disabled:opacity-50`}
                onClick={() => setPage(totalPages)}
                disabled={pageSafe >= totalPages}
              >
                Last »
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4 — Consultant Assignments */}
      <section className={CARD + " mb-4"} aria-label="Consultant Assignments" data-tile-name="Consultant Assignments">
        <SectionHeader title="Consultant Assignments" subtitle="All consultants who have been assigned to projects." />

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-white/10 dark:bg-neutral-950">
          <div className="overflow-auto thin-scrollbar" style={{ maxHeight: "65vh" }}>
            {assignedSortedRows.length === 0 ? (
              <div className="p-6 text-sm text-slate-600 dark:text-slate-300">No consultant assignments found.</div>
            ) : (
              <table className="min-w-full border-separate border-spacing-0 text-[13px]">
                <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur dark:bg-neutral-950/95">
                  <tr>
                    <th
                      className={
                        "text-left font-extrabold text-[11px] uppercase tracking-wide " +
                        "text-slate-600 dark:text-slate-200 " +
                        "px-3 py-2.5 border-b border-slate-200 dark:border-white/10 whitespace-nowrap select-none"
                      }
                    >
                      Action
                    </th>

                    {[
                      { key: "userName", label: "Consultant" },
                      { key: "projectTitle", label: "Project" },
                      { key: "companyName", label: "Company" },
                      { key: "status", label: "Status" },
                      { key: "validFrom", label: "Valid From" },
                      { key: "validTo", label: "Valid To" },
                      { key: "validity", label: "Validity" },
                      { key: "updated", label: "Last Updated" },
                    ].map(({ key, label }) => {
                      const active = aSortKey === (key as any);
                      const dir = active ? aSortDir : undefined;

                      return (
                        <th
                          key={key}
                          className={
                            "text-left font-extrabold text-[11px] uppercase tracking-wide " +
                            "text-slate-600 dark:text-slate-200 " +
                            "px-3 py-2.5 border-b border-slate-200 dark:border-white/10 whitespace-nowrap select-none cursor-pointer"
                          }
                          title={`Sort by ${label}`}
                          onClick={() => {
                            if (aSortKey !== (key as any)) {
                              setASortKey(key as any);
                              setASortDir("asc");
                            } else {
                              setASortDir((d) => (d === "asc" ? "desc" : "asc"));
                            }
                          }}
                          aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
                        >
                          <span className="inline-flex items-center gap-1">
                            {label}
                            <span className="text-[10px] opacity-70" style={{ color: active ? "#00379C" : undefined }}>
                              {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
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
                      className="border-b border-slate-100/80 dark:border-white/5 hover:bg-[#00379C]/[0.03] dark:hover:bg-white/[0.03]"
                    >
                      <td className="px-2 py-1.5 whitespace-nowrap align-middle">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#23A192] hover:bg-[#23A192]/10 active:scale-[0.98] dark:hover:bg-[#23A192]/15"
                            onClick={() => openView(r)}
                            title="View assignment"
                            aria-label="View assignment"
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
                            className={
                              "inline-flex h-7 w-7 items-center justify-center rounded-full " +
                              "text-[#00379C] hover:bg-[#00379C]/10 active:scale-[0.98] dark:hover:bg-[#00379C]/15 " +
                              (!r.membershipId ? "opacity-50 cursor-not-allowed" : "")
                            }
                            onClick={() => openEdit(r)}
                            disabled={!r.membershipId}
                            title={r.membershipId ? "Edit validity dates" : "Missing membership id"}
                            aria-label="Edit validity dates"
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

                      <td className="px-3 py-1.5 whitespace-nowrap align-middle text-slate-800 dark:text-slate-100 max-w-[14rem] overflow-hidden text-ellipsis">
                        {r.userName}
                      </td>

                      <td className="px-3 py-1.5 whitespace-nowrap align-middle max-w-[14rem] overflow-hidden text-ellipsis">
                        {r.projectTitle}
                      </td>

                      <td className="px-3 py-1.5 whitespace-nowrap align-middle">{r.companyName || "—"}</td>

                      <td className="px-3 py-1.5 whitespace-nowrap align-middle">
                        {r.status ? (
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(
                              r.status
                            )}`}
                          >
                            {r.status}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>

                      <td className="px-3 py-1.5 whitespace-nowrap align-middle">{fmtLocalDateOnly(r.validFrom) || "—"}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap align-middle">{fmtLocalDateOnly(r.validTo) || "—"}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap align-middle">
                        <ValidityBadge value={r.validity || "—"} />
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap align-middle">{fmtLocalDateTime(r.updated) || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination footer */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 py-2 text-sm border-t border-slate-200 dark:border-white/10">
            <div className="text-slate-600 dark:text-slate-300">
              Page <b>{aPageSafe}</b> of <b>{aTotalPages}</b> · Showing <b>{assignedRowsPaged.length}</b> of{" "}
              <b>{aTotal}</b> consultant assignments
            </div>

            <div className="flex flex-wrap items-center gap-1 justify-end">
              <button className={`${ctl} ${ctlLight} disabled:opacity-50`} onClick={() => setAPage(1)} disabled={aPageSafe <= 1}>
                « First
              </button>
              <button
                className={`${ctl} ${ctlLight} disabled:opacity-50`}
                onClick={() => setAPage((p) => Math.max(1, p - 1))}
                disabled={aPageSafe <= 1}
              >
                ‹ Prev
              </button>
              <button
                className={`${ctl} ${ctlLight} disabled:opacity-50`}
                onClick={() => setAPage((p) => Math.min(aTotalPages, p + 1))}
                disabled={aPageSafe >= aTotalPages}
              >
                Next ›
              </button>
              <button
                className={`${ctl} ${ctlLight} disabled:opacity-50`}
                onClick={() => setAPage(aTotalPages)}
                disabled={aPageSafe >= aTotalPages}
              >
                Last »
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ===== View Modal (read-only) ===== */}
      {viewOpen && viewRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setViewOpen(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-neutral-950 shadow-lg p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-slate-900 dark:text-white">Consultant Assignment</div>
                <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  {viewRow.userName} · {viewRow.projectTitle}
                </div>
              </div>

              <button className={BTN_SECONDARY + " h-8 px-3 text-[11px]"} onClick={() => setViewOpen(false)}>
                Close
              </button>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10">
              <table className="min-w-full text-sm">
                <tbody>
                  {[
                    ["Consultant", viewRow.userName || "—"],
                    ["Project", viewRow.projectTitle || "—"],
                    ["Company", viewRow.companyName || "—"],
                    ["Status", viewRow.status || "—"],
                    ["Valid From", fmtLocalDateOnly(viewRow.validFrom) || "—"],
                    ["Valid To", fmtLocalDateOnly(viewRow.validTo) || "—"],
                    ["Validity", viewRow.validity || "—"],
                    ["Last Updated", fmtLocalDateTime(viewRow.updated) || "—"],
                  ].map(([k, v]) => (
                    <tr key={String(k)} className="odd:bg-slate-50/60 dark:odd:bg-white/[0.03]">
                      <td className="px-3 py-2 font-semibold whitespace-nowrap text-slate-700 dark:text-slate-200">
                        {k}
                      </td>
                      <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-end">
              <button className={BTN_PRIMARY} onClick={() => setViewOpen(false)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Edit Modal (with date updates + hard delete button) ===== */}
      {editOpen && editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              if (!deleting) setEditOpen(false);
            }}
          />

          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-neutral-950 shadow-lg p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-slate-900 dark:text-white">Edit Validity</div>
                <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  {editRow.userName} · {editRow.projectTitle}
                </div>
              </div>

              <button
                className={
                  "h-8 px-3 rounded-full text-[11px] font-semibold text-white shadow-sm " +
                  (deleting || !editRow?.membershipId
                    ? "bg-rose-600/60 cursor-not-allowed"
                    : "bg-rose-600 hover:bg-rose-700")
                }
                onClick={onHardDeleteFromEdit}
                disabled={deleting || !editRow?.membershipId}
                title={editRow?.membershipId ? "Permanently remove this assignment" : "Missing membership id"}
              >
                {deleting ? "Removing…" : "Remove"}
              </button>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10">
              <table className="min-w-full text-sm">
                <tbody>
                  {[
                    ["Consultant", editRow.userName || "—"],
                    ["Project", editRow.projectTitle || "—"],
                    ["Company", editRow.companyName || "—"],
                    ["Status", editRow.status || "—"],
                  ].map(([k, v]) => (
                    <tr key={String(k)} className="odd:bg-slate-50/60 dark:odd:bg-white/[0.03]">
                      <td className="px-3 py-2 font-semibold whitespace-nowrap text-slate-700 dark:text-slate-200">
                        {k}
                      </td>
                      <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-medium text-slate-600 dark:text-slate-300">Valid From</div>
                <input
                  type="date"
                  className={PILL_DATE + " mt-1"}
                  value={editFrom}
                  min={_editFromMin || todayLocalISO()}
                  disabled={deleting}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEditFrom(v);
                    if (editTo && editTo < v) setEditTo(v);
                  }}
                />
              </div>

              <div>
                <div className="text-xs font-medium text-slate-600 dark:text-slate-300">Valid To</div>
                <input
                  type="date"
                  className={PILL_DATE + " mt-1"}
                  value={editTo}
                  min={editFrom && editFrom > todayLocalISO() ? editFrom : todayLocalISO()}
                  disabled={deleting}
                  onChange={(e) => setEditTo(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button className={BTN_SECONDARY} onClick={() => setEditOpen(false)} disabled={deleting}>
                Cancel
              </button>

              <button
                className={BTN_PRIMARY}
                title="Update validity dates"
                disabled={!editRow?.membershipId || deleting}
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
                    const payload: any = {
                      validTo: editTo,
                      scopeType: "Project",
                      projectId: editRow.projectId,
                    };
                    if (!origFrom || editFrom !== origFrom) payload.validFrom = editFrom;

                    await api.patch(`/admin/assignments/${editRow.membershipId}`, payload);

                    const { data: fresh } = await api.get("/admin/users", {
                      params: { includeMemberships: "1" },
                    });
                    setAllUsers(Array.isArray(fresh) ? fresh : fresh?.users ?? []);

                    const successMsg = [
                      `Updated validity`,
                      ``,
                      `Project: ${editRow.projectTitle}`,
                      `Consultant: ${editRow.userName}`,
                      ``,
                      `Valid From: ${origFrom || "—"} → ${editFrom}`,
                      `Valid To:   ${origTo || "—"} → ${editTo}`,
                    ].join("\n");

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
