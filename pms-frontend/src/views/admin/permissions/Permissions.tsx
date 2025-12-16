// src/views/admin/permissions/Permissions.tsx
import React from "react";
import { useNavigate } from "react-router-dom";

export default function Permissions() {
  const navigate = useNavigate();

  const goTemplates = () => navigate("/admin/permissions/templates");
  const goOverrides = () => navigate("/admin/permissions/project-overrides");

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-yellow-50 dark:from-neutral-900 dark:to-neutral-950 px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
              Modules &amp; Permissions
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Define role templates and per-project overrides.
            </p>
          </div>
        </div>

        {/* Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Role Templates */}
          <button
            type="button"
            onClick={goTemplates}
            className="group text-left rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm transition hover:shadow-md hover:bg-white dark:border-neutral-800 dark:bg-neutral-900"
            aria-label="Open Role Templates"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Default Access
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Role Templates
                </h3>
              </div>

              <span className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition group-hover:border-emerald-200 group-hover:text-emerald-700 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M10.293 3.293a1 1 0 011.414 0l5 5a.997.997 0 010 1.414l-5 5a1 1 0 11-1.414-1.414L13.586 10H4a1 1 0 110-2h9.586l-3.293-3.293a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
            </div>

            <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
              Set the default permission matrix for each role across modules and
              actions (view/raise/review/approve/close).
            </p>

            <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
              <span>Open Templates</span>
              <span className="transition group-hover:translate-x-0.5">→</span>
            </div>
          </button>

          {/* Project Overrides */}
          <button
            type="button"
            onClick={goOverrides}
            className="group text-left rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm transition hover:shadow-md hover:bg-white dark:border-neutral-800 dark:bg-neutral-900"
            aria-label="Open Project Overrides"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Project Specific
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Project Overrides
                </h3>
              </div>

              <span className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition group-hover:border-emerald-200 group-hover:text-emerald-700 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M10.293 3.293a1 1 0 011.414 0l5 5a.997.997 0 010 1.414l-5 5a1 1 0 11-1.414-1.414L13.586 10H4a1 1 0 110-2h9.586l-3.293-3.293a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
            </div>

            <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
              Override role templates for a specific project. You can reset back
              to the role template anytime.
            </p>

            <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
              <span>Open Overrides</span>
              <span className="transition group-hover:translate-x-0.5">→</span>
            </div>
          </button>
        </div>

        {/* Optional hint block (fits your style) */}
        <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white/95 px-5 py-4 text-xs text-gray-600 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-gray-300">
          <b>Tip:</b> Start with <b>Role Templates</b>, then fine-tune with{" "}
          <b>Project Overrides</b> only where a project needs exceptions.
        </div>
      </div>
    </div>
  );
}
