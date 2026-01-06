// src/views/admin/permissions/AdminPermTemplates.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getTemplate,
  listTemplates,
  saveTemplate,
  Matrix,
  RoleKey,
} from "../../../api/adminPermissions";

// Internal keys stay the same
const MODULES = [
  "WIR",
  "MIR",
  "CS",
  "DPR",
  "MIP",
  "DS",
  "RFC",
  "OBS",
  "DLP",
  "LTR",
  "FDB",
  "MAITRI",
  "DASHBOARD",
] as const;
type ModuleKey = (typeof MODULES)[number];

const MODULE_LABELS: Record<ModuleKey, string> = {
  WIR: "WIR (Work Inspection Request)",
  MIR: "MIR (Material Inspection Request)",
  CS: "CS (Contractor's Submittal)",
  DPR: "DPR (Daily Progress Report)",
  MIP: "MIP (Implementation Plan)",
  DS: "DS (Design Submittal)",
  RFC: "RFC (Request For Clarification)",
  OBS: "OBS (Site Observation and NCR/CAR)",
  DLP: "DLP",
  LTR: "LTR (Letter)",
  FDB: "FDB (Feedback)",
  MAITRI: "MAITRI",
  DASHBOARD: "DASHBOARD",
} as const;

const ACTIONS = ["view", "raise", "review", "approve", "close"] as const;
type ActionKey = (typeof ACTIONS)[number];

// Adjust to your public labels (e.g., "IH-PMT" if you expose hyphenated):
const ROLE_OPTIONS: RoleKey[] = [
  "Client",
  "IH-PMT",
  "Contractor",
  "Consultant",
  "PMC",
  "Supplier",
];

const emptyRow = () => ({
  view: false,
  raise: false,
  review: false,
  approve: false,
  close: false,
});

const emptyMatrix = () =>
  Object.fromEntries(MODULES.map((m) => [m, { ...emptyRow() }])) as Matrix;

// LTR rule
const isLtrHardDisabled = (mod: ModuleKey, action: ActionKey) =>
  mod === "LTR" && (action === "review" || action === "approve");

