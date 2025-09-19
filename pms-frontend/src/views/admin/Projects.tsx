import { useEffect, useState } from 'react';

type Row = {
  projectId: string;
  title: string;
  status: string;
  stage?: string | null;
  cityTown?: string | null;
  health?: string | null;
  updatedAt?: string;
};

export default function Projects() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    // TODO: GET /admin/projects?q=
    setRows([]);
  }, []);

  const filtered = rows.filter((r) =>
    (r.title + ' ' + (r.cityTown || '')).toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold dark:text-white">Projects</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">Create & manage project catalog.</p>
        </div>
        <div className="w-72">
          <input
            className="w-full border rounded p-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/70 focus:border-emerald-500"
            placeholder="Search by title / city"
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
              <th className="px-3">Title</th>
              <th className="px-3">Stage</th>
              <th className="px-3">Status</th>
              <th className="px-3">City</th>
              <th className="px-3">Health</th>
              <th className="px-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.projectId} className="bg-white dark:bg-neutral-900 border dark:border-neutral-800">
                <td className="px-3 py-2 font-mono text-xs">{r.projectId}</td>
                <td className="px-3 py-2">{r.title}</td>
                <td className="px-3 py-2">{r.stage || '—'}</td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="px-3 py-2">{r.cityTown || '—'}</td>
                <td className="px-3 py-2">{r.health || '—'}</td>
                <td className="px-3 py-2 text-sm">{r.updatedAt ? new Date(r.updatedAt).toLocaleString() : '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  No projects yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
