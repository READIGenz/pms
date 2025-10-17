// src/views/admin/permissions/AdminPermTemplates.tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTemplate, listTemplates, saveTemplate, Matrix, RoleKey } from '../../../api/adminPermissions';

// Internal keys stay the same
const MODULES = ['WIR','MIR','CS','DPR','MIP','DS','RFC','OBS','DLP','LTR','FDB','MAITRI','DASHBOARD'] as const;
type ModuleKey = typeof MODULES[number];

const MODULE_LABELS: Record<ModuleKey, string> = {
  WIR: "WIR (Work Inspection Request)",
  MIR: "MIR (Material Inspection Request)",
  CS:  "CS (Contractor's Submittal)",
  DPR: "DPR (Daily Progress Report)",
  MIP: "MIP (Implementation Plan)",
  DS:  "DS (Design Submittal)",
  RFC: "RFC (Request For Clarification)",
  OBS: "OBS (Site Observation and NCR/CAR)",
  DLP: "DLP",
  LTR: "LTR (Letter)",
  FDB: "FDB (Feedback)",
  MAITRI: "MAITRI",
  DASHBOARD: "DASHBOARD",
} as const;

const ACTIONS = ['view','raise','review','approve','close'] as const;

// Adjust to your public labels (e.g., "IH-PMT" if you expose hyphenated):
const ROLE_OPTIONS: RoleKey[] = ['Client','IH-PMT','Contractor','Consultant','PMC','Supplier'];

const emptyRow = () => ({ view:false, raise:false, review:false, approve:false, close:false });
const emptyMatrix = () =>
  Object.fromEntries(MODULES.map(m => [m, { ...emptyRow() }])) as Matrix;

export default function AdminPermTemplates() {
  const navigate = useNavigate();

  const [role, setRole] = useState<RoleKey>('Client');
  const [matrix, setMatrix] = useState<Matrix>(emptyMatrix());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { listTemplates().catch(()=>{}); }, []);

  useEffect(() => {
    setLoading(true);
    getTemplate(role)
      .then(row => setMatrix(row.matrix))
      .catch(() => setMatrix(emptyMatrix()))
      .finally(() => setLoading(false));
  }, [role]);

  const toggle = (mod: ModuleKey, action: typeof ACTIONS[number]) => {
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

  const canSave = useMemo(() => !loading && !saving, [loading, saving]);

  const onSave = async () => {
    setSaving(true);
    try {
      const m = structuredClone(matrix);
      m.LTR.review = false; m.LTR.approve = false;
      await saveTemplate(role, m);
      setToast('Saved successfully.');
    } catch (e: any) {
      setToast(`Save failed: ${e?.message ?? e} (role=${role})`);
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Modules & Permissions — Role Templates</h1>
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
            value={role}
            onChange={(e)=>setRole(e.target.value as RoleKey)}
            aria-label="Select Role"
          >
            {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>

          <button
            className="rounded-2xl px-4 py-2 bg-indigo-600 text-white disabled:opacity-50"
            onClick={onSave}
            disabled={!canSave}
          >
            {saving ? 'Saving…' : 'Save Template'}
          </button>
        </div>
      </header>

      {toast && <div className="text-sm text-green-700">{toast}</div>}

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
                <td className="px-4 py-3 font-medium">{MODULE_LABELS[m]}</td>
                {ACTIONS.map(a => (
                  <td key={a} className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={!!matrix?.[m]?.[a]}
                      onChange={() => toggle(m, a)}
                      aria-label={`${MODULE_LABELS[m]} ${a}`}
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
    </div>
  );
}
