// pms-frontend/src/views/home/Tiles.tsx

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

/* ---------------- helpers ---------------- */
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
      return "/projects";
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

  // kept for future use if you decide to route role-wise:
  const _toProjects = useMemo(() => projectsRouteForRole(role), [role]);

  const sp = isServiceProviderRole(role);

  return (
    <div className="w-full">
      {/* role hint pill */}
      {role && role !== "Client" && (
        <div className="mb-4">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs sm:text-sm font-medium text-slate-700 dark:bg-neutral-900/60 dark:border-white/10 dark:text-neutral-200">
            <span className="h-1.5 w-1.5 rounded-full bg-[#23A192]" />
            Logged in as {role}
          </span>
        </div>
      )}

      {/* Container (Admin-like card, no gradient line) */}
      <div className="rounded-2xl bg-white dark:bg-neutral-950 border border-slate-200/80 dark:border-white/10 shadow-sm overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-200/70 dark:border-white/10">
          <div className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Modules
          </div>
          <div className="mt-1 text-sm text-slate-600 dark:text-neutral-400">
            Choose where you want to continue.
          </div>
          <div className="mt-3 h-1 w-14 rounded-full bg-[#FCC020]" />
        </div>

        <div className="p-5 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* ✅ Single My Projects tile */}
            <button
              type="button"
              onClick={() => navigate("/home/my-projects")}
              className="group text-left rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-neutral-950 p-5 sm:p-6 shadow-sm
                         hover:shadow-md hover:-translate-y-0.5 transition transform
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00379C]/25 focus-visible:ring-offset-2 focus-visible:ring-offset-white
                         dark:focus-visible:ring-[#FCC020]/30 dark:focus-visible:ring-offset-neutral-950"
            >
              <div className="flex items-start gap-3">
                {/* icon badge */}
                <div className="h-11 w-11 shrink-0 rounded-2xl bg-gradient-to-br from-[#00379C] via-[#23A192] to-[#FCC020] text-white grid place-items-center shadow-sm">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    className="opacity-95 fill-current"
                    aria-hidden="true"
                  >
                    <path d="M3 21h18v-2H3v2z" />
                    <path d="M5 19h14V8H5v11z" />
                    <path d="M9 10h2v2H9zM9 14h2v2H9zM13 10h2v2h-2zM13 14h2v2h-2z" />
                    <path d="M11 17h2v2h-2z" />
                  </svg>
                </div>

                <div className="min-w-0">
                  <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
                    My Projects
                  </h2>
                  <p className="mt-2 text-sm text-slate-600 dark:text-neutral-400">
                    {sp
                      ? "View and manage projects you are assigned to across sites."
                      : "View and manage all projects you are part of inside Trinity PMS."}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between text-xs text-slate-500 dark:text-neutral-400">
                <span>Go to project workspace</span>

                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#00379C] text-white group-hover:brightness-110 transition">
                  <svg width="14" height="14" viewBox="0 0 24 24" className="fill-current">
                    <path d="M13.172 12 8.222 7.05l1.414-1.414L16 12l-6.364 6.364-1.414-1.414z" />
                  </svg>
                </span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
