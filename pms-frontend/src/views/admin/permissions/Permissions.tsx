// src/views/admin/permissions/Permissions.tsx
import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Permissions() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Trinity PMS — Permissions";
    (window as any).__ADMIN_SUBTITLE__ =
      "Define role templates and per-project overrides across modules and actions.";
    return () => {
      (window as any).__ADMIN_SUBTITLE__ = "";
    };
  }, []);

  const goTemplates = () => navigate("/admin/permissions/templates");
  const goOverrides = () => navigate("/admin/permissions/project-overrides");

  const cardBase =
    "group text-left rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition " +
    "hover:shadow-md dark:border-white/10 dark:bg-neutral-950";
  const cardTopLabel =
    "mb-1 text-xs font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400";
  const cardTitle = "text-base font-extrabold text-slate-900 dark:text-white";
  const cardDesc = "mt-3 text-sm text-slate-600 dark:text-slate-300";

  const pillIconBase =
    "mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full border bg-white text-slate-700 transition " +
    "dark:bg-neutral-950 dark:text-neutral-200";

  const linkBase =
    "mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#00379C] dark:text-[#FCC020]";
  const linkArrow = "transition group-hover:translate-x-0.5";

  return (
    <div className="w-full">
      <div className="mx-auto max-w-6xl">
        {/* Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Role Templates */}
          <button
            type="button"
            onClick={goTemplates}
            className={cardBase}
            aria-label="Open Role Templates"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className={cardTopLabel}>Default Access</div>
                <h3 className={cardTitle}>Role Templates</h3>
              </div>

              <span
                className="
    mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full
    bg-[#FCC020] text-[#00379C] shadow-sm
    ring-1 ring-[#FCC020]/60
    transition
    group-hover:brightness-105 group-hover:shadow
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#FCC020]/60
    dark:ring-[#FCC020]/40
  "
                aria-hidden="true"
              >
                {/* modern arrow icon */}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h12" />
                  <path d="M13 6l6 6-6 6" />
                </svg>
              </span>
            </div>

            <p className={cardDesc}>
              Set the default permission matrix for each role across modules and
              actions (view/raise/review/approve/close).
            </p>

            <div className={linkBase}>
              <span>Open Templates</span>
              <span className={linkArrow}>→</span>
            </div>
          </button>

          {/* Project Overrides */}
          <button
            type="button"
            onClick={goOverrides}
            className={cardBase}
            aria-label="Open Project Overrides"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className={cardTopLabel}>Project Specific</div>
                <h3 className={cardTitle}>Project Overrides</h3>
              </div>

              <span
                className="
    mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full
    bg-[#FCC020] text-[#00379C] shadow-sm
    ring-1 ring-[#FCC020]/60
    transition
    group-hover:brightness-105 group-hover:shadow
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#FCC020]/60
    dark:ring-[#FCC020]/40
  "
                aria-hidden="true"
              >
                {/* modern arrow icon */}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h12" />
                  <path d="M13 6l6 6-6 6" />
                </svg>
              </span>
            </div>

            <p className={cardDesc}>
              Override role templates for a specific project. You can reset back
              to the role template anytime.
            </p>

            <div className={linkBase}>
              <span>Open Overrides</span>
              <span className={linkArrow}>→</span>
            </div>
          </button>
        </div>

        {/* Tip block */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-xs text-slate-600 shadow-sm dark:border-white/10 dark:bg-neutral-950 dark:text-slate-300">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-block h-4 w-1 rounded-full bg-[#FCC020]" />
            <div>
              <b className="text-slate-800 dark:text-slate-100">Tip:</b> Start
              with{" "}
              <b className="text-slate-800 dark:text-slate-100">
                Role Templates
              </b>
              , then fine-tune with{" "}
              <b className="text-slate-800 dark:text-slate-100">
                Project Overrides
              </b>{" "}
              only where a project needs exceptions.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
