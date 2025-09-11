import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './views/Login';
import Landing from './views/Landing';
import MyProjects from './views/MyProjects';
import ProjectDetails from './views/ProjectDetails';
import AdminHome from './views/admin/AdminHome';

import RequireAuth from './components/RequireAuth';
import RequireAdmin from './components/RequireAdmin';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />

        {/* Protected area */}
        <Route element={<RequireAuth />}>
          <Route path="/landing" element={<Landing />} />
          <Route path="/projects" element={<MyProjects />} />
          <Route path="/projects/:id" element={<ProjectDetails />} />

          {/* Admin-only */}
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <AdminHome />
              </RequireAdmin>
            }
          />
        </Route>

        <Route path="*" element={<div style={{ padding: 20 }}>404</div>} />
      </Routes>
    </BrowserRouter>
  );
}
