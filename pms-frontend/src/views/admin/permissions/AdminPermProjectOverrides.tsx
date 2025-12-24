// src/views/admin/permissions/AdminPermProjectOverrides.tsx

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Matrix, RoleKey } from "../../../api/adminPermissions";
import {
  listProjects,
  getProjectOverride,
  saveProjectOverride,
  resetProjectOverride,
} from "../../../api/adminPermissions";

/* ========================= Constants ========================= */

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

// Match your reference labels
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

// LTR rule helper
const isLtrHardDisabled = (mod: ModuleKey, action: ActionKey) =>
  mod === "LTR" && (action === "review" || action === "approve");

/** ---------- NEW: normalize & exported fetcher for user-inherit use ---------- **/

/** Fill missing modules/actions with false and enforce LTR rule. */
function normalizeMatrix(raw?: Partial<Matrix> | null): Matrix {
  const base = emptyMatrix();
  if (!raw) return base;

  for (const mod of MODULES) {
    const src = (raw as any)?.[mod] ?? {};
    for (const act of ACTIONS) {
      base[mod][act] = !!src[act];
    }
  }

  // Enforce LTR rule
  base.LTR.review = false;
  base.LTR.approve = false;
  return base;
}

/**
 * Exported helper: fetch the role’s *project-level* matrix, normalized.
 * User Overrides screen can import this to compute “inherit”.
 */
export async function getRoleBaseMatrix(
  projectId: string,
  role: RoleKey
): Promise<Matrix> {
  try {
    const mat = await getProjectOverride(projectId, role);
    return normalizeMatrix(mat);
  } catch {
    return normalizeMatrix(null);
  }
}

/** -------------------------------------------------------------------------- **/