export default function AdminPermTemplates() {
  const navigate = useNavigate();

  const [role, setRole] = useState<RoleKey>("Client");
  const [matrix, setMatrix] = useState<Matrix>(emptyMatrix());

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);

  // Page header subtitle (Admin shell reads this)
  useEffect(() => {
    document.title = "Trinity PMS — Role Templates";
    (window as any).__ADMIN_SUBTITLE__ =
      "Configure default module permissions for each role.";
    return () => {
      (window as any).__ADMIN_SUBTITLE__ = "";
    };
  }, []);

  // warm-up / optional list fetch (kept)
  useEffect(() => {
    listTemplates().catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    getTemplate(role)
      .then((row) => setMatrix(row.matrix))
      .catch(() => setMatrix(emptyMatrix()))
      .finally(() => setLoading(false));
  }, [role]);

  const toggle = (mod: ModuleKey, action: ActionKey) => {
    if (isLtrHardDisabled(mod, action)) return;

    setMatrix((prev) => {
      const next = structuredClone(prev);
      next[mod][action] = !next[mod][action];
      return next;
    });
  };

  const canSave = useMemo(() => !loading && !saving, [loading, saving]);

  const onSave = async () => {
    setSaving(true);
    setToast(null);

    try {
      const m = structuredClone(matrix);
      // enforce LTR rule server-safe
      m.LTR.review = false;
      m.LTR.approve = false;

      await saveTemplate(role, m);
      setToast({ type: "success", msg: "Template saved successfully." });
    } catch (e: any) {
      setToast({
        type: "error",
        msg: e?.response?.data?.error || e?.message || "Save failed.",
      });
    } finally {
      setSaving(false);
      window.setTimeout(() => setToast(null), 2500);
    }
  };

  // UI tokens (match “client” theme)
  const pillSelect =
    "h-10 rounded-full border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-700 " +
    "shadow-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#00379C]/25 " +
    "dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100";

  const btnOutline =
    "inline-flex h-10 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold " +
    "text-slate-700 shadow-sm transition hover:bg-slate-50 active:translate-y-[0.5px] " +
    "dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100 dark:hover:bg-neutral-900";

  const btnPrimary =
    "inline-flex h-10 items-center justify-center rounded-full bg-[#00379C] px-4 text-sm font-semibold text-white " +
    "shadow-sm transition hover:brightness-110 active:translate-y-[0.5px] disabled:opacity-60";

  return (
    <div className="w-full">
      <div className="mx-auto max-w-6xl">
        {/* Top row (role selector left, back button right) */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Role
            </span>

            <select
              className={pillSelect}
              value={role}
              onChange={(e) => setRole(e.target.value as RoleKey)}
              aria-label="Select Role"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Back button (modern client-yellow circle) */}
          <button
            type="button"
            onClick={() => navigate("/admin/permissions")}
            title="Back to Permissions"
            aria-label="Back to Permissions"
            className="
              inline-flex h-10 w-10 items-center justify-center rounded-full
              bg-[#FCC020] text-[#00379C]
              shadow-sm ring-1 ring-[#FCC020]/60
              transition
              hover:brightness-105 hover:shadow
              active:translate-y-[0.5px]
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#FCC020]/60
              dark:ring-[#FCC020]/40
            "
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 12H7" />
              <path d="M11 6l-6 6 6 6" />
            </svg>
          </button>
        </div>

        {/* Toast */}
        {toast && (
          <div
            className={
              "mb-4 rounded-2xl border px-4 py-3 text-sm shadow-sm " +
              (toast.type === "success"
                ? "border-[#23A192]/25 bg-[#23A192]/10 text-slate-800 dark:text-slate-100"
                : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/25 dark:text-red-200")
            }
          >
            {toast.msg}
          </div>
        )}

        <Section title="Module Permissions Matrix">
          {loading && (
            <div className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              Loading template for <b>{role}</b>…
            </div>
          )}

          <div className="overflow-x-auto thin-scrollbar rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-neutral-950">
            <table className="min-w-full text-[13px]">
              <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-neutral-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-extrabold uppercase tracking-widest text-slate-600 dark:text-slate-200">
                    Module
                  </th>
                  {ACTIONS.map((a) => (
                    <th
                      key={a}
                      className="px-3 py-3 text-center text-xs font-extrabold uppercase tracking-widest text-slate-600 dark:text-slate-200"
                    >
                      {a}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {MODULES.map((m) => (
                  <tr
                    key={m}
                    className="border-t border-slate-100 hover:bg-slate-50/60 dark:border-white/10 dark:hover:bg-neutral-900/60"
                  >
                    <td className="px-4 py-3">
                      <div className="text-[13px] font-semibold text-slate-900 dark:text-white">
                        {MODULE_LABELS[m]}
                      </div>
                      {m === "LTR" && (
                        <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          Review/Approve not applicable for Letters.
                        </div>
                      )}
                    </td>

                    {ACTIONS.map((a) => {
                      const disabled = isLtrHardDisabled(m, a);
                      const checked = !!matrix?.[m]?.[a];

                      return (
                        <td key={a} className="px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            className={
                              "h-4 w-4 rounded border-slate-300 text-[#23A192] " +
                              "focus:ring-[#00379C]/30 " +
                              "dark:border-white/20 " +
                              (disabled ? "opacity-40 cursor-not-allowed" : "")
                            }
                            checked={disabled ? false : checked}
                            disabled={disabled || loading || saving}
                            onChange={() => toggle(m, a)}
                            aria-label={`${MODULE_LABELS[m]} ${a}`}
                            title={
                              disabled
                                ? "LTR cannot be set to Review/Approve"
                                : `${a} permission`
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            This template defines the default permission set for new assignments
            of this role.
          </div>
        </Section>

        {/* Footer actions */}
        <div className="mt-6 flex justify-end gap-2">
          <button
            className={btnOutline}
            onClick={() => navigate("/admin/permissions")}
            type="button"
          >
            Cancel
          </button>

          <button
            className={btnPrimary}
            onClick={onSave}
            disabled={!canSave}
            type="button"
          >
            {saving ? "Saving…" : "Save Template"}
          </button>
        </div>

        {/* Thin scrollbar styling (consistent with other list pages) */}
        <style>
          {`
            .thin-scrollbar::-webkit-scrollbar { height: 10px; width: 10px; }
            .thin-scrollbar::-webkit-scrollbar-track { background: transparent; }
            .thin-scrollbar::-webkit-scrollbar-thumb {
              background: rgba(148, 163, 184, 0.55);
              border-radius: 999px;
              border: 2px solid transparent;
              background-clip: padding-box;
            }
            .thin-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.8); }
            .thin-scrollbar { scrollbar-width: thin; scrollbar-color: rgba(148,163,184,0.55) transparent; }
          `}
        </style>
      </div>
    </div>
  );
}

/* ------------------------ UI helper (CompanyEdit style) ------------------------ */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-white/10 dark:bg-neutral-950 sm:px-6 sm:py-5">
        <div className="mb-3 flex items-center gap-3">
          <span className="inline-block h-5 w-1 rounded-full bg-[#FCC020]" />
          <div className="text-xs font-extrabold uppercase tracking-widest text-[#00379C] dark:text-[#FCC020]">
            {title}
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}
