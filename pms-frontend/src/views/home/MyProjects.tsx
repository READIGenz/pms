// pms-frontend/src/views/home/MyProjects.tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';

type Project = {
    projectId: string;
    title: string;
    code?: string | null;
    status?: string | null;              // Prisma enum
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

// --- Role → WIR path resolver ---
const wirPathForRole = (role: string, projectId: string) => {
  switch (normalizeRole(role)) {
    case 'Contractor': return `/home/contractor/projects/${projectId}/wir`;
    case 'PMC':        return `/home/pmc/projects/${projectId}/wir`;
    case 'IH-PMT':     return `/home/ihpmt/projects/${projectId}/wir`;
    case 'Client':     return `/home/client/projects/${projectId}/wir`;     
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
        case 'Admin': return `/admin/projects/${projectId}`;
        case 'Client': return `/client/projects/${projectId}`;
        case 'IH-PMT': return `/ihpmt/projects/${projectId}`;
        case 'Contractor': return `/contractor/projects/${projectId}`;
        case 'Consultant': return `/consultant/projects/${projectId}`;
        case 'Supplier': return `/supplier/projects/${projectId}`;
        case 'PMC': return `/pmc/projects/${projectId}`;
        default: return `/projects/${projectId}`;
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
            Draft: "bg-gray-100 text-gray-800 border-gray-200 dark:bg-neutral-800 dark:text-gray-200 dark:border-neutral-700",
            Active: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
            OnHold: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
            Completed: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
            Archived: "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-800",
        };
        cls = map[v] || cls;
    } else {
        const map: Record<string, string> = {
            Green: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
            Amber: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
            Red: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800",
            Unknown: "bg-gray-100 text-gray-800 border-gray-200 dark:bg-neutral-800 dark:text-gray-200 dark:border-neutral-700",
        };
        cls = map[v] || cls;
    }

    return <span className={`text-[10px] px-1.5 py-0.5 rounded border ${cls}`}>{v}</span>;
}

