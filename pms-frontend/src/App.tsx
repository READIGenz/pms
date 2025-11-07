// pms-frontend/src/App.tsx
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
import AdminPermUserOverrides from './views/admin/permissionsexplorer/AdminPermUserOverrides';
import ActivityLib from './views/admin/ref/activitylib/ActivityLib';
import ActivityEdit from './views/admin/ref/activitylib/ActivityEdit';
import ActivityCreate from './views/admin/ref/activitylib/ActivityCreate';
import MaterialLib from './views/admin/ref/materiallib/MaterialLib';
import { MaterialNewPage, MaterialEditPage } from './views/admin/ref/materiallib/MaterialForm';

import ChecklistLib from './views/admin/ref/checklistlib/ChecklistLib';
import { ChecklistEditPage, ChecklistNewPage } from './views/admin/ref/checklistlib/ChecklistForm';
import ModuleSettingsLayout from './views/admin/moduleSettings/ModuleSettingsLayout';
import Audit from './views/admin/Audit';

// Unified Home
import HomeLayout from './views/home/HomeLayout';
import Welcome from './views/home/Welcome';
import Tiles from './views/home/Tiles';
import MyProjects from './views/home/MyProjects';
import WIR_Contractor from './views/home/modules/WIR/WIR.Contractor';
import WIR_PMC from './views/home/modules/WIR/WIR.PMC';
import WIR_IHPMT from './views/home/modules/WIR/WIR.IHPMT';
import WIR_Client from './views/home/modules/WIR/WIR.Client';

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
        <Route path="/admin" element={<RequireAuth><AdminHome /></RequireAuth>}>
          <Route index element={<div className="p-4">Dashboard</div>} />
          <Route path="users" element={<Users />} />
          <Route path="users/:id" element={<Users />} />
          <Route path="users/new" element={<UserCreate />} />
          <Route path="users/:id/edit" element={<UserEdit />} />

          <Route path="projects" element={<Projects />} />
          <Route path="projects/:id" element={<Projects />} />
          <Route path="projects/new" element={<ProjectCreate />} />
          <Route path="projects/:id/edit" element={<ProjectEdit />} />

          {/* companies */}
          <Route path="companies" element={<Companies />} />
          <Route path="companies/:id" element={<Companies />} />
          <Route path="companies/new" element={<CompanyCreate />} />
          <Route path="companies/:id/edit" element={<CompanyEdit />} />

          {/* assignments */}
          <Route path="assignments" element={<Navigate to="clients" replace />} />
          <Route path="assignments/:role" element={<Assignments />} />

          {/* permissions */}
          <Route path="permissions" element={<Permissions />} />
          <Route path="permissions/templates" element={<AdminPermTemplates />} />
          <Route path="permissions/project-overrides" element={<AdminPermProjectOverrides />} />

          <Route path="permission-explorer" element={<AdminPermUserOverrides />} />

          {/* refs */}
          <Route path="ref/activitylib" element={<ActivityLib />} />
          <Route path="ref/activitylib/:id/edit" element={<ActivityEdit />} />
          <Route path="ref/activitylib/new" element={<ActivityCreate />} />

          <Route path="ref/materiallib" element={<MaterialLib />} />
          <Route path="ref/materiallib/new" element={<MaterialNewPage />} />
          <Route path="ref/materiallib/:id/edit" element={<MaterialEditPage />} />

          <Route path="ref/checklistlib" element={<ChecklistLib />} />
          <Route path="ref/checklistlib/new" element={<ChecklistNewPage />} />
          <Route path="ref/checklistlib/:id/edit" element={<ChecklistEditPage />} />

          <Route path="module-settings" element={<ModuleSettingsLayout />} />
          <Route path="audit" element={<Audit />} />
        </Route>

        {/* Unified role-aware Home */}
        <Route path="/home" element={<RequireAuth><HomeLayout /></RequireAuth>}>
          <Route index element={<Welcome />} />
          <Route path="tiles" element={<Tiles />} />
          <Route path="my-projects" element={<MyProjects />} />
          <Route path="contractor/projects/:projectId/wir" element={<WIR_Contractor />} />
          <Route path="pmc/projects/:projectId/wir" element={<WIR_PMC />} />
          <Route path="ihpmt/projects/:projectId/wir" element={<WIR_IHPMT />} />
          <Route path="client/projects/:projectId/wir" element={<WIR_Client />} />
        </Route>

        {/* Fallback */}
        <Route path="/landing" element={<RequireAuth><Landing /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
