// pms-frontend/src/views/home/modules/WIR/InspRecoHODRunner.tsx
import React, { useMemo, useState } from "react";

/* ====== Local mirrored types (kept minimal to avoid cross-file imports) ====== */
type RunRow = {
    valueNumber: number | null;
    unit: string | null;
    status: "OK" | "NCR" | "Pending" | null;
    comment: string | null;
    createdAt: string; // ISO
};

type EvidenceRow = {
    id: string;
    kind: "Photo" | "Video" | "File";
    url: string;
    thumbUrl?: string | null;
    fileName?: string | null;
    createdAt?: string | null;
};

type WirItem = {
    id: string;
    seq?: number | null;
    code?: string | null;
    name?: string | null;
    spec?: string | null;
    unit?: string | null;
    tolerance?: string | null;
    critical?: boolean | null;
    tags?: string[];
    base?: number | string | null;
    plus?: number | string | null;
    minus?: number | string | null;

    inspectorStatus?: "PASS" | "FAIL" | "NA" | null;
    inspectorNote?: string | null;
    runs?: RunRow[];
    evidences?: EvidenceRow[];
};

type WirDoc = {
    wirId: string;
    code?: string | null;
    title?: string | null;
    status?: string | null;
    forDate?: string | null;
    forTime?: string | null;
    version?: number | null;
    items?: WirItem[];

    // Inspector recommendation header fields
    inspectorRecommendation?: "APPROVE" | "APPROVE_WITH_COMMENTS" | "REJECT" | null;
    inspectorRemarks?: string | null;
    inspectorReviewedAt?: string | null;
};

function fmtDateTime(iso?: string | null) {
    if (!iso) return "—";
    try {
        const d = new Date(iso);
        // Fallback if invalid:
        if (Number.isNaN(d.getTime())) return iso;
        return d.toLocaleString();
    } catch {
        return iso || "—";
    }
}

function tolLine(base?: number | string | null, plus?: number | string | null, minus?: number | string | null) {
    const b = (base ?? null) as any;
    const p = (plus ?? null) as any;
    const m = (minus ?? null) as any;
    if (b == null && p == null && m == null) return null;
    if (b != null && p != null && m != null) return `${b} (+${p}/-${m})`;
    if (b != null && (p != null || m != null)) {
        const pos = p != null ? `+${p}` : "";
        const neg = m != null ? `/-${m}` : "";
        return `${b} ${`${pos}${neg}`.trim()}`.trim();
    }
    if (b != null) return `${b}`;
    return [p != null ? `+${p}` : null, m != null ? `-${m}` : null].filter(Boolean).join(" / ");
}