export default function MyProjects() {
    const { user, claims } = useAuth();
    const navigate = useNavigate();

    const role =
        normalizeRole(
            (user as any)?.role ??
            (claims as any)?.role ??
            (claims as any)?.userRole ??
            (claims as any)?.roleName ??
            ''
        );

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

    // ---- KPIs (computed from ALL projects, not the filtered list) ----
    const kpis = useMemo(() => {
        const total = all.length;
        let active = 0, onHold = 0, completed = 0;

        for (const p of all) {
            switch (canonicalStatus(p.status)) {
                case 'Active': active++; break;
                case 'OnHold': onHold++; break;
                case 'Completed': completed++; break;
                default: break; // ignore Draft/Archived/unknown for KPI strip
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
                            // show only assignments that match the CHOSEN role (except Admin)
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

                // Choose pool based on chosen role:
                // - Client => clientProjects only
                // - Admin / service-provider roles => svcProjects (already role-filtered above)
                const chosen = normalizeRole(role);
                const pool = chosen === 'Client' ? clientProjects : svcProjects;

                // De-dupe (prefer enriched object with status and other fields if available)
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

    return (
        <section className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border dark:border-neutral-800 p-4 sm:p-5 md:p-6">
            <div className="flex items-center justify-between gap-3">
                <h1 className="text-lg sm:text-xl md:text-2xl font-semibold dark:text-white">My Projects</h1>
                <button
                    onClick={() => navigate(-1)}
                    className="text-sm px-3 py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                >
                    Back
                </button>
            </div>


            {/* ---- KPI strip ---- */}
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                <KPI label="Total" value={loading ? '—' : kpis.total} />
                <KPI label="Active" value={loading ? '—' : kpis.active} tone="info" />
                <KPI label="On Hold" value={loading ? '—' : kpis.onHold} tone="warn" />
                <KPI label="Completed" value={loading ? '—' : kpis.completed} />
            </div>

            <div className="mt-4">
                <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by code, title, client, city/state…"
                    className="w-full text-sm border rounded-lg px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                />
            </div>

            {loading && (
                <div className="mt-4 text-sm text-gray-700 dark:text-gray-300">Loading your projects…</div>
            )}

            {err && !loading && (
                <div className="mt-4 text-sm text-red-700 dark:text-red-400">{err}</div>
            )}

            {!loading && !err && filtered.length === 0 && (
                <div className="mt-6 text-sm text-gray-600 dark:text-gray-400">
                    No projects yet. If you believe this is incorrect, contact your administrator.
                </div>
            )}

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((p) => (
                    <button
                        key={p.projectId}
                        onClick={() => gotoWir(navigate, role, p)}   // <-- open WIR with state
                        className="group text-left rounded-2xl border dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 sm:p-5 shadow-sm hover:shadow-md transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                    >
                        <div className="flex items-start gap-3 min-w-0">
                            <div className="h-10 w-10 flex-shrink-0 rounded-xl grid place-items-center bg-emerald-100 text-emerald-700 dark:bg-neutral-800 dark:text-emerald-300">
                                <svg width="20" height="20" viewBox="0 0 24 24" className="fill-current" aria-hidden="true">
                                    <path d="M3 21h18v-2H3v2z" />
                                    <path d="M5 19h14V8H5v11z" />
                                    <path d="M9 10h2v2H9zM9 14h2v2H9zM13 10h2v2h-2zM13 14h2v2h-2z" />
                                    <path d="M11 17h2v2h-2z" />
                                </svg>
                            </div>
                            <div className="min-w-0">
                                <div className="text-base sm:text-lg font-semibold dark:text-white truncate">
                                    {p.code ? `${p.code} — ${p.title}` : p.title}
                                </div>
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                    <Badge kind="status" value={p.status} />
                                    <Badge kind="health" value={p.health} />
                                </div>
                            </div>
                        </div>

                        {/* Summary rows (compact, mirrors modal Summary + key location/dates) */}
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs sm:text-[13px]">
                            <div className="flex gap-2">
                                <span className="text-gray-500 dark:text-gray-400 w-28">Stage</span>
                                <span className="font-medium dark:text-white">{p.stage || "—"}</span>
                            </div>
                            <div className="flex gap-2">
                                <span className="text-gray-500 dark:text-gray-400 w-28">Type</span>
                                <span className="font-medium dark:text-white">{p.projectType || "—"}</span>
                            </div>
                            <div className="flex gap-2">
                                <span className="text-gray-500 dark:text-gray-400 w-28">Structure</span>
                                <span className="font-medium dark:text-white">{p.structureType || "—"}</span>
                            </div>
                            <div className="flex gap-2">
                                <span className="text-gray-500 dark:text-gray-400 w-28">Contract</span>
                                <span className="font-medium dark:text-white">{p.contractType || "—"}</span>
                            </div>
                            <div className="flex gap-2 sm:col-span-2">
                                <span className="text-gray-500 dark:text-gray-400 w-28">Client</span>
                                <span className="font-medium dark:text-white">{p.clientCompanyName || "—"}</span>
                            </div>
                            <div className="flex gap-2">
                                <span className="text-gray-500 dark:text-gray-400 w-28">City/State</span>
                                <span className="font-medium dark:text-white">
                                    {[p.cityTown, p.stateName].filter(Boolean).join(", ") || "—"}
                                </span>
                            </div>
                            <div className="flex gap-2">
                                <span className="text-gray-500 dark:text-gray-400 w-28">Dates</span>
                                <span className="font-medium dark:text-white">
                                    {fmtDate(p.startDate) || "—"} → {fmtDate(p.plannedCompletionDate) || "—"}
                                </span>
                            </div>
                        </div>
                    </button>
                ))}
            </div>
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
            ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200'
            : tone === 'warn'
                ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
                : tone === 'alert'
                    ? 'bg-rose-50 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200'
                    : 'bg-gray-50 text-gray-800 dark:bg-neutral-800 dark:text-neutral-200';

    return (
        <div className={`rounded-xl border dark:border-neutral-800 p-3 sm:p-4 ${toneClasses}`}>
            <div className="text-xs sm:text-sm opacity-80">{label}</div>
            <div className="text-xl sm:text-2xl font-semibold mt-1">{value}</div>
        </div>
    );
}
