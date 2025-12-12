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
import { ArrowLeft } from "lucide-react";

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-yellow-50 dark:from-neutral-900 dark:to-neutral-950 px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
              Role Templates
            </h1>

            <p className="text-sm text-gray-600 dark:text-gray-300">
              Configure default module permissions for each role.
            </p>

            {/* Role selector under subtitle, on the left */}
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Role
              </span>
              <select
                className="h-9 rounded-full border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 shadow-sm focus:outline-none focus:border-transparent focus:ring-2 focus:ring-emerald-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
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
          </div>

          {/* Back icon on the right */}
          <div className="flex items-start">
            <button
              type="button"
              onClick={() => navigate("/admin/permissions")}
              title="Back to Permissions"
              aria-label="Back to Permissions"
              className="
    group inline-flex h-10 w-10 items-center justify-center
    rounded-full
    border border-slate-200/70
    bg-white/80 backdrop-blur
    text-slate-700
    shadow-sm
    transition-all duration-200
    hover:-translate-y-[1px]
    hover:border-emerald-200
    hover:bg-emerald-50/60
    hover:shadow-md
    active:translate-y-0
    dark:border-neutral-700/70
    dark:bg-neutral-900/70
    dark:text-neutral-100
    dark:hover:border-emerald-700/40
    dark:hover:bg-emerald-900/10
  "
            >
              <span className="text-[18px] leading-none transition-transform duration-200 group-hover:-translate-x-0.5">
                ←
              </span>
            </button>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div
            className={
              "mb-4 rounded-xl border p-3 text-sm " +
              (toast.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
                : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300")
            }
          >
            {toast.msg}
          </div>
        )}

        {/* Main Card */}
        <Section title="Module Permissions Matrix">
          {/* Loading hint */}
          {loading && (
            <div className="mb-3 text-xs text-gray-500 dark:text-gray-400">
              Loading template for <b>{role}</b>…
            </div>
          )}

          <div className="overflow-auto rounded-2xl border border-slate-200 bg-white/95 dark:border-neutral-800 dark:bg-neutral-900">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 dark:bg-neutral-950">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
                    Module
                  </th>
                  {ACTIONS.map((a) => (
                    <th
                      key={a}
                      className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300"
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
                    className="border-t border-slate-100 dark:border-neutral-800"
                  >
                    <td className="px-4 py-3">
                      <div className="text-[13px] font-medium text-slate-900 dark:text-white">
                        {MODULE_LABELS[m]}
                      </div>
                      {m === "LTR" && (
                        <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
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
                              "h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 " +
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

          <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            This template defines the default permission set for new assignments
            of this role.
          </div>
        </Section>

        {/* Footer actions (match your Create/Edit pattern) */}
        <div className="mt-6 flex justify-end gap-2">
          <button
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
            onClick={() => navigate("/admin/permissions")}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
            onClick={onSave}
            disabled={!canSave}
            type="button"
          >
            {saving ? "Saving…" : "Save Template"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------ UI helpers (same design family) ------------------------ */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <div className="rounded-2xl border border-slate-200/80 bg-white/95 px-5 py-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:px-6 sm:py-5">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
          {title}
        </div>
        {children}
      </div>
    </section>
  );
}
