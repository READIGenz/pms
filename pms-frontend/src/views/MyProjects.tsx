/**
 * views/MyProjects.tsx
 * --------------------
 * Shows the KPI tiles (Total/Ongoing/Delayed/At Risk) and the clickable project cards.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { endpoints } from '../api/endpoints';
import { useNavigate } from 'react-router-dom';

export default function MyProjects(){
  const nav = useNavigate();
  const { data: kpis } = useQuery({ queryKey:['kpis'], queryFn: async()=> (await api.get(endpoints.myKpis)).data });
  const { data: projects } = useQuery({ queryKey:['my-projects'], queryFn: async()=> (await api.get(endpoints.myProjects)).data });

  return (
    <div className="min-h-screen p-6 space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPITile label="Total" value={kpis?.total ?? 0} />
        <KPITile label="Ongoing" value={kpis?.ongoing ?? 0} />
        <KPITile label="Delayed" value={kpis?.delayed ?? 0} />
        <KPITile label="At Risk" value={kpis?.atRisk ?? 0} />
      </div>

      <h2 className="text-xl font-semibold">Projects</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {(projects ?? []).map((p:any)=>(
          <button key={p.projectId} onClick={()=>nav(`/projects/${p.projectId}`)} className="text-left p-5 rounded-xl border hover:shadow space-y-1 bg-white">
            <div className="flex items-center justify-between">
              <div className="text-lg font-medium">{p.name}</div>
              <span className="text-xs px-2 py-1 rounded-full border">{p.code}</span>
            </div>
            <div className="text-sm text-gray-600">{p.city}</div>
            <div className="text-sm"><b>Status:</b> {p.status} • <b>Stage:</b> {p.stage} • <b>Health:</b> {p.health}</div>
            <div className="text-xs text-gray-500">Roles: {p.roles.join(', ')}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function KPITile({ label, value }:{label:string;value:number}){
  return (
    <div className="p-5 rounded-xl border bg-white">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
