// pms-frontend/src/views/home/MyProjects.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../hooks/useAuth";

type Project = {
  projectId: string;
  title: string;
  code?: string | null;
  status?: string | null; // Prisma enum
  health?: string | null;

  // Summary fields (match Projects.tsx modal)
  stage?: string | null;
  projectType?: string | null;
  structureType?: string | null;
  constructionType?: string | null;
  contractType?: string | null;
  clientCompanyName?: string | null;

  // Location highlights
  cityTown?: string | null;
  stateName?: string | null;

  // Dates
  startDate?: string | null;
  plannedCompletionDate?: string | null;

  // Project manager (best-effort, depends on backend fields)
  projectManagerName?: string | null;
};

const normalizeRole = (raw?: string) => {
  const norm = (raw || "")
    .toString()
    .trim()
    .replace(/[_\s-]+/g, "")
    .toLowerCase();
  switch (norm) {
    case "admin":
      return "Admin";
    case "client":
      return "Client";
    case "ihpmt":
      return "IH-PMT";
    case "contractor":
      return "Contractor";
    case "consultant":
      return "Consultant";
    case "pmc":
      return "PMC";
    case "supplier":
      return "Supplier";
    default:
      return raw || "";
  }
};

// --- Role → WIR path resolver ---
const wirPathForRole = (role: string, projectId: string) => {
  switch (normalizeRole(role)) {
    case "Contractor":
      return `/home/projects/${projectId}/wir`;
    case "PMC":
      return `/home/projects/${projectId}/wir`;
    case "IH-PMT":
      return `/home/projects/${projectId}/wir`;
    case "Client":
      return `/home/projects/${projectId}/wir`;
    default:
      return `/home/projects/${projectId}/wir`;
  }
};

const gotoWir = (
  navigate: ReturnType<typeof useNavigate>,
  role: string,
  proj: Project
) => {
  const path = wirPathForRole(role, proj.projectId);
  navigate(path, {
    state: {
      role: normalizeRole(role),
      project: {
        projectId: proj.projectId,
        code: proj.code,
        title: proj.title,
      },
    },
    replace: false,
  });
};

const gotoModules = (
  navigate: ReturnType<typeof useNavigate>,
  role: string,
  proj: Project
) => {
  navigate(`/home/projects/${proj.projectId}/modules`, {
    state: {
      role: normalizeRole(role),
      project: {
        projectId: proj.projectId,
        code: proj.code,
        title: proj.title,
      },
    },
    replace: false,
  });
};

// ---- Status & health helpers ----
type CanonicalStatus =
  | "Active"
  | "OnHold"
  | "Completed"
  | "Draft"
  | "Archived"
  | "";

const canonicalStatus = (s?: string | null): CanonicalStatus => {
  const n = (s || "").toString().trim().replace(/\s|_/g, "").toLowerCase();
  if (n === "active") return "Active";
  if (n === "onhold" || n === "hold") return "OnHold";
  if (n === "completed" || n === "complete") return "Completed";
  if (n === "draft") return "Draft";
  if (n === "archived" || n === "archive") return "Archived";
  return "";
};

type CanonicalHealth = "Green" | "Amber" | "Red" | "Unknown";

const canonicalHealth = (h?: string | null): CanonicalHealth => {
  const n = (h || "").toString().trim().toLowerCase();
  if (n.includes("green") || n === "good") return "Green";
  if (n.includes("amber") || n.includes("yellow")) return "Amber";
  if (n.includes("red") || n.includes("risk")) return "Red";
  return "Unknown";
};

// ---- Stage helper (for fixed stage pills; case/spacing safe) ----
type CanonicalStage =
  | "planning"
  | "design"
  | "procurement"
  | "execution"
  | "handover"
  | "closed"
  | "";

const canonicalStage = (s?: string | null): CanonicalStage => {
  const n = (s || "").toString().trim().toLowerCase();
  const clean = n.replace(/[_\s-]+/g, "");
  if (clean === "planning") return "planning";
  if (clean === "design") return "design";
  if (clean === "procurement") return "procurement";
  if (clean === "execution") return "execution";
  if (clean === "handover" || clean === "handedover" || clean === "handover")
    return "handover";
  if (clean === "closed" || clean === "close") return "closed";
  return "";
};

// ---- tiny format helpers for dates ----
const isIsoLike = (v: any) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v);
const fmtDate = (v: any) =>
  isIsoLike(v) ? new Date(v).toLocaleDateString() : v ?? "";

