// pms-frontend/src/views/home/MyProjects.tsx
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';

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
};

const normalizeRole = (raw?: string) => {
  const norm = (raw || '').toString().trim().replace(/[_\s-]+/g, '').toLowerCase();
  switch (norm) {
    case 'admin': return 'Admin';
    case 'client': return 'Client';
    case 'ihpmt': return 'IH-PMT';
    case 'contractor': return 'Contractor';
    case 'consultant': return 'Consultant';
    case 'pmc': return 'PMC';
    case 'supplier': return 'Supplier';
    default: return raw || '';
  }
};

// --- Role → WIR path resolver (unified WIR route) ---
const wirPathForRole = (role: string, projectId: string) => {
  switch (normalizeRole(role)) {
    case 'Contractor': return `/home/projects/${projectId}/wir`;
    case 'PMC':        return `/home/projects/${projectId}/wir`;
    case 'IH-PMT':     return `/home/projects/${projectId}/wir`;
    case 'Client':     return `/home/projects/${projectId}/wir`;
    default:           return `/home/projects/${projectId}/wir`;
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

const projectRouteForRole = (role?: string, projectId?: string) => {
  const r = normalizeRole(role);
  switch (r) {
    case 'Admin':      return `/admin/projects/${projectId}`;
    case 'Client':     return `/client/projects/${projectId}`;
    case 'IH-PMT':     return `/ihpmt/projects/${projectId}`;
    case 'Contractor': return `/contractor/projects/${projectId}`;
    case 'Consultant': return `/consultant/projects/${projectId}`;
    case 'Supplier':   return `/supplier/projects/${projectId}`;
    case 'PMC':        return `/pmc/projects/${projectId}`;
    default:           return `/projects/${projectId}`;
  }
};

// ---- Status helpers for KPIs (Prisma enum-aligned) ----
type CanonicalStatus = 'Active' | 'OnHold' | 'Completed' | 'Draft' | 'Archived' | '';

const canonicalStatus = (s?: string | null): CanonicalStatus => {
  const n = (s || '').toString().trim().replace(/\s|_/g, '').toLowerCase();
  if (n === 'active') return 'Active';
  if (n === 'onhold' || n === 'hold') return 'OnHold';
  if (n === 'completed' || n === 'complete') return 'Completed';
  if (n === 'draft') return 'Draft';
  if (n === 'archived' || n === 'archive') return 'Archived';
  return '';
};

// ---- tiny format helpers for dates ----
const isIsoLike = (v: any) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v);
const fmtDate = (v: any) => (isIsoLike(v) ? new Date(v).toLocaleDateString() : (v ?? ""));

// ---- Badge (visual parity with admin modal) ----
function Badge({ kind, value }: { kind: "status" | "health"; value?: string | null }) {
  const v = (value || "").toString().trim();
  if (!v) return null;

  let cls = "bg-gray-100 text-gray-800 border-gray-200 dark:bg-neutral-800 dark:text-gray-200 dark:border-neutral-700";
  if (kind === "status") {
    const map: Record<string, string> = {
      Draft:     "bg-gray-100 text-gray-800 border-gray-200 dark:bg-neutral-800 dark:text-gray-200 dark:border-neutral-700",
      Active:    "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
      OnHold:    "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
      Completed: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
      Archived:  "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-800",
    };
    cls = map[v] || cls;
  } else {
    const map: Record<string, string> = {
      Green:   "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
      Amber:   "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
      Red:     "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800",
      Unknown: "bg-gray-100 text-gray-800 border-gray-200 dark:bg-neutral-800 dark:text-gray-200 dark:border-neutral-700",
    };
    cls = map[v] || cls;
  }

  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${cls}`}>{v}</span>;
}

/** Filter UI state (only visual right now) */
type FilterState = {
  status: string[];
  stage: string[];
  city: string[];
  pm: string[];
  health: string[];
  schedule: string;
  openForms: string;
};
type MultiFilterKey = 'status' | 'stage' | 'city' | 'pm' | 'health';

const initialFilters: FilterState = {
  status: [],
  stage: [],
  city: [],
  pm: [],
  health: [],
  schedule: 'Any',
  openForms: 'Any',
};

export default function MyProjects() {
  const { user, claims } = useAuth();
  const navigate = useNavigate();

  // --- Profile display for top-right avatar & drawer ---
  const role =
    normalizeRole(
      (user as any)?.role ??
      (claims as any)?.role ??
      (claims as any)?.userRole ??
      (claims as any)?.roleName ??
      ''
    );

  const displayName =
    (user as any)?.fullName ||
    [(user as any)?.firstName, (user as any)?.lastName].filter(Boolean).join(' ') ||
    (claims as any)?.name ||
    role ||
    'User';

  const displayEmail =
    (user as any)?.email ||
    (claims as any)?.email ||
    '';

  const initials =
    displayName
      .split(' ')
      .filter(Boolean)
      .map((p: string) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'U';

  const userId =
    (user as any)?.userId ??
    (user as any)?.id ??
    (claims as any)?.userId ??
    (claims as any)?.sub ??
    '';

  const [all, setAll] = useState<Project[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // UI-only state for group & quick chips
  const [activeGroup, setActiveGroup] = useState<"None" | "Stage" | "City" | "PM">("None");
  const [activeQuick, setActiveQuick] = useState<string | null>(null);

  // Bottom sheet filter state
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(initialFilters);

  // Profile drawer state
  const [profileOpen, setProfileOpen] = useState(false);
  const [darkModePref, setDarkModePref] = useState(false);
  const [language, setLanguage] = useState('English');
  const [unitSystem, setUnitSystem] = useState<'SI' | 'Imperial'>('Imperial');

  const handleSignOut = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    location.assign('/login');
  };

  // ---- KPIs (computed from ALL projects, not the filtered list) ----
  const kpis = useMemo(() => {
    const total = all.length;
    let active = 0, onHold = 0, completed = 0;

    for (const p of all) {
      switch (canonicalStatus(p.status)) {
        case 'Active':    active++;    break;
        case 'OnHold':    onHold++;    break;
        case 'Completed': completed++; break;
        default: break;
      }
    }

    return { total, active, onHold, completed };
  }, [all]);

  useEffect(() => {
    document.title = 'Trinity PMS — My Projects';
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
          params: { includeMemberships: '1' },
        });
        const u = ures?.user || ures || {};
        const memberships: any[] = Array.isArray(u.userRoleMemberships) ? u.userRoleMemberships : [];

        // 2) All projects (both to find service-provider projects and enrich)
        const { data: pres } = await api.get('/admin/projects');
        const projectList: any[] = Array.isArray(pres) ? pres : (pres?.projects || []);
        const byId = new Map<string, any>();
        projectList.forEach(p => p?.projectId && byId.set(p.projectId, p));

        // Client projects straight from memberships (enrich from byId)
        const clientProjects: Project[] = memberships
          .filter(m => m.scopeType === 'Project' && m.role === 'Client' && m.project)
          .map(m => {
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
              stateName: p?.state?.name ?? (typeof p?.state === 'string' ? p.state : null),

              startDate: p?.startDate ?? null,
              plannedCompletionDate: p?.plannedCompletionDate ?? null,
            };
          });

        // Service-provider: include any projects where THIS user appears in assignments
        const svcProjects: Project[] = [];
        const CONCURRENCY = 8;
        const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

        for (let i = 0; i < projectList.length; i += CONCURRENCY) {
          const slice = projectList.slice(i, i + CONCURRENCY);
          const results = await Promise.allSettled(
            slice.map(async (p) => {
              const { data: ares } = await api.get(`/admin/projects/${p.projectId}/assignments`);
              const rows: any[] = Array.isArray(ares) ? ares : (ares?.assignments || []);
              const chosen = normalizeRole(role);
              const userHasRole = rows.some(r =>
                String(r.userId) === String(userId) &&
                (chosen === 'Admin'
                  ? true
                  : normalizeRole(
                    r?.role ?? r?.userRole ?? r?.roleName ?? r?.assignmentRole ?? r?.companyRole ?? ''
                  ) === chosen)
              );
              if (userHasRole) {
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
                  stateName: p?.state?.name ?? (typeof p?.state === 'string' ? p.state : null),

                  startDate: p?.startDate ?? null,
                  plannedCompletionDate: p?.plannedCompletionDate ?? null,
                } as Project;
              }
              return null;
            })
          );
          results.forEach(r => {
            if (r.status === 'fulfilled' && r.value) svcProjects.push(r.value);
          });
          if (i + CONCURRENCY < projectList.length) await sleep(50);
        }

        const chosen = normalizeRole(role);
        const pool = chosen === 'Client' ? clientProjects : svcProjects;

        const map = new Map<string, Project>();
        pool.forEach(p => {
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
              constructionType: p.constructionType ?? existing.constructionType ?? null,
              contractType: p.contractType ?? existing.contractType ?? null,
              clientCompanyName: p.clientCompanyName ?? existing.clientCompanyName ?? null,

              cityTown: p.cityTown ?? existing.cityTown ?? null,
              stateName: p.stateName ?? existing.stateName ?? null,

              startDate: p.startDate ?? existing.startDate ?? null,
              plannedCompletionDate: p.plannedCompletionDate ?? existing.plannedCompletionDate ?? null,
            });
          }
        });

        if (!cancelled) setAll(Array.from(map.values()));
      } catch (e: any) {
        if (!cancelled) setErr(e?.response?.data?.error || e?.message || 'Failed to load projects.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAll();
    return () => { cancelled = true; };
  }, [userId, role]);

  // ---- Search filtering for the grid only (title/code/client/location/types) ----
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(p => {
      const hay = [
        p.title, p.code, p.clientCompanyName,
        p.cityTown, p.stateName,
        p.stage, p.projectType, p.structureType, p.contractType,
      ].map(v => (v || '').toString().toLowerCase());
      return hay.some(s => s.includes(q));
    });
  }, [all, search]);

  const handleOpenProject = (p: Project) => {
    gotoWir(navigate, role, p);
  };

  // ---- Filter helpers (UI only) ----
  const toggleMultiFilter = (field: MultiFilterKey, value: string) => {
    setFilters(prev => {
      const exists = prev[field].includes(value);
      const nextArr = exists ? prev[field].filter(v => v !== value) : [...prev[field], value];
      return { ...prev, [field]: nextArr };
    });
  };

  const setSingleFilter = (field: 'schedule' | 'openForms', value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleClearFilters = () => setFilters(initialFilters);
  const handleApplyFilters = () => setIsFilterOpen(false);

  // Options used in filter sheet (purely visual for now)
  const STATUS_OPTIONS = ["Ongoing", "Completed"];
  const STAGE_OPTIONS = ["Construction", "Fitout", "Design"];
  const CITY_OPTIONS = ["Delhi", "Mumbai", "Goa", "Bengaluru", "Hyderabad", "Chennai"];
  const PM_OPTIONS = ["Priya Sharma", "Arun Gupta", "Meera Iyer", "Rahul Verma", "Riya Sen", "Sanjay Rao"];
  const HEALTH_OPTIONS = ["Good", "At Risk", "Delayed"];
  const SCHEDULE_OPTIONS = ["Any", "Overdue", "Due in ≤7d", "Future (>7d)"];
  const OPEN_FORM_OPTIONS = ["Any", "With forms", "No forms"];

  return (
    <section className="bg-transparent">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-5">

        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {role || 'Contractor'}
              </p>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
                My Projects
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="h-9 w-9 rounded-full bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 shadow-sm flex items-center justify-center text-xs font-semibold text-slate-700 dark:text-neutral-100 hover:bg-slate-50 dark:hover:bg-neutral-800"
            title={displayEmail || 'Account'}
          >
            {initials}
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KPI label="Total" value={loading ? '—' : kpis.total} />
          <KPI label="Active" value={loading ? '—' : kpis.active} tone="info" />
          <KPI label="On Hold" value={loading ? '—' : kpis.onHold} tone="warn" />
          <KPI label="Completed" value={loading ? '—' : kpis.completed} />
        </div>

        {/* Search + Sort / Filter */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch">
          <div className="flex-1">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search project, code, title, client, city/state…"
              className="w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-100"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-100"
            >
              Sort
            </button>
            <button
              type="button"
              onClick={() => setIsFilterOpen(true)}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-100"
            >
              Filter
            </button>
          </div>
        </div>

        {/* Group & Quick chips */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400">Group</span>
            <div className="flex flex-wrap gap-2">
              {["None", "Stage", "City", "PM"].map(label => (
                <button
                  key={label}
                  type="button"
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    activeGroup === label
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                  }`}
                  onClick={() => setActiveGroup(label as any)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400">Quick</span>
            <div className="flex flex-wrap gap-2">
              {["At Risk", "Delayed", "Ongoing", "Completed", "On Hold"].map(label => (
                <button
                  key={label}
                  type="button"
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    activeQuick === label
                      ? "bg-emerald-500 text-white"
                      : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-200 dark:hover:bg-emerald-900/60"
                  }`}
                  onClick={() => setActiveQuick(prev => (prev === label ? null : label))}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Messages + Projects list */}
        <div className="space-y-3 pt-1">
          {loading && (
            <div className="text-sm text-slate-500 dark:text-slate-300">
              Loading your projects…
            </div>
          )}

          {err && !loading && (
            <div className="text-sm text-rose-600 dark:text-rose-400">
              {err}
            </div>
          )}

          {!loading && !err && filtered.length === 0 && (
            <div className="text-sm text-slate-500 dark:text-slate-300">
              No projects yet. If you believe this is incorrect, contact your administrator.
            </div>
          )}

          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            All Projects · {filtered.length}
          </p>

          {filtered.map((p) => (
            <div
              key={p.projectId}
              className="rounded-3xl bg-white dark:bg-neutral-900 shadow-sm border border-slate-100 dark:border-neutral-800 px-4 py-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {p.title}
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                    {p.code ? `${p.code} · ` : ""}{p.clientCompanyName || ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge kind="status" value={p.status} />
                  <Badge kind="health" value={p.health} />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                {p.stage && (
                  <span className="rounded-full bg-slate-100 dark:bg-neutral-800 px-2 py-0.5">
                    Stage: {p.stage}
                  </span>
                )}
                {[p.cityTown, p.stateName].some(Boolean) && (
                  <span className="rounded-full bg-slate-100 dark:bg-neutral-800 px-2 py-0.5">
                    {[p.cityTown, p.stateName].filter(Boolean).join(", ")}
                  </span>
                )}
                {(p.startDate || p.plannedCompletionDate) && (
                  <span className="rounded-full bg-slate-100 dark:bg-neutral-800 px-2 py-0.5">
                    {fmtDate(p.startDate) || "—"} → {fmtDate(p.plannedCompletionDate) || "—"}
                  </span>
                )}
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => handleOpenProject(p)}
                  className="w-full rounded-full border border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 py-1.5 text-xs font-medium text-slate-800 dark:text-neutral-100 hover:bg-slate-100 dark:hover:bg-neutral-700"
                >
                  Open
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom-sheet Filters panel */}
      {isFilterOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30">
          <div className="w-full max-w-md rounded-t-3xl bg-slate-50 dark:bg-neutral-900 shadow-2xl border-t border-slate-100 dark:border-neutral-800">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-300/70 dark:bg-neutral-700" />
            <div className="px-4 pt-3 pb-4 max-h-[70vh] overflow-y-auto space-y-4">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Filters
              </h2>

              {/* Status */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Status</p>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map(label => (
                    <button
                      key={label}
                      type="button"
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        filters.status.includes(label)
                          ? "bg-slate-900 text-white"
                          : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 dark:bg-neutral-900 dark:text-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                      }`}
                      onClick={() => toggleMultiFilter('status', label)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stage */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Stage</p>
                <div className="flex flex-wrap gap-2">
                  {STAGE_OPTIONS.map(label => (
                    <button
                      key={label}
                      type="button"
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        filters.stage.includes(label)
                          ? "bg-slate-900 text-white"
                          : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 dark:bg-neutral-900 dark:text-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                      }`}
                      onClick={() => toggleMultiFilter('stage', label)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* City */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">City</p>
                <div className="flex flex-wrap gap-2">
                  {CITY_OPTIONS.map(label => (
                    <button
                      key={label}
                      type="button"
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        filters.city.includes(label)
                          ? "bg-slate-900 text-white"
                          : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 dark:bg-neutral-900 dark:text-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                      }`}
                      onClick={() => toggleMultiFilter('city', label)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Project Manager */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Project Manager</p>
                <div className="flex flex-wrap gap-2">
                  {PM_OPTIONS.map(label => (
                    <button
                      key={label}
                      type="button"
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        filters.pm.includes(label)
                          ? "bg-slate-900 text-white"
                          : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 dark:bg-neutral-900 dark:text-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                      }`}
                      onClick={() => toggleMultiFilter('pm', label)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Health */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Health</p>
                <div className="flex flex-wrap gap-2">
                  {HEALTH_OPTIONS.map(label => (
                    <button
                      key={label}
                      type="button"
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        filters.health.includes(label)
                          ? "bg-slate-900 text-white"
                          : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 dark:bg-neutral-900 dark:text-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                      }`}
                      onClick={() => toggleMultiFilter('health', label)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Schedule */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Schedule</p>
                <div className="flex flex-wrap gap-2">
                  {SCHEDULE_OPTIONS.map(label => (
                    <button
                      key={label}
                      type="button"
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        filters.schedule === label
                          ? "bg-slate-900 text-white"
                          : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 dark:bg-neutral-900 dark:text-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                      }`}
                      onClick={() => setSingleFilter('schedule', label)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Open Forms */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Open Forms</p>
                <div className="flex flex-wrap gap-2">
                  {OPEN_FORM_OPTIONS.map(label => (
                    <button
                      key={label}
                      type="button"
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        filters.openForms === label
                          ? "bg-slate-900 text-white"
                          : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 dark:bg-neutral-900 dark:text-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                      }`}
                      onClick={() => setSingleFilter('openForms', label)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer buttons */}
            <div className="flex gap-3 border-t border-slate-200 dark:border-neutral-800 px-4 py-3 bg-slate-50/80 dark:bg-neutral-900/90 rounded-b-3xl">
              <button
                type="button"
                onClick={handleClearFilters}
                className="flex-1 rounded-full border border-slate-200 bg-white py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleApplyFilters}
                className="flex-1 rounded-full bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile drawer */}
      {profileOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
          <div className="h-full w-full max-w-sm bg-white dark:bg-neutral-900 rounded-l-3xl shadow-2xl flex flex-col">
            <div className="relative p-4 pb-5">
              <div className="h-24 w-full rounded-3xl bg-gradient-to-r from-sky-500 to-indigo-500" />
              <button
                type="button"
                onClick={() => setProfileOpen(false)}
                className="absolute top-4 right-4 h-7 w-7 rounded-full bg-white/90 flex items-center justify-center text-slate-700 shadow"
              >
                ✕
              </button>
              <div className="absolute left-6 top-10 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-white/95 flex items-center justify-center text-xs font-semibold text-slate-800 shadow">
                  {initials}
                </div>
                <div className="text-white">
                  <div className="text-sm font-semibold">{displayName}</div>
                  {displayEmail && (
                    <div className="text-[11px] opacity-90">{displayEmail}</div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 text-sm text-slate-800 dark:text-neutral-100">
              <DrawerItem icon="👤" label="Profile" description="View & edit your details" />
              <DrawerItem icon="🔔" label="Notifications" description="Alerts, reminders & approvals" badge="5" />
              <DrawerItem icon="💳" label="Payments" description="Billing, invoices & receipts" />
              <DrawerItem icon="🎨" label="Customization" description="Theme, home KPIs & layout" />

              <div className="pt-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">
                  Preferences
                </p>
              </div>

              <div className="flex items-center justify-between rounded-2xl px-3 py-2">
                <div className="flex items-center gap-3">
                  <IconBubble>🌙</IconBubble>
                  <div>
                    <div className="text-sm font-medium">Dark Mode</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDarkModePref(v => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                    darkModePref ? 'bg-slate-900' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                      darkModePref ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between rounded-2xl px-3 py-2">
                <div className="flex items-center gap-3">
                  <IconBubble>🌐</IconBubble>
                  <div>
                    <div className="text-sm font-medium">Language</div>
                    <div className="text-xs text-slate-500">Current: {language}</div>
                  </div>
                </div>
                <select
                  value={language}
                  onChange={e => setLanguage(e.target.value)}
                  className="text-xs rounded-full border border-slate-200 bg-white px-3 py-1 shadow-sm focus:outline-none"
                >
                  <option>English</option>
                  <option>Hindi</option>
                </select>
              </div>

              <div className="flex items-center justify-between rounded-2xl px-3 py-2">
                <div className="flex items-center gap-3">
                  <IconBubble>📏</IconBubble>
                  <div>
                    <div className="text-sm font-medium">Units</div>
                    <div className="text-xs text-slate-500">SI / Imperial</div>
                  </div>
                </div>
                <div className="inline-flex rounded-full bg-slate-100 p-0.5">
                  <button
                    type="button"
                    onClick={() => setUnitSystem('SI')}
                    className={`px-3 py-1 text-xs rounded-full ${
                      unitSystem === 'SI'
                        ? 'bg-white shadow text-slate-900'
                        : 'text-slate-500'
                    }`}
                  >
                    SI
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnitSystem('Imperial')}
                    className={`px-3 py-1 text-xs rounded-full ${
                      unitSystem === 'Imperial'
                        ? 'bg-white shadow text-slate-900'
                        : 'text-slate-500'
                    }`}
                  >
                    Imperial
                  </button>
                </div>
              </div>

              <div className="pt-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">
                  Legal &amp; Settings
                </p>
              </div>
              <DrawerItem icon="⚙️" label="Settings" description="App & security preferences" />
              <DrawerItem icon="🛡️" label="Privacy Policy" description="Data usage & permissions" />
              <DrawerItem icon="📄" label="Disclaimer" description="Legal disclaimer & terms" />

              <button
                type="button"
                onClick={handleSignOut}
                className="mt-4 w-full rounded-full border border-rose-200 bg-rose-50 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* --- Small KPI Card --- */
function KPI({
  label,
  value,
  tone = 'base',
}: {
  label: string;
  value: number | string;
  tone?: 'base' | 'info' | 'warn' | 'alert';
}) {
  const toneClasses =
    tone === 'info'
      ? 'border-sky-100 bg-white text-sky-700 shadow-sm dark:bg-neutral-900 dark:border-sky-900/40 dark:text-sky-300'
      : tone === 'warn'
        ? 'border-amber-100 bg-white text-amber-700 shadow-sm dark:bg-neutral-900 dark:border-amber-900/40 dark:text-amber-300'
        : tone === 'alert'
          ? 'border-rose-100 bg-white text-rose-700 shadow-sm dark:bg-neutral-900 dark:border-rose-900/40 dark:text-rose-300'
          : 'border-slate-100 bg-white text-slate-800 shadow-sm dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-200';

  return (
    <div className={`rounded-2xl px-3 py-2 sm:px-4 sm:py-3 ${toneClasses}`}>
      <div className="text-[11px] sm:text-xs opacity-80">{label}</div>
      <div className="text-lg sm:text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function IconBubble({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 text-sm">
      {children}
    </span>
  );
}

function DrawerItem({
  label,
  description,
  badge,
  icon,
}: {
  label: string;
  description: string;
  badge?: string;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2 hover:bg-slate-50 dark:hover:bg-neutral-800"
    >
      <div className="flex items-center gap-3">
        <IconBubble>{icon}</IconBubble>
        <div className="text-left">
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {description}
          </div>
        </div>
      </div>
      {badge && (
        <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
          {badge}
        </span>
      )}
    </button>
  );
}
