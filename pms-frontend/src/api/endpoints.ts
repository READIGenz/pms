/**
 * api/endpoints.ts
 * ----------------
 * Centralized endpoint strings for consistent usage across UI.
 */
export const endpoints = {
  health: '/healthz',
  userExists: '/auth/exists',
  //otpRequest: '/auth/otp/request',
  otpVerify: '/auth/otp/verify',
  me: '/me',
  myKpis: '/me/kpis',
  myProjects: '/my/projects',
  // admin (suggested backend paths)
  admin: {
    projects: '/admin/projects',                     // POST (create), GET (list)
    users: '/admin/users',                           // POST (create), GET (list)
    rolesCatalog: '/admin/roles/catalog',            // GET: return list of allowed roles
    rolesOverview: '/admin/roles/overview',          // GET: counts by role, etc. (optional)
    projectRoles: (projectId: string) => `/admin/projects/${projectId}/roles`,     // GET current assignments
    assignRoles: (projectId: string) => `/admin/projects/${projectId}/assign-roles`, // POST bulk assign
    usersNextCode: '/admin/users/next-code',
     userStatus:   (id: string) => `/admin/users/${id}/status`,
     userProjects: (userId: string) => `/admin/users/${userId}/projects`,
  },
  projectModules: (id: string) => `/projects/${id}/modules`,
};
