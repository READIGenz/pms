// src/views/home/modules/WIR/FollowupScheduleModal.tsx
import React, { useMemo, useState, useEffect } from "react";
import { api } from "../../../../api/client";

type WirDocLite = {
  wirId: string;
  code?: string | null;
  title?: string | null;
  forDate?: string | null;     // ISO
  forTime?: string | null;     // "HH:MM"
  rescheduleForDate?: string | null;
  rescheduleForTime?: string | null;
  // minimal item shape needed to filter FAILED ones
  items?: Array<{ id: string; inspectorStatus?: "PASS" | "FAIL" | "NA" | null }>;
  version?: number | null;
  contractorId?: string | null;
  bicUserId?: string | null;
  cityTown?: string | null;
  stateName?: string | null;
};

export default function FollowupScheduleModal({
  projectId,
  wir,
  nextVersionLabel,
  onClose,
  onCreated,
}: {
  projectId: string;
  wir: WirDocLite;
  nextVersionLabel: string;
  onClose: () => void;
  /** call with new WIR id once wired to backend */
  onCreated?: (newWirId?: string) => void;
}) {
  const [dateISO, setDateISO] = useState("");
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Seed from latest effective plan (same heuristic you use elsewhere)
  useEffect(() => {
    const d =
      (wir.rescheduleForDate || wir.forDate || "").slice(0, 10) ||
      new Date().toISOString().slice(0, 10);
    const t = wir.rescheduleForTime || wir.forTime || "";
    setDateISO(d);
    setTime(t);
  }, [wir]);

  const header = useMemo(() => {
    const parts = [wir.code || undefined, wir.title || undefined, nextVersionLabel].filter(Boolean);
    return parts.join(" — ");
  }, [wir.code, wir.title, nextVersionLabel]);

  const failedItemIds = useMemo(
    () =>
      (wir.items || [])
        .filter((it) => (it.inspectorStatus || "").toUpperCase() === "FAIL")
        .map((it) => it.id),
    [wir.items]
  );

  const nextVersionNum = useMemo(
    () => (typeof wir?.version === "number" ? wir.version + 1 : 1),
    [wir?.version]
  );

  return (
    <div className="fixed inset-0 z-[113] flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl border dark:border-neutral-800 w-[92vw] max-w-lg p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="text-base font-semibold dark:text-white">
            {`Schedule Followup ${nextVersionLabel}`}
          </div>
          <button
            className="text-sm px-3 py-2 rounded-lg border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {/* Context line */}
        <div className="mt-1 text-[12px] text-gray-600 dark:text-gray-300 truncate">
          {header}
        </div>

        {/* Body */}
        <div className="mt-3 space-y-3 text-sm">
          <div className="rounded-xl border dark:border-neutral-800 p-3 space-y-3">
            <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
              New Follow-up Plan
            </div>
            <div className="text-[12px] text-gray-600 dark:text-gray-300">
              This follow-up will include <b>{failedItemIds.length}</b> failed item{failedItemIds.length === 1 ? "" : "s"} from the current version.
            </div>

            <div>
              <label className="text-[12px] block mb-1 text-gray-600 dark:text-gray-300">Date</label>
              <input
                type="date"
                value={dateISO}
                onChange={(e) => setDateISO(e.target.value)}
                className="w-full text-sm px-3 py-2 rounded-lg border dark:border-neutral-800 bg-white dark:bg-neutral-900"
              />
            </div>

            <div>
              <label className="text-[12px] block mb-1 text-gray-600 dark:text-gray-300">Time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full text-sm px-3 py-2 rounded-lg border dark:border-neutral-800 bg-white dark:bg-neutral-900"
              />
            </div>

            <div>
              <label className="text-[12px] block mb-1 text-gray-600 dark:text-gray-300">Note (optional)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Any context for the follow-up…"
                className="w-full text-sm px-3 py-2 rounded-lg border dark:border-neutral-800 bg-white dark:bg-neutral-900"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-end gap-2">
          {err ? <div className="mr-auto text-[12px] text-rose-600">{err}</div> : null}
          <button
            className="px-3 py-2 text-sm rounded-lg border dark:border-neutral-800"
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            className="px-3 py-2 text-sm rounded-lg bg-emerald-600 text-white disabled:opacity-60"
            disabled={submitting || !dateISO || !time || failedItemIds.length === 0}
            onClick={async () => {
              try {
                setErr(null);
                if (failedItemIds.length === 0) {
                  setErr("No FAILED items to carry forward.");
                  return;
                }
                setSubmitting(true);
                const payload = {
                  forDate: dateISO,
                  forTime: time,
                  note: note?.trim() || null,
                  includeItemIds: failedItemIds, // ONLY the failed items
                  // Chain & hand-off fields
                  prevWirId: wir.wirId,                            // link to parent
                  version: nextVersionNum,                         // incremented version
                  contractorId: wir.contractorId ?? null,          // carry contractor
                  bicUserId: wir.contractorId ?? wir.bicUserId ?? null, // hand BIC to contractor (fallback to existing BIC)
                  cityTown: wir.cityTown ?? null,                  // carry location (optional)
                  stateName: wir.stateName ?? null,                // carry location (optional)
                };
                const { data } = await api.post(
                  `/projects/${projectId}/wir/${wir.wirId}/followup`,
                  payload
                );
                const newWirId =
                  data?.wirId || data?.id || data?.wir?.wirId || data?.wir?.id;
                onCreated?.(newWirId);
                onClose();
              } catch (e: any) {
                setErr(e?.response?.data?.error || e?.message || "Failed to create follow-up.");
              } finally {
                setSubmitting(false);
              }
            }}
            title={
              failedItemIds.length === 0
                ? "There are no FAILED items in this WIR"
                : "Create next version with only FAILED items"
            }
          >
            {submitting ? "Creating…" : "Create Followup"}
          </button>
        </div>
      </div>
    </div>
  );
}
