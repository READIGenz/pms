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

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-yellow-50 dark:from-neutral-900 dark:to-neutral-950 px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          {/* Left block */}
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
              Project Overrides
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Override role templates for a specific project.
            </p>

            {/* Project + Role selectors under subtitle (left side) */}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {/* Project selector */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Project
                </span>
                <select
                  className="h-9 rounded-full border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 shadow-sm focus:outline-none focus:border-transparent focus:ring-2 focus:ring-emerald-400 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
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
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Role
                </span>
                <select
                  className="h-9 rounded-full border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 shadow-sm focus:outline-none focus:border-transparent focus:ring-2 focus:ring-emerald-400 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
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
            </div>
          </div>

          {/* Right block: premium back icon button */}
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
                : toast.type === "warn"
                ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300")
            }
          >
            {toast.msg}
          </div>
        )}

        {!projects.length ? (
          <Section title="No projects">
            <div className="text-sm text-gray-600 dark:text-gray-300">
              No projects found. Create a project in <b>Admin → Projects</b>,
              then come back here.
            </div>
          </Section>
        ) : (
          <Section title="Module Permissions Matrix">
            {loading && (
              <div className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                Loading override for <b>{role}</b>…
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
                                (disabled
                                  ? "opacity-40 cursor-not-allowed"
                                  : "")
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
              This override applies only to the selected project and role.
            </div>
          </Section>
        )}

        {/* Footer actions (your consistent pattern) */}
        {!!projects.length && (
          <div className="mt-6 flex justify-end gap-2">
            <button
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
              onClick={() => navigate("/admin/permissions")}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
              onClick={onReset}
              disabled={!projectId || loading || saving}
              type="button"
            >
              Reset To Role Template
            </button>
            <button
              className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
              onClick={onSave}
              disabled={!canSave}
              type="button"
            >
              {saving ? "Saving…" : "Save Override"}
            </button>
          </div>
        )}
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
      <div className="rounded-2xl border border-slate-200/80 bg-white/95 px-5 py-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:px-6 sm:py-5">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
          {title}
        </div>
        {children}
      </div>
    </section>
  );
}
