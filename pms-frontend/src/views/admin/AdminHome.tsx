// pms-frontend/src/views/admin/AdminHome.tsx
import { useEffect, useState } from "react";
import { Outlet, useLocation, Navigate, NavLink } from "react-router-dom";
import avaLogo from "../../assets/avaLogo.jpg";

declare global {
  interface Window {
    __ADMIN_SUBTITLE__?: string;
  }
}

function decodeJwtPayload(token: string): any | null {
  try {
    const [_, b64] = token.split(".");
    if (!b64) return null;
    const norm = b64.replace(/-/g, "+").replace(/_/g, "/");
    const pad = norm.length % 4 ? "=".repeat(4 - (norm.length % 4)) : "";
    return JSON.parse(atob(norm + pad));
  } catch {
    return null;
  }
}

export default function AdminHome() {
  const token = localStorage.getItem("token");
  const loc = useLocation();
  const payload = token ? decodeJwtPayload(token) : null;
  const isSuperAdmin = !!payload?.isSuperAdmin;

  const handleSignOut = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    location.assign("/login");
  };

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
        [
          "w-full text-left px-3 py-2 rounded-xl text-sm transition flex items-center gap-2",
          "border border-transparent",
          isActive
            ? [
                // ✅ active: gold left bar + soft gold background
                "bg-[#FCC020]/20 text-slate-900",
                "border-[#FCC020]/40",
                "shadow-sm",
                "dark:bg-[#FCC020]/15 dark:text-white dark:border-[#FCC020]/35",
              ].join(" ")
            : [
                "text-slate-700 hover:bg-[#00379C]/5 hover:border-[#00379C]/15",
                "dark:text-slate-200 dark:hover:bg-white/5 dark:hover:border-white/10",
              ].join(" "),
        ].join(" ")
      }
    >
      {/* ✅ gold selection bar (shows only when active) */}
      <span
        className={[
          "inline-block w-2 h-2 rounded-full transition",
          "bg-[#00379C] dark:bg-white/70",
        ].join(" ")}
        style={{ opacity: 0.85 }}
      />

      {/* Gold vertical bar */}
      <span
        className="ml-1 h-5 w-1 rounded-full bg-[#FCC020]"
        style={{ display: "none" }}
      />

      <span className="truncate">{label}</span>
    </NavLink>
  );

  const [pageTitle, setPageTitle] = useState("Admin");
  const [pageSubtitle, setPageSubtitle] = useState("");

  useEffect(() => {
    const read = () => {
      const t = (document.title || "").trim();
      const pretty = t.includes("—") ? t.split("—").pop()!.trim() : t;
      setPageTitle(pretty || "Admin");
      setPageSubtitle((window.__ADMIN_SUBTITLE__ || "").trim());
    };

    read();
    const id = window.setInterval(read, 250);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="relative min-h-screen bg-white dark:bg-neutral-950">
      {/* Yellow thin lines background (no ribbon) */}
      <div className="admin-lines-bg" aria-hidden="true" />
      {/* Top accent line #00379C, #FCC020, #23A192*/}
      <div className="h-1 w-full bg-gradient-to-r from-[#FCC020] via-[#23A192] to-[#FCC020]" />

      {/* Header */}
      <header className="w-full px-5 sm:px-8 lg:px-14 py-4 border-b border-slate-200 bg-white sticky top-0 z-30 dark:bg-neutral-950 dark:border-white/10">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-white border border-slate-200 shadow-sm grid place-items-center overflow-hidden dark:bg-neutral-950 dark:border-white/10">
              <img
                src={avaLogo}
                alt="Trinity PMS"
                className="h-full w-full object-contain"
              />
            </div>

            <div>
              <div className="text-xl font-extrabold tracking-tight text-[#00379C] dark:text-white">
                Trinity PMS — Admin
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-300">
                <span className="font-semibold text-[#23A192]">Empowering</span>{" "}
                Projects
              </div>
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSignOut}
              title="Sign out"
              className="inline-flex items-center gap-2 rounded-full
                bg-[#00379C] px-4 py-2 text-xs font-semibold text-white shadow-sm
                hover:brightness-110 active:scale-[0.98]
                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00379C]/40
                dark:focus:ring-offset-neutral-950"
            >
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="px-5 sm:px-8 lg:px-14 py-6">
        <div className="mx-auto max-w-6xl grid grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] gap-6">
          {/* Sidebar */}
          <aside className="md:sticky lg:top-[92px] h-max">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden dark:bg-neutral-950 dark:border-white/10">
              <div className="px-4 py-3 border-b border-slate-200 bg-[#00379C]/[0.03] dark:border-white/10 dark:bg-white/[0.03]">
                <div className="text-xs font-extrabold uppercase tracking-wider text-[#00379C] dark:text-white">
                  Modules
                </div>
                <div className="mt-1 h-1 w-12 rounded-full bg-[#FCC020]" />
              </div>

              <div className="p-3 flex flex-col gap-1">
                <SideLink to="." label="Dashboard" end />
                <SideLink to="companies" label="Companies" />
                <SideLink to="users" label="Users" />
                <SideLink to="projects" label="Projects" />
                <SideLink to="assignments" label="Assignments" />
                <SideLink
                  to="permissions"
                  label="Role Templates and Project Overrides"
                />
                <SideLink
                  to="permission-explorer"
                  label="User Permission Explorer"
                />
                <SideLink to="ref/activitylib" label="Activity Library" />
                <SideLink to="ref/materiallib" label="Material Library" />
                <SideLink to="ref/checklistlib" label="Checklist Library" />
                <SideLink to="module-settings" label="Module Settings" />
                {isSuperAdmin && <SideLink to="audit" label="Audit" />}
              </div>
            </div>
          </aside>

          {/* Main content */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden dark:bg-neutral-950 dark:border-white/10">
            {/* Content header bar */}
            <div className="px-6 py-5 border-b border-slate-200 bg-[#00379C]/[0.03] dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  {/* slightly larger title */}
                  <div className="text-xl font-extrabold text-[#00379C] leading-tight truncate dark:text-white">
                    {pageTitle}
                  </div>
                  {pageSubtitle ? (
                    <div className="mt-0.5 text-sm text-slate-600 truncate dark:text-slate-300">
                      {pageSubtitle}
                    </div>
                  ) : null}
                  <div className="mt-1 h-1 w-10 rounded-full bg-[#FCC020]" />
                </div>
              </div>
            </div>

            <div className="p-6">
              <Outlet />
            </div>
          </section>
        </div>
      </main>
      <style>{`
      .admin-lines-bg{
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 0;
      }

      /* keep AdminHome content above it */
      .admin-lines-bg ~ *{
        position: relative;
        z-index: 1;
      }

      /* ONLY thin yellow lines */
      .admin-lines-bg::before{
        content:"";
        position:absolute;
        inset:-20%;
        transform: rotate(-12deg);
        background:
          repeating-linear-gradient(
            90deg,
            rgba(252,192,32,0.07) 0px,
            rgba(252,192,32,0.07) 2px,
            transparent 2px,
            transparent 18px
          );
        opacity: 0.55;
      }

      /* Dark mode dim */
      :is(.dark) .admin-lines-bg::before{ opacity: 0.18; }
    `}</style>
    </div>
  );
}
