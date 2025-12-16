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

  if (loading) return <div className="p-4 text-sm">Loading KPIs…</div>;
  if (err) return <div className="p-4 text-sm text-rose-600">{err}</div>;
  if (!data) return <div className="p-4 text-sm">No data.</div>;

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
      <div className="relative rounded-2xl border dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900 overflow-hidden group">
        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accent}`} />
        <div className="relative flex items-start gap-3">
          <div className="h-10 w-10 shrink-0 rounded-xl bg-white/70 dark:bg-neutral-800/70 border border-white/60 dark:border-neutral-700 grid place-items-center shadow-sm">
            <svg width="22" height="22" viewBox="0 0 24 24" className="opacity-80" aria-hidden>
              <path d={iconPath} className="fill-current text-emerald-700 dark:text-emerald-300 group-hover:opacity-100" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1">{label}</div>
            <div className="text-3xl font-semibold leading-tight dark:text-white">{primary}</div>
            {secondary ? <div className="text-sm text-gray-700 dark:text-gray-300 mt-1">{secondary}</div> : null}
          </div>
        </div>
        <div className="absolute inset-0 rounded-2xl ring-0 ring-emerald-500/0 group-hover:ring-1 group-hover:ring-emerald-500/20 transition" />
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Tile label="Users" primary={data.users.total} secondary={`Active: ${data.users.active}`} />
        <Tile label="Companies" primary={data.companies.total} secondary={`Active: ${data.companies.active}`} />
        <Tile label="Projects" primary={data.projects.total} secondary={`Active: ${data.projects.active}`} />
      </div>

      {!!data.projectsByStatus?.length && (
        <div className="rounded-2xl border dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900">
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Projects by Status</div>
          <div className="flex flex-wrap gap-2">
            {data.projectsByStatus.map(ps => (
              <span
                key={ps.status}
                className={`text-[12px] px-2 py-1 rounded-lg border ${pillClass(ps.status)}`}
              >
                {ps.status}: <b>{ps.count}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      {!!data.usersByStatus?.length && (
        <div className="rounded-2xl border dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900">
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Users by Status</div>
          <div className="flex flex-wrap gap-2">
            {data.usersByStatus.map(us => (
              <span
                key={us.status}
                className={`text-[12px] px-2 py-1 rounded-lg border ${pillClass(us.status)}`}
              >
                {us.status}: <b>{us.count}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      {!!data.companiesByStatus?.length && (
        <div className="rounded-2xl border dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900">
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Companies by Status</div>
          <div className="flex flex-wrap gap-2">
            {data.companiesByStatus.map(cs => (
              <span
                key={cs.status}
                className={`text-[12px] px-2 py-1 rounded-lg border ${pillClass(cs.status)}`}
              >
                {cs.status}: <b>{cs.count}</b>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}