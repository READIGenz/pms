// pms-frontend/src/views/home/Welcome.tsx

import { useMemo, useEffect, useState } from 'react';
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

const isServiceProviderRole = (role?: string) => {
  const r = normalizeRole(role);
  return ['Contractor', 'Consultant', 'Supplier', 'PMC', 'IH-PMT'].includes(r);
};

export default function Welcome() {
  const { user, claims } = useAuth();
  const navigate = useNavigate();

  const firstName = user?.firstName ?? claims?.firstName ?? user?.name ?? claims?.name ?? 'there';
  const lastName  = user?.lastName  ?? claims?.lastName  ?? '';
  const email     = user?.email     ?? claims?.email     ?? '';
  const photo     = user?.profilePhoto ?? claims?.profilePhoto ?? '';

  // Try multiple fields for phone number
  const mobile =
    (user as any)?.mobile ??
    (user as any)?.phone ??
    (claims as any)?.mobile ??
    (claims as any)?.phone ??
    '';

  // Try multiple fields for role
  const rawRole =
    (user as any)?.role ??
    (claims as any)?.role ??
    (claims as any)?.userRole ??
    (claims as any)?.roleName ??
    '';
  const role = normalizeRole(rawRole);
  const showServiceProviderLine = isServiceProviderRole(role);

  const displayName = useMemo(() => {
    const fn = (firstName || '').toString().trim();
    const ln = (lastName || '').toString().trim();
    return (fn + (ln ? ` ${ln}` : '')).trim() || 'there';
  }, [firstName, lastName]);

  const initials = useMemo(() => {
    const [a = '', b = ''] = displayName.split(' ');
    return ((a[0] || '') + (b[0] || '')).toUpperCase() || 'U';
  }, [displayName]);

  // --- Welcome toast state ---
  const [showWelcomeToast, setShowWelcomeToast] = useState(false);

  useEffect(() => {
    // Show toast on mount, then auto-hide after a few seconds
    setShowWelcomeToast(true);
    const timer = setTimeout(() => setShowWelcomeToast(false), 3500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <section className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border border-slate-200/80 dark:border-neutral-800 p-5 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-3xl flex flex-col md:flex-row items-center md:items-start gap-6 md:gap-8">
          {/* Avatar */}
          <div className="flex-shrink-0">
            {photo ? (
              <img
                src={photo}
                alt={displayName}
                className="rounded-full object-cover ring-2 ring-emerald-100 dark:ring-neutral-700 w-[clamp(64px,12vw,96px)] h-[clamp(64px,12vw,96px)]"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="grid place-items-center rounded-full bg-gradient-to-br from-emerald-500 via-emerald-400 to-lime-300 text-white dark:bg-neutral-800 dark:text-neutral-100 ring-2 ring-emerald-100/70 dark:ring-neutral-700 font-semibold w-[clamp(64px,12vw,96px)] h-[clamp(64px,12vw,96px)]">
                {initials}
              </div>
            )}
          </div>

          {/* Text + CTA */}
          <div className="w-full text-center md:text-left space-y-2 md:space-y-3">
            <div>
              {/* Removed inline "Welcome to Trinity PMS" label */}
              <h1 className="mt-1 text-2xl md:text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">
                Welcome, {displayName}!
              </h1>
            </div>

            {email && (
              <p className="text-sm text-gray-600 dark:text-gray-400 break-words">
                {email}
              </p>
            )}

            {mobile && (
              <p className="text-sm text-gray-600 dark:text-gray-400 break-words">
                {mobile}
              </p>
            )}

            {showServiceProviderLine && (
              <div className="pt-1">
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-200">
                  Logged in as {role}
                </span>
              </div>
            )}

            <p className="text-sm md:text-base text-gray-600 dark:text-gray-400">
              Your personalized workspace brings together inspections, approvals, and project updates in one place.
            </p>

            <div className="pt-4 flex justify-center md:justify-start">
              <button
                onClick={() => navigate('tiles')}
                className="inline-flex justify-center items-center gap-2 rounded-full px-6 py-3 bg-emerald-600 text-white text-sm font-medium shadow hover:bg-emerald-700 active:scale-[0.99] transition w-full sm:w-auto"
              >
                Continue to workspace
                <svg width="16" height="16" viewBox="0 0 24 24" className="fill-current">
                  <path d="M13.172 12 8.222 7.05l1.414-1.414L16 12l-6.364 6.364-1.414-1.414z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Auto-dismiss welcome toast */}
      {showWelcomeToast && (
        <div className="fixed inset-x-0 top-4 z-40 flex justify-center px-4">
          <div className="inline-flex items-center gap-3 rounded-full bg-white/95 dark:bg-neutral-900/95 border border-emerald-100/80 dark:border-emerald-800 shadow-lg px-4 py-2 text-sm text-gray-800 dark:text-gray-100">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-emerald-500 via-lime-400 to-yellow-300 grid place-items-center">
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 2C9 6 7 8.5 7 11a5 5 0 1 0 10 0c0-2.5-2-5-5-9z"
                  className="fill-white/95"
                />
              </svg>
            </div>
            <span className="font-medium">Welcome to Trinity PMS</span>
          </div>
        </div>
      )}
    </>
  );
}
