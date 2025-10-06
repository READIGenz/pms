// src/views/admin/permissions/AdminPermTempProjectOverrides.tsx

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Matrix, RoleKey } from '../../../api/adminPermissions';
import {
  listProjects,
  getProjectOverride,
  saveProjectOverride,
  resetProjectOverride,
} from '../../../api/adminPermissions';

const MODULES = ['WIR','MIR','CS','DPR','MIP','DS','RFC','OBS','DLP','LTR','FDB','MAITRI','DASHBOARD'] as const;
const ACTIONS = ['view','raise','review','approve','close'] as const;

// Match your reference: title-case + "IH-PMT"
const ROLE_OPTIONS: RoleKey[] = ['Client','IH-PMT','Contractor','Consultant','PMC','Supplier'];

const emptyRow = () => ({ view:false, raise:false, review:false, approve:false, close:false });
const emptyMatrix = () =>
  Object.fromEntries(MODULES.map(m => [m, { ...emptyRow() }])) as Matrix;

export default function AdminPermProjectOverrides() {
  const navigate = useNavigate();

  const [projects, setProjects] = useState<{projectId:string; title:string}[]>([]);
  const [projectId, setProjectId] = useState<string>('');
  const [role, setRole] = useState<RoleKey>('Client');

  const [matrix, setMatrix] = useState<Matrix>(emptyMatrix());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Load projects once
  useEffect(() => {
    (async () => {
      try {
        const ps = await listProjects();
        setProjects(ps);
        if (ps.length) setProjectId(ps[0].projectId);
        if (!ps.length) setToast('No projects found. Create one first.');
      } catch (e: any) {
        setToast(`Projects load failed: ${e?.message ?? e}`);
      } finally {
        setTimeout(() => setToast(null), 4000);
      }
    })();
  }, []);

  // Load current override whenever project or role changes
  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    getProjectOverride(projectId, role)
      .then((mat) => setMatrix(mat ?? emptyMatrix()))
      .catch(() => setMatrix(emptyMatrix()))
      .finally(() => setLoading(false));
  }, [projectId, role]);

  const toggle = (mod: typeof MODULES[number], action: typeof ACTIONS[number]) => {
    setMatrix(prev => {
      const next = structuredClone(prev);
      if (mod === 'LTR' && (action === 'review' || action === 'approve')) {
        next[mod].review = false; next[mod].approve = false;
        return next;
      }
      next[mod][action] = !next[mod][action];
      return next;
    });
  };

  const canSave = useMemo(() => !!projectId && !loading && !saving, [projectId, loading, saving]);

  const onSave = async () => {
    if (!projectId) return;
    setSaving(true);
    try {
      const m = structuredClone(matrix);
      m.LTR.review = false; m.LTR.approve = false;
      await saveProjectOverride(projectId, role, m);
      setToast('Override saved.');
    } catch (e:any) {
      setToast(`Save failed: ${e.message ?? e}`);
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const onReset = async () => {
    if (!projectId) return;
    setSaving(true);
    try {
      const m = await resetProjectOverride(projectId, role);
      m.LTR.review = false; m.LTR.approve = false;
      setMatrix(m);
      setToast('Reset to role template.');
    } catch (e:any) {
      setToast(`Reset failed: ${e.message ?? e}`);
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Modules & Permissions — Project Overrides</h1>
        <div className="flex flex-wrap items-center gap-3">
          {/* Back button (top-right) */}
          <button
            type="button"
            onClick={() => navigate('/admin/permissions')}
            className="rounded-2xl px-4 py-2 border"
            aria-label="Back to Permissions"
            title="Back to Permissions"
          >
            Back
          </button>

          <select
            className="border rounded-xl px-3 py-2"
            value={projectId}
            onChange={(e)=>setProjectId(e.target.value)}
            aria-label="Select Project"
            disabled={!projects.length}
          >
            {!projects.length && <option value="">No projects</option>}
            {projects.map(p => <option key={p.projectId} value={p.projectId}>{p.title}</option>)}
          </select>

          <select
            className="border rounded-xl px-3 py-2"
            value={role}
            onChange={(e)=>setRole(e.target.value as RoleKey)}
            aria-label="Select Role"
            disabled={!projects.length}
          >
            {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>

          <button
            className="rounded-2xl px-4 py-2 bg-indigo-600 text-white disabled:opacity-50"
            onClick={onSave}
            disabled={!canSave}
          >
            {saving ? 'Saving…' : 'Save Override'}
          </button>
          <button
            className="rounded-2xl px-4 py-2 border disabled:opacity-50"
            onClick={onReset}
            disabled={!projectId || loading || !projects.length}
          >
            Reset to Role Template
          </button>
        </div>
      </header>

      {toast && <div className="text-sm text-amber-700">{toast}</div>}

      {!projects.length ? (
        <div className="rounded-xl border p-6 text-sm text-gray-600">
          No projects found. Create a project in Admin → Projects, then come back.
        </div>
      ) : (
        <>
          <section className="overflow-auto rounded-2xl border">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Module</th>
                  {ACTIONS.map(a => (
                    <th key={a} className="px-3 py-3 font-medium text-center capitalize">{a}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MODULES.map((m) => (
                  <tr key={m} className="border-t">
                    <td className="px-4 py-3 font-medium">{m}</td>
                    {ACTIONS.map(a => (
                      <td key={a} className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={!!matrix?.[m]?.[a]}
                          onChange={() => toggle(m, a)}
                          aria-label={`${m} ${a}`}
                          disabled={!projectId}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <p className="text-xs text-gray-500">
            Note: Letters (LTR) cannot be set to <b>review</b> or <b>approve</b>. Those are automatically disabled.
          </p>
        </>
      )}
    </div>
  );
}
