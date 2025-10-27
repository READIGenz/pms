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
    case 'Admin': return '/admin/projects';
    case 'Client': return '/client/projects';
    case 'IH-PMT': return '/ihpmt/projects';
    case 'Contractor': return '/contractor/projects';
    case 'Consultant': return '/consultant/projects';
    case 'Supplier': return '/supplier/projects';
    case 'PMC': return '/pmc/projects';
    default: return '/projects'; // sensible fallback
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
          onClick={() => navigate('/home/my-projects')}
          className="group text-left rounded-2xl border dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 sm:p-5 shadow-sm hover:shadow-md transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl grid place-items-center bg-emerald-100 text-emerald-700 dark:bg-neutral-800 dark:text-emerald-300">
              <svg width="20" height="20" viewBox="0 0 24 24" className="fill-current" aria-hidden="true">
                {/* Base */}
                <path d="M3 21h18v-2H3v2z" />
                {/* Building body */}
                <path d="M5 19h14V8H5v11z" />
                {/* Windows */}
                <path d="M9 10h2v2H9zM9 14h2v2H9zM13 10h2v2h-2zM13 14h2v2h-2z" />
                {/* Door */}
                <path d="M11 17h2v2h-2z" />
              </svg>
            </div>

            <h2 className="text-base sm:text-lg font-semibold dark:text-white">My Projects</h2>
          </div>

          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {sp ? 'View and manage your assigned projects.' : 'View and manage your projects.'}
          </p>
        </button>
      </div>
    </div>
  );
}
