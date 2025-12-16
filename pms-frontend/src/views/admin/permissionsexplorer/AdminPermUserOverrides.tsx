// src/admin/permissionsexplorer/AdminPermUserOverrides.tsx
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../api/client';
import type { RoleKey } from '../../../api/adminPermissions';
import { getRoleBaseMatrix } from '../permissions/AdminPermProjectOverrides';


/* ========================= Local types ========================= */
type Actions = 'view' | 'raise' | 'review' | 'approve' | 'close';
type ModuleCode =
  | 'WIR' | 'MIR' | 'CS' | 'DPR' | 'MIP' | 'DS'
  | 'RFC' | 'OBS' | 'DLP' | 'LTR' | 'FDB' | 'MAITRI' | 'DASHBOARD';
type DenyValue = 'inherit' | 'deny';

// Deny-only (partial by design)
type UserOverrideMatrix = Partial<Record<ModuleCode, Partial<Record<Actions, DenyValue>>>>;

type ProjectLite = {
  projectId: string;
  title: string;
  code?: string | null;
  distt?: string | null;
  type?: string | null;
};

// Augmented user to carry code & role for the dropdown label
type UserLite = { userId: string; name: string; code?: string | null; role?: string | null };

/* ========================= Constants ========================= */
const ROLE_OPTIONS: RoleKey[] = ['Client', 'IH-PMT', 'Contractor', 'Consultant', 'PMC', 'Supplier'];

const MODULES: readonly ModuleCode[] = [
  'WIR', 'MIR', 'CS', 'DPR', 'MIP', 'DS', 'RFC', 'OBS', 'DLP', 'LTR', 'FDB', 'MAITRI', 'DASHBOARD'
] as const;
type ModuleKey = typeof MODULES[number];

const MODULE_LABELS: Record<ModuleKey, string> = {
  WIR: "WIR (Work Inspection Request)",
  MIR: "MIR (Material Inspection Request)",
  CS: "CS (Contractor's Submittal)",
  DPR: "DPR (Daily Progress Report)",
  MIP: "MIP (Implementation Plan)",
  DS: "DS (Design Submittal)",
  RFC: "RFC (Request For Clarification)",
  OBS: "OBS (Site Observation and NCR/CAR)",
  DLP: "DLP",
  LTR: "LTR (Letter)",
  FDB: "FDB (Feedback)",
  MAITRI: "MAITRI",
  DASHBOARD: "DASHBOARD",
} as const;

