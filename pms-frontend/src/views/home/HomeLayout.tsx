// pms-frontend/src/views/home/HomeLayout.tsx

import { useEffect } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export default function HomeLayout() {
  const { token } = useAuth();
  const loc = useLocation();

  useEffect(() => {
    document.title = 'Trinity PMS — Home';
  }, []);

  if (!token) return <Navigate to="/login" state={{ from: loc }} replace />;

  return (
    <div className="min-h-dvh flex flex-col overflow-x-hidden bg-gradient-to-b from-emerald-50 to-yellow-50 dark:from-neutral-900 dark:to-neutral-950">
      {/* Header mimics Login’s spacing/look */}
      <header className="w-full px-4 sm:px-6 lg:px-10 py-6 border-b dark:border-neutral-800">
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500 via-lime-400 to-yellow-300 grid place-items-center shadow">
              <svg width="26" height="26" viewBox="0 0 24 24" role="img" aria-hidden="true">
                <path d="M12 2C9 6 7 8.5 7 11a5 5 0 1 0 10 0c0-2.5-2-5-5-9z" className="fill-white/95" />
              </svg>
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight dark:text-white">Trinity PMS</div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Empowering Projects</div>
            </div>
          </div>

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

      {/* Body */}
      <main className="px-4 sm:px-6 lg:px-10 py-6">
        <div className="mx-auto w-full max-w-screen-sm md:max-w-screen-md">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
