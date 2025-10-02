//src/api/adminPermissions.ts
import { api } from './client';

export type Actions = 'view'|'raise'|'review'|'approve'|'close';
export type ModuleCode = 'WIR'|'MIR'|'CS'|'DPR'|'MIP'|'DS'|'RFC'|'OBS'|'DLP'|'LTR'|'FDB'|'MAITRI'|'DASHBOARD';
export type RoleKey = 'Client'|'IH-PMT'|'Contractor'|'Consultant'|'PMC'|'Supplier';

export type Matrix = Record<ModuleCode, Record<Actions, boolean>>;

// -------- Project Templates API --------
export type TemplateRow = {
  id: string;
  role: RoleKey;
  matrix: Matrix;
  createdAt: string;
  updatedAt: string;
};

const base = '/admin/permissions/templates';

export async function listTemplates(): Promise<TemplateRow[]> {
  const { data } = await api.get(base);
  return data;
}
export async function getTemplate(role: RoleKey): Promise<TemplateRow> {
  const { data } = await api.get(`${base}/${encodeURIComponent(role)}`);
  return data;
}
export async function saveTemplate(role: RoleKey, matrix: Matrix): Promise<TemplateRow> {
  const { data } = await api.put(`${base}/${encodeURIComponent(role)}`, { matrix });
  return data;
}

// -------- Project Overrides API --------
export type ProjectLite = { projectId: string; title: string };

export async function listProjects(): Promise<ProjectLite[]> {
  const { data } = await api.get('/admin/projects', {
    // keep consistent headers if you want
    headers: { Accept: 'application/json' },
  });
  const arr = Array.isArray(data) ? data : (data?.projects ?? []);
  return (arr ?? [])
    .map((p: any) => ({ projectId: p.projectId ?? p.id, title: p.title ?? p.name }))
    .filter((p: ProjectLite) => p.projectId && p.title);
}

export async function getProjectOverride(projectId: string, role: RoleKey): Promise<Matrix> {
  try {
    const { data } = await api.get(
      `/admin/permissions/projects/${encodeURIComponent(projectId)}/overrides/${encodeURIComponent(role)}`
    );
    return data?.matrix as Matrix;
  } catch (err: any) {
    if (err?.response?.status === 404) return null as any; // treat as empty
    throw err;
  }
}

export async function saveProjectOverride(projectId: string, role: RoleKey, matrix: Matrix): Promise<void> {
  await api.put(
    `/admin/permissions/projects/${encodeURIComponent(projectId)}/overrides/${encodeURIComponent(role)}`,
    { matrix }
  );
}

export async function resetProjectOverride(projectId: string, role: RoleKey): Promise<Matrix> {
  const { data } = await api.post(
    `/admin/permissions/projects/${encodeURIComponent(projectId)}/overrides/${encodeURIComponent(role)}/reset`
  );
  return data?.matrix as Matrix;
}