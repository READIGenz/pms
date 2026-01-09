import React from "react";

// ===== UI constants (CompanyEdit look) =====
export const CARD =
  "bg-white dark:bg-neutral-950 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm p-5";

// Smaller pills (compact + clean)
export const PILL_INPUT =
  "h-9 w-full rounded-full border border-slate-200 dark:border-white/10 " +
  "bg-white dark:bg-neutral-950 px-3 text-[13px] text-slate-900 dark:text-slate-100 shadow-sm " +
  "placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00379C]/20 dark:focus:ring-[#FCC020]/20 focus:border-transparent";

export const PILL_SELECT =
  "h-9 w-full rounded-full border border-slate-200 dark:border-white/10 " +
  "bg-white dark:bg-neutral-950 px-3 pr-9 text-[13px] text-slate-900 dark:text-slate-100 shadow-sm " +
  "focus:outline-none focus:ring-2 focus:ring-[#00379C]/20 dark:focus:ring-[#FCC020]/20 focus:border-transparent appearance-none";

export const PILL_DATE = PILL_INPUT;

const btnSmBase =
  "h-8 px-3 rounded-full text-[11px] font-semibold shadow-sm hover:brightness-105 " +
  "focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-neutral-950 " +
  "disabled:opacity-60 disabled:cursor-not-allowed";

export const BTN_SECONDARY =
  `${btnSmBase} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 ` +
  "dark:border-white/10 dark:bg-neutral-950 dark:text-slate-200 dark:hover:bg-white/5";

export const BTN_PRIMARY =
  `${btnSmBase} bg-[#00379C] text-white hover:brightness-110 focus:ring-[#00379C]/35`;

export const ICON_BTN =
  "inline-flex items-center justify-center h-8 w-8 rounded-full border border-slate-200 dark:border-white/10 " +
  "bg-white dark:bg-neutral-950 hover:bg-slate-50 dark:hover:bg-white/5";

export const ctl =
  "h-8 rounded-full border px-3 text-[11px] font-semibold shadow-sm transition " +
  "focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-neutral-950 active:scale-[0.98]";
export const ctlLight =
  "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 " +
  "dark:border-white/10 dark:bg-neutral-950 dark:text-slate-200 dark:hover:bg-white/5";

export function PageHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-4">
      <div className="text-xl font-extrabold text-slate-900 dark:text-white">
        {title}
      </div>
      {subtitle ? (
        <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {subtitle}
        </div>
      ) : null}
      <div className="mt-2 h-1 w-10 rounded-full bg-[#FCC020]" />
    </div>
  );
}

/** CompanyEdit-style section header */
export function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-3">
        <span className="h-5 w-1.5 rounded-full bg-[#FCC020]" />
        <div className="text-[12px] sm:text-sm font-extrabold tracking-[0.18em] uppercase text-[#00379C] dark:text-[#FCC020]">
          {title}
        </div>
      </div>
      {subtitle ? (
        <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

// Status pill color (same as Companies/Users table)
export function statusBadgeClass(status?: string | null) {
  const s = String(status || "").toLowerCase();
  if (s === "active")
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/25 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-700/60";
  if (s === "inactive" || s === "disabled")
    return "bg-slate-100 text-slate-800 dark:bg-neutral-800/70 dark:text-slate-200 border-slate-200/60 dark:border-white/10";
  if (s === "blocked" || s === "suspended")
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/25 dark:text-amber-300 border-amber-200/60 dark:border-amber-700/60";
  if (s === "deleted")
    return "bg-rose-100 text-rose-800 dark:bg-rose-900/25 dark:text-rose-300 border-rose-200/60 dark:border-rose-700/60";
  return "bg-blue-100 text-blue-800 dark:bg-blue-900/25 dark:text-blue-300 border-blue-200/60 dark:border-blue-700/60";
}

export function ValidityBadge({ value }: { value: string }) {
  const v = (value || "").toLowerCase();
  let cls =
    "bg-slate-100 text-slate-700 border-slate-200 dark:bg-white/5 dark:text-slate-200 dark:border-white/10";

  if (v === "valid") {
    cls =
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-200 dark:border-emerald-900/40";
  } else if (v === "yet to start") {
    cls =
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-200 dark:border-amber-900/40";
  } else if (v === "expired") {
    cls =
      "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-200 dark:border-rose-900/40";
  }

  return (
    <span
      className={
        "inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium " +
        cls
      }
    >
      {value || "—"}
    </span>
  );
}

// Use once per page near bottom
export function ThinScrollbarStyle() {
  return (
    <style>
      {`
        .thin-scrollbar::-webkit-scrollbar { height: 6px; width: 6px; }
        .thin-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .thin-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(148, 163, 184, 0.7);
          border-radius: 999px;
        }
        .thin-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: rgba(100, 116, 139, 0.9);
        }
      `}
    </style>
  );
}
