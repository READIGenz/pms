// src/admin/permissionsexplorer/AdminPermUserOverrides.tsx
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../api/client";
import type { RoleKey } from "../../../api/adminPermissions";
import { getRoleBaseMatrix } from "../permissions/AdminPermProjectOverrides";

/* ========================= Local types ========================= */
type Actions = "view" | "raise" | "review" | "approve" | "close";
type ModuleCode =
  | "WIR"
  | "MIR"
  | "CS"
  | "DPR"
  | "MIP"
  | "DS"
  | "RFC"
  | "OBS"
  | "DLP"
  | "LTR"
  | "FDB"
  | "MAITRI"
  | "DASHBOARD";
type DenyValue = "inherit" | "deny";

// Deny-only (partial by design)
type UserOverrideMatrix = Partial<
  Record<ModuleCode, Partial<Record<Actions, DenyValue>>>
>;

type ProjectLite = {
  projectId: string;
  title: string;
  code?: string | null;
  distt?: string | null;
  type?: string | null;
};

// Augmented user to carry code & role for the dropdown label
type UserLite = {
  userId: string;
  name: string;
  code?: string | null;
  role?: string | null;
};

/* ========================= Constants ========================= */
const ROLE_OPTIONS: RoleKey[] = [
  "Client",
  "IH-PMT",
  "Contractor",
  "Consultant",
  "PMC",
  "Supplier",
];

const MODULES: readonly ModuleCode[] = [
  "WIR",
  "MIR",
  "CS",
  "DPR",
  "MIP",
  "DS",
  "RFC",
  "OBS",
  "DLP",
  "LTR",
  "FDB",
  "MAITRI",
  "DASHBOARD",
] as const;
type ModuleKey = (typeof MODULES)[number];

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

const ACTIONS: readonly Actions[] = ["view", "raise", "review", "approve", "close"] as const;
const DENY_OPTIONS: readonly DenyValue[] = ["inherit", "deny"] as const;

/* ========================= Helpers ========================= */
const emptyMatrix = (): UserOverrideMatrix => ({});
const safeGet = (m: UserOverrideMatrix, mod: ModuleCode, act: Actions): DenyValue =>
  (m?.[mod]?.[act] as DenyValue) || "inherit";

function setCell(
  matrix: UserOverrideMatrix,
  mod: ModuleCode,
  act: Actions,
  val: DenyValue
): UserOverrideMatrix {
  const copy: UserOverrideMatrix = structuredClone(matrix ?? {});
  copy[mod] = copy[mod] || {};
  if (val === "inherit") {
    delete (copy[mod] as any)[act];
    if (Object.keys(copy[mod] as any).length === 0) delete copy[mod];
  } else {
    (copy[mod] as any)[act] = val;
  }
  if (mod === "LTR") {
    if (copy.LTR) {
      delete (copy.LTR as any).review;
      delete (copy.LTR as any).approve;
    }
  }
  return copy;
}

