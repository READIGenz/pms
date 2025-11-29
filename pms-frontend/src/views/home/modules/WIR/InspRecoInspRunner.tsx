// pms-frontend/src/views/home/modules/WIR/InspRecoInspRunner.tsx
import React, { useMemo } from "react";

/* ---------- Local minimal types (kept narrow & read-only friendly) ---------- */
type RunnerStatus = "OK" | "NCR" | "Pending" | null;

type WirItem = {
  id: string;
  code?: string | null;
  name?: string | null;
  spec?: string | null; // "Mandatory" | "Optional" (free text upstream)
  unit?: string | null;

  // tolerance snapshot (Prisma Decimal may arrive as string)
  base?: number | string | null;
  plus?: number | string | null;
  minus?: number | string | null;

  critical?: boolean | null;
  tags?: string[] | null;

  inspectorStatus?: "PASS" | "FAIL" | "NA" | null;
  inspectorNote?: string | null;

  runs?: Array<{
    valueNumber: number | null;
    unit: string | null;
    status: RunnerStatus;
    comment: string | null;
    createdAt: string; // ISO
  }> | null;
};

type WirDoc = {
  wirId: string;
  code?: string | null;
  title?: string | null;
  version?: number | null;
  status?: string | null;
  forDate?: string | null;
  forTime?: string | null;
  cityTown?: string | null;

  items?: WirItem[] | null;

  inspectorRecommendation?: "APPROVE" | "APPROVE_WITH_COMMENTS" | "REJECT" | null;
  inspectorRemarks?: string | null;
  inspectorReviewedAt?: string | null;
};

type Props = {
  wir: WirDoc;
  onClose: () => void;
};

/* ---------- helpers ---------- */
const toTolLine = (
  base?: number | string | null,
  plus?: number | string | null,
  minus?: number | string | null
) => {
  const b = base ?? null,
    p = plus ?? null,
    m = minus ?? null;
  if (b == null && p == null && m == null) return null;
  const norm = (v: any) => (v == null ? null : String(v));
  const nb = norm(b),
    np = norm(p),
    nm = norm(m);
  if (nb && np && nm) return `${nb} (+${np}/-${nm})`;
  if (nb && (np || nm)) return `${nb} ${[np ? `+${np}` : "", nm ? `/-${nm}` : ""].join("").trim()}`.trim();
  if (nb) return nb;
  return [np ? `+${np}` : null, nm ? `-${nm}` : null].filter(Boolean).join(" / ");
};

const badgeFor = (v?: string | null) => {
  const map: Record<string, string> = {
    APPROVE: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
    APPROVE_WITH_COMMENTS:
      "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
    REJECT: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800",
  };
  const key = (v || "").toUpperCase();
  const cls = map[key] || "bg-gray-100 text-gray-800 border-gray-200 dark:bg-neutral-800 dark:text-gray-200 dark:border-neutral-700";
  return <span className={`text-[10px] px-2 py-0.5 rounded border ${cls}`}>{v || "—"}</span>;
};

const chip = (text: string) => (
  <span className="text-[11px] px-2 py-1 rounded-lg border dark:border-neutral-800">{text}</span>
);

const fmtDateTime = (iso?: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN");
  } catch {
    return iso;
  }
};

/* ---------- Component ---------- */
export default function InspRecoInspRunner({ wir, onClose }: Props) {
  const items = wir.items ?? [];

  const headerLine = useMemo(() => {
    const parts = [wir.code || undefined, wir.title || undefined, typeof wir.version === "number" ? `v${wir.version}` : undefined].filter(Boolean);
    return parts.join(" — ") || `WIR ${wir.wirId}`;
  }, [wir]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl border dark:border-neutral-800 w-[96vw] max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b dark:border-neutral-800 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base sm:text-lg font-semibold dark:text-white truncate">{headerLine}</div>
            <div className="text-[12px] text-gray-600 dark:text-gray-300 truncate">
              {wir.cityTown ? `${wir.cityTown} • ` : ""}
              {wir.forDate ? new Date(wir.forDate).toLocaleDateString() : "—"}
              {wir.forTime ? ` • ${wir.forTime}` : ""}
            </div>
          </div>
          <button
            className="text-sm px-3 py-2 rounded-lg border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {/* Recommendation strip */}
        <div className="p-4 border-b dark:border-neutral-800">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Inspector Recommendation</span>
            {badgeFor(wir.inspectorRecommendation)}
          </div>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="text-sm">
              <div className="text-gray-500 dark:text-gray-400 text-[11px] uppercase mb-0.5">Remarks</div>
              <div className="dark:text-white">{wir.inspectorRemarks?.trim() || "—"}</div>
            </div>
            <div className="text-sm">
              <div className="text-gray-500 dark:text-gray-400 text-[11px] uppercase mb-0.5">Reviewed At</div>
              <div className="dark:text-white">{fmtDateTime(wir.inspectorReviewedAt)}</div>
            </div>
            <div className="text-sm">
              <div className="text-gray-500 dark:text-gray-400 text-[11px] uppercase mb-0.5">WIR Status</div>
              <div className="dark:text-white">{wir.status || "—"}</div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 overflow-auto">
          {items.length === 0 ? (
            <div className="text-sm">No items materialized.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {items.map((it) => {
                const tol = toTolLine(it.base, it.plus, it.minus);
                const req = (it.spec || "").trim();
                const isMandatory = /^mandatory$/i.test(req);
                const isOptional = /^optional$/i.test(req);
                const lastRun = (it.runs?.[0] as any) || null;

                return (
                  <div key={it.id} className="rounded-2xl border dark:border-neutral-800 p-3 space-y-3">
                    {/* Item meta */}
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold dark:text-white">
                            {it.name || "Untitled Item"}
                            {tol ? ` — ${tol}` : ""}
                          </div>
                          {it.code ? (
                            <div className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">{it.code}</div>
                          ) : null}
                        </div>
                        {it.critical ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full border border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200 dark:border-rose-800">
                            Critical
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2">
                        {isMandatory && chip("Mandatory")}
                        {isOptional && chip("Optional")}
                        {it.unit ? chip(`Unit: ${it.unit}`) : null}
                        {tol ? chip(`Tolerance: ${tol}`) : null}
                      </div>

                      {(it.tags?.length || 0) ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(it.tags || []).map((t, i) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full border dark:border-neutral-800">
                              {t}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    {/* Read-only runner details */}
                    <div className="rounded-xl border dark:border-neutral-800 p-3 space-y-2">
                      <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Inspector Observation (Read only)
                      </div>

                      <div className="text-sm">
                        <b>Measurement{(lastRun?.unit || it.unit) ? ` (${lastRun?.unit || it.unit})` : ""}:</b>{" "}
                        {typeof lastRun?.valueNumber === "number" ? String(lastRun.valueNumber) : "—"}
                      </div>

                      <div className="text-sm">
                        <b>Runner Status:</b>{" "}
                        {lastRun?.status || "—"}
                      </div>

                      <div className="text-sm">
                        <b>Inspector Pass/Fail:</b>{" "}
                        {it.inspectorStatus || "—"}
                      </div>

                      <div className="text-sm">
                        <b>Inspector Remarks:</b>{" "}
                        {it.inspectorNote?.trim() || "—"}
                      </div>

                      <div className="text-[11px] text-gray-500 dark:text-gray-400">
                        {lastRun?.createdAt ? `Recorded at ${fmtDateTime(lastRun.createdAt)}` : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
