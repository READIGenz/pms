import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import ConfirmModal from '../../components/ConfirmModal';

const STATUS = ['Ongoing','Completed'] as const;
const STAGE  = ['Construction','Fitout','Design'] as const;
const HEALTH = ['Good','At Risk','Delayed'] as const;

export default function AdminProjectNew(){
  const nav = useNavigate();
  const [form, setForm] = useState({
    code: '', name: '', city: '',
    status: STATUS[0], stage: STAGE[0], health: HEALTH[0],
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string|null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm(s => ({...s, [k]: v}));

  const submit = async () => {
    setErr(null);
    if(!form.code || !form.name || !form.city) { setErr('Code, Name, City are required'); return; }
    try{
      setBusy(true);
      const { data } = await api.post(endpoints.admin.projects, form);
      if(data?.ok || data?.projectId){
        setConfirmOpen(true);
      }else{
        setErr(data?.error || 'Failed to create project');
      }
    }catch(e:any){ setErr(e?.response?.data?.error || 'Failed to create project'); }
    finally{ setBusy(false); }
  };

  const input = 'border rounded w-full p-3';
  const select = 'border rounded w-full p-3 bg-white';

  return (
    <div className="min-h-screen p-6 bg-gray-50">
      <div className="max-w-3xl mx-auto bg-white border rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Create New Project</h2>
          <button className="border rounded px-3 py-1" onClick={()=>nav(-1)}>Back</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="text-sm">Project Code</label><input className={input} value={form.code} onChange={e=>set('code', e.target.value.toUpperCase())}/></div>
          <div><label className="text-sm">Project Name</label><input className={input} value={form.name} onChange={e=>set('name', e.target.value)}/></div>
          <div><label className="text-sm">City</label><input className={input} value={form.city} onChange={e=>set('city', e.target.value)}/></div>
          <div>
            <label className="text-sm">Status</label>
            <select className={select} value={form.status} onChange={e=>set('status', e.target.value)}>
              {STATUS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm">Stage</label>
            <select className={select} value={form.stage} onChange={e=>set('stage', e.target.value)}>
              {STAGE.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm">Health</label>
            <select className={select} value={form.health} onChange={e=>set('health', e.target.value)}>
              {HEALTH.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {err && <div className="text-red-600 text-sm">{err}</div>}

        <button disabled={busy} onClick={submit} className="px-4 py-2 rounded bg-emerald-600 text-white disabled:opacity-60">
          {busy ? 'Submitting…' : 'Submit'}
        </button>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Project created"
        description="Your project was created successfully."
        onConfirm={() => nav('/admin', { replace: true })}
        onOpenChange={setConfirmOpen}
      />
    </div>
  );
}
