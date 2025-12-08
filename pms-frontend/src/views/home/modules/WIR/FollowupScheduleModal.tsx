// src/views/home/modules/WIR/FollowupScheduleModal.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../../api/client";

// ---- dev logging helper (keeps logs consistent) ----
function flog(label: string, obj?: any) {
  try {
    console.info(`[Followup] ${label}:`, obj ?? "");
  } catch {
    console.info(`[Followup] ${label} (unserializable)`);
  }
}

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
  seriesId?: string | null;           // Needed to pass parent series
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

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const navigate = useNavigate();

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
        // unwrap common shapes: {data}, {wir}, or bare row
        const row =
          (data && (data.data || data.wir)) ? (data.data || data.wir) : data;
        if (!ignore) setFullWir(row || null);
      } catch {
        if (!ignore) setFullWir(null);
      } finally {
        if (!ignore) setLoadingWir(false);
      }
    }
    load();
    return () => { ignore = true; };
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

  function buildFollowupBody() {
    const body = {
      // LEGACY payload (your BE tolerance accepts this)
      forDate: dateISO,                       // "YYYY-MM-DD"
      forTime: time,                          // "HH:mm"
      includeItemIds: failedItemIds,          // controller maps -> itemIds
      seriesId: wir?.seriesId || undefined,
      title:
        nextVersionLabel && (wir?.title || "").trim()
          ? `${wir.title} ${nextVersionLabel}`
          : wir?.title || undefined,
      description: note?.trim() || undefined, // controller reads description or note
    };
    flog("buildFollowupBody()", {
      parentWirId: wir?.wirId,
      dateISO,
      time,
      failedCount: failedItemIds.length,
      sampleFailed: failedItemIds.slice(0, 5),
      body,
    });
    return body;
  }

  async function createFollowup() {
    setSubmitting(true);
    setErr(null);
    try {
      flog("create:start", {
        projectId,
        parentWirId: wir?.wirId,
        locationBefore: window.location.pathname,
      });

      const body = buildFollowupBody();

      flog("POST /followup ->", {
        url: `/projects/${projectId}/wir/${wir.wirId}/followup`,
        body,
      });
      const { data } = await api.post(
        `/projects/${projectId}/wir/${wir.wirId}/followup`,
        body
      );

      // BE returns { wirId, version, ... }
      flog("POST success: raw data", data);
      const newId = data?.wirId ?? data?.data?.wirId;
      flog("derived newId", newId);

      if (onCreated) onCreated(newId);
      // // Always take user to the doc page with the /home prefix (prevents reload → auth guard → /login)
      // if (newId) {
      //   const target = `/home/projects/${projectId}/wir/${newId}/doc`;
      //   flog("navigate()", { target });
      //   navigate(target, { state: { project: { projectId } } });
      // }
      // Go to WIR LIST view (with /home prefix to avoid auth guard flicker)
      // Tip: we also pass the freshly created WIR id in state so list view can highlight/scroll if desired.
      {
        const target = `/home/projects/${projectId}/wir`;
        flog("navigate()", { target, focusWirId: newId });
        navigate(target, {
          state: { project: { projectId }, focusWirId: newId ?? null },
          replace: true,
        });
      }
      flog("closing modal");
      onClose();
      setTimeout(() => {
        flog("locationAfterSuccess", window.location.pathname);
      }, 0);
    } catch (e: any) {
      // Maximum visibility on why FE might treat this as auth loss
      flog("ERROR", {
        message: e?.message,
        status: e?.response?.status,
        data: e?.response?.data,
        headers: e?.response?.headers,
        axiosUrl: e?.config?.url,
        axiosMethod: e?.config?.method,
        responseURL: e?.request?.responseURL,
        locationNow: window.location.pathname,
      });
      if (e?.response?.status === 400) {
        console.warn(
          "[Followup] 400 detected — if an axios interceptor treats 400/403 as auth loss, this would trigger a redirect to /login."
        );
      }
      setErr(
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        "Failed to create follow-up."
      );
    } finally {
      flog("create:finally", {
        submittingWas: true,
        locationFinally: window.location.pathname,
      });
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
            onClick={() => setConfirmOpen(true)}
            title={
              failedItemIds.length === 0
                ? "There are no FAILED/NCR items in this WIR"
                : "Create next version with only FAILED/NCR items"
            }
          >
            {submitting ? "Creating…" : "Create Follow-up"}
          </button>
        </div>

        {confirmOpen && (
          <div className="fixed inset-0 z-[114] flex items-center justify-center bg-black/50">
            <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl border dark:border-neutral-800 w-[92vw] max-w-xl p-4">
              <div className="flex items-center justify-between">
                <div className="text-base font-semibold dark:text-white">Confirm Follow-up</div>
                <button
                  className="text-sm px-3 py-2 rounded-lg border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                  onClick={() => !confirmBusy && setConfirmOpen(false)}
                  disabled={confirmBusy}
                >
                  Close
                </button>
              </div>

              <div className="mt-3 text-sm divide-y">
                <div className="py-2 flex justify-between gap-3">
                  <div className="text-gray-600 dark:text-gray-300">Parent</div>
                  <div className="text-right dark:text-white truncate">
                    {(wir.code ? `${wir.code} — ` : "") + (wir.title || "WIR")}
                  </div>
                </div>

                <div className="py-2 flex justify-between gap-3">
                  <div className="text-gray-600 dark:text-gray-300">Date</div>
                  <div className="text-right dark:text-white">{dateISO || "—"}</div>
                </div>

                <div className="py-2 flex justify-between gap-3">
                  <div className="text-gray-600 dark:text-gray-300">Time</div>
                  <div className="text-right dark:text-white">{time || "—"}</div>
                </div>

                <div className="py-2 flex justify-between gap-3">
                  <div className="text-gray-600 dark:text-gray-300">Failed Items</div>
                  <div className="text-right dark:text-white">{failedItemIds.length}</div>
                </div>

                <div className="py-2">
                  <div className="text-gray-600 dark:text-gray-300 mb-1">Failed Item IDs (sample)</div>
                  <div className="text-[12px] font-mono break-all dark:text-white">
                    {failedItemIds.slice(0, 5).join(", ")}
                    {failedItemIds.length > 5 ? " …" : ""}
                  </div>
                </div>

                <div className="py-2">
                  <div className="text-gray-600 dark:text-gray-300 mb-1">JSON to be sent</div>
                  <pre className="text-[12px] leading-snug whitespace-pre-wrap break-all font-mono p-2 rounded-lg border dark:border-neutral-800 dark:text-white bg-gray-50 dark:bg-neutral-800/50">
                    {JSON.stringify(buildFollowupBody(), null, 2)}
                  </pre>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  className="px-3 py-2 text-sm rounded-lg border dark:border-neutral-800"
                  onClick={() => setConfirmOpen(false)}
                  disabled={confirmBusy}
                >
                  Back
                </button>
                <button
                  className="px-3 py-2 text-sm rounded-lg bg-emerald-600 text-white disabled:opacity-60"
                  onClick={async () => {
                    flog("confirmClick", { disabled, loadingWir, submitting, failedCount: failedItemIds.length });
                    setConfirmBusy(true);
                    try {
                      await createFollowup();
                    } finally {
                      setConfirmBusy(false);
                      setConfirmOpen(false);
                    }
                  }}
                  disabled={confirmBusy || submitting || loadingWir || failedItemIds.length === 0}
                  title={
                    failedItemIds.length === 0
                      ? "There are no FAILED/NCR items in this WIR"
                      : "Create next version with only FAILED/NCR items"
                  }
                >
                  {confirmBusy ? "Creating…" : "Confirm & Create"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
