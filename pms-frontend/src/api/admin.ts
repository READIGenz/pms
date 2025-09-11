import { api } from './client';

export const adminApi = {
  createProject: (data: { code: string; name: string; city: string; stage: string; status?: string; health?: string }) =>
    api.post('/admin/projects', data).then(r => r.data),
  searchProjects: (q: string) =>
    api.get('/admin/projects', { params: { q } }).then(r => r.data),
  searchUsers: (q: string) =>
    api.get('/admin/users', { params: { q } }).then(r => r.data),
  listAssignments: (projectId: string) =>
    api.get('/admin/assignments', { params: { projectId } }).then(r => r.data),
  assign: (data: { projectId: string; userId: string; role: string }) =>
    api.post('/admin/assignments', data).then(r => r.data),
  removeAssignment: (id: string) =>
    api.delete('/admin/assignments', { params: { id } }).then(r => r.data),
};
