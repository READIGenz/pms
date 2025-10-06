// src/admin/permissionsexplorer/AdminPermUserOverrides.tsx
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../api/client';

/* ========================= Local types ========================= */
type Actions = 'view' | 'raise' | 'review' | 'approve' | 'close';
type ModuleCode =
  | 'WIR' | 'MIR' | 'CS' | 'DPR' | 'MIP' | 'DS'
  | 'RFC' | 'OBS' | 'DLP' | 'LTR' | 'FDB' | 'MAITRI' | 'DASHBOARD';
type DenyValue = 'inherit' | 'deny';

// Deny-only (partial by design)
type UserOverrideMatrix = Partial<Record<ModuleCode, Partial<Record<Actions, DenyValue>>>>;

type ProjectLite = { projectId: string; title: string };

// Augmented user to carry code & role for the dropdown label
type UserLite = { userId: string; name: string; code?: string | null; role?: string | null };

/* ========================= Constants ========================= */
const MODULES: readonly ModuleCode[] = [
  'WIR','MIR','CS','DPR','MIP','DS','RFC','OBS','DLP','LTR','FDB','MAITRI','DASHBOARD'
] as const;
const ACTIONS: readonly Actions[] = ['view','raise','review','approve','close'] as const;

const DENY_OPTIONS: readonly DenyValue[] = ['inherit','deny'] as const;

/* ========================= Helpers ========================= */
const emptyMatrix = (): UserOverrideMatrix => ({});
const safeGet = (m: UserOverrideMatrix, mod: ModuleCode, act: Actions): DenyValue =>
  (m?.[mod]?.[act] as DenyValue) || 'inherit';

function setCell(
  matrix: UserOverrideMatrix,
  mod: ModuleCode,
  act: Actions,
  val: DenyValue,
): UserOverrideMatrix {
  const copy: UserOverrideMatrix = structuredClone(matrix ?? {});
  copy[mod] = copy[mod] || {};
  if (val === 'inherit') {
    delete (copy[mod] as any)[act];
    if (Object.keys(copy[mod] as any).length === 0) delete copy[mod];
  } else {
    (copy[mod] as any)[act] = val;
  }
  if (mod === 'LTR') {
    if (copy.LTR) { delete (copy.LTR as any).review; delete (copy.LTR as any).approve; }
  }
  return copy;
}