// ---- Badge (for small status/health pills) ----
function Badge({
  kind,
  value,
}: {
  kind: "status" | "health";
  value?: string | null;
}) {
  const v = (value || "").toString().trim();
  if (!v) return null;

  let cls =
    "bg-gray-100 text-gray-800 border-gray-200 dark:bg-neutral-800 dark:text-gray-200 dark:border-neutral-700";
  if (kind === "status") {
    const map: Record<string, string> = {
      Draft:
        "bg-gray-100 text-gray-800 border-gray-200 dark:bg-neutral-800 dark:text-gray-200 dark:border-neutral-700",
      Active:
        "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
      OnHold:
        "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
      Completed:
        "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
      Archived:
        "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-800",
    };
    cls = map[v] || cls;
  } else {
    const map: Record<string, string> = {
      Green:
        "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
      Amber:
        "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
      Red: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800",
      Unknown:
        "bg-gray-100 text-gray-800 border-gray-200 dark:bg-neutral-800 dark:text-gray-200 dark:border-neutral-700",
    };
    cls = map[v] || cls;
  }

  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${cls}`}>
      {v}
    </span>
  );
}

type QuickFilter =
  | "none"
  | "atrisk"
  | "delayed"
  | "ongoing"
  | "completed"
  | "onhold";

type GroupBy = "none" | "stage" | "city" | "pm";

// Filters inside modal (UPDATED to your requested options)
type StatusFilter = "all" | "active" | "completed" | "onhold";
type HealthFilter = "all" | "green" | "amber" | "red";
type ScheduleFilter = "any" | "overdue" | "due7" | "future";
type OpenFormsFilter = "any" | "with" | "none";

const FIXED_STAGE_OPTIONS: { id: CanonicalStage; label: string }[] = [
  { id: "planning", label: "Planning" },
  { id: "design", label: "Design" },
  { id: "procurement", label: "Procurement" },
  { id: "execution", label: "Execution" },
  { id: "handover", label: "Handover" },
  { id: "closed", label: "Closed" },
];

export default function MyProjects() {
  const { user, claims } = useAuth();
  const profileName: string = user?.firstName
    ? `${user.firstName}${user?.lastName ? ` ${user.lastName}` : ""}`
    : claims?.firstName
      ? `${claims.firstName}${claims?.lastName ? ` ${claims.lastName}` : ""}`
      : (user?.name as string | undefined) ||
      (claims?.name as string | undefined) ||
      "User";

  const profileEmail: string =
    (user?.email as string | undefined) ||
    (claims?.email as string | undefined) ||
    "";

  const profileInitials: string =
    (profileName ?? "")
      .toString()
      .split(/\s+/)
      .filter((part) => part.length > 0)
      .map((part) => part.charAt(0).toUpperCase())
      .slice(0, 2)
      .join("") || "U";

  const navigate = useNavigate();

  const role = normalizeRole(
    (user as any)?.role ??
    (claims as any)?.role ??
    (claims as any)?.userRole ??
    (claims as any)?.roleName ??
    ""
  );

  const userId =
    (user as any)?.userId ??
    (user as any)?.id ??
    (claims as any)?.userId ??
    (claims as any)?.sub ??
    "";

  const [all, setAll] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("none");
  const [groupBy, setGroupBy] = useState<GroupBy>("none"); // visual label

  const [showFilter, setShowFilter] = useState(false);
  const [showProfilePanel, setShowProfilePanel] = useState(false);

  const [darkModePref, setDarkModePref] = useState(false);
  const [unitsPref, setUnitsPref] = useState<"SI" | "Imperial">("SI");
  const [languagePref, setLanguagePref] = useState("English");

  // modal filters (UPDATED defaults)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all");
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilter>("any");
  const [openFormsFilter, setOpenFormsFilter] =
    useState<OpenFormsFilter>("any"); // placeholder
  const [selectedStages, setSelectedStages] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedPMs, setSelectedPMs] = useState<string[]>([]);

  // ---- KPIs (Total, Ongoing, At Risk, Delayed) ----
  const kpis = useMemo(() => {
    const total = all.length;
    let ongoing = 0;
    let atRisk = 0;
    let delayed = 0;

    for (const p of all) {
      const s = canonicalStatus(p.status);
      const h = canonicalHealth(p.health);
      if (s === "Active") ongoing++;
      if (h === "Red") atRisk++;
      if (h === "Amber") delayed++;
    }

    return { total, ongoing, atRisk, delayed };
  }, [all]);

  useEffect(() => {
    document.title = "Trinity PMS — My Projects";
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const fetchAll = async () => {
      setLoading(true);
      setErr(null);
      try {
        // 1) User w/ memberships (for client projects)
        const { data: ures } = await api.get(`/admin/users/${userId}`, {
          params: { includeMemberships: "1" },
        });
        const u = ures?.user || ures || {};
        const memberships: any[] = Array.isArray(u.userRoleMemberships)
          ? u.userRoleMemberships
          : [];

        // 2) All projects (for enrichment + service-provider detection)
        const { data: pres } = await api.get("/admin/projects");
        const projectList: any[] = Array.isArray(pres)
          ? pres
          : pres?.projects || [];
        const byId = new Map<string, any>();
        projectList.forEach((p) => p?.projectId && byId.set(p.projectId, p));

        // Client projects straight from memberships
        const clientProjects: Project[] = memberships
          .filter(
            (m) => m.scopeType === "Project" && m.role === "Client" && m.project
          )
          .map((m) => {
            const p = byId.get(m.project.projectId) || {};
            return {
              projectId: m.project.projectId,
              title: m.project.title,
              code: m.project.code,
              status: p?.status ?? p?.projectStatus ?? null,
              health: p?.health ?? null,

              stage: p?.stage ?? null,
              projectType: p?.projectType ?? null,
              structureType: p?.structureType ?? null,
              constructionType: p?.constructionType ?? null,
              contractType: p?.contractType ?? null,
              clientCompanyName: p?.clientCompany?.name ?? null,

              cityTown: p?.cityTown ?? null,
              stateName:
                p?.state?.name ??
                (typeof p?.state === "string" ? p.state : null),

              startDate: p?.startDate ?? null,
              plannedCompletionDate: p?.plannedCompletionDate ?? null,

              projectManagerName:
                p?.projectManagerName ??
                p?.pmName ??
                p?.projectManager?.name ??
                null,
            };
          });

        // Service-provider: include any projects where THIS user appears in assignments
        const svcProjects: Project[] = [];
        const CONCURRENCY = 8;
        const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

        for (let i = 0; i < projectList.length; i += CONCURRENCY) {
          const slice = projectList.slice(i, i + CONCURRENCY);
          const results = await Promise.allSettled(
            slice.map(async (p) => {
              const { data: ares } = await api.get(
                `/admin/projects/${p.projectId}/assignments`
              );
              const rows: any[] = Array.isArray(ares)
                ? ares
                : ares?.assignments || [];
              const chosen = normalizeRole(role);
              const userHasRole = rows.some(
                (r) =>
                  String(r.userId) === String(userId) &&
                  (chosen === "Admin"
                    ? true
                    : normalizeRole(
                      r?.role ??
                      r?.userRole ??
                      r?.roleName ??
                      r?.assignmentRole ??
                      r?.companyRole ??
                      ""
                    ) === chosen)
              );
              if (userHasRole) {
                const pmName =
                  p?.projectManagerName ??
                  p?.pmName ??
                  p?.projectManager?.name ??
                  null;

                return {
                  projectId: p.projectId,
                  title: p.title,
                  code: p.code,
                  status: p?.status ?? p?.projectStatus ?? null,
                  health: p?.health ?? null,

                  stage: p?.stage ?? null,
                  projectType: p?.projectType ?? null,
                  structureType: p?.structureType ?? null,
                  constructionType: p?.constructionType ?? null,
                  contractType: p?.contractType ?? null,
                  clientCompanyName: p?.clientCompany?.name ?? null,

                  cityTown: p?.cityTown ?? null,
                  stateName:
                    p?.state?.name ??
                    (typeof p?.state === "string" ? p.state : null),

                  startDate: p?.startDate ?? null,
                  plannedCompletionDate: p?.plannedCompletionDate ?? null,

                  projectManagerName: pmName,
                } as Project;
              }
              return null;
            })
          );
          results.forEach((r) => {
            if (r.status === "fulfilled" && r.value) svcProjects.push(r.value);
          });
          if (i + CONCURRENCY < projectList.length) await sleep(50);
        }

        const chosen = normalizeRole(role);
        const pool = chosen === "Client" ? clientProjects : svcProjects;

        // De-dupe with enrichment
        const map = new Map<string, Project>();
        pool.forEach((p) => {
          if (!p?.projectId) return;
          const existing = map.get(p.projectId);
          if (!existing) map.set(p.projectId, p);
          else {
            map.set(p.projectId, {
              projectId: p.projectId,
              title: p.title || existing.title,
              code: p.code ?? existing.code ?? null,
              status: p.status ?? existing.status ?? null,
              health: p.health ?? existing.health ?? null,

              stage: p.stage ?? existing.stage ?? null,
              projectType: p.projectType ?? existing.projectType ?? null,
              structureType: p.structureType ?? existing.structureType ?? null,
              constructionType:
                p.constructionType ?? existing.constructionType ?? null,
              contractType: p.contractType ?? existing.contractType ?? null,
              clientCompanyName:
                p.clientCompanyName ?? existing.clientCompanyName ?? null,

              cityTown: p.cityTown ?? existing.cityTown ?? null,
              stateName: p.stateName ?? existing.stateName ?? null,

              startDate: p.startDate ?? existing.startDate ?? null,
              plannedCompletionDate:
                p.plannedCompletionDate ??
                existing.plannedCompletionDate ??
                null,

              projectManagerName:
                p.projectManagerName ?? existing.projectManagerName ?? null,
            });
          }
        });

        if (!cancelled) setAll(Array.from(map.values()));
      } catch (e: any) {
        if (!cancelled)
          setErr(
            e?.response?.data?.error || e?.message || "Failed to load projects."
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [userId, role]);

  // City, PM options for modal (kept as-is)
  const cityOptions = useMemo(
    () =>
      Array.from(
        new Set(
          all
            .map((p) => {
              const label = [p.cityTown, p.stateName]
                .filter(Boolean)
                .join(" • ");
              return (label || "").trim();
            })
            .filter((v) => !!v)
        )
      ),
    [all]
  );

  const pmOptions = useMemo(
    () =>
      Array.from(
        new Set(
          all.map((p) => (p.projectManagerName || "").trim()).filter((v) => !!v)
        )
      ),
    [all]
  );

  // ---- Search + quick filters + modal filters + sort ----
  const filtered = useMemo(() => {
    let list = [...all];

    // Quick filter (health/status)
    if (quickFilter !== "none") {
      list = list.filter((p) => {
        const s = canonicalStatus(p.status);
        const h = canonicalHealth(p.health);
        switch (quickFilter) {
          case "atrisk":
            return h === "Red";
          case "delayed":
            return h === "Amber";
          case "ongoing":
            return s === "Active";
          case "completed":
            return s === "Completed";
          case "onhold":
            return s === "OnHold";
          default:
            return true;
        }
      });
    }

    // Modal: Status (UPDATED)
    if (statusFilter !== "all") {
      list = list.filter((p) => {
        const s = canonicalStatus(p.status);
        if (statusFilter === "active") return s === "Active";
        if (statusFilter === "completed") return s === "Completed";
        if (statusFilter === "onhold") return s === "OnHold";
        return true;
      });
    }

    // Modal: Health (UPDATED)
    if (healthFilter !== "all") {
      list = list.filter((p) => {
        const h = canonicalHealth(p.health);
        if (healthFilter === "green") return h === "Green";
        if (healthFilter === "amber") return h === "Amber";
        if (healthFilter === "red") return h === "Red";
        return true;
      });
    }

    // Modal: Stage (UPDATED fixed options; still multi-select)
    if (selectedStages.length) {
      const set = new Set(selectedStages);
      list = list.filter((p) => {
        const st = canonicalStage(p.stage);
        return st ? set.has(st) : false;
      });
    }

    // Modal: City
    if (selectedCities.length) {
      const set = new Set(selectedCities);
      list = list.filter((p) => {
        const label = [p.cityTown, p.stateName].filter(Boolean).join(" • ");
        return label && set.has(label);
      });
    }

    // Modal: Project Manager
    if (selectedPMs.length) {
      const set = new Set(selectedPMs);
      list = list.filter((p) =>
        p.projectManagerName ? set.has(p.projectManagerName) : false
      );
    }

    // Modal: Schedule (based on plannedCompletionDate) — keep as-is
    if (scheduleFilter !== "any") {
      const now = new Date();
      list = list.filter((p) => {
        if (!p.plannedCompletionDate) return false;
        const d = isIsoLike(p.plannedCompletionDate)
          ? new Date(p.plannedCompletionDate)
          : new Date(p.plannedCompletionDate as any);
        if (isNaN(d.getTime())) return false;
        const diffDays = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        if (scheduleFilter === "overdue") return diffDays < 0;
        if (scheduleFilter === "due7") return diffDays >= 0 && diffDays <= 7;
        if (scheduleFilter === "future") return diffDays > 7;
        return true;
      });
    }

    // Modal: OpenFormsFilter – placeholder (no underlying data yet)
    // (kept for UI parity)

    // search
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => {
        const hay = [
          p.title,
          p.code,
          p.clientCompanyName,
          p.cityTown,
          p.stateName,
          p.stage,
          p.projectType,
          p.projectManagerName,
        ].map((v) => (v || "").toString().toLowerCase());
        return hay.some((s) => s.includes(q));
      });
    }

    // sort by title
    list.sort((a, b) => {
      const aa = (a.title || "").toLowerCase();
      const bb = (b.title || "").toLowerCase();
      if (aa < bb) return sortDir === "asc" ? -1 : 1;
      if (aa > bb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [
    all,
    quickFilter,
    search,
    sortDir,
    statusFilter,
    healthFilter,
    selectedStages,
    selectedCities,
    selectedPMs,
    scheduleFilter,
    openFormsFilter,
  ]);

  const handleClearFilters = () => {
    setStatusFilter("all");
    setHealthFilter("all");
    setScheduleFilter("any");
    setOpenFormsFilter("any");
    setSelectedStages([]);
    setSelectedCities([]);
    setSelectedPMs([]);
    setQuickFilter("none");
    setGroupBy("none");
  };

  const toggleFromArray = (
    value: string,
    arr: string[],
    setArr: (v: string[]) => void
  ) => {
    if (arr.includes(value)) {
      setArr(arr.filter((v) => v !== value));
    } else {
      setArr([...arr, value]);
    }
  };

  const handleSignOut = () => {
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    } catch {
      /* ignore */
    }
    window.location.assign("/login");
  };

  return (
    <section className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border border-slate-200/80 dark:border-neutral-800 p-4 sm:p-5 lg:p-6">
      {/* Header + back + profile */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
            {role || "User"}
          </p>
          <h1 className="text-lg sm:text-xl md:text-2xl font-semibold text-gray-900 dark:text-white">
            My Projects
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate("/home/tiles")}
<<<<<<< Updated upstream
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs sm:text-sm font-medium text-slate-700 shadow-sm
=======
            className="inline-flex items-center gap-1.5 h-8 rounded-full border border-slate-200 bg-white px-4 text-xs sm:text-sm font-medium text-slate-700 shadow-sm
>>>>>>> Stashed changes
                       hover:bg-slate-50 hover:border-slate-300
                       dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M14.707 5.293 9 11l5.707 5.707-1.414 1.414L6.172 11l7.121-7.121z"
                className="fill-current"
              />
            </svg>
            <span>Back</span>
          </button>

          <button
            type="button"
            onClick={() => setShowProfilePanel(true)}
            className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
            title="Profile"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-3.33 0-6 1.34-6 3v1h12v-1c0-1.66-2.67-3-6-3z"
                className="fill-current"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* KPI boxes */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPI label="Total" value={loading ? "—" : kpis.total} tone="base" />
        <KPI label="Ongoing" value={loading ? "—" : kpis.ongoing} tone="info" />
        <KPI label="At Risk" value={loading ? "—" : kpis.atRisk} tone="alert" />
        <KPI label="Delayed" value={loading ? "—" : kpis.delayed} tone="warn" />
      </div>

      {/* Search + Sort + Filter row */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-md">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  d="M10 4a6 6 0 014.472 9.938l3.795 3.795-1.414 1.414-3.795-3.795A6 6 0 1110 4zm0 2a4 4 0 100 8 4 4 0 000-8z"
                  className="fill-current"
                />
              </svg>
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search project, code, city, PM…"
              className="w-full rounded-full border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm text-gray-900
                         outline-none transition
                         focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-300
                         dark:bg-neutral-900 dark:border-neutral-800 dark:text-white"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 shadow-sm
               hover:bg-slate-50 hover:border-slate-300
               dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
            title="Sort"
          >
            {/* sort icon */}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="shrink-0"
            >
              <path
                d="M7 4h2v14l2-2 1.4 1.4L8 22l-4.4-4.6L5 16l2 2V4zm10 0 4.4 4.6L20 10l-2-2v14h-2V8l-2 2-1.4-1.4L17 4z"
                className="fill-current"
              />
            </svg>
            <span className="hidden xs:inline">Sort</span>
            <span className="xs:hidden">Sort</span>
          </button>

          <button
            type="button"
            onClick={() => setShowFilter(true)}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 shadow-sm
               hover:bg-slate-50 hover:border-slate-300
               dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
            title="Filter"
          >
            {/* filter icon */}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="shrink-0"
            >
              <path
                d="M4 5h16v2l-6 7v5l-4-2v-3L4 7V5z"
                className="fill-current"
              />
            </svg>
            <span className="hidden xs:inline">Filter</span>
            <span className="xs:hidden">Filter</span>
          </button>
        </div>
      </div>

      {/* Group row */}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
        <span className="text-gray-500 dark:text-gray-400">Group</span>
        {[
          { id: "none", label: "None" },
          { id: "stage", label: "Stage" },
          { id: "city", label: "City" },
          { id: "pm", label: "PM" },
        ].map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setGroupBy(g.id as GroupBy)}
            className={
              "px-3 py-1 rounded-full border text-xs sm:text-sm " +
              (groupBy === g.id
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white text-gray-700 border-slate-200 hover:bg-slate-50 dark:bg-neutral-900 dark:border-neutral-700 dark:text-gray-100 dark:hover:bg-neutral-800")
            }
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Quick filters row */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
        <span className="text-gray-500 dark:text-gray-400">Quick</span>
        {[
          { id: "atrisk", label: "At Risk" },
          { id: "delayed", label: "Delayed" },
          { id: "ongoing", label: "Ongoing" },
          { id: "completed", label: "Completed" },
          { id: "onhold", label: "On Hold" },
        ].map((q) => (
          <button
            key={q.id}
            type="button"
            onClick={() =>
              setQuickFilter((prev) =>
                prev === q.id ? "none" : (q.id as QuickFilter)
              )
            }
            className={
              "px-3 py-1 rounded-full border text-xs sm:text-sm " +
              (quickFilter === q.id
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white text-gray-700 border-slate-200 hover:bg-slate-50 dark:bg-neutral-900 dark:border-neutral-700 dark:text-gray-100 dark:hover:bg-neutral-800")
            }
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* States */}
      {loading && (
        <div className="mt-4 text-sm text-gray-700 dark:text-gray-300">
          Loading your projects…
        </div>
      )}

      {err && !loading && (
        <div className="mt-4 text-sm text-red-700 dark:text-red-400">{err}</div>
      )}

      {!loading && !err && filtered.length === 0 && (
        <div className="mt-6 text-sm text-gray-600 dark:text-gray-400">
          No projects yet. If you believe this is incorrect, contact your
          administrator.
        </div>
      )}

      {/* Projects list */}
      <div className="mt-6 space-y-4">
        {filtered.map((p) => {
          const statusLabel = canonicalStatus(p.status) || p.status || "";
          const healthLabel = canonicalHealth(p.health);
          const cityState = [p.cityTown, p.stateName]
            .filter(Boolean)
            .join(" • ");

          return (
            <button
              key={p.projectId}
              type="button"
              onClick={() => gotoModules(navigate, role, p)}
              className="w-full text-left rounded-3xl border border-slate-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-4 sm:px-5 sm:py-5 shadow-sm
                         hover:shadow-md hover:-translate-y-0.5 transition
                         focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
            >
              {/* Top row: title + status badge */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white truncate">
                    {p.title}
                  </h2>
                  <p className="mt-0.5 text-xs sm:text-sm text-gray-600 dark:text-gray-400 truncate">
                    {p.code ? `${p.code} • ` : ""}
                    {p.projectType || "—"}
                    {cityState ? ` • ${cityState}` : ""}
                  </p>
                  {p.projectManagerName && (
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">
                      PM: {p.projectManagerName}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {statusLabel && <Badge kind="status" value={statusLabel} />}
                  {healthLabel !== "Unknown" && (
                    <Badge kind="health" value={healthLabel} />
                  )}
                </div>
              </div>

              {/* Chips row */}
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-gray-700 dark:bg-neutral-800 dark:border-neutral-700 dark:text-gray-200">
                  Stage: {p.stage || "—"}
                </span>
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-gray-700 dark:bg-neutral-800 dark:border-neutral-700 dark:text-gray-200">
                  Next: {fmtDate(p.plannedCompletionDate) || "—"}
                </span>
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-gray-700 dark:bg-neutral-800 dark:border-neutral-700 dark:text-gray-200">
                  City: {cityState || "—"}
                </span>
              </div>

              {/* Open bar */}
              <div
                className="mt-4 rounded-full border border-slate-200 bg-white px-4 py-2 text-center text-sm font-medium text-gray-800 shadow-sm
                              group-hover:border-emerald-500 group-hover:text-emerald-700
                              dark:bg-neutral-900 dark:border-neutral-700 dark:text-gray-100"
              >
                Open
              </div>
            </button>
          );
        })}
      </div>

      {/* Filter bottom sheet */}
      {showFilter && (
        <div className="fixed inset-0 z-40">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowFilter(false)}
            aria-hidden="true"
          />

          {/* Sheet */}
          <div className="absolute inset-0 flex items-end sm:items-center justify-center p-4">
            <div className="w-full max-w-md sm:max-w-lg bg-white dark:bg-neutral-900 rounded-t-3xl sm:rounded-3xl border border-slate-200/80 dark:border-neutral-800 shadow-xl max-h-[85vh] overflow-hidden">
              {/* drag handle */}
              <div className="pt-3 pb-1 flex justify-center">
                <div className="h-1 w-16 rounded-full bg-slate-300/80 dark:bg-neutral-700" />
              </div>

              {/* content */}
              <div className="px-4 sm:px-5 pb-4 sm:pb-5 overflow-y-auto max-h-[75vh] space-y-5">
                <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
                  Filters
                </h2>

                {/* Status (UPDATED) */}
                <div>
                  <div className="text-xs sm:text-sm font-medium text-slate-800 dark:text-gray-100 mb-2">
                    Status
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: "all", label: "All" },
                      { id: "active", label: "Active" },
                      { id: "completed", label: "Completed" },
                      { id: "onhold", label: "OnHold" },
                    ].map((opt) => {
                      const active = statusFilter === (opt.id as StatusFilter);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            setStatusFilter((prev) =>
                              opt.id === "all"
                                ? "all"
                                : prev === opt.id
                                  ? "all"
                                  : (opt.id as StatusFilter)
                            )
                          }
                          className={
                            "px-3 py-1.5 rounded-full border text-xs sm:text-sm transition-colors " +
                            (active
                              ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                              : "bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100 dark:bg-neutral-800 dark:border-neutral-700 dark:text-gray-100")
                          }
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Stage (UPDATED fixed list) */}
                <div>
                  <div className="text-xs sm:text-sm font-medium text-slate-800 dark:text-gray-100 mb-2">
                    Stage
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedStages([])}
                      className={
                        "px-3 py-1.5 rounded-full border text-xs sm:text-sm transition-colors " +
                        (selectedStages.length === 0
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                          : "bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100 dark:bg-neutral-800 dark:border-neutral-700 dark:text-gray-100")
                      }
                    >
                      All
                    </button>

                    {FIXED_STAGE_OPTIONS.map((s) => {
                      const active = selectedStages.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() =>
                            toggleFromArray(
                              s.id,
                              selectedStages,
                              setSelectedStages
                            )
                          }
                          className={
                            "px-3 py-1.5 rounded-full border text-xs sm:text-sm transition-colors " +
                            (active
                              ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                              : "bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100 dark:bg-neutral-800 dark:border-neutral-700 dark:text-gray-100")
                          }
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* City (kept as-is) */}
                {cityOptions.length > 0 && (
                  <div>
                    <div className="text-xs sm:text-sm font-medium text-slate-800 dark:text-gray-100 mb-2">
                      City
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {cityOptions.map((c) => {
                        const active = selectedCities.includes(c);
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() =>
                              toggleFromArray(
                                c,
                                selectedCities,
                                setSelectedCities
                              )
                            }
                            className={
                              "px-3 py-1.5 rounded-full border text-xs sm:text-sm transition-colors " +
                              (active
                                ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                                : "bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100 dark:bg-neutral-800 dark:border-neutral-700 dark:text-gray-100")
                            }
                          >
                            {c}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Project Manager (kept as-is) */}
                {pmOptions.length > 0 && (
                  <div>
                    <div className="text-xs sm:text-sm font-medium text-slate-800 dark:text-gray-100 mb-2">
                      Project Manager
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {pmOptions.map((pm) => {
                        const active = selectedPMs.includes(pm);
                        return (
                          <button
                            key={pm}
                            type="button"
                            onClick={() =>
                              toggleFromArray(pm, selectedPMs, setSelectedPMs)
                            }
                            className={
                              "px-3 py-1.5 rounded-full border text-xs sm:text-sm transition-colors " +
                              (active
                                ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                                : "bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100 dark:bg-neutral-800 dark:border-neutral-700 dark:text-gray-100")
                            }
                          >
                            {pm}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Health (UPDATED) */}
                <div>
                  <div className="text-xs sm:text-sm font-medium text-slate-800 dark:text-gray-100 mb-2">
                    Health
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: "all", label: "All" },
                      { id: "green", label: "Green" },
                      { id: "amber", label: "Amber" },
                      { id: "red", label: "Red" },
                    ].map((opt) => {
                      const active = healthFilter === (opt.id as HealthFilter);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            setHealthFilter((prev) =>
                              opt.id === "all"
                                ? "all"
                                : prev === opt.id
                                  ? "all"
                                  : (opt.id as HealthFilter)
                            )
                          }
                          className={
                            "px-3 py-1.5 rounded-full border text-xs sm:text-sm transition-colors " +
                            (active
                              ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                              : "bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100 dark:bg-neutral-800 dark:border-neutral-700 dark:text-gray-100")
                          }
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Schedule (keep as-is) */}
                <div>
                  <div className="text-xs sm:text-sm font-medium text-slate-800 dark:text-gray-100 mb-2">
                    Schedule
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: "any", label: "Any" },
                      { id: "overdue", label: "Overdue" },
                      { id: "due7", label: "Due in ≤7d" },
                      { id: "future", label: "Future (>7d)" },
                    ].map((opt) => {
                      const active = scheduleFilter === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            setScheduleFilter(opt.id as ScheduleFilter)
                          }
                          className={
                            "px-3 py-1.5 rounded-full border text-xs sm:text-sm transition-colors " +
                            (active
                              ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                              : "bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100 dark:bg-neutral-800 dark:border-neutral-700 dark:text-gray-100")
                          }
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Open Forms – keep as-is */}
                <div>
                  <div className="text-xs sm:text-sm font-medium text-slate-800 dark:text-gray-100 mb-2">
                    Open Forms
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: "any", label: "Any" },
                      { id: "with", label: "With forms" },
                      { id: "none", label: "No forms" },
                    ].map((opt) => {
                      const active = openFormsFilter === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            setOpenFormsFilter(opt.id as OpenFormsFilter)
                          }
                          className={
                            "px-3 py-1.5 rounded-full border text-xs sm:text-sm transition-colors " +
                            (active
                              ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                              : "bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100 dark:bg-neutral-800 dark:border-neutral-700 dark:text-gray-100")
                          }
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Footer buttons */}
              <div className="border-t border-slate-200/80 dark:border-neutral-800 px-4 sm:px-5 py-3 flex gap-3 bg-slate-50/60 dark:bg-neutral-900/60">
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="flex-1 rounded-full border border-slate-300 bg-white py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-100
                             dark:bg-neutral-900 dark:border-neutral-700 dark:text-gray-100 dark:hover:bg-neutral-800"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setShowFilter(false)}
                  className="flex-1 rounded-full bg-emerald-600 py-2.5 text-sm font-medium text-white shadow hover:bg-emerald-700"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Profile side panel */}
      {showProfilePanel && (
        <div className="fixed inset-0 z-40 flex justify-end">
          {/* dim background */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowProfilePanel(false)}
            aria-hidden="true"
          />

          {/* right side drawer */}
          <aside className="relative h-full w-full max-w-sm bg-white dark:bg-neutral-950 shadow-xl border-l border-slate-200/80 dark:border-neutral-800 flex flex-col">
            {/* header / handle */}
            <div className="px-4 pt-3 pb-2 border-b border-slate-200/70 dark:border-neutral-800 flex items-center justify-between">
              {/* user summary */}
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-emerald-500 via-emerald-400 to-lime-300 text-white grid place-items-center text-sm font-semibold">
                  {profileInitials}
                </div>
                <div className="leading-tight">
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">
                    {profileName}
                  </div>
                  {profileEmail && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {profileEmail}
                    </div>
                  )}
                  {role && (
                    <div className="mt-0.5 text-[11px] text-emerald-700 dark:text-emerald-300">
                      {role}
                    </div>
                  )}
                </div>
              </div>

              {/* close button stays same */}
              <button
                type="button"
                onClick={() => setShowProfilePanel(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-neutral-800"
                aria-label="Close profile panel"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  className="text-slate-500 dark:text-slate-300"
                >
                  <path
                    d="M6.225 4.811 4.81 6.225 10.586 12l-5.775 5.775 1.414 1.414L12 13.414l5.775 5.775 1.414-1.414L13.414 12l5.775-5.775-1.414-1.414L12 10.586z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>

            {/* scrollable content */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6 text-sm">
              {/* Account section */}
              <section>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                  Account
                </div>
                <div className="space-y-1.5">
                  {/* Profile */}
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-slate-50 dark:hover:bg-neutral-900"
                  >
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                      {/* user icon */}
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        className="fill-current"
                      >
                        <path d="M12 12a4 4 0 1 0-4-4 4.004 4.004 0 0 0 4 4zm0 2c-3.337 0-6 1.343-6 3v1h12v-1c0-1.657-2.663-3-6-3z" />
                      </svg>
                    </span>
                    <div className="flex-1 text-left">
                      <div className="font-medium text-gray-900 dark:text-white">
                        Profile
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        View &amp; edit your details
                      </div>
                    </div>
                  </button>

                  {/* Notifications */}
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-slate-50 dark:hover:bg-neutral-900"
                  >
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                      {/* bell icon */}
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        className="fill-current"
                      >
                        <path d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6V11a6 6 0 0 0-5-5.917V4a1 1 0 0 0-2 0v1.083A6 6 0 0 0 6 11v5l-2 2v1h16v-1z" />
                      </svg>
                    </span>
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-white">
                          Notifications
                        </span>
                        {/* red count pill */}
                        <span className="inline-flex items-center justify-center rounded-full bg-rose-500 text-white text-[11px] px-1.5">
                          5
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Alerts, reminders &amp; approvals
                      </div>
                    </div>
                  </button>

                  {/* Payments */}
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-slate-50 dark:hover:bg-neutral-900"
                  >
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                      {/* card icon */}
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        className="fill-current"
                      >
                        <path d="M4 5h16a2 2 0 0 1 2 2v1H2V7a2 2 0 0 1 2-2zm-2 6h20v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" />
                      </svg>
                    </span>
                    <div className="flex-1 text-left">
                      <div className="font-medium text-gray-900 dark:text-white">
                        Payments
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Billing, invoices &amp; receipts
                      </div>
                    </div>
                  </button>

                  {/* Customization */}
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-slate-50 dark:hover:bg-neutral-900"
                  >
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                      {/* brush icon */}
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        className="fill-current"
                      >
                        <path d="M20.71 4.63 19.37 3.3a1 1 0 0 0-1.41 0L11 10.25V13h2.75l6.96-6.96a1 1 0 0 0 0-1.41z" />
                        <path d="M5 14a3 3 0 0 0-3 3 3 3 0 0 0 5.45 1.69A4.92 4.92 0 0 1 10 17h1v-2H5z" />
                      </svg>
                    </span>
                    <div className="flex-1 text-left">
                      <div className="font-medium text-gray-900 dark:text-white">
                        Customization
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Theme, home KPIs &amp; layout
                      </div>
                    </div>
                  </button>
                </div>
              </section>

              {/* Support section */}
              <section>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                  Support
                </div>
                <div className="space-y-1.5">
                  {/* Contact Support */}
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-slate-50 dark:hover:bg-neutral-900"
                  >
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700 dark:bg-neutral-800 dark:text-neutral-100">
                      {/* chat icon */}
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        className="fill-current"
                      >
                        <path d="M4 4h16v10H5.17L4 15.17z" />
                      </svg>
                    </span>
                    <div className="flex-1 text-left">
                      <div className="font-medium text-gray-900 dark:text-white">
                        Contact Support
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Chat, email or phone
                      </div>
                    </div>
                  </button>

                  {/* Help Center */}
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-slate-50 dark:hover:bg-neutral-900"
                  >
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700 dark:bg-neutral-800 dark:text-neutral-100">
                      {/* help icon */}
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        className="fill-current"
                      >
                        <path d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2zm1 15h-2v-2h2zm1.07-7.75-.9.92A2.5 2.5 0 0 0 12 13h-1v-1a3.5 3.5 0 0 1 1-2.5l1.24-1.26A1.5 1.5 0 1 0 11 7h-1a2.5 2.5 0 1 1 4.07 2.25z" />
                      </svg>
                    </span>
                    <div className="flex-1 text-left">
                      <div className="font-medium text-gray-900 dark:text-white">
                        Help Center
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Guides &amp; tutorials
                      </div>
                    </div>
                  </button>
                </div>
              </section>

              {/* Preferences */}
              <section>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                  Preferences
                </div>
                <div className="space-y-3">
                  {/* Dark mode toggle (local only) */}
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">
                        Dark Mode
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        App appearance
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDarkModePref((v) => !v)}
                      className="inline-flex items-center rounded-full bg-slate-100 dark:bg-neutral-800 px-1 py-0.5"
                    >
                      <div
                        className={`flex items-center justify-between w-14 text-[11px] ${darkModePref ? "text-white" : "text-slate-600"
                          }`}
                      >
                        <span
                          className={`flex-1 text-center transition-colors ${!darkModePref ? "font-medium" : "opacity-70"
                            }`}
                        >
                          Off
                        </span>
                        <span
                          className={`flex-1 text-center transition-colors ${darkModePref ? "font-medium" : "opacity-70"
                            }`}
                        >
                          On
                        </span>
                      </div>
                    </button>
                  </div>

                  {/* Language */}
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">
                        Language
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Current: {languagePref}
                      </div>
                    </div>
                    <select
                      value={languagePref}
                      onChange={(e) => setLanguagePref(e.target.value)}
                      className="text-xs rounded-full border border-slate-200 bg-white px-3 py-1 dark:bg-neutral-900 dark:border-neutral-700 dark:text-white"
                    >
                      <option>English</option>
                      <option>Hindi</option>
                    </select>
                  </div>

                  {/* Units */}
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white mb-1">
                      Units
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      SI / Imperial
                    </div>
                    <div className="inline-flex rounded-full border border-slate-200 bg-slate-100 p-0.5 dark:bg-neutral-900 dark:border-neutral-700">
                      <button
                        type="button"
                        onClick={() => setUnitsPref("SI")}
                        className={`px-3 py-1 text-xs rounded-full ${unitsPref === "SI"
                            ? "bg-white dark:bg-emerald-600 text-emerald-700 dark:text-white shadow-sm"
                            : "text-gray-600 dark:text-gray-400"
                          }`}
                      >
                        SI
                      </button>
                      <button
                        type="button"
                        onClick={() => setUnitsPref("Imperial")}
                        className={`px-3 py-1 text-xs rounded-full ${unitsPref === "Imperial"
                            ? "bg-white dark:bg-emerald-600 text-emerald-700 dark:text-white shadow-sm"
                            : "text-gray-600 dark:text-gray-400"
                          }`}
                      >
                        Imperial
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* Legal & settings */}
              <section>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                  Legal &amp; Settings
                </div>
                <div className="space-y-1.5">
                  {[
                    { label: "Settings", sub: "App & security preferences" },
                    {
                      label: "Privacy Policy",
                      sub: "Data usage & permissions",
                    },
                    { label: "Disclaimer", sub: "Legal disclaimer & terms" },
                  ].map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      className="w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2 hover:bg-slate-50 dark:hover:bg-neutral-900"
                    >
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700 dark:bg-neutral-800 dark:text-neutral-100">
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            className="fill-current"
                          >
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 12.94a7.502 7.502 0 0 0 0-1.88l2.03-1.58-1.92-3.32-2.39.96a7.47 7.47 0 0 0-1.62-.94L14.5 2h-5l-.99 3.18c-.6.24-1.16.55-1.68.92l-2.39-.96-1.92 3.32 2.03 1.58a7.502 7.502 0 0 0 0 1.88L1.52 14.52l1.92 3.32 2.39-.96c.52.37 1.08.68 1.68.92L9.5 22h5l.99-3.18c.6-.24 1.16-.55 1.68-.92l2.39.96 1.92-3.32z" />
                          </svg>
                        </span>
                        <div className="text-left">
                          <div className="font-medium text-gray-900 dark:text-white">
                            {item.label}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {item.sub}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            </div>

            {/* Sign out row */}
            <div className="px-4 py-3 border-t border-rose-100/70 dark:border-rose-900/40 bg-rose-50/60 dark:bg-rose-950/20">
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-rose-500 text-white text-sm font-medium py-2.5 hover:bg-rose-600"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  className="fill-current"
                >
                  <path d="M10 17v-2h4v-2h-4V9l-5 3z" />
                  <path d="M13 3H5a2 2 0 0 0-2 2v4h2V5h8v14H5v-4H3v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z" />
                </svg>
                <span>Sign out</span>
              </button>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

/* --- Small KPI Card (2x2 tiles) --- */
function KPI({
  label,
  value,
  tone = "base",
}: {
  label: string;
  value: number | string;
  tone?: "base" | "info" | "warn" | "alert";
}) {
  const toneClasses =
    tone === "info"
      ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
      : tone === "warn"
        ? "bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
        : tone === "alert"
          ? "bg-rose-50 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200"
          : "bg-gray-50 text-gray-800 dark:bg-neutral-800 dark:text-neutral-200";

  return (
    <div
      className={`rounded-3xl border border-slate-200/80 dark:border-neutral-800 px-4 py-3 ${toneClasses}`}
    >
      <div className="text-xs text-gray-600 dark:text-gray-200">{label}</div>
      <div className="mt-1 text-xl sm:text-2xl font-semibold">{value}</div>
    </div>
  );
}
