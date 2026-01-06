// src/views/admin/moduleSettings/ModuleSettingsLayout.tsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, Navigate } from "react-router-dom";
import { api } from "../../../api/client";

declare global {
  interface Window {
    __ADMIN_SUBTITLE__?: string;
  }
}

type ProjectLite = {
  projectId: string;
  title: string;
  code?: string | null;
  distt?: string | null;
  type?: string | null;
};

// Only WIR
const MODULES = ["WIR"] as const;
type ModuleKey = (typeof MODULES)[number];

const LABELS: Record<ModuleKey, string> = {
  WIR: "WIR Settings",
};

// ---- WIR settings stored in `extra` ----
type WirTransmissionType = "Public" | "Private" | "UserSet";

type BaseModuleSettings = {
  enabled: boolean;
  autoCodePrefix?: string | null;
  requireEvidence?: boolean;
  requireGeoEvidence?: boolean;
  requireMinPhotos?: number;
  allowAWC?: boolean;
  slaHours?: number | null;
  extra?: Record<string, any>;
};

const WIR_EXTRA_DEFAULTS = {
  transmissionType: "Public" as WirTransmissionType,
  redirectAllowed: true,
  exportPdfAllowed: false,
};

function decodeJwtPayload(token: string): any | null {
  try {
    const [_, b64] = token.split(".");
    if (!b64) return null;
    const norm = b64.replace(/-/g, "+").replace(/_/g, "/");
    const pad = norm.length % 4 ? "=".repeat(4 - (norm.length % 4)) : "";
    return JSON.parse(atob(norm + pad));
  } catch {
    return null;
  }
}

const EMPTY: BaseModuleSettings = {
  enabled: true,
  autoCodePrefix: "",
  requireEvidence: false,
  requireGeoEvidence: false,
  requireMinPhotos: 0,
  allowAWC: false,
  slaHours: 0,
  extra: { ...WIR_EXTRA_DEFAULTS },
};

type ToastType = "success" | "error" | "info";
function Toast({
  type,
  message,
  onClose,
}: {
  type: ToastType;
  message: string;
  onClose: () => void;
}) {
  const tone =
    type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-900/25 dark:text-emerald-200"
      : type === "error"
      ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800/60 dark:bg-rose-900/25 dark:text-rose-200"
      : "border-slate-200 bg-white text-slate-800 dark:border-white/10 dark:bg-neutral-950 dark:text-slate-200";

  return (
    <div
      className={`mb-4 rounded-2xl border px-4 py-3 shadow-sm flex items-start justify-between gap-3 ${tone}`}
      role="status"
      aria-live="polite"
    >
      <div className="text-sm font-semibold">{message}</div>
      <button
        type="button"
        onClick={onClose}
        className="h-8 px-3 rounded-full border border-transparent text-[11px] font-semibold hover:bg-black/5 dark:hover:bg-white/5"
        title="Dismiss"
      >
        Close
      </button>
    </div>
  );
}

