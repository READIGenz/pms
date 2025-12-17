// src/views/admin/moduleSettings/ModuleSettingsLayout.tsx
import { useEffect, useState } from "react";
import { useLocation, Navigate } from "react-router-dom";
import { api } from "../../../api/client";

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

  useEffect(() => {
    document.title = "Trinity PMS — Module Settings";
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
        if (!rows.length) alert("No projects found. Create one first.");
      } catch (e: any) {
        alert(`Projects load failed: ${e?.message ?? e}`);
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
        alert(
          `Load failed for project "${currentProjectLabel()}": ${
            e?.message ?? e
          }`
        );
        const n = normalize(null);
        n.extra = { ...WIR_EXTRA_DEFAULTS };
        setWir(n);
      } finally {
        setLoadingSettings(false);
      }
    })();
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

  // Helper: pretty project label for alerts
  function currentProjectLabel() {
    const p = projects.find((x) => x.projectId === projectId);
    if (!p) return "Unknown Project";
    return p.code ? `${p.title} (${p.code})` : p.title;
  }

  // --- Handlers: WIR ---
  async function onSaveWIR() {
    if (!projectId) return;
    setSaving(true);
    try {
      const extra = { ...(wir.extra || {}), ...getWirExtra(wir) };
      await putModuleSettings(projectId, "WIR", { ...wir, extra });
      alert(`WIR settings saved for project: ${currentProjectLabel()}.`);
    } catch (e: any) {
      alert(
        `Save failed for project "${currentProjectLabel()}": ${
          e?.message ?? e
        }`
      );
    } finally {
      setSaving(false);
    }
  }

  async function onResetWIR() {
    if (!projectId) return;
    const ok = confirm(
      `Reset WIR settings to defaults for project "${currentProjectLabel()}"?`
    );
    if (!ok) return;
    setSaving(true);
    try {
      const fresh = await resetModule(projectId, "WIR");
      const n = normalize(fresh);
      n.extra = { ...WIR_EXTRA_DEFAULTS, ...(n.extra || {}) };
      setWir(n);
      alert(
        `WIR settings reset to defaults for project: ${currentProjectLabel()}.`
      );
    } catch (e: any) {
      alert(
        `Reset failed for project "${currentProjectLabel()}": ${
          e?.message ?? e
        }`
      );
    } finally {
      setSaving(false);
    }
  }

  if (!token) return <Navigate to="/login" state={{ from: loc }} replace />;

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-yellow-50 dark:from-neutral-900 dark:to-neutral-950 px-4 sm:px-6 lg:px-10 py-8 rounded-2xl">
        <div className="mx-auto max-w-3xl">
          <div className="mb-5 space-y-2">
            <h1 className="text-2xl font-semibold dark:text-white">
              Module Settings
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Manage project-specific configuration for Trinity PMS modules.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm p-5">
            <div className="text-sm text-red-700 dark:text-red-400 font-medium mb-1">
              403 — Access Denied
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-200">
              You don&apos;t have permission to access this page. Please
              contact a Super Admin if you believe this is a mistake.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-yellow-50 dark:from-neutral-900 dark:to-neutral-950 px-4 sm:px-6 lg:px-10 py-8 rounded-2xl">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-6 space-y-3">
          <div>
            <h1 className="text-2xl font-semibold dark:text-white">
              Module Settings
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Configure WIR behaviour for each project — transmission, redirect
              and export options.
            </p>
          </div>

          {/* Line 2: Project selector + loading state */}
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2 md:basis-3/4">
              <span className="text-xs font-medium text-gray-600 uppercase tracking-wide dark:text-gray-300">
                Project
              </span>
              <select
                className="h-9 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm min-w-56 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent dark:bg-neutral-900 dark:text-white dark:border-neutral-700"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={loadingProjects}
                aria-label="Select Project"
              >
                {projects.length === 0 ? (
                  <option value="">No projects</option>
                ) : (
                  <option value="">— Select a project —</option>
                )}
                {projects.map((p) => {
                  const tip = [
                    p.code ? `Code: ${p.code}` : null,
                    `Title: ${p.title}`,
                    `Distt: ${p.distt ?? "-"}`,
                    `Type: ${p.type ?? "-"}`,
                  ]
                    .filter(Boolean)
                    .join(" | ");
                  return (
                    <option
                      key={p.projectId}
                      value={p.projectId}
                      title={tip}
                    >
                      {p.title}
                    </option>
                  );
                })}
              </select>

              {(loadingProjects || loadingSettings) && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Loading…
                </span>
              )}
            </div>

            {/* Status hint on the right */}
            <div className="flex items-center justify-start md:justify-end md:basis-1/4">
              <span className="inline-flex items-center rounded-full border border-emerald-200/70 bg-emerald-50/80 px-3 py-1 text-[11px] font-medium text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-900/30 dark:text-emerald-300">
                {projectId
                  ? canEdit
                    ? "Editing enabled for this project"
                    : "Read-only — check loading or permissions"
                  : "Select a project to start editing"}
              </span>
            </div>
          </div>

          {/* Tabs: only WIR (kept for future modules) */}
          <div className="flex flex-wrap gap-2">
            {MODULES.map((m) => {
              const active = moduleKey === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModuleKey(m)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    active
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-emerald-50 dark:bg-neutral-900 dark:text-slate-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                  }`}
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
        <div className="rounded-2xl border border-slate-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm p-5">
          <h2 className="text-lg font-semibold dark:text-white">
            {LABELS[moduleKey]}
          </h2>

          {/* --- WIR: ONLY the 3 requested options --- */}
          <div className="mt-4 space-y-5">
            <fieldset
              className="grid grid-cols-1 gap-4 md:grid-cols-3 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-900/60"
              disabled={!projectId}
            >
              {/* Transmission Type */}
              <div className="rounded-xl border border-slate-200/80 bg-white/80 p-3 dark:border-neutral-800 dark:bg-neutral-900/80">
                <div className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                  Transmission Type
                </div>
                {(
                  ["Public", "Private"] as WirTransmissionType[]
                ).map((val) => {
                  const checked = getWirExtra(wir).transmissionType === val;
                  return (
                    <label
                      key={val}
                      className="flex items-center gap-2 rounded-full px-2 py-1 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-neutral-800"
                    >
                      <input
                        type="radio"
                        className="h-4 w-4 text-emerald-600 focus:ring-emerald-500"
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
                      />
                      <span className="text-sm text-slate-800 dark:text-slate-100">
                        {val}
                      </span>
                    </label>
                  );
                })}
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Default: <span className="font-medium">Public</span>
                </div>
              </div>

              {/* Redirect Allowed */}
              <div className="rounded-xl border border-slate-200/80 bg-white/80 p-3 dark:border-neutral-800 dark:bg-neutral-900/80">
                <div className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                  Redirect
                </div>
                {[
                  { label: "Allowed", val: true },
                  { label: "Not Allowed", val: false },
                ].map((opt) => {
                  const checked = getWirExtra(wir).redirectAllowed === opt.val;
                  return (
                    <label
                      key={opt.label}
                      className="flex items-center gap-2 rounded-full px-2 py-1 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-neutral-800"
                    >
                      <input
                        type="radio"
                        className="h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                        name="wir-redirect"
                        value={String(opt.val)}
                        checked={checked}
                        onChange={() =>
                          setWir((s) => ({
                            ...s,
                            extra: {
                              ...(s.extra || {}),
                              redirectAllowed: opt.val,
                            },
                          }))
                        }
                        disabled={!canEdit}
                      />
                      <span className="text-sm text-slate-800 dark:text-slate-100">
                        {opt.label}
                      </span>
                    </label>
                  );
                })}
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Default: <span className="font-medium">Allowed</span>
                </div>
              </div>

              {/* Export PDF */}
              <div className="rounded-xl border border-slate-200/80 bg-white/80 p-3 dark:border-neutral-800 dark:bg-neutral-900/80">
                <div className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                  Export PDF
                </div>
                {[
                  { label: "Allowed", val: true },
                  { label: "Not Allowed", val: false },
                ].map((opt) => {
                  const checked =
                    getWirExtra(wir).exportPdfAllowed === opt.val;
                  return (
                    <label
                      key={opt.label}
                      className="flex items-center gap-2 rounded-full px-2 py-1 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-neutral-800"
                    >
                      <input
                        type="radio"
                        className="h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                        name="wir-exportpdf"
                        value={String(opt.val)}
                        checked={checked}
                        onChange={() =>
                          setWir((s) => ({
                            ...s,
                            extra: {
                              ...(s.extra || {}),
                              exportPdfAllowed: opt.val,
                            },
                          }))
                        }
                        disabled={!canEdit}
                      />
                      <span className="text-sm text-slate-800 dark:text-slate-100">
                        {opt.label}
                      </span>
                    </label>
                  );
                })}
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Default: <span className="font-medium">Not Allowed</span>
                </div>
              </div>
            </fieldset>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="h-9 rounded-full bg-emerald-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                onClick={onSaveWIR}
                disabled={!canEdit || saving}
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                className="h-9 rounded-full border border-slate-200 bg-white px-4 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60 dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
                onClick={onResetWIR}
                disabled={!canEdit || saving}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
