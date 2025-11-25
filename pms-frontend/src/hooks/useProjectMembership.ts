// src/hooks/useProjectMembership.ts
import { useEffect, useMemo, useState } from "react";
import { getMembershipMe, MembershipMe, Matrix } from "../api/permissions";

type Status = "idle" | "loading" | "ready" | "error";

export function useProjectMembership(projectId?: string) {
  const [status, setStatus] = useState<Status>("idle");
  const [data, setData] = useState<MembershipMe | null>(null);
  const [err, setErr] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    async function run() {
      if (!projectId) return;
      setStatus("loading");
      setErr(null);
      try {
        const res = await getMembershipMe(projectId);
        if (!alive) return;
        setData(res);
        setStatus("ready");
      } catch (e) {
        if (!alive) return;
        setErr(e);
        setStatus("error");
      }
    }
    run();
    return () => { alive = false; };
  }, [projectId]);

  const role = data?.roleInProject;
  const matrix: Matrix | undefined = data?.effectivePermissions;

  // helper: safe lookup
  const can = useMemo(() => {
    return (moduleKey: string) => {
      const m = matrix?.[moduleKey];
      return {
        view: !!m?.view,
        raise: !!m?.raise,
        review: !!m?.review,
        approve: !!m?.approve,
        close: !!m?.close,
      };
    };
  }, [matrix]);

  return { status, role, matrix, can, error: err };
}
