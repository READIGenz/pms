import { Link } from 'react-router-dom';

export default function AdminHome(){
  const tiles = [
    // 📋 Lists
    { to: '/admin/projects', title: 'Projects', desc: 'Browse & search all projects in the system.' },
    { to: '/admin/users',    title: 'Users',    desc: 'Browse & search all users, including roles.' },

    // ➕ Create
    { to: '/admin/projects/new', title: 'Create New Project', desc: 'Add a project with code, city, status, stage & health.' },
    { to: '/admin/users/new',    title: 'Create New User',    desc: 'Add a pre-registered user with role, email & phone.' },

    // 🔎 Assign
    { to: '/admin/assign', title: 'Assign Roles', desc: 'Pick a project and assign users per role (supports None).' },
  ];

  return (
    <div className="min-h-screen p-6 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-semibold mb-2">Admin Console</h1>
        <p className="text-gray-600 mb-6">Manage projects, users, and role assignments.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tiles.map(t => (
            <Link key={t.to} to={t.to} className="rounded-xl border bg-white p-4 hover:shadow">
              <div className="text-lg font-medium">{t.title}</div>
              <div className="text-sm text-gray-600 mt-1">{t.desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
