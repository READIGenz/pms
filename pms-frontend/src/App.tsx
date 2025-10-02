// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './views/Login';
import AdminHome from './views/admin/AdminHome';
import Users from './views/admin/users/Users';
import UserCreate from "./views/admin/users/UserCreate";
import UserEdit from "./views/admin/users/UserEdit";
import Projects from './views/admin/projects/Projects';
import ProjectCreate from "./views/admin/projects/ProjectCreate";
import ProjectEdit from "./views/admin/projects/ProjectEdit";
import Companies from './views/admin/companies/Companies';
import CompanyCreate from './views/admin/companies/CompanyCreate';
import CompanyEdit from './views/admin/companies/CompanyEdit';
import Assignments from './views/admin/assignments/Assignments';
import Permissions from './views/admin/permissions/Permissions';
import AdminPermTemplates from './views/admin/permissions/AdminPermTemplates';
import AdminPermProjectOverrides from './views/admin/permissions/AdminPermProjectOverrides';
import PermissionExplorer from './views/admin/PermissionExplorer';
import ActivityLib from './views/admin/ActivityLib';
import MaterialLib from './views/admin/MaterialLib';
import ChecklistLib from './views/admin/ChecklistLib';

// Role homes (create these files or swap with your actual components)
import ClientHome from './views/client/clientHome';
import IHPmtHome from './views/ihpmt/ihpmtHome';
import ContractorHome from './views/contractor/contractorHome';
import ConsultantHome from './views/consultant/consultantHome';
import SupplierHome from './views/supplier/supplierHome';
import PMCHome from './views/pmc/pmcHome';

// Optional generic landing
function Landing() {
  return <div className="p-6">Welcome</div>;
}

function RequireAuth({ children }: { children: JSX.Element }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* default */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />

        {/* Admin area */}
        <Route
          path="/admin"
          element={<RequireAuth><AdminHome /></RequireAuth>}
        >
          <Route index element={<div className="p-4">Dashboard</div>} />
          <Route path="users" element={<Users />} />
          <Route path="users/:id" element={<Users />} />
          <Route path="users/new" element={<UserCreate />} />
          <Route path="users/:id/edit" element={<UserEdit />} />

          <Route path="projects" element={<Projects />} />
          <Route path="projects/:id" element={<Projects />} />
          <Route path="projects/new" element={<ProjectCreate />} />
          <Route path="projects/:id/edit" element={<ProjectEdit />} />

          <Route path="companies" element={<Companies />} />
          <Route path="companies/:id" element={<Companies />} />
          <Route path="companies/new" element={<CompanyCreate />} />
          <Route path="companies/:id/edit" element={<CompanyEdit />} />

          {/* 👇 NEW: assignments use a param route; base redirects to 'clients' */}
          <Route path="assignments" element={<Navigate to="clients" replace />} />
          <Route path="assignments/:role" element={<Assignments />} />

          <Route path="permissions" element={<Permissions />} />
          <Route path="permissions/templates" element={<AdminPermTemplates />} />
          <Route path="permissions/project-overrides" element={<AdminPermProjectOverrides />} />
          
          <Route path="permission-explorer" element={<PermissionExplorer />} />
          <Route path='activityLib' element={<ActivityLib />} />
          <Route path="materialLib" element={<MaterialLib />} />
          <Route path="checkListLib" element={<ChecklistLib />} />
          {/* when no child path picked */}
        </Route>

        {/* Role-based homes */}
        <Route path="/clientHome" element={<RequireAuth><ClientHome /></RequireAuth>} />
        <Route path="/ihpmtHome" element={<RequireAuth><IHPmtHome /></RequireAuth>} />
        <Route path="/contractorHome" element={<RequireAuth><ContractorHome /></RequireAuth>} />
        <Route path="/consultantHome" element={<RequireAuth><ConsultantHome /></RequireAuth>} />
        <Route path="/supplierHome" element={<RequireAuth><SupplierHome /></RequireAuth>} />
        <Route path="/pmcHome" element={<RequireAuth><PMCHome /></RequireAuth>} />

        {/* Fallback generic landing (if you use /landing in Login.tsx fallback) */}
        <Route path="/landing" element={<RequireAuth><Landing /></RequireAuth>} />

        {/* catch-all */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
