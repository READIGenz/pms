// pms-frontend/src/views/home/Welcome.tsx

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

  return (
    <section className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border dark:border-neutral-800 p-4 sm:p-6 md:p-8">
      <div className="w-full flex justify-center">
        {photo ? (
          <img
            src={photo}
            alt={displayName}
            className="rounded-full object-cover ring-2 ring-emerald-100 dark:ring-neutral-700 w-[clamp(64px,12vw,96px)] h-[clamp(64px,12vw,96px)]"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="grid place-items-center rounded-full bg-emerald-100 text-emerald-900 dark:bg-neutral-800 dark:text-neutral-100 ring-2 ring-emerald-100 dark:ring-neutral-700 font-semibold w-[clamp(64px,12vw,96px)] h-[clamp(64px,12vw,96px)]">
            {initials}
          </div>
        )}
      </div>

      <div className="mt-5 text-center space-y-1">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight dark:text-white">
          Welcome, {displayName}!
        </h1>

        {email && (
          <p className="text-sm text-gray-600 dark:text-gray-400 break-words">{email}</p>
        )}

        {mobile && (
          <p className="text-sm text-gray-600 dark:text-gray-400 break-words">
            {mobile}
          </p>
        )}

        {showServiceProviderLine && (
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            You are logged in as {role}.
          </p>
        )}

        <p className="text-sm md:text-base text-gray-600 dark:text-gray-400">
          Let’s get you to your workspace.
        </p>
      </div>

      <div className="mt-6 flex justify-center">
        <button
          onClick={() => navigate('tiles')}
          className="inline-flex justify-center items-center gap-2 rounded-xl px-5 py-3 bg-emerald-600 text-white text-sm font-medium shadow hover:bg-emerald-700 active:scale-[0.99] transition w-full sm:w-auto"
        >
          Continue
          <svg width="16" height="16" viewBox="0 0 24 24" className="fill-current">
            <path d="M13.172 12 8.222 7.05l1.414-1.414L16 12l-6.364 6.364-1.414-1.414z" />
          </svg>
        </button>
      </div>
    </section>
  );
}
