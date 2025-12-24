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

function tolLine(
  base?: number | string | null,
  plus?: number | string | null,
  minus?: number | string | null
) {
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
  return [p != null ? `+${p}` : null, m != null ? `-${m}` : null]
    .filter(Boolean)
    .join(" / ");
}

function statusPill(v?: "PASS" | "FAIL" | "NA" | null) {
  const label = v ?? "—";

  const cls =
    v === "PASS"
      ? "bg-[#23A192] text-white border-[#23A192]"
      : v === "FAIL"
      ? "bg-rose-600 text-white border-rose-700"
      : "bg-slate-100 text-slate-800 border-slate-200 dark:bg-neutral-900 dark:text-neutral-200 dark:border-white/10";

  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${cls}`}>
      {label}
    </span>
  );
}

function recPill(v?: WirDoc["inspectorRecommendation"] | null) {
  const label = v ?? "—";
  const map: Record<string, string> = {
    APPROVE: "bg-[#23A192] text-white border-[#23A192]",
    APPROVE_WITH_COMMENTS: "bg-[#00379C] text-white border-[#00379C]",
    REJECT: "bg-rose-600 text-white border-rose-700",
    "—": "bg-slate-100 text-slate-800 border-slate-200 dark:bg-neutral-900 dark:text-neutral-200 dark:border-white/10",
  };
  const cls = map[label] || map["—"];
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${cls}`}>
      {label}
    </span>
  );
}

function LatestRun({ runs }: { runs?: RunRow[] }) {
  if (!runs || runs.length === 0) {
    return <div className="text-sm text-slate-600 dark:text-neutral-300">No measurements recorded.</div>;
  }
  const latest = runs[0];
  return (
    <div className="text-sm space-y-0.5 text-slate-900 dark:text-white">
      <div>
        <b>Reading:</b>{" "}
        {latest.valueNumber != null
          ? `${latest.valueNumber}${latest.unit ? ` ${latest.unit}` : ""}`
          : "—"}
      </div>
      <div>
        <b>Comment:</b> {latest.comment?.toString().trim() ? latest.comment : "—"}
      </div>
      <div className="text-slate-700 dark:text-neutral-300">
        <b>Taken at:</b> {fmtDateTime(latest.createdAt)}
      </div>
    </div>
  );
}