/* ========================= Component ========================= */
export default function AdminPermUserOverrides() {
  // Title + subtitle at top (same pattern as Users/Projects)
  useEffect(() => {
    document.title = "Trinity PMS — User Overrides";
    (window as any).__ADMIN_SUBTITLE__ =
      "Deny-only overrides for a specific user on a project (inherit vs deny).";
    return () => {
      (window as any).__ADMIN_SUBTITLE__ = "";
    };
  }, []);

  // selectors
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [assignedUsers, setAssignedUsers] = useState<UserLite[]>([]);

  const [projectId, setProjectId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<RoleKey | "All">("All");

  // data
  const [matrix, setMatrix] = useState<UserOverrideMatrix>(emptyMatrix());

  // base “inherit” matrix for the selected project + user’s role
  type AllowMatrix = Record<ModuleKey, Record<(typeof ACTIONS)[number], boolean>>;
  const allowEmptyRow = () => ({
    view: false,
    raise: false,
    review: false,
    approve: false,
    close: false,
  });
  const allowEmptyMatrix = (): AllowMatrix =>
    Object.fromEntries(MODULES.map((m) => [m, { ...allowEmptyRow() }])) as AllowMatrix;

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
        const pr = await api.get("/admin/projects", { headers: { Accept: "application/json" } });
        const pData = pr.data;
        const pArr = Array.isArray(pData) ? pData : pData?.projects ?? [];
        const pList: ProjectLite[] = (pArr ?? [])
          .map((p: any) => ({
            projectId: p.projectId ?? p.id,
            title: p.title ?? p.name ?? "Untitled",
            code: p.code ?? p.projectCode ?? null,
            distt: p.distt ?? p.district ?? null,
            type: p.type ?? p.projectType ?? null,
          }))
          .filter((p: ProjectLite) => p.projectId && p.title);
        setProjects(pList);
        if (pList.length) setProjectId((prev) => prev || pList[0].projectId);

        // Users (try brief → fallback to full)
        let uArr: any[] = [];
        try {
          const ur1 = await api.get("/admin/users", { params: { brief: 1 } });
          uArr = Array.isArray(ur1.data) ? ur1.data : ur1.data?.users ?? [];
        } catch {
          const ur2 = await api.get("/admin/users");
          const uData = ur2.data;
          uArr = Array.isArray(uData) ? uData : uData?.users ?? [];
        }
        const uList: UserLite[] = (uArr ?? [])
          .map((u: any) => {
            const fullName = [u.firstName, u.middleName, u.lastName]
              .filter(Boolean)
              .join(" ")
              .trim();
            const name = u.name ?? (fullName || u.email || u.phone || "User");
            return {
              userId: u.userId ?? u.id,
              name,
              code: u.code ?? u.userCode ?? null,
              role: null, // will be filled from assignment fetch
            };
          })
          .filter((u: UserLite) => u.userId && u.name);
        setUsers(uList);
        if (uList.length) setUserId((prev) => prev || uList[0].userId);

        if (!pList.length) setToast("No projects found. Create one first.");
        if (!uList.length) setToast((t) => t ?? "No users found.");
      } catch (e: any) {
        setToast(`Init load failed: ${e?.message ?? e}`);
      } finally {
        setTimeout(() => setToast(null), 4000);
      }
    })();
  }, []);

  /* ------------------- filter users by project assignments ------------------ */
  useEffect(() => {
    if (!projectId || users.length === 0) {
      setAssignedUsers([]);
      return;
    }

    (async () => {
      try {
        // Expect: { ok, projectId, assignments: [{ userId, role, ...}] }
        const { data } = await api.get(
          `/admin/projects/${encodeURIComponent(projectId)}/assignments`
        );
        const assn = Array.isArray(data?.assignments) ? data.assignments : [];
        const roleByUser: Record<string, string> = {};
        assn.forEach((a: any) => {
          if (a?.userId) roleByUser[a.userId] = a.role ?? roleByUser[a.userId] ?? null;
        });

        const assignedIds = new Set<string>(assn.map((a: any) => a.userId).filter(Boolean));
        const filtered: UserLite[] = users
          .filter((u) => assignedIds.has(u.userId))
          .map((u) => ({ ...u, role: roleByUser[u.userId] ?? u.role ?? null }));

        // apply the role filter
        const source: UserLite[] = filtered;
        const filteredByRole: UserLite[] =
          roleFilter === "All"
            ? source
            : source.filter((u: UserLite) => {
                const raw = (u.role ?? "").trim();
                // normalize IH-PMT ↔ IH_PMT
                if (roleFilter === "IH-PMT") return raw === "IH_PMT";
                return raw === roleFilter;
              });

        setAssignedUsers(filteredByRole);

        if (!filteredByRole.find((u) => u.userId === userId)) {
          setUserId(filteredByRole[0]?.userId ?? "");
        }
      } catch (e: any) {
        setAssignedUsers([]);
        setUserId("");
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
          `/admin/permissions/projects/${encodeURIComponent(
            projectId
          )}/users/${encodeURIComponent(userId)}/overrides`
        );
        const m = (data?.matrix ?? {}) as UserOverrideMatrix;
        if (m?.LTR) {
          delete (m.LTR as any).review;
          delete (m.LTR as any).approve;
        }
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
    if (!projectId || !userId) {
      setBaseAllow(allowEmptyMatrix());
      return;
    }

    // Find the selected user’s role from assignedUsers
    const roleRaw = assignedUsers.find((u) => u.userId === userId)?.role ?? "";
    const rolePretty = roleRaw === "IH_PMT" ? "IH-PMT" : roleRaw;
    const roleKey = (rolePretty || "Client") as RoleKey; // fallback to something safe

    (async () => {
      try {
        const mat = await getRoleBaseMatrix(projectId, roleKey);
        // map Matrix -> AllowMatrix (same shape booleans)
        const mapped = MODULES.reduce((acc, mod) => {
          acc[mod] = ACTIONS.reduce((row, act) => {
            row[act] = !!(mat as any)?.[mod]?.[act];
            return row;
          }, {} as Record<(typeof ACTIONS)[number], boolean>);
          return acc;
        }, {} as AllowMatrix);
        setBaseAllow(mapped);
      } catch {
        setBaseAllow(allowEmptyMatrix());
      }
    })();
  }, [projectId, userId, assignedUsers]);

  /* ------------------------- actions ------------------------- */
  const canSave = useMemo(
    () => !!projectId && !!userId && !loading && !saving,
    [projectId, userId, loading, saving]
  );

  const onChangeCell = (mod: ModuleCode, act: Actions, val: DenyValue) => {
    if (mod === "LTR" && (act === "review" || act === "approve")) return;
    setMatrix((prev) => setCell(prev, mod, act, val));
  };

  const onSave = async () => {
    if (!projectId || !userId) return;
    setSaving(true);
    try {
      const payload = structuredClone(matrix ?? {});
      if (payload?.LTR) {
        delete (payload.LTR as any).review;
        delete (payload.LTR as any).approve;
      }
      await api.put(
        `/admin/permissions/projects/${encodeURIComponent(
          projectId
        )}/users/${encodeURIComponent(userId)}/overrides`,
        { matrix: payload }
      );
      setToast("Overrides saved.");
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
        `/admin/permissions/projects/${encodeURIComponent(
          projectId
        )}/users/${encodeURIComponent(userId)}/overrides/reset`,
        {}
      );
      setMatrix(emptyMatrix());
      setToast("Cleared. All cells inherit.");
    } catch (e: any) {
      setToast(`Reset failed: ${e?.response?.data?.error ?? e?.message ?? e}`);
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  /* ========================= UI tokens (latest theme) ========================= */
  const controlBase =
    "h-8 rounded-full border bg-white px-3 py-1.5 text-[11px] font-semibold shadow-sm " +
    "focus:outline-none focus:ring-2 focus:ring-offset-2 dark:bg-neutral-900";
  const controlBorder =
    "border-slate-200 text-slate-700 placeholder:text-slate-400 " +
    "dark:border-white/10 dark:text-neutral-100";
  const controlFocus =
    "focus:ring-[#00379C]/25 focus:border-[#00379C] " +
    "dark:focus:ring-[#FCC020]/20 dark:focus:border-[#FCC020]";
  const btnOutline =
    "inline-flex items-center justify-center h-8 rounded-full border border-slate-200 bg-white px-3 " +
    "text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 " +
    "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00379C]/25 " +
    "dark:bg-neutral-900 dark:border-white/10 dark:text-neutral-100 dark:hover:bg-neutral-800 dark:focus:ring-[#FCC020]/20";
  const btnPrimary =
    "inline-flex items-center justify-center h-8 rounded-full bg-[#00379C] px-3 text-[11px] font-semibold text-white " +
    "shadow-sm hover:brightness-110 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00379C]/30";
  const btnTeal =
    "inline-flex items-center justify-center h-8 rounded-full bg-[#23A192] px-3 text-[11px] font-semibold text-white " +
    "shadow-sm hover:brightness-110 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#23A192]/30";

  /* ------------------------- render ------------------------- */
  return (
    <div className="w-full">
      <div className="mx-auto max-w-6xl">
        {/* Toast */}
        {toast && (
          <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm text-sm font-semibold text-slate-800 dark:border-white/10 dark:bg-neutral-950 dark:text-slate-200">
            {toast}
          </div>
        )}

        {/* Controls (same style structure as Users: left controls, right actions) */}
        <div className="mb-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            {/* LEFT: selectors */}
            <div className="flex flex-wrap items-center gap-2 lg:basis-3/5 lg:pr-3">
              {/* Project selector */}
              <select
                className={`${controlBase} ${controlBorder} ${controlFocus} min-w-[220px]`}
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                aria-label="Select Project"
                disabled={!projects.length}
                title="Select project"
              >
                {!projects.length && <option value="">No projects</option>}
                {projects.length > 0 && !projectId && (
                  <option value="">— Select a project —</option>
                )}
                {projects.map((p) => {
                  const tip = [
                    p.code ? `Code: ${p.code}` : null,
                    `Title: ${p.title}`,
                    `Distt: ${p.distt ?? "-"}`,
                    `Type: ${p.type ?? "-"}`,
                  ]
                    .filter(Boolean)
                    .join(" | ");

                  return (
                    <option key={p.projectId} value={p.projectId} title={tip}>
                      {p.title}
                    </option>
                  );
                })}
              </select>

              {/* Role filter */}
              <select
                className={`${controlBase} ${controlBorder} ${controlFocus} min-w-[140px]`}
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as RoleKey | "All")}
                aria-label="Filter by Role"
                disabled={!projects.length}
                title="Filter assigned users by role"
              >
                <option value="All">All Roles</option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              {/* User selector (assigned users) */}
              <select
                className={`${controlBase} ${controlBorder} ${controlFocus} min-w-[260px]`}
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                aria-label="Select User"
                disabled={!assignedUsers.length}
                title="Select user assigned to this project"
              >
                {!assignedUsers.length && <option value="">No assigned users</option>}
                {assignedUsers.map((u) => {
                  const code = (u.code ?? "").toString().trim();
                  const name = (u.name ?? "").toString().trim();
                  const rawRole = (u.role ?? "").toString().trim();
                  const rolePretty = rawRole === "IH_PMT" ? "IH-PMT" : rawRole;

                  const left = [code, name].filter(Boolean).join(" - ");
                  const right = roleFilter === "All" && rolePretty ? ` (${rolePretty})` : "";
                  const label = `${left}${right}`;
                  return (
                    <option key={u.userId} value={u.userId}>
                      {label}
                    </option>
                  );
                })}
              </select>

              {(loading || saving) && (
                <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">
                  {saving ? "Saving…" : "Loading…"}
                </span>
              )}
            </div>

            {/* RIGHT: actions */}
            <div className="flex items-center gap-2 lg:basis-2/5 lg:pl-3 lg:justify-end">
              <button className={btnTeal} onClick={onSave} disabled={!canSave} type="button">
                {saving ? "Saving…" : "Save Overrides"}
              </button>

              <button
                className={btnOutline}
                onClick={onReset}
                disabled={!projectId || !userId || loading}
                type="button"
              >
                Clear to Inherit
              </button>
            </div>
          </div>
        </div>

        {/* Table card */}
        <section className="rounded-2xl shadow-sm border border-slate-200 dark:border-white/10 bg-white dark:bg-neutral-950 overflow-hidden">
          <div className="overflow-x-auto thin-scrollbar">
            <table className="min-w-full text-xs sm:text-sm border-separate border-spacing-0">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="bg-slate-50/95 dark:bg-neutral-950/90 backdrop-blur px-4 py-2 border-b border-slate-200 dark:border-white/10 text-[11px] sm:text-xs font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-300 text-left whitespace-nowrap rounded-tl-2xl">
                    Module
                  </th>
                  {ACTIONS.map((a, i) => (
                    <th
                      key={a}
                      className={[
                        "bg-slate-50/95 dark:bg-neutral-950/90 backdrop-blur",
                        "px-3 py-2 border-b border-slate-200 dark:border-white/10",
                        "text-[11px] sm:text-xs font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-300",
                        "text-center whitespace-nowrap",
                        i === ACTIONS.length - 1 ? "rounded-tr-2xl" : "",
                      ].join(" ")}
                    >
                      {a}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {MODULES.map((m, idx) => (
                  <tr
                    key={m}
                    className={
                      (idx % 2
                        ? "bg-white dark:bg-neutral-950"
                        : "bg-slate-50/40 dark:bg-neutral-950/60") +
                      " hover:bg-slate-50/70 dark:hover:bg-white/5"
                    }
                  >
                    <td className="px-4 py-2 border-b border-slate-100 dark:border-white/10 whitespace-nowrap text-slate-800 dark:text-neutral-100 font-semibold">
                      {MODULE_LABELS[m]}
                    </td>

                    {ACTIONS.map((a) => (
                      <td key={a} className="px-3 py-2 border-b border-slate-100 dark:border-white/10">
                        {m === "LTR" && (a === "review" || a === "approve") ? (
                          <div className="text-center text-xs text-slate-400 dark:text-slate-500">—</div>
                        ) : (
                          <div className="flex items-center justify-center gap-3">
                            {/* Base allow chip */}
                            <span
                              className={[
                                "text-[10px] rounded-full px-2 py-0.5 border font-semibold",
                                baseAllow[m][a]
                                  ? "bg-[#23A192]/10 border-[#23A192]/25 text-[#23A192] dark:bg-[#23A192]/15 dark:border-[#23A192]/30"
                                  : "bg-slate-50 border-slate-200 text-slate-600 dark:bg-neutral-900 dark:border-white/10 dark:text-slate-300",
                              ].join(" ")}
                              title={`Project/role matrix value: ${baseAllow[m][a] ? "Yes" : "No"}`}
                            >
                              {baseAllow[m][a] ? "Yes" : "No"}
                            </span>

                            {/* Inherit / Deny */}
                            <div className="inline-flex items-center gap-2">
                              {DENY_OPTIONS.map((opt) => {
                                const checked = safeGet(matrix, m, a) === opt;
                                const id = `${m}-${a}-${opt}`;
                                return (
                                  <label
                                    key={opt}
                                    htmlFor={id}
                                    className="inline-flex items-center gap-1 cursor-pointer select-none"
                                    title={opt}
                                  >
                                    <input
                                      id={id}
                                      type="radio"
                                      name={`${m}-${a}`}
                                      value={opt}
                                      checked={checked}
                                      onChange={() => onChangeCell(m, a, opt)}
                                      aria-label={`${MODULE_LABELS[m]} ${a} ${opt}`}
                                      className="h-3.5 w-3.5 accent-[#23A192] focus:ring-[#23A192]"
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

          {/* Footer note */}
          <div className="border-t border-slate-200 dark:border-white/10 px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
            User overrides are <b>deny-only</b>. Leaving a cell as <b>inherit</b> keeps the role template / project override
            in effect. Letters (LTR) cannot be set to review or approve.
          </div>
        </section>

        {/* Scrollbar styling (same family as other pages) */}
        <style>{`
          .thin-scrollbar::-webkit-scrollbar { height: 10px; width: 10px; }
          .thin-scrollbar::-webkit-scrollbar-track { background: transparent; }
          .thin-scrollbar::-webkit-scrollbar-thumb {
            background: rgba(148, 163, 184, 0.55);
            border-radius: 999px;
            border: 2px solid transparent;
            background-clip: padding-box;
          }
          .thin-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.8); }
          .thin-scrollbar { scrollbar-width: thin; scrollbar-color: rgba(148,163,184,0.55) transparent; }
        `}</style>
      </div>
    </div>
  );
}
