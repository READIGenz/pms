import { useEffect, useState } from 'react';

type Row = {
  companyId: string;
  name: string;
  companyRole?: string | null;
  status: 'Active' | 'Inactive';
  stateId?: string | null;
  updatedAt?: string;
};

export default function Companies() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    // TODO: GET /admin/companies?q=
    setRows([]);
  }, []);

  const filtered = rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold dark:text-white">Companies</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">Registry & roles.</p>
        </div>
        <div className="w-72">
          <input
            className="w-full border rounded p-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/70 focus:border-emerald-500"
            placeholder="Search by name"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </header>

      <div className="overflow-auto">
        <table className="w-full border-separate border-spacing-y-2">
          <thead>
            <tr className="text-left text-xs text-gray-600 dark:text-gray-300">
              <th className="px-3">ID</th>
              <th className="px-3">Name</th>
              <th className="px-3">Role</th>
              <th className="px-3">Status</th>
              <th className="px-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.companyId} className="bg-white dark:bg-neutral-900 border dark:border-neutral-800">
                <td className="px-3 py-2 font-mono text-xs">{r.companyId}</td>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2">{r.companyRole || '—'}</td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="px-3 py-2 text-sm">{r.updatedAt ? new Date(r.updatedAt).toLocaleString() : '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  No companies yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