function RunsHistory({ runs }: { runs?: RunRow[] }) {
  if (!runs || runs.length <= 1) return null;
  const rest = runs.slice(1);
  return (
    <div className="mt-2 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-neutral-950 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-neutral-400 mb-2">
        Previous Runs
      </div>
      <ul className="space-y-1 max-h-44 overflow-auto pr-1">
        {rest.map((r, idx) => (
          <li key={idx} className="text-[12px] text-slate-800 dark:text-neutral-200">
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

  const icon = (k: EvidenceRow["kind"]) => (k === "Photo" ? "📷" : k === "Video" ? "🎥" : "📄");

  return (
    <div className="mt-3">
      <div className="text-[12px] font-semibold text-slate-900 dark:text-white mb-2">
        Evidences
      </div>
      <ul className="space-y-2">
        {sorted.map((ev) => (
          <li
            key={ev.id}
            className="text-[13px] flex items-center gap-2 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-neutral-950 px-3 py-2 hover:bg-slate-50 dark:hover:bg-white/[0.03]"
            title={ev.fileName || ev.url}
          >
            <span aria-hidden className="shrink-0">{icon(ev.kind)}</span>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                openProtected(ev.url, ev.fileName);
              }}
              className="truncate text-left underline decoration-dotted hover:decoration-solid text-[#00379C] dark:text-[#FCC020]"
              style={{ maxWidth: "60%" }}
            >
              {ev.fileName?.trim() || ev.url}
            </button>

            <span className="text-[11px] text-slate-500 dark:text-neutral-400 ml-auto shrink-0">
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
      <div className="bg-white dark:bg-neutral-950 rounded-2xl shadow-2xl border border-slate-200/80 dark:border-white/10 w-[96vw] max-w-6xl h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between gap-3 sticky top-0 z-10 bg-white/95 dark:bg-neutral-950/95 backdrop-blur">
          <div className="min-w-0">
            <div className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white truncate">
              HOD Review — Inspector Recommendation <span className="text-slate-400 dark:text-neutral-400">(Read only)</span>
            </div>
            <div className="text-[12px] text-slate-600 dark:text-neutral-300 truncate">
              {headerLine || wir.wirId}
            </div>
          </div>

          <button
            className="text-sm px-4 h-10 rounded-full border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-neutral-950 hover:bg-slate-50 dark:hover:bg-white/[0.03] text-slate-900 dark:text-white transition"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-auto">
          {/* Summary strip */}
          <div className="p-4 border-b border-slate-200/80 dark:border-white/10">
            <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.03] p-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="text-[12px] px-2 py-1 rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-neutral-950/40 flex items-center gap-2">
                <span className="text-slate-500 dark:text-neutral-400">Recommendation:</span>
                {recPill(wir.inspectorRecommendation)}
              </div>
              <div className="text-[12px] px-2 py-1 rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-neutral-950/40">
                <span className="text-slate-500 dark:text-neutral-400">Reviewed at:</span>{" "}
                <b className="text-slate-900 dark:text-white">{fmtDateTime(wir.inspectorReviewedAt)}</b>
              </div>
              <div className="text-[12px] px-2 py-1 rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-neutral-950/40">
                <span className="text-slate-500 dark:text-neutral-400">Items:</span>{" "}
                <b className="text-slate-900 dark:text-white">{items.length || "—"}</b>
              </div>
            </div>
          </div>

          {/* Inspector remarks (header-level) */}
          <div className="px-4 pt-4">
            <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-neutral-950 p-4">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-neutral-400">
                Inspector Remarks (Header)
              </div>
              <div className="mt-2 text-sm text-slate-900 dark:text-white whitespace-pre-wrap">
                {wir.inspectorRemarks?.toString().trim() ? wir.inspectorRemarks : "—"}
              </div>
            </div>
          </div>

          {/* Items list */}
          <div className="p-4">
            {items.length === 0 ? (
              <div className="text-sm text-slate-700 dark:text-neutral-300">No items materialized.</div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {items.map((it) => {
                  const tol = tolLine(it.base, it.plus, it.minus);
                  const showHistory = !!openHistory[it.id];

                  return (
                    <div
                      key={it.id}
                      className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-neutral-950 p-4 space-y-3"
                    >
                      {/* Item Meta */}
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                              {it.name ?? "Untitled Item"}
                              {tol ? <span className="text-slate-500 dark:text-neutral-300"> — {tol}</span> : null}
                            </div>
                            <div className="text-[12px] text-slate-500 dark:text-neutral-400 mt-0.5">
                              {(it.code || "").trim() || "—"}
                            </div>
                          </div>

                          {it.critical ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full border border-rose-200 bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-200 dark:border-rose-900/40">
                              Critical
                            </span>
                          ) : null}
                        </div>

                        {/* Pills */}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(() => {
                            const s = (it.spec || "").trim();
                            if (/^mandatory$/i.test(s)) {
                              return (
                                <span className="text-[11px] px-3 py-1 rounded-full border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-slate-800 dark:text-neutral-200">
                                  Mandatory
                                </span>
                              );
                            }
                            if (/^optional$/i.test(s)) {
                              return (
                                <span className="text-[11px] px-3 py-1 rounded-full border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-slate-800 dark:text-neutral-200">
                                  Optional
                                </span>
                              );
                            }
                            return null;
                          })()}

                          {it.unit ? (
                            <span className="text-[11px] px-3 py-1 rounded-full border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-slate-800 dark:text-neutral-200">
                              Unit: {it.unit}
                            </span>
                          ) : null}

                          {tol ? (
                            <span className="text-[11px] px-3 py-1 rounded-full border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-slate-800 dark:text-neutral-200">
                              Tolerance: {tol}
                            </span>
                          ) : null}
                        </div>

                        {(it.tags?.length || 0) > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {it.tags!.map((t, i) => (
                              <span
                                key={i}
                                className="text-[10px] px-2 py-0.5 rounded-full border border-slate-200/80 dark:border-white/10 bg-white dark:bg-neutral-950 text-slate-700 dark:text-neutral-200"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Inspector Observation (read-only) */}
                      <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.03] p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-neutral-400">
                            Inspector Observation (Read only)
                          </div>
                          <div className="flex items-center gap-2">{statusPill(it.inspectorStatus ?? null)}</div>
                        </div>

                        <div className="text-sm text-slate-900 dark:text-white">
                          <b>Remarks:</b>{" "}
                          {it.inspectorNote?.toString().trim() ? it.inspectorNote : "—"}
                        </div>

                        <div className="mt-3">
                          <div className="text-[12px] font-semibold text-slate-900 dark:text-white mb-1">
                            Latest Measurement
                          </div>
                          <LatestRun runs={it.runs} />
                        </div>

                        {/* Inspector evidences (photos/docs/videos) */}
                        <EvidenceList evidences={it.evidences} />

                        {/* Toggle history */}
                        {(it.runs?.length || 0) > 1 && (
                          <>
                            <button
                              className="mt-3 text-[12px] px-4 h-9 rounded-full border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-neutral-950 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition text-slate-900 dark:text-white"
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
          <div className="p-4 border-t border-slate-200/80 dark:border-white/10 flex items-center justify-end gap-2 bg-white/80 dark:bg-neutral-950/80 backdrop-blur">
            <button
              className="text-sm px-5 h-10 rounded-full border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-neutral-950 hover:bg-slate-50 dark:hover:bg-white/[0.03] text-slate-900 dark:text-white transition"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
        {/* scrollable body end */}
      </div>
    </div>
  );
}