export default function AdminPermProjectOverrides() {
  const navigate = useNavigate();

  const [projects, setProjects] = useState<
    { projectId: string; title: string }[]
  >([]);
  const [projectId, setProjectId] = useState<string>("");
  const [role, setRole] = useState<RoleKey>("Client");

  const [matrix, setMatrix] = useState<Matrix>(emptyMatrix());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState<{
    type: "success" | "error" | "warn";
    msg: string;
  } | null>(null);

  // Title + subtitle at top (Admin shell reads __ADMIN_SUBTITLE__)
  useEffect(() => {
    document.title = "Trinity PMS — Project Overrides";
    (window as any).__ADMIN_SUBTITLE__ =
      "Override role templates for a specific project (per-module actions).";
    return () => {
      (window as any).__ADMIN_SUBTITLE__ = "";
    };
  }, []);

  // Load projects once
  useEffect(() => {
    (async () => {
      try {
        const ps = await listProjects();
        setProjects(ps);
        if (ps.length) {
          setProjectId(ps[0].projectId);
        } else {
          setToast({
            type: "warn",
            msg: "No projects found. Create one first.",
          });
        }
      } catch (e: any) {
        setToast({
          type: "error",
          msg: `Projects load failed: ${e?.message ?? e}`,
        });
      } finally {
        window.setTimeout(() => setToast(null), 3000);
      }
    })();
  }, []);

  // Load current override whenever project or role changes
  useEffect(() => {
    if (!projectId) return;
    setLoading(true);

    getRoleBaseMatrix(projectId, role)
      .then((mat) => setMatrix(mat))
      .finally(() => setLoading(false));
  }, [projectId, role]);

  const toggle = (mod: ModuleKey, action: ActionKey) => {
    if (isLtrHardDisabled(mod, action)) return;

    setMatrix((prev) => {
      const next = structuredClone(prev);
      next[mod][action] = !next[mod][action];
      return next;
    });
  };

  const canSave = useMemo(
    () => !!projectId && !loading && !saving,
    [projectId, loading, saving]
  );

  const onSave = async () => {
    if (!projectId) return;

    setSaving(true);
    setToast(null);

    try {
      const m = structuredClone(matrix);
      m.LTR.review = false;
      m.LTR.approve = false;

      await saveProjectOverride(projectId, role, m);

      setToast({ type: "success", msg: "Override saved." });
    } catch (e: any) {
      setToast({
        type: "error",
        msg: `Save failed: ${e?.message ?? e}`,
      });
    } finally {
      setSaving(false);
      window.setTimeout(() => setToast(null), 2500);
    }
  };

  const onReset = async () => {
    if (!projectId) return;

    setSaving(true);
    setToast(null);

    try {
      const m = await resetProjectOverride(projectId, role);
      m.LTR.review = false;
      m.LTR.approve = false;

      setMatrix(normalizeMatrix(m));
      setToast({ type: "success", msg: "Reset to role template." });
    } catch (e: any) {
      setToast({
        type: "error",
        msg: `Reset failed: ${e?.message ?? e}`,
      });
    } finally {
      setSaving(false);
      window.setTimeout(() => setToast(null), 2500);
    }
  };

  /* ========================= UI tokens (latest theme) ========================= */

  const controlBase =
    "h-10 rounded-full border bg-white px-4 text-[13px] font-semibold text-slate-700 shadow-sm " +
    "focus:outline-none focus:ring-2 focus:ring-offset-2 dark:bg-neutral-950 " +
    "transition active:scale-[0.99]";
  const controlBorder =
    "border-slate-200 placeholder:text-slate-400 dark:border-white/10 dark:text-neutral-100";
  const controlFocus =
    "focus:ring-[#00379C]/25 focus:border-[#00379C] dark:focus:ring-[#FCC020]/20 dark:focus:border-[#FCC020]";

  const btnOutline =
    "inline-flex h-10 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold " +
    "text-slate-700 shadow-sm transition hover:bg-slate-50 active:translate-y-[0.5px] " +
    "disabled:opacity-60 dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100 dark:hover:bg-white/5";

  const btnPrimary =
    "inline-flex h-10 items-center justify-center rounded-full bg-[#00379C] px-4 text-sm font-semibold text-white " +
    "shadow-sm transition hover:brightness-110 active:translate-y-[0.5px] disabled:opacity-60";

  const btnTeal =
    "inline-flex h-10 items-center justify-center rounded-full bg-[#23A192] px-4 text-sm font-semibold text-white " +
    "shadow-sm transition hover:brightness-110 active:translate-y-[0.5px] disabled:opacity-60";

  const backBtnYellow =
    "inline-flex h-10 w-10 items-center justify-center rounded-full " +
    "bg-[#FCC020] text-[#00379C] shadow-sm ring-1 ring-[#FCC020]/60 transition " +
    "hover:brightness-105 hover:shadow active:translate-y-[0.5px] " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#FCC020]/60 dark:ring-[#FCC020]/40";

  return (
    <div className="w-full">
      <div className="mx-auto max-w-6xl">
        {/* Top bar: selectors (left) + back (right) */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            {/* Project selector */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Project
              </span>
              <select
                className={`${controlBase} ${controlBorder} ${controlFocus} min-w-[240px]`}
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                aria-label="Select Project"
                disabled={!projects.length}
              >
                {!projects.length && <option value="">No projects</option>}
                {projects.map((p) => (
                  <option key={p.projectId} value={p.projectId}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Role selector */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Role
              </span>
              <select
                className={`${controlBase} ${controlBorder} ${controlFocus} min-w-[160px]`}
                value={role}
                onChange={(e) => setRole(e.target.value as RoleKey)}
                aria-label="Select Role"
                disabled={!projects.length}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {(loading || saving) && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {saving ? "Saving…" : "Loading…"}
              </span>
            )}
          </div>

          {/* Back button */}
          <button
            type="button"
            onClick={() => navigate("/admin/permissions")}
            title="Back to Permissions"
            aria-label="Back to Permissions"
            className={backBtnYellow}
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
                : toast.type === "warn"
                ? "border-[#FCC020]/45 bg-[#FCC020]/15 text-slate-800 dark:text-slate-100"
                : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/25 dark:text-red-200")
            }
          >
            {toast.msg}
          </div>
        )}

        {!projects.length ? (
          <Section title="No projects">
            <div className="text-sm text-slate-600 dark:text-slate-300">
              No projects found. Create a project in <b>Admin → Projects</b>,
              then come back here.
            </div>
          </Section>
        ) : (
          <Section title="Module Permissions Matrix">
            {loading && (
              <div className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                Loading override for <b>{role}</b>…
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
                  {MODULES.map((m, idx) => (
                    <tr
                      key={m}
                      className={
                        "border-t border-slate-100 dark:border-white/10 " +
                        (idx % 2
                          ? "bg-white dark:bg-neutral-950"
                          : "bg-slate-50/40 dark:bg-neutral-950/60") +
                        " hover:bg-slate-50/70 dark:hover:bg-white/5"
                      }
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
                                "h-4 w-4 rounded border-slate-300 text-[#23A192] focus:ring-[#00379C]/30 " +
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
              This override applies only to the selected project and role.
            </div>
          </Section>
        )}

        {/* Footer actions */}
        {!!projects.length && (
          <div className="mt-6 flex justify-end gap-2">
            <button
              className={btnOutline}
              onClick={() => navigate("/admin/permissions")}
              type="button"
            >
              Cancel
            </button>

            <button
              className={btnOutline}
              onClick={onReset}
              disabled={!projectId || loading || saving}
              type="button"
            >
              Reset To Role Template
            </button>

            <button
              className={btnTeal}
              onClick={onSave}
              disabled={!canSave}
              type="button"
            >
              {saving ? "Saving…" : "Save Override"}
            </button>
          </div>
        )}

        {/* Scrollbar styling (consistent across pages) */}
        <style>{`
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
        `}</style>
      </div>
    </div>
  );
}

/* ========================= UI helper ========================= */

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
