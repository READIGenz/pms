// pms-frontend/src/api/wir.ts
import { api } from "./client";

// raw WIR list payload from backend (keep loose here)
export async function listWir(projectId: string): Promise<any> {
  const { data } = await api.get(`/projects/${projectId}/wir`);
  return data;
}

export async function getWir(projectId: string, wirId: string): Promise<any> {
  const { data } = await api.get(`/projects/${projectId}/wir/${wirId}`);
  return data;
}

export async function createWir(
  projectId: string,
  payload: any
): Promise<any> {
  const { data } = await api.post(`/projects/${projectId}/wir`, payload);
  return data;
}

export async function updateWir(
  projectId: string,
  wirId: string,
  payload: any
): Promise<any> {
  const { data } = await api.patch(`/projects/${projectId}/wir/${wirId}`, payload);
  return data;
}

export async function deleteWir(
  projectId: string,
  wirId: string
): Promise<void> {
  await api.delete(`/projects/${projectId}/wir/${wirId}`);
}

export async function submitWir(
  projectId: string,
  wirId: string,
  body?: any
): Promise<any> {
  const { data } = await api.post(
    `/projects/${projectId}/wir/${wirId}/submit`,
    body ?? {}
  );
  return data;
}

export async function recommendWir(
  projectId: string,
  wirId: string,
  body?: any
): Promise<any> {
  const { data } = await api.put(
    `/projects/${projectId}/wir/${wirId}/recommend`,
    body ?? {}
  );
  return data;
}

export async function approveWir(
  projectId: string,
  wirId: string,
  body?: any
): Promise<any> {
  const { data } = await api.put(
    `/projects/${projectId}/wir/${wirId}/approve`,
    body ?? {}
  );
  return data;
}

export async function rejectWir(
  projectId: string,
  wirId: string,
  body: { role: string; comment: string }
): Promise<any> {
  const { data } = await api.put(
    `/projects/${projectId}/wir/${wirId}/reject`,
    body
  );
  return data;
}

export async function returnWir(
  projectId: string,
  wirId: string,
  body: { role: string; comment?: string }
): Promise<any> {
  const { data } = await api.put(
    `/projects/${projectId}/wir/${wirId}/return`,
    body
  );
  return data;
}

// Inspector Runner save
export async function saveWirRunnerInspector(
  projectId: string,
  wirId: string,
  payload: {
    items: {
      itemId: string;
      status: "PASS" | "FAIL" | null;
      measurement: string | null;
      remark: string | null;
    }[];
    overallRecommendation?: "APPROVE" | "APPROVE_WITH_COMMENTS" | "REJECT" | null;
  }
) {
  const { data } = await api.post(
    `/projects/${projectId}/wir/${wirId}/runner/inspector-save`,
    payload
  );
  return data;
}

export function saveWirRunnerHod(projectId: string, wirId: string, payload: {
  items: { itemId: string; hodRemark: string | null }[];
  notes?: string | null;
}) {
  return api.post(`/projects/${projectId}/wir/${wirId}/runner/hod-save`, payload).then(r => r.data);
}

// HOD finalize (Runner)
export async function finalizeWirRunnerHod(
  projectId: string,
  wirId: string,
  payload: {
    outcome: "ACCEPT" | "RETURN" | "REJECT";
    notes?: string | null;
    inspectorRecommendation?: "APPROVE" | "APPROVE_WITH_COMMENTS" | "REJECT" | null;
    items: {
      itemId: string;
      inspectorStatus: "PASS" | "FAIL" | null;
      inspectorMeasurement: string | null;
      inspectorRemark: string | null;
      hodRemark: string | null;
      hodLastSavedAt?: string | null;
    }[];
  }
) {
  const { data } = await api.post(
    `/projects/${projectId}/wir/${wirId}/runner/hod-finalize`,
    payload
  );
  return data;
}

export async function rescheduleWir(
  projectId: string,
  wirId: string,
  body: any
): Promise<any> {
  const { data } = await api.post(
    `/projects/${projectId}/wir/${wirId}/reschedule`,
    body
  );
  return data;
}

/** History rows from GET /projects/:pid/wir/:wid/history */
export async function getWirHistory(
  projectId: string,
  wirId: string
): Promise<any> {
  const { data } = await api.get(
    `/projects/${projectId}/wir/${wirId}/history`
  );
  return data;
}

/** Discussion list from GET /projects/:pid/wir/:wid/discussions */
export async function listWirDiscussions(
  projectId: string,
  wirId: string
): Promise<any> {
  const { data } = await api.get(
    `/projects/${projectId}/wir/${wirId}/discussions`
  );
  return data;
}

/** POST a new discussion message */
export async function postWirDiscussionMessage(
  projectId: string,
  wirId: string,
  payload: any
): Promise<any> {
  const { data } = await api.post(
    `/projects/${projectId}/wir/${wirId}/discussions`,
    payload
  );
  return data;
}
