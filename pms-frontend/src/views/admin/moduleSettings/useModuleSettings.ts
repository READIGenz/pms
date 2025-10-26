// src/views/admin/moduleSettings/useModuleSettings.ts
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BaseModuleSettings, ModuleKey } from "../../../api/adminModuleSettings";
import { getModuleSettings, saveModuleSettings, resetModuleSettings } from "../../../api/adminModuleSettings";

const EMPTY: BaseModuleSettings = {
  enabled: true,
  autoCodePrefix: "",
  requireEvidence: false,
  requireGeoEvidence: false,
  requireMinPhotos: 0,
  allowAWC: false,
  slaHours: null,
  extra: {},
};

export function normalizeSettings(raw?: Partial<BaseModuleSettings> | null): BaseModuleSettings {
  const base = { ...EMPTY, extra: {} as Record<string, any> };
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    extra: { ...(base.extra || {}), ...(raw.extra || {}) },
  };
}

export function useModuleSettings(projectId: string, mod: ModuleKey) {
  const [settings, setSettings] = useState<BaseModuleSettings>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const canSave = useMemo(() => !!projectId && !loading && !saving, [projectId, loading, saving]);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const raw = await getModuleSettings(projectId, mod);
      setSettings(normalizeSettings(raw || undefined));
    } catch (e: any) {
      setToast(`Load failed: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
      setTimeout(() => setToast(null), 3000);
    }
  }, [projectId, mod]);

  const save = useCallback(async () => {
    if (!projectId) return;
    setSaving(true);
    try {
      await saveModuleSettings(projectId, mod, settings);
      setToast("Settings saved.");
    } catch (e: any) {
      setToast(`Save failed: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  }, [projectId, mod, settings]);

  const reset = useCallback(async () => {
    if (!projectId) return;
    setSaving(true);
    try {
      const fresh = await resetModuleSettings(projectId, mod);
      setSettings(normalizeSettings(fresh));
      setToast("Reset to defaults.");
    } catch (e: any) {
      setToast(`Reset failed: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  }, [projectId, mod]);

  useEffect(() => { load(); }, [load]);

  return { settings, setSettings, loading, saving, toast, canSave, save, reset, reload: load };
}
