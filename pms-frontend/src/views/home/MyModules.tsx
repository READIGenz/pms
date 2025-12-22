//pms-frontend/src/views/home/MyModules.tsx

import { useEffect, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

type NavState = {
  role?: string;
  project?: { projectId: string; code?: string | null; title?: string };
};

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

// keep exactly the same WIR destination as today
const wirPathForRole = (role: string, projectId: string) => {
  switch (normalizeRole(role)) {
    case "Contractor":
    case "PMC":
    case "IH-PMT":
    case "Client":
    default:
      return `/home/projects/${projectId}/wir`;
  }
};

export default function MyModules() {
  const navigate = useNavigate();
  const { projectId: projectIdFromUrl } = useParams();
  const location = useLocation();

  const navState = (location.state || {}) as NavState;

  const role = normalizeRole(navState?.role);
  const projectId = navState?.project?.projectId || projectIdFromUrl || "";
  const projectTitle = navState?.project?.title || "Project";
  const projectCode = navState?.project?.code || null;

  useEffect(() => {
    document.title = "Trinity PMS — My Modules";
  }, []);

  const tiles = useMemo(
    () => [
      {
        key: "wir",
        title: "Work Inspection Request (WIR)",
        desc: "Create & manage inspections",
        enabled: true,
        onClick: () => {
          if (!projectId) return;
          navigate(wirPathForRole(role, projectId), {
            state: {
              role,
              project: { projectId, code: projectCode, title: projectTitle },
            },
            replace: false,
          });
        },
      },
      {
        key: "dpr",
        title: "Daily Progress Report (DPR)",
        desc: "Daily site progress logs",
        enabled: false,
        onClick: () => {},
      },
      {
        key: "punchlist",
        title: "Punchlist (Snag list)",
        desc: "Track defects & closures",
        enabled: false,
        onClick: () => {},
      },
      {
        key: "docs",
        title: "Project Document",
        desc: "Drawings, MOM, approvals",
        enabled: false,
        onClick: () => {},
      },
      {
        key: "dashboard",
        title: "Dashboard",
        desc: "KPIs & insights",
        enabled: false,
        onClick: () => {},
      },
    ],
    [navigate, projectId, projectCode, projectTitle, role]
  );

  return (
    <section className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border border-slate-200/80 dark:border-neutral-800 p-4 sm:p-5 lg:p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
            {role || "User"} • {projectCode ? projectCode : "—"}
          </p>
          <h1 className="text-lg sm:text-xl md:text-2xl font-semibold text-gray-900 dark:text-white truncate">
            {projectTitle}
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            My Modules
          </p>
        </div>

        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs sm:text-sm font-medium text-slate-700 shadow-sm
                     hover:bg-slate-50 hover:border-slate-300
                     dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
          type="button"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M14.707 5.293 9 11l5.707 5.707-1.414 1.414L6.172 11l7.121-7.121z"
              className="fill-current"
            />
          </svg>
          <span>Back</span>
        </button>
      </div>

      {/* Tiles */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={t.enabled ? t.onClick : undefined}
            className={
              "text-left rounded-3xl border border-slate-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-sm transition " +
              (t.enabled
                ? "hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                : "opacity-60 cursor-not-allowed")
            }
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900 dark:text-white">
                  {t.title}
                </div>
                <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                  {t.desc}
                </div>
              </div>

              {!t.enabled && (
                <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full border bg-slate-50 text-slate-700 border-slate-200 dark:bg-neutral-800 dark:text-gray-200 dark:border-neutral-700">
                  Coming soon
                </span>
              )}
            </div>

            {t.enabled && (
              <div className="mt-4 rounded-full border border-slate-200 bg-white px-4 py-2 text-center text-sm font-medium text-gray-800 shadow-sm
                              dark:bg-neutral-900 dark:border-neutral-700 dark:text-gray-100">
                Open
              </div>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}