/* ========================= Component ========================= */
export default function AdminPermUserOverrides() {
  // selectors
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [assignedUsers, setAssignedUsers] = useState<UserLite[]>([]);

  const [projectId, setProjectId] = useState<string>('');
  const [userId, setUserId] = useState<string>('');

  // data
  const [matrix, setMatrix] = useState<UserOverrideMatrix>(emptyMatrix());

  // ui
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);

  /* ------------------------- load projects & users ------------------------- */
  useEffect(() => {
    (async () => {
      try {
        // Projects
        const pr = await api.get('/admin/projects', { headers: { Accept: 'application/json' } });
        const pData = pr.data;
        const pArr = Array.isArray(pData) ? pData : (pData?.projects ?? []);
        const pList: ProjectLite[] = (pArr ?? []).map((p: any) => ({
          projectId: p.projectId ?? p.id,
          title: p.title ?? p.name ?? 'Untitled',
        })).filter((p: ProjectLite) => p.projectId && p.title);
        setProjects(pList);
        if (pList.length) setProjectId(prev => prev || pList[0].projectId);

        // Users (try brief → fallback to full)
        let uArr: any[] = [];
        try {
          const ur1 = await api.get('/admin/users', { params: { brief: 1 } });
          uArr = Array.isArray(ur1.data) ? ur1.data : (ur1.data?.users ?? []);
        } catch {
          const ur2 = await api.get('/admin/users');
          const uData = ur2.data;
          uArr = Array.isArray(uData) ? uData : (uData?.users ?? []);
        }
        const uList: UserLite[] = (uArr ?? []).map((u: any) => {
          const fullName = [u.firstName, u.middleName, u.lastName].filter(Boolean).join(' ').trim();
          const name = u.name ?? (fullName || u.email || u.phone || 'User');
          return {
            userId: u.userId ?? u.id,
            name,
            code: u.code ?? u.userCode ?? null,
            role: null, // will be filled from assignment fetch
          };
        }).filter((u: UserLite) => u.userId && u.name);
        setUsers(uList);
        if (uList.length) setUserId(prev => prev || uList[0].userId);

        if (!pList.length) setToast('No projects found. Create one first.');
        if (!uList.length) setToast(t => t ?? 'No users found.');
      } catch (e: any) {
        setToast(`Init load failed: ${e?.message ?? e}`);
      } finally {
        setTimeout(() => setToast(null), 4000);
      }
    })();
  }, []);

  /* ------------------- filter users by project assignments ------------------ */
  useEffect(() => {
    if (!projectId || users.length === 0) { setAssignedUsers([]); return; }

    (async () => {
      try {
        // Expect: { ok, projectId, assignments: [{ userId, role, ...}] }
        const { data } = await api.get(`/admin/projects/${encodeURIComponent(projectId)}/assignments`);
        const assn = Array.isArray(data?.assignments) ? data.assignments : [];
        const roleByUser: Record<string, string> = {};
        assn.forEach((a: any) => { if (a?.userId) roleByUser[a.userId] = a.role ?? roleByUser[a.userId] ?? null; });

        const assignedIds = new Set<string>(assn.map((a: any) => a.userId).filter(Boolean));
        const filtered: UserLite[] = users
          .filter(u => assignedIds.has(u.userId))
          .map(u => ({ ...u, role: roleByUser[u.userId] ?? u.role ?? null }));

        setAssignedUsers(filtered);

        if (!filtered.find(u => u.userId === userId)) {
          setUserId(filtered[0]?.userId ?? '');
        }
      } catch (e: any) {
        setAssignedUsers([]);
        setUserId('');
        setToast(`Failed to load project assignments: ${e?.message ?? e}`);
        setTimeout(() => setToast(null), 3000);
      }
    })();
  }, [projectId, users]);

  /* ------------------------- load current overrides ------------------------ */
  useEffect(() => {
    if (!projectId || !userId) return;
    setLoading(true);
    (async () => {
      try {
        const { data } = await api.get(
          `/admin/permissions/projects/${encodeURIComponent(projectId)}/users/${encodeURIComponent(userId)}/overrides`
        );
        const m = (data?.matrix ?? {}) as UserOverrideMatrix;
        if (m?.LTR) { delete (m.LTR as any).review; delete (m.LTR as any).approve; }
        setMatrix(m);
      } catch (e: any) {
        setMatrix(emptyMatrix());
        if (e?.response?.status && e.response.status !== 404) {
          setToast(`Load overrides failed: ${e?.message ?? e}`);
        }
      } finally {
        setLoading(false);
        setTimeout(() => setToast(null), 3000);
      }
    })();
  }, [projectId, userId]);

  /* ------------------------- actions ------------------------- */
  const canSave = useMemo(() => !!projectId && !!userId && !loading && !saving, [projectId, userId, loading, saving]);

  const onChangeCell = (mod: ModuleCode, act: Actions, val: DenyValue) => {
    if (mod === 'LTR' && (act === 'review' || act === 'approve')) return;
    setMatrix(prev => setCell(prev, mod, act, val));
  };

  const onSave = async () => {
    if (!projectId || !userId) return;
    setSaving(true);
    try {
      const payload = structuredClone(matrix ?? {});
      if (payload?.LTR) { delete (payload.LTR as any).review; delete (payload.LTR as any).approve; }
      await api.put(
        `/admin/permissions/projects/${encodeURIComponent(projectId)}/users/${encodeURIComponent(userId)}/overrides`,
        { matrix: payload }
      );
      setToast('Overrides saved.');
    } catch (e: any) {
      setToast(`Save failed: ${e?.response?.data?.error ?? e?.message ?? e}`);
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const onReset = async () => {
    if (!projectId || !userId) return;
    setSaving(true);
    try {
      await api.post(
        `/admin/permissions/projects/${encodeURIComponent(projectId)}/users/${encodeURIComponent(userId)}/overrides/reset`,
        {}
      );
      setMatrix(emptyMatrix());
      setToast('Cleared. All cells inherit.');
    } catch (e: any) {
      setToast(`Reset failed: ${e?.response?.data?.error ?? e?.message ?? e}`);
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  /* ------------------------- render ------------------------- */
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Modules & Permissions — User Overrides</h1>
        <div className="flex flex-wrap items-center gap-3">
          {/* Project selector */}
          <select
            className="border rounded-xl px-3 py-2"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            aria-label="Select Project"
            disabled={!projects.length}
          >
            {!projects.length && <option value="">No projects</option>}
            {projects.map((p) => (
              <option key={p.projectId} value={p.projectId}>
                {p.title}
              </option>
            ))}
          </select>

          {/* User selector — ONLY assigned users, label shows <code - full name (role)> */}
          <select
            className="border rounded-xl px-3 py-2"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            aria-label="Select User"
            disabled={!assignedUsers.length}
          >
            {!assignedUsers.length && <option value="">No assigned users</option>}
            {assignedUsers.map((u) => {
  const code = (u.code ?? '').toString().trim();
  const name = (u.name ?? '').toString().trim();

  const rawRole = (u.role ?? '').toString().trim();
  const rolePretty = rawRole === 'IH_PMT' ? 'IH-PMT' : rawRole;  // ← NEW

  const left = [code, name].filter(Boolean).join(' - ');
  const right = rolePretty ? ` (${rolePretty})` : '';
  const label = `${left}${right}`;
  return (
    <option key={u.userId} value={u.userId}>
      {label}
    </option>
  );
})}

          </select>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              className="rounded-2xl px-4 py-2 bg-indigo-600 text-white disabled:opacity-50"
              onClick={onSave}
              disabled={!canSave}
            >
              {saving ? 'Saving…' : 'Save Overrides'}
            </button>
            <button
              className="rounded-2xl px-4 py-2 border"
              onClick={onReset}
              disabled={!projectId || !userId || loading}
            >
              Clear all to Inherit
            </button>
          </div>
        </div>
      </header>

      {toast && <div className="text-sm text-emerald-700">{toast}</div>}

      {/* Grid */}
      <section className="overflow-auto rounded-2xl border">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Module</th>
              {ACTIONS.map((a) => (
                <th key={a} className="px-3 py-3 font-medium text-center capitalize">
                  {a}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODULES.map((m) => (
              <tr key={m} className="border-t">
                <td className="px-4 py-3 font-medium">{m}</td>
                {ACTIONS.map((a) => (
                  <td key={a} className="px-3 py-3 text-center">
                    {m === 'LTR' && (a === 'review' || a === 'approve') ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : (
                      <div className="inline-flex items-center gap-2">
                        {DENY_OPTIONS.map((opt) => {
                          const checked = safeGet(matrix, m, a) === opt;
                          const id = `${m}-${a}-${opt}`;
                          return (
                            <label key={opt} htmlFor={id} className="inline-flex items-center gap-1 cursor-pointer">
                              <input
                                id={id}
                                type="radio"
                                name={`${m}-${a}`}
                                value={opt}
                                checked={checked}
                                onChange={() => onChangeCell(m, a, opt)}
                              />
                              <span className="text-xs capitalize">{opt}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-gray-500">
        User overrides are <b>deny-only</b>. Leaving a cell as <i>inherit</i> keeps the role template/project override
        in effect. Letters (LTR) cannot be set to <b>review</b> or <b>approve</b>.
      </p>
    </div>
  );
}
