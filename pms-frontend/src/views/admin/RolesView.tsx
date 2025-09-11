import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';

export default function AdminRolesView(){
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string|null>(null);

  useEffect(() => {
    (async () => {
      setErr(null);
      try{
        // Suggested backend: GET /admin/roles/catalog -> { ok: true, roles: string[] }
        const { data } = await api.get(endpoints.admin.rolesCatalog);
        if(data?.ok && Array.isArray(data.roles)) setRoles(data.roles);
        else setRoles([
          'Admin','Customer','PMC','Architect','Designer','Contractor',
          'Legal/Liasoning','Ava-PMT','Engineer (Contractor)',
          'DC (Contractor)','DC (PMC)','Inspector (PMC)','HOD (PMC)'
        ]);
      }catch(e:any){
        setErr(e?.response?.data?.error || null);
        // fallback to static list
        setRoles([
          'Admin','Customer','PMC','Architect','Designer','Contractor',
          'Legal/Liasoning','Ava-PMT','Engineer (Contractor)',
          'DC (Contractor)','DC (PMC)','Inspector (PMC)','HOD (PMC)'
        ]);
      }finally{ setLoading(false); }
    })();
  }, []);

  return (
    <div className="min-h-screen p-6 bg-gray-50">
      <div className="max-w-3xl mx-auto bg-white border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Roles Catalog</h2>
          <a href="/admin" className="border rounded px-3 py-1">Back</a>
        </div>
        {loading ? <div>Loading…</div> : (
          <ul className="list-disc pl-6 space-y-1">
            {roles.map(r => <li key={r}>{r}</li>)}
          </ul>
        )}
        {err && <div className="text-red-600 text-sm mt-3">{err}</div>}
      </div>
    </div>
  );
}
