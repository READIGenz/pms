import { useEffect, useState } from 'react';
import { api } from '../../api/client';

type Kpis = {
  users: { total: number; active: number };
  companies: { total: number; active: number };
  projects: { total: number; active: number };
  projectsByStatus?: Array<{ status: string; count: number }>;
  usersByStatus?: Array<{ status: string; count: number }>;
  companiesByStatus?: Array<{ status: string; count: number }>;
};

export default function Dashboard() {
  const [data, setData] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        // Axios-style: { data }
        const { data } = await api.get('/admin/dashboard/kpis');
        if (!ignore) setData(data ?? data); // support either direct data or wrapped
      } catch (e: any) {
        if (!ignore) setErr(e?.message || 'Failed to load KPIs');
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  // --- UI helpers (pure styling) ---
  const pillClass = (status: string) => {
    const s = (status || '').toLowerCase();
    if (['active', 'approved', 'submitted', 'green'].some(k => s.includes(k))) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800';
    }
    if (['recommended', 'amber', 'onhold', 'on hold', 'returned'].some(k => s.includes(k))) {
      return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800';
    }
    if (['completed', 'blue'].some(k => s.includes(k))) {
      return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800';
    }
    if (['rejected', 'inactive', 'red', 'archived'].some(k => s.includes(k))) {
      return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800';
    }
    return 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-neutral-800/50 dark:text-gray-300 dark:border-neutral-700';
  };

  const Tile = ({
    label,
    primary,
    secondary,
  }: {
    label: string;
    primary: string | number;
    secondary?: string;
  }) => {
    const accent =
      label === 'Users'
        ? 'from-emerald-500/10 to-emerald-400/5'
        : label === 'Companies'
        ? 'from-amber-500/10 to-amber-400/5'
        : label === 'Projects'
        ? 'from-blue-500/10 to-blue-400/5'
        : 'from-gray-500/10 to-gray-400/5';

    const iconPath =
      label === 'Users'
        ? 'M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5z'
        : label === 'Companies'
        ? 'M3 9l9-7 9 7v11a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z'
        : label === 'Projects'
        ? 'M4 4h16v4H4zM4 10h16v4H4zM4 16h16v4H4z'
        : 'M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2z';

    return (
      <div className="relative rounded-3xl border border-slate-200/80 dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900 overflow-hidden group shadow-sm">
        {/* soft background gradient */}
        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accent}`} />

        {/* content, vertically centered */}
        <div className="relative flex h-full items-center gap-4">
          {/* icon bubble */}
          <div className="h-10 w-10 shrink-0 rounded-full bg-white/80 dark:bg-neutral-800/80 border border-white/80 dark:border-neutral-700 grid place-items-center shadow-sm">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden className="text-emerald-700 dark:text-emerald-300">
              <path d={iconPath} className="fill-current" />
            </svg>
          </div>

          {/* text block */}
          <div className="flex flex-col justify-center min-w-0">
            <div className="text-xs uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1">
              {label}
            </div>
            <div className="text-3xl font-semibold leading-tight dark:text-white">
              {primary}
            </div>
            {secondary ? (
              <div className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                {secondary}
              </div>
            ) : null}
          </div>
        </div>

        {/* hover ring */}
        <div className="absolute inset-0 rounded-3xl ring-0 ring-emerald-500/0 group-hover:ring-1 group-hover:ring-emerald-500/20 transition" />
      </div>
    );
  };

  // --- Loading / error / empty states in same layout as other admin pages ---
  if (loading || err || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-yellow-50 dark:from-neutral-900 dark:to-neutral-950 px-4 sm:px-6 lg:px-10 py-8 rounded-2xl">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
              Admin Dashboard
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Overview of users, companies, and projects.
            </p>
          </div>
          {loading && (
            <div className="rounded-2xl border border-slate-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
              Loading KPIs…
            </div>
          )}
          {err && (
            <div className="rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
              {err}
            </div>
          )}
          {!loading && !err && !data && (
            <div className="rounded-2xl border border-slate-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
              No data.
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Main dashboard UI ---
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-yellow-50 dark:from-neutral-900 dark:to-neutral-950 px-4 sm:px-6 lg:px-10 py-8 rounded-2xl">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
              Admin Dashboard
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Snapshot of users, companies, and projects in Trinity PMS.
            </p>
          </div>
        </div>

        {/* KPI Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Tile
            label="Users"
            primary={data.users.total}
            secondary={`Active: ${data.users.active}`}
          />
          <Tile
            label="Companies"
            primary={data.companies.total}
            secondary={`Active: ${data.companies.active}`}
          />
          <Tile
            label="Projects"
            primary={data.projects.total}
            secondary={`Active: ${data.projects.active}`}
          />
        </div>

        {/* Status sections, styled like other admin “Section” blocks */}
        {!!data.projectsByStatus?.length && (
          <div className="mb-2 bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border border-slate-200/70 dark:border-neutral-800 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-2">
              Projects by Status
            </div>
            <div className="flex flex-wrap gap-2">
              {data.projectsByStatus.map(ps => (
                <span
                  key={ps.status}
                  className={`text-[12px] px-3 py-1 rounded-full border ${pillClass(ps.status)}`}
                >
                  {ps.status}: <b>{ps.count}</b>
                </span>
              ))}
            </div>
          </div>
        )}

        {!!data.usersByStatus?.length && (
          <div className="mb-2 bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border border-slate-200/70 dark:border-neutral-800 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-2">
              Users by Status
            </div>
            <div className="flex flex-wrap gap-2">
              {data.usersByStatus.map(us => (
                <span
                  key={us.status}
                  className={`text-[12px] px-3 py-1 rounded-full border ${pillClass(us.status)}`}
                >
                  {us.status}: <b>{us.count}</b>
                </span>
              ))}
            </div>
          </div>
        )}

        {!!data.companiesByStatus?.length && (
          <div className="mb-2 bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border border-slate-200/70 dark:border-neutral-800 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-2">
              Companies by Status
            </div>
            <div className="flex flex-wrap gap-2">
              {data.companiesByStatus.map(cs => (
                <span
                  key={cs.status}
                  className={`text-[12px] px-3 py-1 rounded-full border ${pillClass(cs.status)}`}
                >
                  {cs.status}: <b>{cs.count}</b>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
