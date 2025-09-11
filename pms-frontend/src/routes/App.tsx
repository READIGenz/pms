/**
 * routes/App.tsx
 * --------------
 * Adds /admin and admin subroutes.
 */
import { Route, Routes, Navigate, useLocation } from 'react-router-dom';
import Login from '../views/Login';
import Landing from '../views/Landing';
import MyProjects from '../views/MyProjects';
import ProjectDetails from '../views/ProjectDetails';

import AdminHome from '../views/admin/AdminHome';
import AdminProjectNew from '../views/admin/ProjectNew';
import AdminUserNew from '../views/admin/UserNew';
import AdminRolesView from '../views/admin/RolesView';
import AdminAssignRoles from '../views/admin/AssignRoles';

import ProjectsList from '../views/admin/ProjectList';
import UsersList from '../views/admin/UsersList';

function decode(token: string): any | null {
  try {
    const [, b] = token.split('.');
    if (!b) return null;
    const f = b.replace(/-/g, '+').replace(/_/g, '/');
    const pad = f.length % 4 ? '='.repeat(4 - (f.length % 4)) : '';
    return JSON.parse(atob(f + pad));
  } catch { return null; }
}

function Private({ children }: { children: JSX.Element }) {
  const token = localStorage.getItem('token');
  const loc = useLocation();
  return token ? children : <Navigate to="/login" state={{ from: loc }} replace />;
}

function AdminOnly({ children }: { children: JSX.Element }) {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const payload = token ? decode(token) : null;
  const isAdmin = !!(payload && payload.isSuperAdmin) || !!user?.isSuperAdmin;
  return isAdmin ? children : <Navigate to="/landing" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* regular protected pages */}
      <Route path="/landing" element={<Private><Landing /></Private>} />
      <Route path="/projects" element={<Private><MyProjects /></Private>} />
      <Route path="/projects/:id" element={<Private><ProjectDetails /></Private>} />

      {/* admin area */}
      <Route path="/admin" element={
        <Private><AdminOnly><AdminHome /></AdminOnly></Private>
      } />
      <Route path="/admin/projects/new" element={
        <Private><AdminOnly><AdminProjectNew /></AdminOnly></Private>
      } />
      <Route path="/admin/users/new" element={
        <Private><AdminOnly><AdminUserNew /></AdminOnly></Private>
      } />
      <Route path="/admin/roles" element={
        <Private><AdminOnly><AdminRolesView /></AdminOnly></Private>
      } />
      <Route path="/admin/assign" element={
        <Private><AdminOnly><AdminAssignRoles /></AdminOnly></Private>
      } />
      {/* NEW list pages */}
      <Route path="/admin/projects" element={<Private><AdminOnly><ProjectsList /></AdminOnly></Private>} />
      <Route path="/admin/users" element={<Private><AdminOnly><UsersList /></AdminOnly></Private>} />

      <Route path="*" element={<Navigate to="/login" replace />} />
      <Route path="/admin" element={
        <Private><AdminOnly><AdminHome /></AdminOnly></Private>} />
    </Routes>
  );
}
