import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import ConfirmModal from '../../components/ConfirmModal';

type Project = { projectId: string; code: string; name: string; city: string };
type User = { userId: string; name: string; role: string; email?: string; phone?: string };
type RoleOption = { role: string; users: User[] };

const ROLES = [
  'Customer','PMC','Architect','Designer','Contractor','Legal/Liasoning','Ava-PMT',
  'Engineer (Contractor)','DC (Contractor)','DC (PMC)','Inspector (PMC)','HOD (PMC)'
];

export default function AdminAssignRoles(){
  const nav = useNavigate();
  const [step, setStep] = useState<'pick'|'assign'>('pick');
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string|null>(null);

  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const [catalog, setCatalog] = useState<RoleOption[]>([]);
  const [current, setCurrent] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    (async () => {
      setErr(null);
      try{
        setLoading(true);
        const { data } = await api.get(endpoints.admin.projects);
        const list: Project[] = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
        setProjects(list);
      }catch(e:any){
        setErr(e?.response?.data?.error || 'Failed to load projects');
      }finally{ setLoading(false); }
    })();
  }, []);

  const pickProject = async (p: Project) => {
    setSelectedProject(p);
    setErr(null);
    setStep('assign');
    try{
      const [usersRes, rolesRes] = await Promise.all([
        api.get(endpoints.admin.users), // q optional
        api.get(endpoints.admin.projectRoles(p.projectId))
      ]);
      const users: User[] = Array.isArray(usersRes?.data)
        ? usersRes.data
        : (Array.isArray(usersRes?.data?.items) ? usersRes.data.items : []);

      const grouped: RoleOption[] = ROLES.map(role => ({
        role,
        users: users.filter(u => (u.role || '').trim() === role),
      }));
      setCatalog(grouped);

      const cur = rolesRes?.data?.assignments || {};
      const normalized: Record<string, string|null> = {};
      ROLES.forEach(role => normalized[role] = cur[role] ?? null);
      setCurrent(normalized);
    }catch(e:any){
      setErr(e?.response?.data?.error || 'Failed to load users/assignments');
    }
  };

  const rolesReady = useMemo(() => (catalog.length > 0) && !!selectedProject, [catalog, selectedProject]);

  const setRoleUser = (role: string, userIdOrNull: string | 'NONE') => {
    setCurrent(s => ({...s, [role]: userIdOrNull === 'NONE' ? null : userIdOrNull}));
  };

  const submit = async () => {
    if(!selectedProject) return;
    setSaving(true); setErr(null);
    try{
      const { data } = await api.post(endpoints.admin.assignRoles(selectedProject.projectId), { assignments: current });
      if(data?.ok){
        setConfirmOpen(true);
      } else {
        setErr(data?.error || 'Failed to save assignments');
      }
    }catch(e:any){
      setErr(e?.response?.data?.error || 'Failed to save assignments');
    }finally{ setSaving(false); }
  };

  if(step === 'pick'){
    return (
      <div className="min-h-screen p-6 bg-gray-50">
        <div className="max-w-5xl mx-auto bg-white border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Assign Roles → Pick a Project</h2>
            <a href="/admin" className="border rounded px-3 py-1">Back</a>
          </div>

          {loading ? <div>Loading projects…</div> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map(p => (
                <button key={p.projectId} onClick={()=>pickProject(p)} className="text-left rounded-xl border p-4 hover:shadow">
                  <div className="text-lg font-medium">{p.name}</div>
                  <div className="text-sm text-gray-600">{p.code} · {p.city}</div>
                </button>
              ))}
              {!projects.length && (
                <div className="text-gray-500 text-sm p-2">
                  No projects found. Create one from <a className="text-emerald-700 underline" href="/admin/projects/new">New Project</a>.
                </div>
              )}
            </div>
          )}
          {err && <div className="text-red-600 text-sm mt-3">{err}</div>}
        </div>
      </div>
    );
  }

  // step === 'assign'
  return (
    <div className="min-h-screen p-6 bg-gray-50">
      <div className="max-w-5xl mx-auto bg-white border rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Assign Roles</h2>
            {selectedProject && (
              <div className="text-sm text-gray-600">
                Project: <b>{selectedProject.name}</b> ({selectedProject.code}) · {selectedProject.city}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button className="border rounded px-3 py-1" onClick={()=>setStep('pick')}>Back</button>
            <a className="border rounded px-3 py-1" href="/admin">Admin Home</a>
          </div>
        </div>

        {err && <div className="text-red-600 text-sm">{err}</div>}

        {!rolesReady ? (
          <div>Loading roles/users…</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {catalog.map(({ role, users }) => (
              <div key={role} className="rounded-xl border p-4">
                <div className="font-medium mb-2">{role}</div>
                <select
                  className="border rounded w-full p-2 bg-white"
                  value={current[role] ?? 'NONE'}
                  onChange={e=> setRoleUser(role, e.target.value)}
                >
                  <option value="NONE">None</option>
                  {users.map(u => (
                    <option key={u.userId} value={u.userId}>
                      {u.name} {u.email ? `· ${u.email}` : u.phone ? `· ${u.phone}` : ''}
                    </option>
                  ))}
                </select>
                {!users.length && (
                  <div className="text-xs text-gray-500 mt-2">
                    No users with “{role}” role found. Create in <a className="text-emerald-700 underline" href="/admin/users/new">New User</a>.
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div>
          <button disabled={saving} onClick={submit} className="px-4 py-2 rounded bg-emerald-600 text-white disabled:opacity-60">
            {saving ? 'Saving…' : 'Save Assignments'}
          </button>
        </div>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Assignments saved"
        description="Role assignments for this project were saved successfully."
        onConfirm={() => nav('/admin', { replace: true })}
        onOpenChange={setConfirmOpen}
      />
    </div>
  );
}