function statusPill(v?: "PASS" | "FAIL" | "NA" | null) {
    const label = v ?? "—";
    const cls =
        v === "PASS"
            ? "bg-emerald-600 text-white border-emerald-700"
            : v === "FAIL"
                ? "bg-rose-600 text-white border-rose-700"
                : "bg-gray-100 text-gray-800 border-gray-200 dark:bg-neutral-800 dark:text-gray-200 dark:border-neutral-700";
    return <span className={`text-[10px] px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>;
}

function recPill(v?: WirDoc["inspectorRecommendation"] | null) {
    const label = v ?? "—";
    const map: Record<string, string> = {
        APPROVE: "bg-emerald-600 text-white border-emerald-700",
        APPROVE_WITH_COMMENTS: "bg-blue-600 text-white border-blue-700",
        REJECT: "bg-rose-600 text-white border-rose-700",
        "—": "bg-gray-100 text-gray-800 border-gray-200 dark:bg-neutral-800 dark:text-gray-200 dark:border-neutral-700",
    };
    const cls = map[label] || map["—"];
    return <span className={`text-[11px] px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>;
}

function LatestRun({ runs }: { runs?: RunRow[] }) {
    if (!runs || runs.length === 0) {
        return <div className="text-sm">No measurements recorded.</div>;
    }
    const latest = runs[0];
    return (
        <div className="text-sm space-y-0.5">
            <div>
                <b>Reading:</b>{" "}
                {latest.valueNumber != null ? `${latest.valueNumber}${latest.unit ? ` ${latest.unit}` : ""}` : "—"}
            </div>
            <div>
                <b>Comment:</b> {latest.comment?.toString().trim() ? latest.comment : "—"}
            </div>
            <div>
                <b>Taken at:</b> {fmtDateTime(latest.createdAt)}
            </div>
        </div>
    );
}

function RunsHistory({ runs }: { runs?: RunRow[] }) {
    if (!runs || runs.length <= 1) return null;
    const rest = runs.slice(1);
    return (
        <div className="mt-2 rounded-lg border dark:border-neutral-800 p-2">
            <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                Previous Runs
            </div>
            <ul className="space-y-1 max-h-44 overflow-auto pr-1">
                {rest.map((r, idx) => (
                    <li key={idx} className="text-[12px]">
                        <span className="font-medium">{fmtDateTime(r.createdAt)}</span> —{" "}
                        {r.valueNumber != null ? `${r.valueNumber}${r.unit ? ` ${r.unit}` : ""}` : "—"}
                        {r.comment?.trim() ? ` • ${r.comment}` : ""}
                        {r.status ? ` • ${r.status}` : ""}
                    </li>
                ))}
            </ul>
        </div>
    );
}

function EvidenceList({ evidences }: { evidences?: EvidenceRow[] }) {
  if (!evidences || evidences.length === 0) return null;

  // Try common token keys; still works if you're on cookie auth
  const getToken = () =>
    localStorage.getItem("access_token") ||
    localStorage.getItem("jwt") ||
    localStorage.getItem("token") ||
    "";

  async function openProtected(url: string, suggestedName?: string | null) {
    try {
      const token = getToken();
      const res = await fetch(url, {
        method: "GET",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include", // also send cookies if present
      });

      // If auth fails or server redirects (e.g., to /login), fall back to plain open
      if (!res.ok || res.headers.get("content-type")?.includes("text/html")) {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      // Open in a new tab; try to hint filename for downloads
      const a = document.createElement("a");
      a.href = blobUrl;
      if (suggestedName && suggestedName.trim()) a.download = suggestedName.trim();
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      // For images/PDFs this will open preview; for others it will download
      document.body.appendChild(a);
      a.click();
      a.remove();

      // Revoke after a little while
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch {
      // Last resort
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  // newest first if timestamps exist
  const sorted = [...evidences].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });

  const icon = (k: EvidenceRow["kind"]) =>
    k === "Photo" ? "📷" : k === "Video" ? "🎥" : "📄";

  return (
    <div className="mt-3">
      <div className="text-[12px] font-medium mb-1">Evidences</div>
      <ul className="space-y-1">
        {sorted.map((ev) => (
          <li
            key={ev.id}
            className="text-[13px] flex items-center gap-2 rounded-lg border dark:border-neutral-800 px-2 py-1 hover:bg-gray-50 dark:hover:bg-neutral-800"
            title={ev.fileName || ev.url}
          >
            <span aria-hidden>{icon(ev.kind)}</span>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                openProtected(ev.url, ev.fileName);
              }}
              className="truncate underline decoration-dotted hover:decoration-solid text-left"
              style={{ maxWidth: "60%" }}
            >
              {ev.fileName?.trim() || ev.url}
            </button>

            <span className="text-[11px] text-gray-500 dark:text-gray-400 ml-auto">
              {ev.kind}
              {ev.createdAt ? ` • ${fmtDateTime(ev.createdAt)}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function InspRecoHODRunner({
    wir,
    onClose,
}: {
    wir: WirDoc;
    onClose: () => void;
}) {
    const items = useMemo(() => wir.items ?? [], [wir?.items]);

    // Track which item histories are expanded
    const [openHistory, setOpenHistory] = useState<Record<string, boolean>>({});

    const headerLine = useMemo(() => {
        const parts = [
            wir.code || undefined,
            wir.title || undefined,
            typeof wir.version === "number" ? `v${wir.version}` : undefined,
        ].filter(Boolean);
        return parts.join(" — ");
    }, [wir]);

    return (
        <div
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40"
            role="dialog"
            aria-modal="true"
        >
            <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border dark:border-neutral-800 w-[96vw] max-w-6xl h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-4 border-b dark:border-neutral-800 flex items-center justify-between gap-3 sticky top-0 z-10 bg-white dark:bg-neutral-900">
                    <div className="min-w-0">
                        <div className="text-base sm:text-lg font-semibold dark:text-white truncate">
                            HOD Review — Inspector Recommendation (Read only)
                        </div>
                        <div className="text-[12px] text-gray-600 dark:text-gray-300 truncate">
                            {headerLine || wir.wirId}
                        </div>
                    </div>
                    <button
                        className="text-sm px-3 py-2 rounded-lg border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                        onClick={onClose}
                    >
                        Close
                    </button>
                </div>
                {/* Scrollable body (wraps summary, remarks, items, footer) */}
                <div className="flex-1 overflow-auto">
                    {/* Summary strip */}
                    {/* Summary strip */}
                    <div className="p-4 border-b dark:border-neutral-800 grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="text-[12px] px-2 py-1 rounded-lg border dark:border-neutral-800 flex items-center gap-2">
                            <span className="text-gray-500 dark:text-gray-400">Recommendation:</span>
                            {recPill(wir.inspectorRecommendation)}
                        </div>
                        <div className="text-[12px] px-2 py-1 rounded-lg border dark:border-neutral-800">
                            <span className="text-gray-500 dark:text-gray-400">Reviewed at:</span>{" "}
                            <b>{fmtDateTime(wir.inspectorReviewedAt)}</b>
                        </div>
                        <div className="text-[12px] px-2 py-1 rounded-lg border dark:border-neutral-800">
                            <span className="text-gray-500 dark:text-gray-400">Items:</span>{" "}
                            <b>{items.length || "—"}</b>
                        </div>
                    </div>

                    {/* Inspector remarks (header-level) */}
                    <div className="px-4 pt-3">
                        <div className="rounded-xl border dark:border-neutral-800 p-3">
                            <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                Inspector Remarks (Header)
                            </div>
                            <div className="mt-1 text-sm dark:text-white whitespace-pre-wrap">
                                {wir.inspectorRemarks?.toString().trim() ? wir.inspectorRemarks : "—"}
                            </div>
                        </div>
                    </div>

                    {/* Items list */}
                    <div className="p-4">
                        {items.length === 0 ? (
                            <div className="text-sm">No items materialized.</div>
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                {items.map((it) => {
                                    const tol = tolLine(it.base, it.plus, it.minus);
                                    const showHistory = !!openHistory[it.id];

                                    return (
                                        <div
                                            key={it.id}
                                            className="rounded-2xl border dark:border-neutral-800 p-3 space-y-3"
                                        >
                                            {/* Item Meta */}
                                            <div>
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-semibold dark:text-white truncate">
                                                            {it.name ?? "Untitled Item"}{tol ? ` — ${tol}` : ""}
                                                        </div>
                                                        <div className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">
                                                            {(it.code || "").trim() || "—"}
                                                        </div>
                                                    </div>
                                                    {it.critical ? (
                                                        <span className="text-[10px] px-2 py-0.5 rounded-full border border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200 dark:border-rose-800">
                                                            Critical
                                                        </span>
                                                    ) : null}
                                                </div>

                                                {/* Pills */}
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {(() => {
                                                        const s = (it.spec || "").trim();
                                                        if (/^mandatory$/i.test(s)) {
                                                            return (
                                                                <span className="text-[11px] px-2 py-1 rounded-lg border dark:border-neutral-800">
                                                                    Mandatory
                                                                </span>
                                                            );
                                                        }
                                                        if (/^optional$/i.test(s)) {
                                                            return (
                                                                <span className="text-[11px] px-2 py-1 rounded-lg border dark:border-neutral-800">
                                                                    Optional
                                                                </span>
                                                            );
                                                        }
                                                        return null;
                                                    })()}

                                                    {it.unit ? (
                                                        <span className="text-[11px] px-2 py-1 rounded-lg border dark:border-neutral-800">
                                                            Unit: {it.unit}
                                                        </span>
                                                    ) : null}
                                                    {tol ? (
                                                        <span className="text-[11px] px-2 py-1 rounded-lg border dark:border-neutral-800">
                                                            Tolerance: {tol}
                                                        </span>
                                                    ) : null}
                                                </div>

                                                {(it.tags?.length || 0) > 0 && (
                                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                                        {it.tags!.map((t, i) => (
                                                            <span
                                                                key={i}
                                                                className="text-[10px] px-2 py-0.5 rounded-full border dark:border-neutral-800"
                                                            >
                                                                {t}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Inspector Observation (read-only) */}
                                            <div className="rounded-xl border dark:border-neutral-800 p-3 space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                                        Inspector Observation (Read only)
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {statusPill(it.inspectorStatus ?? null)}
                                                    </div>
                                                </div>

                                                <div className="text-sm">
                                                    <b>Remarks:</b>{" "}
                                                    {it.inspectorNote?.toString().trim() ? it.inspectorNote : "—"}
                                                </div>

                                                <div className="mt-2">
                                                    <div className="text-[12px] font-medium mb-1">Latest Measurement</div>
                                                    <LatestRun runs={it.runs} />
                                                </div>

                                                {/* Inspector evidences (photos/docs/videos) */}
                                                <EvidenceList evidences={it.evidences} />

                                                {/* Toggle history */}
                                                {(it.runs?.length || 0) > 1 && (
                                                    <>
                                                        <button
                                                            className="mt-2 text-[12px] px-3 py-1.5 rounded-lg border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                                                            onClick={() =>
                                                                setOpenHistory((m) => ({ ...m, [it.id]: !m[it.id] }))
                                                            }
                                                        >
                                                            {showHistory ? "Hide history" : "View history"}
                                                        </button>
                                                        {showHistory && <RunsHistory runs={it.runs} />}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-3 border-t dark:border-neutral-800 flex items-center justify-end gap-2">
                        <button
                            className="text-sm px-4 py-2 rounded-lg border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                            onClick={onClose}
                        >
                            Close
                        </button>
                    </div>
                </div> {/* scrollable body end */}
            </div>

        </div>

    );
}
