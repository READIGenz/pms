// src/views/home/modules/WIR/FollowupScheduleModal.tsx
import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../../../api/client";

type WirItemLite = {
  id: string;
  inspectorStatus?: "PASS" | "FAIL" | "NA" | null; // runner enum
  status?: string | null;                          // mirrored service status (OK/NCR/Pending)
};

type WirDocLite = {
  wirId: string;
  code?: string | null;
  title?: string | null;
  forDate?: string | null;            // ISO
  forTime?: string | null;            // "HH:MM"
  rescheduleForDate?: string | null;
  rescheduleForTime?: string | null;
  version?: number | null;
  items?: WirItemLite[];
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
  nextVersionLabel: string;           // e.g. "→ v3" or "— Next"
  onClose: () => void;
  onCreated?: (newWirId?: string) => void;
}) {
  const [dateISO, setDateISO] = useState("");
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Load authoritative WIR (with items + latest inspector/status mirrors)
  const [fullWir, setFullWir] = useState<any | null>(null);
  const [loadingWir, setLoadingWir] = useState(false);

  useEffect(() => {
    const d =
      (wir.rescheduleForDate || wir.forDate || "").slice(0, 10) ||
      new Date().toISOString().slice(0, 10);
    const t = wir.rescheduleForTime || wir.forTime || "";
    setDateISO(d);
    setTime(t);
  }, [wir]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        setLoadingWir(true);
        const { data } = await api.get(`/projects/${projectId}/wir/${wir.wirId}`);
        if (!ignore) setFullWir(data || null);
      } catch {
        if (!ignore) setFullWir(null);
      } finally {
        if (!ignore) setLoadingWir(false);
      }
    }
    load();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, wir?.wirId]);

  const header = useMemo(() => {
    return [wir.code || undefined, wir.title || undefined, nextVersionLabel]
      .filter(Boolean)
      .join(" — ");
  }, [wir.code, wir.title, nextVersionLabel]);

  // Pick failed items (explicit FAIL or mirrored NCR)
  const failedItemIds = useMemo(() => {
    const base = (fullWir || wir) as any;
    const items: WirItemLite[] = Array.isArray(base?.items) ? base.items : [];
    return items
      .filter((it) => {
        const insp = String(it?.inspectorStatus || "").toUpperCase();
        const st = String(it?.status || "").toUpperCase();
        return insp === "FAIL" || st === "NCR";
      })
      .map((it) => it.id)
      .filter(Boolean);
  }, [fullWir, wir]);

  async function createFollowup() {
    setSubmitting(true);
    setErr(null);
    try {
      // EXACT shape the controller expects for /followup
      const body = {
        forDate: dateISO,                            // "YYYY-MM-DD"
        forTime: time,                               // "HH:mm"
        includeItemIds: failedItemIds,               // REQUIRED by controller
        title:
          nextVersionLabel && (wir?.title || "").trim()
            ? `${wir.title} ${nextVersionLabel}`
            : wir?.title || undefined,
        description: note?.trim() || undefined,      // optional
      };

      const { data } = await api.post(
        `/projects/${projectId}/wir/${wir.wirId}/followup`,
        body
      );

      // BE returns { wirId, version, ... }
      onCreated?.(data?.wirId);
      onClose();
    } catch (e: any) {
      setErr(
        e?.response?.data?.message ||
          e?.response?.data?.error ||
          e?.message ||
          "Failed to create follow-up."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const disabled =
    submitting || loadingWir || !dateISO || !time || failedItemIds.length === 0;

  return (
    <div
      className="fixed inset-0 z-[113] flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl border dark:border-neutral-800 w-[92vw] max-w-lg p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="text-base font-semibold dark:text-white">
            {`Schedule Follow-up ${nextVersionLabel || ""}`}
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
              {loadingWir ? (
                <>Scanning items…</>
              ) : (
                <>
                  This follow-up will include <b>{failedItemIds.length}</b> failed
                  item{failedItemIds.length === 1 ? "" : "s"} from the current
                  version.
                </>
              )}
            </div>

            <div>
              <label className="text-[12px] block mb-1 text-gray-600 dark:text-gray-300">
                Date
              </label>
              <input
                type="date"
                value={dateISO}
                onChange={(e) => setDateISO(e.target.value)}
                className="w-full text-sm px-3 py-2 rounded-lg border dark:border-neutral-800 bg-white dark:bg-neutral-900"
              />
            </div>

            <div>
              <label className="text-[12px] block mb-1 text-gray-600 dark:text-gray-300">
                Time
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full text-sm px-3 py-2 rounded-lg border dark:border-neutral-800 bg-white dark:bg-neutral-900"
              />
            </div>

            <div>
              <label className="text-[12px] block mb-1 text-gray-600 dark:text-gray-300">
                Note (optional)
              </label>
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
            disabled={disabled}
            onClick={createFollowup}
            title={
              failedItemIds.length === 0
                ? "There are no FAILED/NCR items in this WIR"
                : "Create next version with only FAILED/NCR items"
            }
          >
            {submitting ? "Creating…" : "Create Follow-up"}
          </button>
        </div>
      </div>
    </div>
  );
}
