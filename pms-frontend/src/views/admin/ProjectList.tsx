import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';

type Project = {
  projectId: string;
  code: string;
  name: string;
  city?: string;
  status?: string;
  stage?: string;
  health?: string;
  createdAt?: string;
};

export default function ProjectsList(){
  const nav = useNavigate();
  const [items, setItems] = useState<Project[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string|null>(null);

  const load = async (query?: string) => {
    setErr(null);
    setLoading(true);
    try {
      const { data } = await api.get(endpoints.admin.projects, { params: query ? { q: query } : undefined });
      setItems(Array.isArray(data) ? data : (data?.items ?? []));
    } catch(e:any) {
      setErr(e?.response?.data?.error || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  // Simple debounce for search
  useEffect(() => {
    const t = setTimeout(() => load(q.trim() || undefined), 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="min-h-screen p-6 bg-gray-50">
      <div className="max-w-6xl mx-auto bg-white border rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-semibold">Projects</h2>
            <div className="text-sm text-gray-600">{loading ? 'Loading…' : `${items.length} result(s)`}</div>
          </div>
          <div className="flex gap-2">
            <input
              className="border rounded px-3 py-2 w-64"
              placeholder="Search by code/name/city…"
              value={q}
              onChange={(e)=>setQ(e.target.value)}
            />
            <Link to="/admin/projects/new" className="px-3 py-2 rounded bg-emerald-600 text-white">New Project</Link>
            <Link to="/admin" className="px-3 py-2 rounded border">Back</Link>
          </div>
        </div>

        {err && <div className="text-red-600 text-sm mb-3">{err}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(p => (
            <div key={p.projectId} className="rounded-xl border bg-white p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-medium">{p.name}</div>
                  <div className="text-sm text-gray-600">{p.code} · {p.city || '—'}</div>
                </div>
                <div className="text-right text-xs text-gray-500">
                  {p.status && <div>Status: {p.status}</div>}
                  {p.stage  && <div>Stage: {p.stage}</div>}
                  {p.health && <div>Health: {p.health}</div>}
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  className="px-3 py-1.5 rounded border"
                  onClick={()=> nav('/admin/assign')}
                  title="Manage role assignments for this project"
                >Manage Roles</button>
                <button
                  className="px-3 py-1.5 rounded border"
                  onClick={()=> nav(`/projects/${p.projectId}`)}
                  title="Open project details (user view)"
                >Open</button>
              </div>
            </div>
          ))}
          {!loading && items.length === 0 && (
            <div className="text-gray-500 text-sm p-4">No projects found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
