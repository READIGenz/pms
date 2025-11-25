// Shared membership & acting-role helpers for WIR flows

import { api } from "../../../../api/client";
import { getRoleBaseMatrix } from "../../../admin/permissions/AdminPermProjectOverrides";

export type RoleKey =
  | "Admin" | "Client" | "IH-PMT" | "Contractor" | "Consultant" | "PMC" | "Supplier";

type MembershipLite = {
  role?: string | null;
  project?: { projectId?: string; title?: string } | null;
  validFrom?: string | null;
  validTo?: string | null;
  updatedAt?: string | null;
};

type UserLite = {
  userId: string;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  email?: string | null;
  fullName?: string | null;
  name?: string | null;
  displayName?: string | null;
  userRoleMemberships?: MembershipLite[];
};

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function isWithinYMD(dateISO: string, startISO?: string | null, endISO?: string | null) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return false;
  const d = new Date(`${dateISO}T00:00:00`);
  const s = startISO ? new Date(startISO) : null;
  const e = endISO ? new Date(endISO) : null;
  if (isNaN(+d)) return false;
  if (s && d < s) return false;
  if (e && d > e) return false;
  return true;
}

export function displayNameLite(u: Partial<UserLite>): string {
  const name =
    u.fullName ||
    u.name ||
    [u.firstName, u.middleName, u.lastName].filter(Boolean).join(" ") ||
    u.displayName ||
    "";
  return (name || u.email || `User #${u.userId}` || "User").toString();
}

/** Return ALL active members for a (projectId, roleKey) on a given yyyy-mm-dd date */
export async function listActiveMembersForProjectRole(
  projectId: string,
  roleKey: RoleKey,
  onDateISO: string
): Promise<Array<{ user: UserLite; mem: MembershipLite }>> {
  const { data } = await api.get("/admin/users", { params: { includeMemberships: "1" } });
  const users: UserLite[] = Array.isArray(data) ? data : (data?.users ?? []);

  const hits: Array<{ user: UserLite; mem: MembershipLite }> = [];
  const roleNeedle = roleKey.toLowerCase();

  for (const u of users) {
    const mems = Array.isArray(u.userRoleMemberships) ? u.userRoleMemberships : [];
    for (const m of mems) {
      const r = (m?.role || "").toLowerCase();
      const pid = String(m?.project?.projectId || "");
      if (r !== roleNeedle) continue;
      if (pid !== String(projectId)) continue;
      if (isWithinYMD(onDateISO, m?.validFrom || undefined, m?.validTo || undefined)) {
        hits.push({ user: u, mem: m });
      }
    }
  }

  // newest membership first (stable preference)
  hits.sort((a, b) => {
    const au = Date.parse(a.mem.updatedAt || "") || 0;
    const bu = Date.parse(b.mem.updatedAt || "") || 0;
    return bu - au;
  });

  return hits;
}

/** deny-only composition: eff = baseAllow && (override !== 'deny') */
function effAllow(baseYes: boolean | undefined, denyCell?: "inherit" | "deny" | false): boolean {
  return !!baseYes && denyCell !== "deny" && denyCell !== false;
}

/** Map effective actions → Acting role label */
export type ActingRole = "Inspector" | "HOD" | "Inspector+HOD" | "ViewerOnly";
export function deduceActingRole(
  effView: boolean,
  effRaise: boolean,
  effReview: boolean,
  effApprove: boolean
): ActingRole {
  if (effView && !effRaise && effReview && !effApprove) return "Inspector";
  if (effView && !effRaise && !effReview && effApprove) return "HOD";
  if (effView && !effRaise && effReview && effApprove) return "Inspector+HOD";
  return "ViewerOnly";
}

/** Compute acting role for (projectId, roleKey, userId) using base role matrix + user deny-only overrides */
export async function resolveActingRoleFor(
  projectId: string,
  roleKey: RoleKey,
  userId: string
): Promise<ActingRole> {
  // 1) base (allow) from role template
  const base = await getRoleBaseMatrix(projectId, roleKey as any);
  const baseView   = !!base?.WIR?.view;
  const baseRaise  = !!base?.WIR?.raise;
  const baseReview = !!base?.WIR?.review;
  const baseApprove= !!base?.WIR?.approve;

  // 2) user overrides (deny-only)
  let overRow: Record<"view"|"raise"|"review"|"approve", "inherit"|"deny"|false|undefined> = { view: undefined, raise: undefined, review: undefined, approve: undefined };
  try {
    const { data } = await api.get(`/admin/permissions/projects/${projectId}/users/${userId}/overrides`);
    const m = (data?.matrix ?? data) || {};
    overRow = (m?.WIR ?? {}) as typeof overRow;
  } catch {
    // ignore; treat as all inherit
  }

  const effV  = effAllow(baseView,   overRow.view);
  const effRz = effAllow(baseRaise,  overRow.raise);
  const effRv = effAllow(baseReview, overRow.review);
  const effAp = effAllow(baseApprove,overRow.approve);

  return deduceActingRole(effV, effRz, effRv, effAp);
}
