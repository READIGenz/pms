// pms-frontend/src/views/ihpmt/ihpmtHome.tsx
import { useEffect } from 'react';
import { Outlet, useLocation, Navigate, NavLink } from 'react-router-dom';

export default function ihpmtHome() {
  // client-side guard
  const token = localStorage.getItem('token');
  const loc = useLocation();

  useEffect(() => {
    document.title = 'Trinity PMS — IH PMT';
  }, []);

  if (!token) return <Navigate to="/login" state={{ from: loc }} replace />;

  const SideLink = ({
    to,
    label,
    end = false,
  }: {
    to: string;
    label: string;
    end?: boolean;
  }) => (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `w-full text-left px-3 py-2 rounded text-sm transition flex items-center gap-2
        ${isActive ? 'bg-emerald-600 text-white' : 'hover:bg-emerald-50 dark:hover:bg-neutral-800'}`
      }
    >
      {/* tiny pill icon to keep visual rhythm */}
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      <span>{label}</span>
    </NavLink>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-yellow-50 dark:from-neutral-900 dark:to-neutral-950">
      {/* Header */}
      <header className="w-full px-4 sm:px-6 lg:px-10 py-4 border-b dark:border-neutral-800">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 via-lime-400 to-yellow-300 grid place-items-center shadow">
              <svg width="22" height="22" viewBox="0 0 24 24" role="img" aria-hidden="true">
                <path d="M12 2C9 6 7 8.5 7 11a5 5 0 1 0 10 0c0-2.5-2-5-5-9z" className="fill-white/95" />
              </svg>
            </div>
            <div>
              <div className="text-xl font-bold tracking-tight dark:text-white">Trinity PMS — IH-PMT</div>
              <div className="text-xs text-gray-600 dark:text-gray-300">Empowering Projects</div>
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-3">
            <button
              className="px-3 py-2 rounded border text-sm hover:bg-gray-50 dark:hover:bg-neutral-800"
              onClick={() => {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                location.assign('/login');
              }}
              title="Sign out"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Body with left sidebar nav + main content */}
      <main className="px-4 sm:px-6 lg:px-10 py-6">
        <div className="mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-6">
          

          {/* Main content */}
          <section className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border dark:border-neutral-800 p-6">
            <Outlet />
          </section>
        </div>
      </main>
    </div>
  );
}
