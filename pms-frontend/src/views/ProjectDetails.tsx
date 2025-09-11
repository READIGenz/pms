import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { endpoints } from '../api/endpoints';

export default function ProjectDetails(){
  const { id } = useParams();
  const { data: me } = useQuery({ queryKey:['me'], queryFn: async()=> (await api.get(endpoints.me)).data });
  const { data: modules } = useQuery({ queryKey:['modules', id], enabled: !!id, queryFn: async()=> (await api.get(endpoints.projectModules(id!))).data });

  const project = (me?.projects ?? []).find((p:any)=> p.projectId === id);

  return (
    <div className="min-h-screen p-6 space-y-6">
      <div className="space-y-1">
        <div className="text-2xl font-semibold">{project?.name}</div>
        <div className="text-sm text-gray-600">{project?.code} • {project?.city}</div>
        <div className="text-sm"><b>Status:</b> {project?.status} • <b>Stage:</b> {project?.stage} • <b>Health:</b> {project?.health}</div>
        <div className="text-xs text-gray-500">Role: {me?.role}</div>
      </div>
      <h3 className="text-lg font-semibold">Modules</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {(modules ?? []).map((m:string)=>(<div key={m} className="p-4 rounded-xl border bg-white">{m}</div>))}
      </div>
    </div>
  );
}
