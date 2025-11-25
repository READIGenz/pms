//pms-frontend/src/views/home/modules/WIR/wir.bicNames.ts
import { useEffect, useState } from "react";
import { api } from "../../../../api/client";

/** Minimal shape we care about from list rows */
export type BicAware = {
  bicUserId?: string | null;
  bicFullName?: string | null;
  bicUser?: { fullName?: string | null } | null;
};

/** Local cache + hydrator for BIC names. */
export function useBicNameMap(list: BicAware[]): Record<string, string> {
  const [bicNameMap, setBicNameMap] = useState<Record<string, string>>({});

  useEffect(() => {
    // collect BIC userIds that we need names for
    const need = new Set<string>();
    for (const w of list) {
      const uid = w?.bicUserId as string | undefined;
      const hasName = !!w?.bicFullName || !!w?.bicUser?.fullName || !!(uid && bicNameMap[uid]);
      if (uid && !hasName) need.add(uid);
    }
    if (need.size === 0) return;

    let ignore = false;

    async function run() {
      try {
        // If BE supports filtering users by ids, use it here instead of bulk fetch.
        // For now fetch all (lightweight) list without memberships.
        const { data } = await api.get("/admin/users", { params: { includeMemberships: 0 } });
        const users: any[] = Array.isArray(data?.users) ? data.users : [];
        const nextMap: Record<string, string> = {};

        for (const u of users) {
          const id = u?.userId;
          if (!id || !need.has(id)) continue;

          const fullName =
            u?.fullName ||
            [u?.firstName, u?.lastName].filter(Boolean).join(" ") ||
            u?.email ||
            u?.code ||
            id;

          nextMap[id] = String(fullName);
        }

        if (!ignore && Object.keys(nextMap).length) {
          setBicNameMap((prev) => ({ ...prev, ...nextMap }));
        }
      } catch (e) {
        // non-blocking; tiles will keep showing the id if name not found
        console.warn("[WIR] BIC name hydrate failed", e);
      }
    }

    run();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]); // depend on list only; internal map is merged

  return bicNameMap;
}

/** Pick the best BIC display name given a row and the hydrated map. */
export function pickBicName(row: BicAware, bicNameMap: Record<string, string>): string | null {
  const any = row as any;
  return (
    row.bicFullName ||
    row.bicUser?.fullName ||
    (row.bicUserId ? bicNameMap[row.bicUserId] : undefined) ||
    any?.bicName ||
    any?.bic_user_full_name ||
    null
  );
}
