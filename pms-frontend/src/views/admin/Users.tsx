import { useEffect, useState } from 'react';

type UserRow = {
  userId: string;
  code?: string;
  firstName: string;
  middleName?: string;
  lastName?: string;
  countryCode: string;
  phone: string;
  email?: string | null;
  userStatus: 'Active' | 'Inactive';
  updatedAt?: string;
};

export default function Users() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    // TODO: replace with real API call: GET /admin/users?q=
    // setRows(await api.get(...))
    setRows([]);
  }, []);

  const filtered = rows.filter((r) => {
    const name = [r.firstName, r.middleName, r.lastName].filter(Boolean).join(' ');
    return name.toLowerCase().includes(q.toLowerCase()) || r.phone.includes(q) || (r.email || '').includes(q);
  });

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold dark:text-white">Users</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">Minimal onboarding & status.</p>
        </div>
        <div className="w-72">
          <input
            className="w-full border rounded p-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/70 focus:border-emerald-500"
            placeholder="Search by name / phone / email"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </header>

      <div className="overflow-auto">
        <table className="w-full border-separate border-spacing-y-2">
          <thead>
            <tr className="text-left text-xs text-gray-600 dark:text-gray-300">
              <th className="px-3">User ID</th>
              <th className="px-3">Name</th>
              <th className="px-3">Phone</th>
              <th className="px-3">Email</th>
              <th className="px-3">Status</th>
              <th className="px-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const name = [r.firstName, r.middleName, r.lastName].filter(Boolean).join(' ');
              const pill =
                'inline-flex items-center px-2 py-0.5 rounded-full text-xs border ' +
                (r.userStatus === 'Active'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-red-50 text-red-700 border-red-200');
              return (
                <tr key={r.userId} className="bg-white dark:bg-neutral-900 border dark:border-neutral-800">
                  <td className="px-3 py-2 font-mono text-xs">{r.userId}</td>
                  <td className="px-3 py-2">{name || '(no name)'}</td>
                  <td className="px-3 py-2">{`${r.countryCode} ${r.phone}`}</td>
                  <td className="px-3 py-2">{r.email || '—'}</td>
                  <td className="px-3 py-2"><span className={pill}>{r.userStatus}</span></td>
                  <td className="px-3 py-2 text-sm">{r.updatedAt ? new Date(r.updatedAt).toLocaleString() : '—'}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
