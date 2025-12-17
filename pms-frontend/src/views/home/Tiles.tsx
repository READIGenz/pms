// pms-frontend/src/views/home/Tiles.tsx

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

const normalizeRole = (raw?: string) => {
  const norm = (raw || "")
    .toString()
    .trim()
    .replace(/[_\s-]+/g, "")
    .toLowerCase();
  switch (norm) {
    case "admin":
      return "Admin";
    case "client":
      return "Client";
    case "ihpmt":
      return "IH-PMT";
    case "contractor":
      return "Contractor";
    case "consultant":
      return "Consultant";
    case "pmc":
      return "PMC";
    case "supplier":
      return "Supplier";
    default:
      return raw || "";
  }
};

const isServiceProviderRole = (role?: string) =>
  ["Contractor", "Consultant", "Supplier", "PMC", "IH-PMT"].includes(
    normalizeRole(role)
  );

const projectsRouteForRole = (role?: string) => {
  // Map each role to its projects page. Adjust if your app uses different paths.
  switch (normalizeRole(role)) {
    case "Admin":
      return "/admin/projects";
    case "Client":
      return "/client/projects";
    case "IH-PMT":
      return "/ihpmt/projects";
    case "Contractor":
      return "/contractor/projects";
    case "Consultant":
      return "/consultant/projects";
    case "Supplier":
      return "/supplier/projects";
    case "PMC":
      return "/pmc/projects";
    default:
      return "/projects"; // sensible fallback
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
    "";
  const role = useMemo(() => normalizeRole(rawRole), [rawRole]);
  const toProjects = useMemo(() => projectsRouteForRole(role), [role]); // kept for future use
  const sp = isServiceProviderRole(role);

  return (
    <div className="w-full">
      {/* role hint pill */}
      {role && role !== "Client" && (
        <div className="mb-3">
          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs sm:text-sm font-medium text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200">
            Logged in as {role}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* My Projects tile */}
        <button
          type="button"
          onClick={() => navigate("/home/my-projects")}
          className="group relative text-left rounded-2xl border border-slate-200/80 dark:border-neutral-800 bg-white/90 dark:bg-neutral-900 p-5 sm:p-6 shadow-sm
                     hover:shadow-md hover:-translate-y-0.5 transition transform focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
        >
          {/* soft background accent */}
          <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-500/5 via-emerald-400/3 to-lime-300/6" />

          <div className="relative flex items-start gap-3">
            {/* icon badge */}
            <div className="h-11 w-11 shrink-0 rounded-2xl bg-gradient-to-br from-emerald-500 via-emerald-400 to-lime-300 text-white grid place-items-center shadow-sm">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                className="opacity-95"
                aria-hidden="true"
              >
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

            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
                My Projects
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                {sp
                  ? "View and manage projects you are assigned to across sites."
                  : "View and manage all projects you are part of inside Trinity PMS."}
              </p>
            </div>
          </div>

          {/* arrow in bottom-right */}
          <div className="relative mt-4 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>Go to project workspace</span>
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white group-hover:bg-emerald-700 transition">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                className="fill-current"
              >
                <path d="M13.172 12 8.222 7.05l1.414-1.414L16 12l-6.364 6.364-1.414-1.414z" />
              </svg>
            </span>
          </div>
        </button>
        {/* My Projects tile 2 */}
        <button
          type="button"
          onClick={() => navigate("/home/my-projects")}
          className="group relative text-left rounded-2xl border border-slate-200/80 dark:border-neutral-800 bg-white/90 dark:bg-neutral-900 p-5 sm:p-6 shadow-sm
                     hover:shadow-md hover:-translate-y-0.5 transition transform focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
        >
          {/* soft background accent */}
          <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-500/5 via-emerald-400/3 to-lime-300/6" />

          <div className="relative flex items-start gap-3">
            {/* icon badge */}
            <div className="h-11 w-11 shrink-0 rounded-2xl bg-gradient-to-br from-emerald-500 via-emerald-400 to-lime-300 text-white grid place-items-center shadow-sm">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                className="opacity-95"
                aria-hidden="true"
              >
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

            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
                My Projects
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                {sp
                  ? "View and manage projects you are assigned to across sites."
                  : "View and manage all projects you are part of inside Trinity PMS."}
              </p>
            </div>
          </div>

          {/* arrow in bottom-right */}
          <div className="relative mt-4 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>Go to project workspace</span>
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white group-hover:bg-emerald-700 transition">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                className="fill-current"
              >
                <path d="M13.172 12 8.222 7.05l1.414-1.414L16 12l-6.364 6.364-1.414-1.414z" />
              </svg>
            </span>
          </div>
        </button>
      </div>
    </div>
  );
}
