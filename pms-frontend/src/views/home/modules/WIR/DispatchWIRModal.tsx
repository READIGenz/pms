// src/views/home/modules/WIR/DispatchWIRModal.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  listActiveMembersForProjectRole,
  resolveActingRoleFor,
  resolveActingRoleForVerbose,
  todayISO,
  type ActingRole,
} from "./memberships.helpers";
import { api } from "../../../../api/client";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../hooks/useAuth";

type Props = {
  open: boolean;
  onClose: () => void;
  creatorName: string;
  role: string; // already normalized upstream
  projectCaption?: string; // "PRJ-001 — Tower A"
  projectId: string;
  /** NEW: target WIR id to dispatch */
  wirId: string;
  /** NEW: optional optimistic patch to parent list */
  onDispatched?: (patch: {
    wirId: string;
    status: "Submitted";
    code?: string;
    bicUserId: string;
    bicFullName?: string; // NEW
    updatedAt?: string;
    version?: number; // <— NEW
  }) => void;
};

/** Simple shape for recipients (UI) */
type Recipient = {
  id: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  /** Derived acting role: "Inspector" | "HOD" | "Inspector+HOD" */
  acting: "Inspector" | "HOD" | "Inspector+HOD";
};

/** Display name normalizer (kept tiny; no old heuristics) */
function displayName(u: any): string {
  const s =
    u?.fullName ||
    u?.name ||
    [u?.firstName, u?.lastName].filter(Boolean).join(" ") ||
    u?.displayName ||
    u?.email ||
    u?.code ||
    u?.id ||
    "User";
  return String(s);
}