const ACTIONS: readonly Actions[] = ['view', 'raise', 'review', 'approve', 'close'] as const;
const DENY_OPTIONS: readonly DenyValue[] = ['inherit', 'deny'] as const;

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
  const [roleFilter, setRoleFilter] = useState<RoleKey | 'All'>('All');

  // data
  const [matrix, setMatrix] = useState<UserOverrideMatrix>(emptyMatrix());

  // base “inherit” matrix for the selected project + user’s role
  type AllowMatrix = Record<ModuleKey, Record<typeof ACTIONS[number], boolean>>;
  const allowEmptyRow = () => ({ view: false, raise: false, review: false, approve: false, close: false });
  const allowEmptyMatrix = (): AllowMatrix =>
    Object.fromEntries(MODULES.map(m => [m, { ...allowEmptyRow() }])) as AllowMatrix;

  const [baseAllow, setBaseAllow] = useState<AllowMatrix>(allowEmptyMatrix());

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
          code: p.code ?? p.projectCode ?? null,
          distt: p.distt ?? p.district ?? null,
          type: p.type ?? p.projectType ?? null,
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

        // apply the role filter
        const source: UserLite[] = filtered;
        const filteredByRole: UserLite[] =
          roleFilter === 'All'
            ? source
            : source.filter((u: UserLite) => {
              const raw = (u.role ?? '').trim();
              // normalize IH-PMT ↔ IH_PMT
              if (roleFilter === 'IH-PMT') return raw === 'IH_PMT';
              return raw === roleFilter;
            });

        setAssignedUsers(filteredByRole);

        if (!filteredByRole.find(u => u.userId === userId)) {
          setUserId(filteredByRole[0]?.userId ?? '');
        }
      } catch (e: any) {
        setAssignedUsers([]);
        setUserId('');
        setToast(`Failed to load project assignments: ${e?.message ?? e}`);
        setTimeout(() => setToast(null), 3000);
      }
    })();
  }, [projectId, users, roleFilter]);

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

  useEffect(() => {
    // Need project, user, and the user’s ROLE for this project
    if (!projectId || !userId) { setBaseAllow(allowEmptyMatrix()); return; }

    // Find the selected user’s role from assignedUsers (it was already attached in your earlier effect)
    const roleRaw = assignedUsers.find(u => u.userId === userId)?.role ?? '';
    const rolePretty = roleRaw === 'IH_PMT' ? 'IH-PMT' : roleRaw;
    const roleKey = (rolePretty || 'Client') as RoleKey; // fallback to something safe

    (async () => {
      try {
        const mat = await getRoleBaseMatrix(projectId, roleKey);
        // map Matrix -> AllowMatrix (same shape booleans)
        const mapped = MODULES.reduce((acc, mod) => {
          acc[mod] = ACTIONS.reduce((row, act) => {
            row[act] = !!mat?.[mod]?.[act];
            return row;
          }, {} as Record<typeof ACTIONS[number], boolean>);
          return acc;
        }, {} as AllowMatrix);
        setBaseAllow(mapped);
      } catch {
        setBaseAllow(allowEmptyMatrix());
      }
    })();
  }, [projectId, userId, assignedUsers]);

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
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-yellow-50 dark:from-neutral-900 dark:to-neutral-950 px-4 sm:px-6 lg:px-10 py-8 rounded-2xl">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <header className="space-y-4">
          <div>
            <h1 className="text-2xl font-semibold dark:text-white">
              Modules &amp; Permissions — User Overrides
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Fine-tune module permissions for specific users.
            </p>
          </div>

          {/* Controls row */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            {/* Left: project / role / user selects */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Project selector */}
              <div className="relative inline-flex items-center min-w-48">
                <select
                  className="h-9 w-full rounded-full border border-emerald-300/70 bg-white/90 px-3 pr-8 text-xs font-medium text-slate-800 shadow-[0_0_0_1px_rgba(16,185,129,0.12)] focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent appearance-none dark:bg-neutral-900 dark:text-white dark:border-emerald-500/70 dark:shadow-[0_0_0_1px_rgba(45,212,191,0.25)]"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  aria-label="Select Project"
                  disabled={!projects.length}
                >
                  {!projects.length && <option value="">No projects</option>}
                  {projects.length > 0 && !projectId && (
                    <option value="">— Select a project —</option>
                  )}
                  {projects.map((p) => {
                    const tip = [
                      p.code ? `Code: ${p.code}` : null,
                      `Title: ${p.title}`,
                      `Distt: ${p.distt ?? '-'}`,
                      `Type: ${p.type ?? '-'}`,
                    ].filter(Boolean).join(' | ');

                    return (
                      <option key={p.projectId} value={p.projectId} title={tip}>
                        {p.title}
                      </option>
                    );
                  })}
                </select>
                <span className="pointer-events-none absolute right-2 text-emerald-500/80 dark:text-emerald-300/80">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 8l5 5 5-5" />
                  </svg>
                </span>
              </div>

              {/* Role filter */}
              <div className="relative inline-flex items-center min-w-32">
                <select
                  className="h-9 w-full rounded-full border border-slate-200 bg-white/90 px-3 pr-8 text-xs font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent appearance-none dark:bg-neutral-900 dark:text-white dark:border-neutral-700"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as RoleKey | 'All')}
                  aria-label="Filter by Role"
                  disabled={!projects.length}
                  title="Filter the users list by role on this project"
                >
                  <option value="All">All Roles</option>
                  {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <span className="pointer-events-none absolute right-2 text-slate-400 dark:text-slate-500">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 8l5 5 5-5" />
                  </svg>
                </span>
              </div>

              {/* User selector — ONLY assigned users */}
              <div className="relative inline-flex items-center min-w-56">
                <select
                  className="h-9 w-full rounded-full border border-slate-200 bg-white/90 px-3 pr-8 text-xs font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent appearance-none dark:bg-neutral-900 dark:text-white dark:border-neutral-700"
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
                    const rolePretty = rawRole === 'IH_PMT' ? 'IH-PMT' : rawRole;

                    const left = [code, name].filter(Boolean).join(' - ');
                    const right = roleFilter === 'All' && rolePretty ? ` (${rolePretty})` : '';
                    const label = `${left}${right}`;
                    return (
                      <option key={u.userId} value={u.userId}>
                        {label}
                      </option>
                    );
                  })}
                </select>
                <span className="pointer-events-none absolute right-2 text-slate-400 dark:text-slate-500">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 8l5 5 5-5" />
                  </svg>
                </span>
              </div>
            </div>

            {/* Right: actions */}
            <div className="flex flex-wrap items-center gap-2 justify-end">
              <button
                className="h-9 rounded-full bg-emerald-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                onClick={onSave}
                disabled={!canSave}
              >
                {saving ? 'Saving…' : 'Save Overrides'}
              </button>
              <button
                className="h-9 rounded-full border border-slate-200 bg-white px-4 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60 dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
                onClick={onReset}
                disabled={!projectId || !userId || loading}
              >
                Clear all to Inherit
              </button>
            </div>
          </div>
        </header>

        {/* Toast */}
        {toast && (
          <div className="rounded-full border border-emerald-200/70 bg-emerald-50/90 px-3 py-2 text-xs text-emerald-800 shadow-sm dark:border-emerald-800/70 dark:bg-emerald-900/40 dark:text-emerald-200">
            {toast}
          </div>
        )}

        {/* Grid + explanation */}
        <section className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border border-slate-200/80 dark:border-neutral-800 overflow-hidden">
          <div className="overflow-x-auto thin-scrollbar">
            <table className="min-w-full text-[13px] border-separate border-spacing-0">
              <thead className="sticky top-0 z-10 bg-gray-50/90 backdrop-blur dark:bg-neutral-800/95">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold text-xs uppercase tracking-wide text-slate-600 border-b border-slate-200 dark:text-slate-200 dark:border-neutral-700">
                    Module
                  </th>
                  {ACTIONS.map((a) => (
                    <th
                      key={a}
                      className="px-3 py-2.5 font-semibold text-xs uppercase tracking-wide text-slate-600 text-center border-b border-slate-200 dark:text-slate-200 dark:border-neutral-700"
                    >
                      {a}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MODULES.map((m) => (
                  <tr
                    key={m}
                    className="border-b border-slate-100/80 dark:border-neutral-800 hover:bg-slate-50/60 dark:hover:bg-neutral-800/60"
                  >
                    <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100 whitespace-nowrap">
                      {MODULE_LABELS[m]}
                    </td>
                    {ACTIONS.map((a) => (
                      <td
                        key={a}
                        className="px-3 py-2.5 text-center align-middle"
                      >
                        {m === 'LTR' && (a === 'review' || a === 'approve') ? (
                          <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                        ) : (
                          <div className="inline-flex items-center gap-3">
                            {/* Base allow chip */}
                            <span
                              className={
                                'text-[10px] rounded-full px-2 py-0.5 border ' +
                                (baseAllow[m][a]
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/40 dark:border-emerald-700 dark:text-emerald-200'
                                  : 'bg-gray-50 border-gray-200 text-gray-600 dark:bg-neutral-800 dark:border-neutral-700 dark:text-gray-300')
                              }
                              title={`Project/role matrix value: ${baseAllow[m][a] ? 'Yes' : 'No'}`}
                            >
                              {baseAllow[m][a] ? 'Yes' : 'No'}
                            </span>

                            {/* Inherit / Deny radios */}
                            <div className="inline-flex items-center gap-2">
                              {DENY_OPTIONS.map((opt) => {
                                const checked = safeGet(matrix, m, a) === opt;
                                const id = `${m}-${a}-${opt}`;
                                return (
                                  <label
                                    key={opt}
                                    htmlFor={id}
                                    className="inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <input
                                      id={id}
                                      type="radio"
                                      name={`${m}-${a}`}
                                      value={opt}
                                      checked={checked}
                                      onChange={() => onChangeCell(m, a, opt)}
                                      aria-label={`${MODULE_LABELS[m]} ${a} ${opt}`}
                                      className="h-3.5 w-3.5 text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <span className="text-[11px] capitalize text-slate-700 dark:text-slate-200">
                                      {opt}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Explanation line at the bottom, after table */}
          <div className="border-t border-slate-200 dark:border-neutral-800 px-4 py-2.5">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              User overrides are deny-only. Leaving a cell as inherit keeps the role template/project override in effect. Letters (LTR) cannot be set to review or approve.
            </p>
          </div>
        </section>

        {/* Thin scrollbar styling for this page (for horizontal scroll) */}
        <style>
          {`
            .thin-scrollbar::-webkit-scrollbar {
              height: 6px;
              width: 6px;
            }
            .thin-scrollbar::-webkit-scrollbar-track {
              background: transparent;
            }
            .thin-scrollbar::-webkit-scrollbar-thumb {
              background-color: rgba(148, 163, 184, 0.7);
              border-radius: 999px;
            }
            .thin-scrollbar::-webkit-scrollbar-thumb:hover {
              background-color: rgba(100, 116, 139, 0.9);
            }
          `}
        </style>
      </div>
    </div>
  );
}
