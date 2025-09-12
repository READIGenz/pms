import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';

type User = {
  userId: string;
  code: string;
  role: string;
  name: string;
  city?: string | null;
  email?: string | null;
  countryCode?: string | null; // digits only, e.g. "91"
  phone?: string | null;       // 10-digit local, e.g. "9876543210"
  isSuperAdmin?: boolean;
  status?: 'Active'|'Inactive';
  createdAt?: string;
};

function fmtPhoneParen(u: User) {
  if (u.countryCode && u.phone) return `(+${u.countryCode}) ${u.phone}`;
  if (u.phone) return u.phone; // fallback if cc missing
  return null;
}

export default function UsersList(){
  const [items, setItems] = useState<User[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string|null>(null);

  // who is logged in?
  const currentUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
  }, []);
  const canModify = !!currentUser?.isSuperAdmin;

  // inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState<'Active'|'Inactive'>('Active');
  const [saving, setSaving] = useState(false);
  
  const load = async (query?: string) => {
    setErr(null);
    setLoading(true);
    try {
      const { data } = await api.get(endpoints.admin.users, { params: query ? { q: query } : undefined });
      // backend returns either an array or { ok, items }
      const list: User[] = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
      setItems(list);
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

  const beginEdit = (u: User) => {
    setEditingId(u.userId);
    setNewStatus((u.status as 'Active'|'Inactive') || 'Active');
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveStatus = async (u: User) => {
    if (!editingId) return;
    try {
      setSaving(true);
      const { data } = await api.patch(endpoints.admin.userStatus(u.userId), { status: newStatus });
      if (data?.ok) {
        // update local list
        setItems(arr => arr.map(it => it.userId === u.userId ? { ...it, status: newStatus } : it));
        setEditingId(null);
      } else {
        setErr(data?.error || 'Failed to update status');
      }
    } catch (e:any) {
      setErr(e?.response?.data?.error || 'Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen p-6 bg-gray-50">
      <div className="max-w-6xl mx-auto bg-white border rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-semibold">Users</h2>
            <div className="text-sm text-gray-600">{loading ? 'Loading…' : `${items.length} result(s)`}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <input
            className="border rounded px-3 py-2 w-64"
            placeholder="Search by email/name/code/role…"
            value={q}
            onChange={(e)=>setQ(e.target.value)}
          />
          <Link to="/admin/users/new" className="px-3 py-2 rounded bg-emerald-600 text-white">New User</Link>
          <Link to="/admin" className="px-3 py-2 rounded border">Back</Link>
        </div>

        {err && <div className="text-red-600 text-sm mb-3">{err}</div>}

         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(u => {
            const phone = fmtPhoneParen(u);
            const isEditing = editingId === u.userId;
            const badge = u.status === 'Inactive'
              ? 'bg-red-100 text-red-700 border-red-200'
              : 'bg-emerald-100 text-emerald-700 border-emerald-200';

           return (
              <div key={u.userId} className="rounded-xl border bg-white p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-lg font-medium">{u.name}</div>
                    <div className="text-sm text-gray-600">{u.code} · {u.role}</div>
                    <div className="text-xs text-gray-500">
                      {u.city || '—'}
                      {u.email ? ` · ${u.email}` : ''}
                      {phone ? ` · ${phone}` : ''}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-[10px] px-2 py-1 rounded-full border ${badge}`}>
                      {u.status || 'Active'}
                    </span>
                    {u.isSuperAdmin && (
                      <span className="text-[10px] px-2 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                        SUPER ADMIN
                      </span>
                    )}
                  </div>
                </div>

                {canModify && (
                  <div className="pt-2">
                    {!isEditing ? (
                      <button
                        className="px-3 py-1 rounded border hover:bg-gray-50"
                        onClick={() => beginEdit(u)}
                      >
                        Modify Status
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <select
                          className="border rounded px-2 py-1 bg-white"
                          value={newStatus}
                          onChange={e => setNewStatus(e.target.value as 'Active'|'Inactive')}
                        >
                          <option value="Active">Active</option>
                          <option value="Inactive">Inactive</option>
                        </select>
                        <button
                          className="px-3 py-1 rounded bg-emerald-600 text-white disabled:opacity-60"
                          disabled={saving}
                          onClick={() => saveStatus(u)}
                        >
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button className="px-3 py-1 rounded border" onClick={cancelEdit}>
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!loading && items.length === 0 && (
            <div className="text-gray-500 text-sm p-4">No users found.</div>
          )}
        </div>
      </div>
    </div>
  );
}