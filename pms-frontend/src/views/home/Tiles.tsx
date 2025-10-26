// pms-frontend/src/views/home/Tiles.tsx

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

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

const isServiceProviderRole = (role?: string) =>
  ['Contractor', 'Consultant', 'Supplier', 'PMC', 'IH-PMT'].includes(normalizeRole(role));

const projectsRouteForRole = (role?: string) => {
  // Map each role to its projects page. Adjust if your app uses different paths.
  switch (normalizeRole(role)) {
    case 'Admin':       return '/admin/projects';
    case 'Client':      return '/client/projects';
    case 'IH-PMT':      return '/ihpmt/projects';
    case 'Contractor':  return '/contractor/projects';
    case 'Consultant':  return '/consultant/projects';
    case 'Supplier':    return '/supplier/projects';
    case 'PMC':         return '/pmc/projects';
    default:            return '/projects'; // sensible fallback
  }
};

export default function Tiles() {
  const { user, claims } = useAuth();
  const navigate = useNavigate();

  const rawRole =
    (user as any)?.role ??
    (claims as any)?.role ??
    (claims as any)?.userRole ??
    (claims as any)?.roleName ??
    '';
  const role = useMemo(() => normalizeRole(rawRole), [rawRole]);
  const toProjects = useMemo(() => projectsRouteForRole(role), [role]);
  const sp = isServiceProviderRole(role);

  return (
    <div className="w-full">
      {/* If you want a small role hint, keep this. Remove it if not needed. */}
      {role && role !== 'Client' && (
        <div className="mb-2 text-xs sm:text-sm text-emerald-700 dark:text-emerald-300">
          You are logged in as <b>{role}</b>.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <button
          onClick={() => navigate(toProjects)}
          className="group text-left rounded-2xl border dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 sm:p-5 shadow-sm hover:shadow-md transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl grid place-items-center bg-emerald-100 text-emerald-700 dark:bg-neutral-800 dark:text-emerald-300">
              <svg width="20" height="20" viewBox="0 0 24 24" className="fill-current">
                <path d="M3 4h18v2H3V4zm0 6h18v10H3V10zm2 2v6h14v-6H5z" />
              </svg>
            </div>
            <h2 className="text-base sm:text-lg font-semibold dark:text-white">My Projects</h2>
          </div>

          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {sp ? 'View and manage your assigned projects.' : 'View and manage your projects.'}
          </p>

          <div className="mt-3 inline-flex items-center gap-1 text-emerald-700 group-hover:gap-2 transition">
            Open
            <svg width="16" height="16" viewBox="0 0 24 24" className="fill-current">
              <path d="M13.172 12 8.222 7.05l1.414-1.414L16 12l-6.364 6.364-1.414-1.414z" />
            </svg>
          </div>
        </button>
      </div>
    </div>
  );
}
