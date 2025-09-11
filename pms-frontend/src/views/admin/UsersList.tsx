import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';

type User = {
  userId: string;
  code: string;
  role: string;
  name: string;
  city?: string;
  email?: string | null;
  phone?: string | null;
  isSuperAdmin?: boolean;
  createdAt?: string;
};

export default function UsersList(){
  const [items, setItems] = useState<User[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string|null>(null);

  const load = async (query?: string) => {
    setErr(null);
    setLoading(true);
    try {
      const { data } = await api.get(endpoints.admin.users, { params: query ? { q: query } : undefined });
      setItems(Array.isArray(data) ? data : (data?.items ?? []));
    } catch(e:any) {
      setErr(e?.response?.data?.error || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setTimeout(() => load(q.trim() || undefined), 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="min-h-screen p-6 bg-gray-50">
      <div className="max-w-6xl mx-auto bg-white border rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-semibold">Users</h2>
            <div className="text-sm text-gray-600">{loading ? 'Loading…' : `${items.length} result(s)`}</div>
          </div>
          <div className="flex gap-2">
            <input
              className="border rounded px-3 py-2 w-64"
              placeholder="Search by email/name/code/role…"
              value={q}
              onChange={(e)=>setQ(e.target.value)}
            />
            <Link to="/admin/users/new" className="px-3 py-2 rounded bg-emerald-600 text-white">New User</Link>
            <Link to="/admin" className="px-3 py-2 rounded border">Back</Link>
          </div>
        </div>

        {err && <div className="text-red-600 text-sm mb-3">{err}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(u => (
            <div key={u.userId} className="rounded-xl border bg-white p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-medium">{u.name}</div>
                  <div className="text-sm text-gray-600">{u.code} · {u.role}</div>
                  <div className="text-xs text-gray-500">
                    {u.city || '—'} {u.email ? `· ${u.email}` : ''} {u.phone ? `· ${u.phone}` : ''}
                  </div>
                </div>
                {u.isSuperAdmin && (
                  <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                    SUPER ADMIN
                  </span>
                )}
              </div>
            </div>
          ))}
          {!loading && items.length === 0 && (
            <div className="text-gray-500 text-sm p-4">No users found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