/* ---------------- UI helpers (theme only) ---------------- */
function SectionHeader({
  title,
  sub,
}: {
  title: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="inline-block h-5 w-1 rounded-full bg-[#FCC020]" />
          <div className="text-[13px] sm:text-sm font-semibold tracking-wide text-[#00379C] dark:text-white uppercase">
            {title}
          </div>
        </div>
        {sub ? (
          <div className="mt-1 text-[12px] text-gray-600 dark:text-gray-300">
            {sub}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function DispatchWIRModal({
  open,
  onClose,
  creatorName,
  role,
  projectCaption,
  projectId,
  wirId,
  onDispatched,
}: Props) {
  if (!open) return null;

  const navigate = useNavigate(); // NEW

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Recipient[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // NEW: confirm dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmInspector, setConfirmInspector] = useState<Recipient | null>(
    null
  );
  const { user, claims } = useAuth();
  const [wirMeta, setWirMeta] = useState<{
    code?: string | null;
    title?: string | null;
  } | null>(null);
  const [wirHeader, setWirHeader] = useState<any>(null);
  // Same rule we used in CreateWIR.tsx
  const currentUserId =
    (claims as any)?.sub ||
    (claims as any)?.userId ||
    (claims as any)?.id ||
    (user as any)?.userId ||
    (user as any)?.id ||
    null;

  const params = useParams<{ wirId?: string }>();
  const targetWirId = wirId || params.wirId || undefined;

  // Fetch on open+projectId
  useEffect(() => {
    let abort = false;
    async function run() {
      if (!open || !projectId) return;
      setLoading(true);
      setErr(null);
      setCandidates([]);
      setSelectedId(null);

      try {
        // list all active PMC members for this project (today)
        const onDate = todayISO();
        const members = await listActiveMembersForProjectRole(
          projectId,
          "PMC",
          onDate
        );

        // Resolve acting role PER USER using base+overrides (deny-only)
        const mapped: Recipient[] = [];
        for (const { user } of members) {
          const uid = String(user.userId || "");
          if (!uid) continue;

          const diag = await resolveActingRoleForVerbose(projectId, "PMC", uid);
          console.log("[DispatchWIR] role diag", {
            uid,
            name: displayName(user),
            ...diag,
          });
          const acting: ActingRole = diag.acting;

          if (acting === "HOD") continue; // exclude pure HOD; allow ViewerOnly + Inspector + Inspector+HOD

          mapped.push({
            id: uid,
            fullName: displayName(user),
            email: user.email ?? null,
            phone:
              (user as any)?.displayPhone ??
              (user as any)?.phone ??
              (user as any)?.mobile ??
              null,
            acting: (acting === "Inspector+HOD"
              ? "Inspector+HOD"
              : acting) as Recipient["acting"],
          });
        }

        if (!abort) setCandidates(mapped);
      } catch (e: any) {
        const msg =
          e?.response?.data?.error ||
          e?.message ||
          "Failed to load recipients.";
        if (!abort) {
          setErr(msg);
          setCandidates([]);
        }
      } finally {
        if (!abort) setLoading(false);
      }
    }
    run();
    return () => {
      abort = true;
    };
  }, [open, projectId]);

  // NEW: fetch WIR code/title for the confirm dialog
  useEffect(() => {
    let abort = false;
    async function loadWirMeta() {
      if (!open || !projectId || !targetWirId) return;
      try {
        const { data } = await api.get(
          `/projects/${projectId}/wir/${targetWirId}`
        );
        if (!abort) {
          setWirHeader(data || null);
          setWirMeta({ code: data?.code ?? null, title: data?.title ?? null });
        }
      } catch {
        if (!abort) {
          setWirHeader(null);
          setWirMeta(null);
        }
      }
    }
    loadWirMeta();
    return () => {
      abort = true;
    };
  }, [open, projectId, targetWirId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) =>
      [c.fullName, c.email, c.phone, c.acting]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [candidates, search]);

  // NEW: label for Confirm dialog
  const wirLabel = useMemo(() => {
    if (!targetWirId) return "—";
    const parts: string[] = [];
    if (wirMeta?.code) parts.push(String(wirMeta.code));
    if (wirMeta?.title) parts.push(String(wirMeta.title));
    return parts.length ? parts.join(" — ") : targetWirId;
  }, [wirMeta, targetWirId]);

  const toggle = (id: string) => setSelectedId((prev) => (prev === id ? null : id));

  const canSend = !!selectedId && !submitting && !!targetWirId;
  // helper: canonical status checks
  const isDraftStatus = (s?: string | null) =>
    typeof s === "string" && s.toLowerCase().includes("draft");
  const isSubmittedStatus = (s?: string | null) =>
    typeof s === "string" && s.toLowerCase().includes("submit");

  // HOD preview dialog
  const [hodPreviewOpen, setHodPreviewOpen] = useState(false);
  const [hodPatch, setHodPatch] = useState<Record<string, any> | null>(null);

  const isHodFlow = useMemo(() => {
    // route by current WIR status:
    // - Draft      -> Inspector dispatch ("Confirm & Send")
    // - Submitted  -> HOD path ("Proceed & Send")
    return isSubmittedStatus(wirHeader?.status);
  }, [wirHeader?.status]);

  const confirmCta = useMemo(() => {
    // status-driven CTA
    return isHodFlow
      ? submitting
        ? "Sending…"
        : "Proceed & Send"
      : submitting
      ? "Sending…"
      : "Confirm & Send";
  }, [isHodFlow, submitting]);

  function onSend() {
    const inspectorId = selectedId || "";
    if (!inspectorId) {
      setErr("Please pick an Inspector.");
      return;
    }
    if (!targetWirId) {
      setErr(
        "Missing WIR ID. Open this from a WIR detail/edit screen and try again."
      );
      return;
    }

    const inspector = candidates.find((c) => c.id === inspectorId);
    if (!inspector) {
      setErr("Selected Inspector not found.");
      return;
    }

    // Open confirmation dialog with snapshot of the data
    setConfirmInspector(inspector);
    setConfirmOpen(true);
  }

  async function performDispatch(inspectorId: string) {
    if (!targetWirId) return;

    setSubmitting(true);
    setErr(null);
    try {
      const dispatchBody: any = {
        inspectorId,
        assignCode: true,
        materializeIfNeeded: true,
      };
      // >>> add creator stamp if we have it
      if (currentUserId) dispatchBody.createdById = currentUserId;

      const { data } = await api.post(
        `/projects/${projectId}/wir/${targetWirId}/dispatch`,
        dispatchBody
      );

      // --- ensure version = 1 on submit (idempotent/no-op if BE already did it)
      let ensuredVersion: number | undefined = data?.version;
      try {
        // Only patch if BE didn’t return a valid version >= 1
        if (!ensuredVersion || ensuredVersion !== 1) {
          const v = await api.patch(
            `/projects/${projectId}/wir/${targetWirId}`,
            { version: 1 } // <— enforce version 1 at submit
          );
          ensuredVersion = v?.data?.version ?? 1;
        }
      } catch (e) {
        console.warn("[WIR] version patch failed (non-blocking)", e);
        // still fall back to 1 so UI stays consistent
        if (!ensuredVersion || ensuredVersion < 1) ensuredVersion = 1;
      }

      onDispatched?.({
        wirId: data?.wirId ?? targetWirId,
        status: "Submitted",
        code: data?.code ?? undefined,
        bicUserId: inspectorId,
        bicFullName:
          confirmInspector?.fullName || data?.bicFullName || data?.inspectorName, // NEW
        updatedAt: data?.updatedAt,
        version: ensuredVersion ?? 1,
      });

      // Close confirm + modal
      setConfirmOpen(false);
      setConfirmInspector(null);
      onClose?.();

      // Navigate back to WIR list view for this project
      const baseList =
        role === "Contractor"
          ? `/home/projects/${projectId}/wir`
          : role === "PMC"
          ? `/home/projects/${projectId}/wir`
          : role === "IH-PMT"
          ? `/home/projects/${projectId}/wir`
          : role === "Client"
          ? `/home/projects/${projectId}/wir`
          : `/home/projects/${projectId}/wir`;

      navigate(baseList, {
        state: {
          role,
          project: projectCaption
            ? { projectId, title: projectCaption }
            : { projectId },
        },
      });
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Failed to dispatch.");
    } finally {
      setSubmitting(false);
    }
  }

  const onConfirmSend = () => {
    if (!confirmInspector) return;
    if (isHodFlow) {
      // Build patch for preview
      const hodId = confirmInspector.id;
      const patch: Record<string, any> = {
        hodId,
        bicUserId: hodId,
        status: "Recommended",
        version: 1,
      };
      // carry inspectorRecommendation if present (from header)
      if (wirHeader?.inspectorRecommendation != null) {
        patch.inspectorRecommendation = wirHeader.inspectorRecommendation;
      }
      // optional: try mapping createdById to contractorId if available
      if (currentUserId) {
        patch.contractorId = currentUserId;
      }
      setHodPatch(patch);
      setHodPreviewOpen(true);
      return;
    }
    void performDispatch(confirmInspector.id);
  };

  async function applyHodPatch() {
    if (!targetWirId || !hodPatch || !confirmInspector) return;
    setSubmitting(true);
    setErr(null);
    try {
      const { data } = await api.patch(
        `/projects/${projectId}/wir/${targetWirId}`,
        hodPatch
      );
      onDispatched?.({
        wirId: data?.wirId ?? targetWirId,
        status: data?.status ?? "Recommended",
        code: data?.code ?? undefined,
        bicUserId: data?.bicUserId ?? hodPatch.bicUserId,
        bicFullName: confirmInspector.fullName,
        updatedAt: data?.updatedAt,
        version: data?.version ?? 1,
      });
      setHodPreviewOpen(false);
      setConfirmOpen(false);
      setConfirmInspector(null);
      onClose?.();
    } catch (e: any) {
      setErr(
        e?.response?.data?.message || e?.message || "Failed to send to HOD."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]">
      {/* Modal panel: full-height sheet on mobile; centered card on sm+ with scrollable content */}
      <div
        className="
          absolute inset-x-0 bottom-0
          sm:static sm:mx-auto sm:mt-16
          w-full sm:w-auto sm:max-w-xl
          bg-white dark:bg-neutral-950
          border-t sm:border border-slate-200 dark:border-white/10
          rounded-t-2xl sm:rounded-2xl
          shadow-sm
          h-[92vh] sm:h-auto
          max-h-[92vh] sm:max-h-[85vh]
          overflow-y-auto
        "
      >
        {/* Header */}
        <div className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-base sm:text-lg font-semibold text-[#00379C] dark:text-white">
                Dispatch Work Inspection
              </div>
              {projectCaption ? (
                <div className="mt-1 text-[12px] text-gray-600 dark:text-gray-300 truncate">
                  {projectCaption}
                </div>
              ) : null}
            </div>

            <button
              onClick={onClose}
              className="shrink-0 h-10 px-4 rounded-full border
                         border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 active:scale-[0.99]
                         dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-200 dark:hover:bg-rose-900/30"
            >
              Close
            </button>
          </div>

          {/* Meta (creator + role) */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-neutral-950 p-4">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[#00379C] dark:text-gray-200">
                Created By
              </div>
              <div className="mt-1 text-[15px] sm:text-sm text-gray-900 dark:text-white">
                {creatorName || "—"}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-neutral-950 p-4">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[#00379C] dark:text-gray-200">
                Your Role
              </div>
              <div className="mt-1 text-[15px] sm:text-sm text-gray-900 dark:text-white">
                {role || "—"}
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 sm:px-5 pb-5 space-y-4">
          {/* Recipients */}
          <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-neutral-950 p-4">
            <SectionHeader
              title="Recipients"
              sub="PMC members assigned to this project"
            />

            <div className="mt-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, phone, or role…"
                className="w-full h-10 rounded-full border border-slate-200 dark:border-white/10
                           bg-white dark:bg-neutral-900 text-gray-900 dark:text-white
                           px-4 text-[15px] sm:text-sm
                           outline-none focus:ring-2 focus:ring-[#00379C]/25"
              />
            </div>

            <div className="mt-3 h-[38vh] sm:max-h-[40vh] overflow-auto space-y-2 pr-1">
              {loading ? (
                <div className="text-[13px] sm:text-sm text-gray-600 dark:text-gray-300 p-2">
                  Loading recipients…
                </div>
              ) : err ? (
                <div className="text-[13px] sm:text-sm text-rose-700 dark:text-rose-300 p-2">
                  {err}
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-[13px] sm:text-sm text-gray-600 dark:text-gray-300 p-3 rounded-2xl border border-dashed border-slate-200 dark:border-white/10">
                  No recipients to show. (PMC users without WIR permissions are
                  hidden.)
                </div>
              ) : (
                filtered.map((r) => {
                  const isSelected = selectedId === r.id;
                  return (
                    <label
                      key={r.id}
                      className={[
                        "flex items-start gap-3 p-3 rounded-2xl border transition cursor-pointer",
                        "border-slate-200 dark:border-white/10",
                        "hover:bg-slate-50 dark:hover:bg-neutral-900/60",
                        isSelected
                          ? "bg-[#23A192]/5 border-[#23A192]/40"
                          : "bg-white dark:bg-neutral-950",
                      ].join(" ")}
                    >
                      <input
                        type="radio"
                        name="recipient"
                        className="mt-0.5 h-5 w-5 accent-[#23A192]"
                        checked={isSelected}
                        onChange={() => toggle(r.id)}
                      />

                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] sm:text-sm font-medium text-gray-900 dark:text-white truncate">
                          {r.fullName}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span
                            className="text-[11px] px-2 py-1 rounded-full border
                                       border-[#23A192]/30 text-[#23A192]
                                       dark:border-[#23A192]/40 dark:text-[#23A192]"
                          >
                            {r.acting}
                          </span>

                          {r.email ? (
                            <span className="text-[11px] px-2 py-1 rounded-full border border-slate-200 dark:border-white/10 text-gray-600 dark:text-gray-300 truncate">
                              {r.email}
                            </span>
                          ) : null}

                          {r.phone ? (
                            <span className="text-[11px] px-2 py-1 rounded-full border border-slate-200 dark:border-white/10 text-gray-600 dark:text-gray-300">
                              {r.phone}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <span
                        className={[
                          "text-[11px] px-2 py-1 rounded-full border shrink-0",
                          isSelected
                            ? "border-[#FCC020]/50 bg-[#FCC020]/15 text-[#00379C] dark:text-white"
                            : "border-slate-200 dark:border-white/10 text-gray-500 dark:text-gray-400",
                        ].join(" ")}
                      >
                        {isSelected ? "Selected" : "Pick"}
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            <div className="mt-3 text-[12px] text-gray-600 dark:text-gray-300">
              Selected: <b className="text-gray-900 dark:text-white">{selectedId ? 1 : 0}</b>
            </div>
          </section>

          {/* AI Routing & Summary */}
          <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-neutral-950 p-4">
            <SectionHeader title="AI Routing & Summary" />
            <div className="mt-2 text-[13px] sm:text-sm text-gray-600 dark:text-gray-300">
              We’ll add routing rules and a compact summary here (auto-generated
              for recipients) in the next step.
            </div>
          </section>

          {/* Actions */}
          <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-neutral-950 p-4">
            {err && !loading ? (
              <div className="text-[12px] sm:text-sm text-rose-700 dark:text-rose-300 mb-3">
                {err}
              </div>
            ) : null}

            <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-end">
              <button
                onClick={onClose}
                className="w-full sm:w-auto h-10 text-sm px-5 rounded-full border
                           border-slate-200 dark:border-white/10
                           hover:bg-slate-50 dark:hover:bg-neutral-900/60
                           text-gray-800 dark:text-gray-200"
              >
                Cancel
              </button>

              <button
                onClick={onSend}
                disabled={!canSend}
                className={[
                  "w-full sm:w-auto h-10 text-sm px-6 rounded-full border transition",
                  canSend
                    ? "bg-[#00379C] text-white border-[#00379C] hover:brightness-110"
                    : "bg-[#00379C]/60 text-white border-[#00379C]/60 cursor-not-allowed",
                ].join(" ")}
                title={canSend ? "Send" : "Select a recipient"}
              >
                {submitting ? "Sending…" : "Send"}
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* Confirm Dispatch */}
      {confirmOpen && confirmInspector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md mx-4 rounded-2xl bg-white dark:bg-neutral-950 border border-slate-200 dark:border-white/10 p-4 sm:p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="inline-block h-5 w-1 rounded-full bg-[#FCC020]" />
              <div className="text-base font-semibold text-[#00379C] dark:text-white">
                Confirm Dispatch
              </div>
            </div>

            <div className="mt-3 space-y-2 text-sm text-gray-700 dark:text-gray-200">
              <div>
                <span className="font-medium text-gray-900 dark:text-white">
                  Project:
                </span>{" "}
                {projectCaption || projectId}
              </div>
              <div>
                <span className="font-medium text-gray-900 dark:text-white">
                  WIR:
                </span>{" "}
                {wirLabel}
              </div>

              <div>
                <span className="font-medium text-gray-900 dark:text-white">
                  Recipient:
                </span>{" "}
                {confirmInspector.fullName} ({confirmInspector.acting})
              </div>
              {confirmInspector.email && (
                <div>
                  <span className="font-medium text-gray-900 dark:text-white">
                    Email:
                  </span>{" "}
                  {confirmInspector.email}
                </div>
              )}
              {confirmInspector.phone && (
                <div>
                  <span className="font-medium text-gray-900 dark:text-white">
                    Phone:
                  </span>{" "}
                  {confirmInspector.phone}
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="w-full sm:w-auto h-10 text-sm px-5 rounded-full border
                           border-slate-200 dark:border-white/10
                           hover:bg-slate-50 dark:hover:bg-neutral-900/60
                           text-gray-800 dark:text-gray-200"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={onConfirmSend}
                disabled={submitting}
                className={[
                  "w-full sm:w-auto h-10 text-sm px-6 rounded-full border transition",
                  submitting
                    ? "bg-[#00379C]/60 text-white border-[#00379C]/60 cursor-not-allowed"
                    : "bg-[#00379C] text-white border-[#00379C] hover:brightness-110",
                ].join(" ")}
              >
                {confirmCta}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HOD Preview */}
      {hodPreviewOpen && hodPatch && confirmInspector && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md mx-4 rounded-2xl bg-white dark:bg-neutral-950 border border-slate-200 dark:border-white/10 p-4 sm:p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="inline-block h-5 w-1 rounded-full bg-[#FCC020]" />
              <div className="text-base font-semibold text-[#00379C] dark:text-white">
                Confirm Updates (Send to HOD)
              </div>
            </div>

            <div className="mt-3 text-sm text-gray-700 dark:text-gray-200 space-y-1">
              <div>
                <span className="font-medium text-gray-900 dark:text-white">
                  WIR:
                </span>{" "}
                {wirLabel}
              </div>
              <div>
                <span className="font-medium text-gray-900 dark:text-white">
                  HOD:
                </span>{" "}
                {confirmInspector.fullName}
              </div>

              <div className="mt-3 font-medium text-gray-900 dark:text-white">
                Fields to update:
              </div>
              <ul className="mt-1 list-disc pl-5 space-y-1">
                {"hodId" in hodPatch && (
                  <li>
                    hodId → <b>{hodPatch.hodId}</b>
                  </li>
                )}
                {"bicUserId" in hodPatch && (
                  <li>
                    bicUserId → <b>{hodPatch.bicUserId}</b>
                  </li>
                )}
                {"inspectorRecommendation" in hodPatch && (
                  <li>
                    inspectorRecommendation →{" "}
                    <i className="break-words">
                      {String(hodPatch.inspectorRecommendation)}
                    </i>
                  </li>
                )}
                {"status" in hodPatch && (
                  <li>
                    status → <b>{hodPatch.status}</b>
                  </li>
                )}
                {"version" in hodPatch && (
                  <li>
                    version → <b>{hodPatch.version}</b>
                  </li>
                )}
                {"contractorId" in hodPatch && (
                  <li>
                    contractorId → <b>{hodPatch.contractorId}</b>{" "}
                    <span className="opacity-70">(best-effort)</span>
                  </li>
                )}
              </ul>
            </div>

            <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setHodPreviewOpen(false)}
                className="w-full sm:w-auto h-10 text-sm px-5 rounded-full border
                           border-slate-200 dark:border-white/10
                           hover:bg-slate-50 dark:hover:bg-neutral-900/60
                           text-gray-800 dark:text-gray-200"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={applyHodPatch}
                disabled={submitting}
                className={[
                  "w-full sm:w-auto h-10 text-sm px-6 rounded-full border transition",
                  submitting
                    ? "bg-[#00379C]/60 text-white border-[#00379C]/60 cursor-not-allowed"
                    : "bg-[#00379C] text-white border-[#00379C] hover:brightness-110",
                ].join(" ")}
              >
                {submitting ? "Applying…" : "OK, Proceed"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
