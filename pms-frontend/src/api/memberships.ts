// src/api/memberships.ts
import { api } from "./client";

export type Actions = "view" | "raise" | "review" | "approve" | "close";
export type ModuleCode =
  | "WIR" | "MIR" | "CS" | "DPR" | "MIP" | "DS"
  | "RFC" | "OBS" | "DLP" | "LTR" | "FDB" | "MAITRI" | "DASHBOARD";

export type EffectivePermissions = Partial<
  Record<ModuleCode, Partial<Record<Actions, boolean>>>
>;

export type WhoAmIResponse = {
  roleInProject: string;                 // e.g., "Contractor", "PMC", "IH-PMT"
  effectivePermissions: EffectivePermissions; // booleans (already resolved allow/deny)
};

export async function getMembershipMe(projectId: string): Promise<WhoAmIResponse> {
  const { data } = await api.get(`/projects/${projectId}/memberships/me`);
  return data as WhoAmIResponse;
}