function ConfirmModal({
  open,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  busy,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden dark:border-white/10 dark:bg-neutral-950">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10">
            <div className="text-sm font-extrabold text-[#00379C] dark:text-white">
              {title}
            </div>
            <div className="mt-1 h-1 w-10 rounded-full bg-[#FCC020]" />
          </div>

          <div className="p-4 text-sm text-slate-700 dark:text-slate-200">
            {message}
          </div>

          <div className="px-4 py-3 border-t border-slate-200 dark:border-white/10 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="h-8 rounded-full border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50
                         dark:border-white/10 dark:bg-neutral-950 dark:text-slate-200 dark:hover:bg-white/5"
              disabled={!!busy}
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="h-8 rounded-full bg-[#00379C] px-3 text-[11px] font-semibold text-white shadow-sm hover:brightness-110
                         focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00379C]/35
                         dark:focus:ring-offset-neutral-950 disabled:opacity-60"
              disabled={!!busy}
            >
              {busy ? "Working…" : confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ModuleSettingsLayout() {
  const token = localStorage.getItem("token");
  const loc = useLocation();
  const payload = token ? decodeJwtPayload(token) : null;
  const isSuperAdmin = !!payload?.isSuperAdmin;

  // Projects
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [projectId, setProjectId] = useState<string>("");

  // Module picker (only WIR)
  const [moduleKey, setModuleKey] = useState<ModuleKey>("WIR");

  // Settings state (only WIR)
  const [wir, setWir] = useState<BaseModuleSettings>(EMPTY);

  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [saving, setSaving] = useState(false);

  // UI-only: toast + confirm modal
  const [toast, setToast] = useState<{ type: ToastType; msg: string } | null>(
    null
  );
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    document.title = "Trinity PMS — Module Settings";
    window.__ADMIN_SUBTITLE__ =
      "Configure project-specific WIR behaviour — transmission, redirect and export options.";
    return () => {
      window.__ADMIN_SUBTITLE__ = "";
    };
  }, []);

  // Load projects once
  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoadingProjects(true);
      try {
        const pr = await api.get("/admin/projects", {
          headers: { Accept: "application/json" },
        });
        const pData = pr.data;
        const pArr = Array.isArray(pData) ? pData : pData?.projects ?? [];
        const rows: ProjectLite[] = (pArr ?? [])
          .map((p: any) => ({
            projectId: p.projectId ?? p.id,
            title: p.title ?? p.name ?? "Untitled",
            code: p.code ?? p.projectCode ?? null,
            distt: p.distt ?? p.district ?? null,
            type: p.type ?? p.projectType ?? null,
          }))
          .filter((p: ProjectLite) => p.projectId && p.title);
        setProjects(rows);
        if (!rows.length) {
          setToast({
            type: "info",
            msg: "No projects found. Create one first.",
          });
        }
      } catch (e: any) {
        setToast({
          type: "error",
          msg: `Projects load failed: ${e?.message ?? e}`,
        });
      } finally {
        setLoadingProjects(false);
      }
    })();
  }, [token]);

  // Load WIR settings when a project is selected
  useEffect(() => {
    if (!projectId) {
      setWir(EMPTY);
      return;
    }
    (async () => {
      setLoadingSettings(true);
      try {
        const s = await getModuleSettings(projectId, "WIR");
        const n = normalize(s);
        n.extra = { ...WIR_EXTRA_DEFAULTS, ...(n.extra || {}) };
        setWir(n);
      } catch (e: any) {
        setToast({
          type: "error",
          msg: `Load failed for project "${currentProjectLabel()}": ${
            e?.message ?? e
          }`,
        });
        const n = normalize(null);
        n.extra = { ...WIR_EXTRA_DEFAULTS };
        setWir(n);
      } finally {
        setLoadingSettings(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // --- API helpers ---
  async function getModuleSettings(
    pid: string,
    mod: ModuleKey
  ): Promise<BaseModuleSettings | null> {
    const { data } = await api.get(`/admin/module-settings/${pid}/${mod}`);
    return data ?? null;
  }
  async function putModuleSettings(
    pid: string,
    mod: ModuleKey,
    body: BaseModuleSettings
  ): Promise<void> {
    await api.put(`/admin/module-settings/${pid}/${mod}`, body);
  }
  async function resetModule(
    pid: string,
    mod: ModuleKey
  ): Promise<BaseModuleSettings> {
    const { data } = await api.post(
      `/admin/module-settings/${pid}/${mod}/reset`
    );
    return data;
  }

  function normalize(raw?: Partial<BaseModuleSettings> | null): BaseModuleSettings {
    const base = { ...EMPTY };
    if (!raw) return base;
    return {
      ...base,
      ...raw,
      extra: { ...(base.extra || {}), ...(raw.extra || {}) },
    };
  }

  const canEdit =
    !!projectId && !loadingProjects && !loadingSettings && isSuperAdmin;

  // ---- helpers for WIR extra ----
  function getWirExtra(state: BaseModuleSettings) {
    const ex = state.extra || {};
    return {
      transmissionType:
        (ex.transmissionType as WirTransmissionType) ??
        WIR_EXTRA_DEFAULTS.transmissionType,
      redirectAllowed:
        typeof ex.redirectAllowed === "boolean"
          ? ex.redirectAllowed
          : WIR_EXTRA_DEFAULTS.redirectAllowed,
      exportPdfAllowed:
        typeof ex.exportPdfAllowed === "boolean"
          ? ex.exportPdfAllowed
          : WIR_EXTRA_DEFAULTS.exportPdfAllowed,
    };
  }

  // Helper: pretty project label for messages
  function currentProjectLabel() {
    const p = projects.find((x) => x.projectId === projectId);
    if (!p) return "Unknown Project";
    return p.code ? `${p.title} (${p.code})` : p.title;
  }

  // --- Handlers: WIR (logic unchanged, only message style changed) ---
  async function onSaveWIR() {
    if (!projectId) return;
    setSaving(true);
    try {
      const extra = { ...(wir.extra || {}), ...getWirExtra(wir) };
      await putModuleSettings(projectId, "WIR", { ...wir, extra });
      setToast({
        type: "success",
        msg: `WIR settings saved for project: ${currentProjectLabel()}.`,
      });
    } catch (e: any) {
      setToast({
        type: "error",
        msg: `Save failed for project "${currentProjectLabel()}": ${
          e?.message ?? e
        }`,
      });
    } finally {
      setSaving(false);
    }
  }

  async function onResetWIRConfirmed() {
    if (!projectId) return;
    setSaving(true);
    try {
      const fresh = await resetModule(projectId, "WIR");
      const n = normalize(fresh);
      n.extra = { ...WIR_EXTRA_DEFAULTS, ...(n.extra || {}) };
      setWir(n);
      setToast({
        type: "success",
        msg: `WIR settings reset to defaults for project: ${currentProjectLabel()}.`,
      });
    } catch (e: any) {
      setToast({
        type: "error",
        msg: `Reset failed for project "${currentProjectLabel()}": ${
          e?.message ?? e
        }`,
      });
    } finally {
      setSaving(false);
      setResetOpen(false);
    }
  }

  if (!token) return <Navigate to="/login" state={{ from: loc }} replace />;

  /* ========================= UI tokens (same family as other pages) ========================= */
  const pill =
    "h-8 rounded-full border px-3 text-[11px] font-semibold shadow-sm transition " +
    "focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-neutral-950 active:scale-[0.98]";
  const pillLight =
    "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 " +
    "dark:border-white/10 dark:bg-neutral-950 dark:text-slate-200 dark:hover:bg-white/5";
  const pillPrimary =
    "bg-[#00379C] text-white hover:brightness-110 border-transparent focus:ring-[#00379C]/35";
  const pillTeal =
    "bg-[#23A192] text-white hover:brightness-110 border-transparent focus:ring-[#23A192]/35";
  const pillGold =
    "bg-[#FCC020] text-slate-900 hover:brightness-105 border-transparent focus:ring-[#FCC020]/40";

  const projectOptions = useMemo(() => projects, [projects]);

  if (!isSuperAdmin) {
    return (
      <div className="w-full">
        <div className="mx-auto max-w-6xl">
          {toast && (
            <Toast
              type={toast.type}
              message={toast.msg}
              onClose={() => setToast(null)}
            />
          )}

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-white/10 dark:bg-neutral-950">
            <div className="px-5 py-4 border-b border-slate-200 bg-[#00379C]/[0.03] dark:border-white/10 dark:bg-white/[0.03]">
              <div className="text-lg font-extrabold text-[#00379C] dark:text-white">
                Module Settings
              </div>
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                You don&apos;t have permission to access this page.
              </div>
              <div className="mt-2 h-1 w-10 rounded-full bg-[#FCC020]" />
            </div>

            <div className="p-5">
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-800 dark:border-rose-800/60 dark:bg-rose-900/25 dark:text-rose-200">
                <div className="text-sm font-extrabold">403 — Access Denied</div>
                <div className="mt-1 text-sm">
                  Please contact a Super Admin if you believe this is a mistake.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mx-auto max-w-6xl">
        {toast && (
          <Toast
            type={toast.type}
            message={toast.msg}
            onClose={() => setToast(null)}
          />
        )}

        {/* Top controls (no extra outer “big background”) */}
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-white/10 dark:bg-neutral-950">
          <div className="px-5 py-4 border-b border-slate-200 bg-[#00379C]/[0.03] dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="text-sm font-extrabold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Project
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    className={`${pill} ${pillLight} min-w-[260px]`}
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    disabled={loadingProjects}
                    aria-label="Select Project"
                    title="Select project"
                  >
                    {projectOptions.length === 0 ? (
                      <option value="">No projects</option>
                    ) : (
                      <option value="">— Select a project —</option>
                    )}

                    {projectOptions.map((p) => {
                      const tip = [
                        p.code ? `Code: ${p.code}` : null,
                        `Title: ${p.title}`,
                        `Distt: ${p.distt ?? "-"}`,
                        `Type: ${p.type ?? "-"}`,
                      ]
                        .filter(Boolean)
                        .join(" | ");
                      return (
                        <option key={p.projectId} value={p.projectId} title={tip}>
                          {p.title}
                        </option>
                      );
                    })}
                  </select>

                  {(loadingProjects || loadingSettings) && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Loading…
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-start lg:justify-end">
                <span
                  className={[
                    "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold",
                    projectId
                      ? canEdit
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-900/25 dark:text-emerald-200"
                        : "border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-neutral-950 dark:text-slate-200"
                      : "border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-neutral-950 dark:text-slate-300",
                  ].join(" ")}
                >
                  {projectId
                    ? canEdit
                      ? "Editing enabled for this project"
                      : "Read-only — check loading or permissions"
                    : "Select a project to start editing"}
                </span>
              </div>
            </div>

            <div className="mt-3 h-1 w-12 rounded-full bg-[#FCC020]" />
          </div>

          {/* Tabs (kept for future modules) */}
          <div className="px-5 py-3 flex flex-wrap gap-2">
            {MODULES.map((m) => {
              const active = moduleKey === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModuleKey(m)}
                  className={[
                    pill,
                    active
                      ? "bg-[#00379C] text-white border-transparent focus:ring-[#00379C]/35"
                      : pillLight,
                  ].join(" ")}
                  aria-pressed={active}
                  aria-label={`Select ${LABELS[m]}`}
                >
                  {LABELS[m]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Panel */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-white/10 dark:bg-neutral-950">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10">
            <div className="text-base font-extrabold text-[#00379C] dark:text-white">
              {LABELS[moduleKey]}
            </div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Configure WIR behaviour for each project — transmission, redirect
              and export options.
            </div>
            <div className="mt-2 h-1 w-10 rounded-full bg-[#FCC020]" />
          </div>

          {/* --- WIR options --- */}
          <div className="p-5">
            <fieldset
              className="grid grid-cols-1 gap-3 lg:grid-cols-3"
              disabled={!projectId}
            >
              {/* Transmission Type */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-950">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-extrabold text-slate-800 dark:text-white">
                    Transmission Type
                  </div>
                  <span className="h-2 w-2 rounded-full bg-[#23A192]" />
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Default: <span className="font-semibold">Public</span>
                </div>

                <div className="mt-3 space-y-2">
                  {(["Public", "Private"] as WirTransmissionType[]).map(
                    (val) => {
                      const checked = getWirExtra(wir).transmissionType === val;
                      return (
                        <label
                          key={val}
                          className="flex items-center gap-2 rounded-full px-2 py-1 text-sm cursor-pointer hover:bg-[#00379C]/[0.04] dark:hover:bg-white/[0.04]"
                        >
                          <input
                            type="radio"
                            name="wir-transmission"
                            value={val}
                            checked={checked}
                            onChange={() =>
                              setWir((s) => ({
                                ...s,
                                extra: { ...(s.extra || {}), transmissionType: val },
                              }))
                            }
                            disabled={!canEdit}
                            className="h-4 w-4 accent-[#23A192]"
                          />
                          <span className="text-sm text-slate-800 dark:text-slate-100">
                            {val}
                          </span>
                        </label>
                      );
                    }
                  )}
                </div>
              </div>

              {/* Redirect Allowed */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-950">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-extrabold text-slate-800 dark:text-white">
                    Redirect
                  </div>
                  <span className="h-2 w-2 rounded-full bg-[#FCC020]" />
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Default: <span className="font-semibold">Allowed</span>
                </div>

                <div className="mt-3 space-y-2">
                  {[
                    { label: "Allowed", val: true },
                    { label: "Not Allowed", val: false },
                  ].map((opt) => {
                    const checked = getWirExtra(wir).redirectAllowed === opt.val;
                    return (
                      <label
                        key={opt.label}
                        className="flex items-center gap-2 rounded-full px-2 py-1 text-sm cursor-pointer hover:bg-[#00379C]/[0.04] dark:hover:bg-white/[0.04]"
                      >
                        <input
                          type="radio"
                          name="wir-redirect"
                          value={String(opt.val)}
                          checked={checked}
                          onChange={() =>
                            setWir((s) => ({
                              ...s,
                              extra: { ...(s.extra || {}), redirectAllowed: opt.val },
                            }))
                          }
                          disabled={!canEdit}
                          className="h-4 w-4 accent-[#23A192]"
                        />
                        <span className="text-sm text-slate-800 dark:text-slate-100">
                          {opt.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Export PDF */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-950">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-extrabold text-slate-800 dark:text-white">
                    Export PDF
                  </div>
                  <span className="h-2 w-2 rounded-full bg-[#00379C]" />
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Default: <span className="font-semibold">Not Allowed</span>
                </div>

                <div className="mt-3 space-y-2">
                  {[
                    { label: "Allowed", val: true },
                    { label: "Not Allowed", val: false },
                  ].map((opt) => {
                    const checked = getWirExtra(wir).exportPdfAllowed === opt.val;
                    return (
                      <label
                        key={opt.label}
                        className="flex items-center gap-2 rounded-full px-2 py-1 text-sm cursor-pointer hover:bg-[#00379C]/[0.04] dark:hover:bg-white/[0.04]"
                      >
                        <input
                          type="radio"
                          name="wir-exportpdf"
                          value={String(opt.val)}
                          checked={checked}
                          onChange={() =>
                            setWir((s) => ({
                              ...s,
                              extra: { ...(s.extra || {}), exportPdfAllowed: opt.val },
                            }))
                          }
                          disabled={!canEdit}
                          className="h-4 w-4 accent-[#23A192]"
                        />
                        <span className="text-sm text-slate-800 dark:text-slate-100">
                          {opt.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </fieldset>

            {/* Actions */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                className={`${pill} ${pillTeal}`}
                onClick={onSaveWIR}
                disabled={!canEdit || saving}
                type="button"
                title="Save settings"
              >
                {saving ? "Saving…" : "Save"}
              </button>

              <button
                className={`${pill} ${pillLight}`}
                onClick={() => setResetOpen(true)}
                disabled={!canEdit || saving}
                type="button"
                title="Reset to defaults"
              >
                Reset
              </button>

              {/* optional subtle hint */}
              <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">
                Changes apply to the selected project only.
              </span>
            </div>
          </div>
        </div>

        {/* Confirm modal (replaces browser confirm) */}
        <ConfirmModal
          open={resetOpen}
          title="Reset WIR settings?"
          message={`Reset WIR settings to defaults for project "${currentProjectLabel()}"?`}
          confirmText="Reset"
          cancelText="Cancel"
          onCancel={() => setResetOpen(false)}
          onConfirm={onResetWIRConfirmed}
          busy={saving}
        />
      </div>
    </div>
  );
}
