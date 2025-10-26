// src/api/adminModuleSettings.ts
import { api } from "./client";

export const MODULES = ['WIR','MIR','CS','DPR','MIP','DS','RFC','OBS','DLP','LTR','FDB','MAITRI','DASHBOARD'] as const;
export type ModuleKey = typeof MODULES[number];

export type BaseModuleSettings = {
  enabled: boolean;
  autoCodePrefix?: string | null;
  // Global toggles you commonly use:
  requireEvidence?: boolean;
  requireGeoEvidence?: boolean;
  requireMinPhotos?: number;
  allowAWC?: boolean; // for “Accepted With Comment”, typical WIR
  slaHours?: number | null;
  extra?: Record<string, any>; // room for per-module extensions
};

export type ModuleSettingsResponse = BaseModuleSettings | null;

export async function listProjects(): Promise<{ projectId: string; title: string }[]> {
  const { data } = await api.get("/admin/projects");
  // expect: [{ projectId, title }, ...]
  return data ?? [];
}

/** GET current settings (project + module). */
export async function getModuleSettings(projectId: string, mod: ModuleKey): Promise<ModuleSettingsResponse> {
  const { data } = await api.get(`/admin/module-settings/${projectId}/${mod}`);
  return data ?? null;
}

/** PUT save settings (project + module). */
export async function saveModuleSettings(projectId: string, mod: ModuleKey, body: BaseModuleSettings): Promise<void> {
  await api.put(`/admin/module-settings/${projectId}/${mod}`, body);
}

/** POST reset settings to backend defaults/template (project + module). */
export async function resetModuleSettings(projectId: string, mod: ModuleKey): Promise<BaseModuleSettings> {
  const { data } = await api.post(`/admin/module-settings/${projectId}/${mod}:reset`);
  return data;
}
