// src/api/permissions.ts
import { api } from "./client";

export type Matrix = Record<string, {
  view: boolean; raise: boolean; review: boolean; approve: boolean; close: boolean;
}>;

export type RoleInProject =
  | "Contractor" | "Inspector" | "HOD" | "IH-PMT" | "Admin" | "Observer" | "Client";

export type MembershipMe = {
  roleInProject: RoleInProject;
  effectivePermissions: Matrix; // server already resolves overrides
};

export type ActingRow = {
  user: { id: string; fullName?: string; email?: string };
  actingRole: RoleInProject;
};

export async function getMembershipMe(projectId: string): Promise<MembershipMe> {
  const { data } = await api.get(`/projects/${projectId}/memberships/me`);
  return data as MembershipMe;
}

export async function getActingRoles(projectId: string, dateISO?: string): Promise<ActingRow[]> {
  const q = dateISO ? `?date=${encodeURIComponent(dateISO)}` : "";
  return api.get(`projects/${projectId}/roles/acting${q}`);
}
