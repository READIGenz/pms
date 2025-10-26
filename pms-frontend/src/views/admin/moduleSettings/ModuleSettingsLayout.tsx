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
type ModuleKey = typeof MODULES[number];

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
        const pr = await api.get("/admin/projects", { headers: { Accept: "application/json" } });
        const pData = pr.data;
        const pArr = Array.isArray(pData) ? pData : (pData?.projects ?? []);
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
        alert(`Load failed for project "${currentProjectLabel()}": ${e?.message ?? e}`);
        const n = normalize(null);
        n.extra = { ...WIR_EXTRA_DEFAULTS };
        setWir(n);
      }
      finally {
        setLoadingSettings(false);
      }
    })();
  }, [projectId]);

  // --- API helpers ---
  async function getModuleSettings(pid: string, mod: ModuleKey): Promise<BaseModuleSettings | null> {
    const { data } = await api.get(`/admin/module-settings/${pid}/${mod}`);
    return data ?? null;
  }
  async function putModuleSettings(pid: string, mod: ModuleKey, body: BaseModuleSettings): Promise<void> {
    await api.put(`/admin/module-settings/${pid}/${mod}`, body);
  }
  async function resetModule(pid: string, mod: ModuleKey): Promise<BaseModuleSettings> {
    const { data } = await api.post(`/admin/module-settings/${pid}/${mod}/reset`);
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

  const canEdit = !!projectId && !loadingProjects && !loadingSettings && isSuperAdmin;

  // ---- helpers for WIR extra ----
  function getWirExtra(state: BaseModuleSettings) {
    const ex = state.extra || {};
    return {
      transmissionType: (ex.transmissionType as WirTransmissionType) ?? WIR_EXTRA_DEFAULTS.transmissionType,
      redirectAllowed: typeof ex.redirectAllowed === "boolean" ? ex.redirectAllowed : WIR_EXTRA_DEFAULTS.redirectAllowed,
      exportPdfAllowed:
        typeof ex.exportPdfAllowed === "boolean" ? ex.exportPdfAllowed : WIR_EXTRA_DEFAULTS.exportPdfAllowed,
    };
  }

  // Helper: pretty project label for alerts
  function currentProjectLabel() {
    const p = projects.find(x => x.projectId === projectId);
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
      alert(`Save failed for project "${currentProjectLabel()}": ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  }

  async function onResetWIR() {
    if (!projectId) return;
    const ok = confirm(`Reset WIR settings to defaults for project "${currentProjectLabel()}"?`);
    if (!ok) return;
    setSaving(true);
    try {
      const fresh = await resetModule(projectId, "WIR");
      const n = normalize(fresh);
      n.extra = { ...WIR_EXTRA_DEFAULTS, ...(n.extra || {}) };
      setWir(n);
      alert(`WIR settings reset to defaults for project: ${currentProjectLabel()}.`);
    } catch (e: any) {
      alert(`Reset failed for project "${currentProjectLabel()}": ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  }

  if (!token) return <Navigate to="/login" state={{ from: loc }} replace />;
  if (!isSuperAdmin) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Module Settings</h1>
        <div className="rounded-xl border p-4 text-sm">403 — You don’t have permission to access this page.</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <h1 className="text-2xl font-semibold">Module Settings</h1>

      {/* Project selector */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">Project</label>
        <select
          className="border rounded-xl px-3 py-2 min-w-56"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          disabled={loadingProjects}
          aria-label="Select Project"
        >
          {projects.length === 0 ? (
            <option value="">No projects</option>
          ) : (
            <option value="">— select a project —</option>
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
              <option key={p.projectId} value={p.projectId} title={tip}>
                {p.title}
              </option>
            );
          })}
        </select>
        {(loadingProjects || loadingSettings) && (
          <span className="text-xs text-gray-500">Loading…</span>
        )}
      </div>

      {/* Tabs: only WIR */}
      <div className="flex flex-wrap gap-2">
        {MODULES.map((m) => {
          const active = moduleKey === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setModuleKey(m)}
              className={`px-3 py-1.5 rounded-full text-sm border transition
                ${active ? "bg-emerald-600 text-white border-emerald-600" : "hover:bg-emerald-50"}`}
              aria-pressed={active}
              aria-label={`Select ${LABELS[m]}`}
            >
              {m}
            </button>
          );
        })}
      </div>

      {/* Panel */}
      <div className="rounded-2xl border dark:border-neutral-800 p-4">
        <h2 className="text-lg font-semibold">{LABELS[moduleKey]}</h2>

        {/* --- WIR: ONLY the 3 requested options --- */}
        <div className="mt-4 space-y-4">
          <fieldset className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded-xl border p-4" disabled={!projectId}>
            {/* Transmission Type */}
            <div className="rounded-xl border p-3">
              <div className="text-sm font-medium mb-2">Transmission Type</div>
              {(["Public", "Private", "UserSet"] as WirTransmissionType[]).map((val) => {
                const checked = getWirExtra(wir).transmissionType === val;
                return (
                  <label key={val} className="flex items-center gap-2 py-1 cursor-pointer">
                    <input
                      type="radio"
                      name="wir-transmission"
                      value={val}
                      checked={checked}
                      onChange={() => setWir((s) => ({ ...s, extra: { ...(s.extra || {}), transmissionType: val } }))}
                      disabled={!canEdit}
                    />
                    <span className="text-sm">{val}</span>
                  </label>
                );
              })}
              <div className="text-xs text-gray-500 mt-1">Default: Public</div>
            </div>

            {/* Redirect Allowed */}
            <div className="rounded-xl border p-3">
              <div className="text-sm font-medium mb-2">Redirect</div>
              {[
                { label: "Allowed", val: true },
                { label: "Not Allowed", val: false },
              ].map((opt) => {
                const checked = getWirExtra(wir).redirectAllowed === opt.val;
                return (
                  <label key={opt.label} className="flex items-center gap-2 py-1 cursor-pointer">
                    <input
                      type="radio"
                      name="wir-redirect"
                      value={String(opt.val)}
                      checked={checked}
                      onChange={() => setWir((s) => ({ ...s, extra: { ...(s.extra || {}), redirectAllowed: opt.val } }))}
                      disabled={!canEdit}
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                );
              })}
              <div className="text-xs text-gray-500 mt-1">Default: Allowed</div>
            </div>

            {/* Export PDF */}
            <div className="rounded-xl border p-3">
              <div className="text-sm font-medium mb-2">Export PDF</div>
              {[
                { label: "Allowed", val: true },
                { label: "Not Allowed", val: false },
              ].map((opt) => {
                const checked = getWirExtra(wir).exportPdfAllowed === opt.val;
                return (
                  <label key={opt.label} className="flex items-center gap-2 py-1 cursor-pointer">
                    <input
                      type="radio"
                      name="wir-exportpdf"
                      value={String(opt.val)}
                      checked={checked}
                      onChange={() => setWir((s) => ({ ...s, extra: { ...(s.extra || {}), exportPdfAllowed: opt.val } }))}
                      disabled={!canEdit}
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                );
              })}
              <div className="text-xs text-gray-500 mt-1">Default: Not Allowed</div>
            </div>
          </fieldset>

          <div className="flex items-center gap-2">
            <button
              className="rounded-2xl px-4 py-2 bg-indigo-600 text-white disabled:opacity-50"
              onClick={onSaveWIR}
              disabled={!canEdit || saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              className="rounded-2xl px-4 py-2 border disabled:opacity-50"
              onClick={onResetWIR}
              disabled={!canEdit || saving}
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
