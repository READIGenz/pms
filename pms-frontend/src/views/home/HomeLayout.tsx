// pms-frontend/src/views/home/HomeLayout.tsx

import { useEffect } from "react";
import { Outlet, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

// ✅ Update the extension if your asset is .svg / .jpg etc.
import avaLogo from "../../assets/avaLogo.jpg";

export default function HomeLayout() {
  const { token } = useAuth();
  const loc = useLocation();

  useEffect(() => {
    document.title = "Trinity PMS — Home";
  }, []);

  if (!token) return <Navigate to="/login" state={{ from: loc }} replace />;

  return (
    <div className="min-h-dvh flex flex-col bg-slate-50/60 dark:bg-neutral-950">
      {/* Top 1px brand gradient line (like Admin / Login theme) */}
      <div className="h-px w-full bg-gradient-to-r from-[#00379C] via-[#23A192] to-[#FCC020]" />

      {/* Header (match Admin Home look) */}
      <header className="w-full bg-white dark:bg-neutral-950 border-b border-slate-200/80 dark:border-white/10">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-14 py-5">
          <div className="flex items-center justify-between gap-4">
            {/* Brand */}
            <div className="flex items-center gap-4 min-w-0">
              <div className="h-14 w-14 rounded-full bg-white dark:bg-neutral-950 border border-slate-200/80 dark:border-white/10 shadow-sm grid place-items-center overflow-hidden">
                <img
                  src={avaLogo}
                  alt="Trinity PMS"
                  className="h-10 w-10 object-contain"
                  loading="eager"
                />
              </div>

              <div className="min-w-0">
                <div className="truncate text-xl sm:text-2xl font-bold tracking-tight text-[#00379C]">
                  Trinity PMS
                </div>
                <div className="truncate text-sm font-medium text-[#23A192]">
                  Empowering Projects
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Sign out"
                title="Sign out"
                onClick={() => {
                  localStorage.removeItem("token");
                  localStorage.removeItem("user");
                  window.location.assign("/login");
                }}
                className="inline-flex items-center justify-center h-10 rounded-full px-6 bg-[#00379C] text-white text-sm font-medium shadow-sm
                           hover:brightness-110 active:scale-[0.99] transition
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00379C]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white
                           dark:focus-visible:ring-[#FCC020]/35 dark:focus-visible:ring-offset-neutral-950"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-14 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
