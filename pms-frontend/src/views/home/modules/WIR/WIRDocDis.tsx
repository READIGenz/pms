// pms-frontend/src/views/home/modules/WIR/WIRDocDis.tsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../../../../api/client";
import { useAuth } from "../../../../hooks/useAuth";
import { useBicNameMap, pickBicName } from "./wir.bicNames";
import type { BicAware } from "./wir.bicNames";
import {
    type RoleKey,
    listActiveMembersForProjectRole,
    resolveActingRoleFor,
    displayNameLite,
    todayISO,
} from "./memberships.helpers";
import InspRecoInspRunner from "./InspRecoInspRunner";
import InspRecoHODRunner from "./InspRecoHODRunner";
import WIRDiscussion from "./WIRDiscussion";
import FollowupScheduleModal from "./FollowupScheduleModal";

type NavState = {
    role?: string;
    project?: { projectId: string; code?: string | null; title?: string | null };
};

type WirItemEvidence = {
    id: string;
    kind: "Photo" | "Video" | "File";
    url: string;
    thumbUrl?: string | null;
    fileName?: string | null;
    fileSize?: number | null;
    mimeType?: string | null;
    capturedAt?: string | null;
    createdAt?: string | null;
};

type WirItem = {
    id: string;
    seq?: number | null;
    code?: string | null;
    name?: string | null;
    spec?: string | null;            // requirement text lives here
    unit?: string | null;            // Prisma: WirItem.unit
    status?: string | null;
    tolerance?: string | null;       // string snapshot if present
    critical?: boolean | null;

    // From Prisma WirItem
    tags?: string[];                 // WirItem.tags
    // Note: Prisma Decimal comes back as string; allow both string/number to be safe.
    base?: number | string | null;   // WirItem.base
    plus?: number | string | null;   // WirItem.plus
    minus?: number | string | null;  // WirItem.minus
    inspectorStatus?: "PASS" | "FAIL" | "NA" | null; // WirItem.inspectorStatus
    inspectorNote?: string | null;                   // WirItem.inspectorNote
    // Latest runner hydration support (added by BE include)
    runs?: Array<{
        valueNumber: number | null;
        unit: string | null;
        status: "OK" | "NCR" | "Pending" | null;
        comment: string | null;
        createdAt: string;
    }>;
    evidences?: WirItemEvidence[];
};

type WirDoc = {
    wirId: string;
    code?: string | null;
    title?: string | null;
    status?: string | null;
    discipline?: string | null;
    forDate?: string | null; // ISO
    forTime?: string | null; // "HH:MM"
    cityTown?: string | null;
    stateName?: string | null;
    materialized?: boolean | null;
    snapshotAt?: string | null;
    bicUserId?: string | null;
    createdById?: string | null;
    inspectorId?: string | null;
    hodId?: string | null;
    contractorId?: string | null;
    hodOutcome?: "ACCEPT" | "REJECT" | null;
    hodRemarks?: string | null;
    hodDecidedAt?: string | null;
    version?: number | null;
    updatedAt?: string | null;
    checklists?: Array<{
        id: string;
        checklistId: string;
        checklistCode?: string | null;
        checklistTitle?: string | null;
        discipline?: string | null;
        versionLabel?: string | null;
        itemsTotal?: number | null;
        itemsCount?: number | null;
        order?: number | null;
    }>;
    items?: WirItem[];
    histories?: Array<{
        id: string;
        action: string;
        actorUserId?: string | null;
        actorName?: string | null;
        notes?: string | null;
        createdAt: string;
        meta?: any;
    }>;
    evidences?: WirItemEvidence[];
    // --- Inspector recommendation header fields (persisted on BE) ---
    inspectorRecommendation?: "APPROVE" | "APPROVE_WITH_COMMENTS" | "REJECT" | null;
    inspectorRemarks?: string | null;
    inspectorReviewedAt?: string | null;
    rescheduleForDate?: string | null;
    rescheduleForTime?: string | null;
    rescheduleReason?: string | null;
    rescheduledById?: string | null;
};

const canonicalWirStatus = (s?: string | null) => {
    const n = (s || "").toString().trim().toLowerCase();
    if (!n) return "Unknown";
    if (n.includes("draft")) return "Draft";
    if (n.includes("submit")) return "Submitted";
    if (n.includes("recommend")) return "Recommended";
    if (n.includes("approve_with_comments")) return "APPROVE_WITH_COMMENTS";
    if (n.includes("approve")) return "Approved";
    if (n.includes("reject")) return "Rejected";
    if (n.includes("return")) return "Returned";
    return "Unknown";
};

// 12-hour formatter for "HH:MM" strings
const fmtTime12 = (t?: string | null) => {
    if (!t) return "";
    const m = /^(\d{1,2}):(\d{2})/.exec(String(t));
    if (!m) return String(t);
    let h = Math.max(0, Math.min(23, parseInt(m[1]!, 10)));
    const mm = m[2]!;
    const ampm: "AM" | "PM" = h >= 12 ? "PM" : "AM";
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return `${String(h12).padStart(2, "0")}:${mm} ${ampm}`;
};

// Tolerance formatter → "20 (+3/-2)"
const tolLine = (base?: number | null, plus?: number | null, minus?: number | null) => {
    const b = base ?? null, p = plus ?? null, m = minus ?? null;
    if (b == null && p == null && m == null) return null;
    if (b != null && p != null && m != null) return `${b} (+${p}/-${m})`;
    if (b != null && (p != null || m != null)) {
        const pos = p != null ? `+${p}` : "";
        const neg = m != null ? `/-${m}` : "";
        return `${b} ${`${pos}${neg}`.trim()}`.trim();
    }
    if (b != null) return `${b}`;
    return [p != null ? `+${p}` : null, m != null ? `-${m}` : null].filter(Boolean).join(" / ");
};

// Runner local edit buffer per item
type EditBuf = {
    value?: string;                        // raw text → parse to number on save
    remark?: string;
    status?: "PASS" | "FAIL" | "NA";
    photo?: File | null;                   // local selection (pre-upload)
    pendingFiles?: File[];               // locally staged, not yet uploaded
    evidenceUrl?: string | null;           // uploaded file URL (server)
    evidenceName?: string | null;          // uploaded file name (display)
    uploading?: boolean;                   // per-item upload spinner
    evidenceId?: string | null;
};

function TabButton({
    active,
    onClick,
    children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={`px-3 py-2 rounded-lg border text-sm ${active
                ? "bg-emerald-600 text-white dark:border-emerald-700"
                : "hover:bg-gray-50 dark:hover:bg-neutral-800 dark:border-neutral-800"
                }`}
        >
            {children}
        </button>
    );
}

// Map file to BE "kind"
const detectKind = (file: File): "Photo" | "Video" | "File" => {
    const t = (file.type || "").toLowerCase();
    if (t.startsWith("image/")) return "Photo";
    if (t.startsWith("video/")) return "Video";
    return "File";
};

// ---- Evidence cap (UI + client guard) ----
const MAX_EVIDENCES_PER_ITEM = 5;

// Pretty (fallback) name from URL
const baseName = (s?: string | null) => {
    if (!s) return "";
    try { return decodeURIComponent(s.split("/").pop() || s); } catch { return s; }
};

export default function WIRDocDis() {
    const { user, claims } = useAuth();
    const currentUid = useMemo(
        () => String((claims as any)?.userId || (user as any)?.userId || ""),
        [claims, user]
    );

    const loc = useLocation();
    const navigate = useNavigate();
    const params = useParams<{ projectId: string; wirId: string }>();

    const projectId = params.projectId!;
    const wirId = params.wirId!;
    const projectFromState = (loc.state as NavState | undefined)?.project;

    const [tab, setTab] = useState<"document" | "discussion">("document");
    const [subtab, setSubtab] = useState<"overview" | "runner">("overview");

    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [row, setRow] = useState<WirDoc | null>(null);

    // bic full name map
    const bicSeed: BicAware[] = row
        ? [
            {
                bicUserId: (row as any)?.bicUserId ?? null,
                bicFullName: (row as any)?.bicUser?.fullName ?? null,
                bicUser: (row as any)?.bicUser ?? null,
            },
        ]
        : [];
    const bicNameMap = useBicNameMap(bicSeed);
    const bicName = useMemo(
        () =>
            row
                ? pickBicName(
                    {
                        bicUserId: (row as any)?.bicUserId ?? null,
                        bicFullName: (row as any)?.bicUser?.fullName ?? null,
                        bicUser: (row as any)?.bicUser ?? null,
                    },
                    bicNameMap
                ) || ""
                : "",
        [row, bicNameMap]
    );

    // Role carried via NavState (string like "Contractor", "PMC", "IH-PMT", etc.)
    const effectiveRole = useMemo(
        () => ((loc.state as NavState | undefined)?.role ?? null),
        [loc.state]
    );

    const creatorName =
        (user as any)?.fullName ||
        (user as any)?.name ||
        (user as any)?.displayName ||
        [(user as any)?.firstName, (user as any)?.lastName].filter(Boolean).join(" ") ||
        (claims as any)?.fullName ||
        (claims as any)?.name ||
        (claims as any)?.displayName ||
        "User";

    const backToList = () => {
        navigate(`/home/projects/${projectId}/wir`, {
            state: { project: projectFromState || { projectId } },
            replace: true,
        });
    };

    // add files to local queue (respect cap)
    const addPendingFiles = (itemId: string, files: FileList | File[]) => {
        const list = Array.from(files || []);
        if (list.length === 0) return;

        const saved = (row?.items?.find(x => x.id === itemId)?.evidences?.length || 0);
        const current = (edits[itemId]?.pendingFiles?.length || 0);
        const room = Math.max(0, MAX_EVIDENCES_PER_ITEM - (saved + current));
        if (room <= 0) { setErr(`You can attach up to ${MAX_EVIDENCES_PER_ITEM} files for this item.`); return; }

        const toAdd = list.slice(0, room);
        setEdits(m => {
            const prev = m[itemId]?.pendingFiles || [];
            return { ...m, [itemId]: { ...(m[itemId] || {}), pendingFiles: [...prev, ...toAdd] } };
        });
    };

    const removePendingFile = (itemId: string, idx: number) => {
        setEdits(m => {
            const prev = m[itemId]?.pendingFiles || [];
            const next = prev.slice(); next.splice(idx, 1);
            return { ...m, [itemId]: { ...(m[itemId] || {}), pendingFiles: next } };
        });
    };

    // DELETE a saved (server) evidence and optimistically update UI
    const deleteSavedEvidence = async (itemId: string, evidenceId: string) => {
        // optimistic UI
        setRow(prev => {
            if (!prev) return prev;
            const items = (prev.items || []).map(it => {
                if (it.id !== itemId) return it;
                const kept = (it.evidences || []).filter(ev => ev.id !== evidenceId);
                return { ...it, evidences: kept };
            });
            return { ...prev, items };
        });

        try {
            // adjust path if your backend differs
            await api.delete(`/projects/${projectId}/wir/${wirId}/runner/attachments/${evidenceId}`);
        } catch (e: any) {
            // rollback on failure
            setErr(e?.response?.data?.error || e?.message || "Failed to delete attachment.");
            await fetchWir(); // re-sync from server
        }
    };

    const fetchWir = useCallback(async () => {
        setLoading(true);
        setErr(null);
        try {
            const { data } = await api.get(`/projects/${projectId}/wir/${wirId}`);
            setRow((data?.wir ?? data) as WirDoc);
        } catch (e: any) {
            setErr(e?.response?.data?.error || e?.message || "Failed to load WIR.");
            setRow(null);
        } finally {
            setLoading(false);
        }
    }, [projectId, wirId]);

    useEffect(() => {
        document.title = "Trinity PMS — WIR Document";
    }, []);

    useEffect(() => {
        fetchWir();
    }, [fetchWir]);

    // ---------- Runner edit state & helpers ----------
    const [edits, setEdits] = useState<Record<string, EditBuf>>({});
    const [savingAll, setSavingAll] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);

    // Inspector recommendation submit state
    const [recSubmitting, setRecSubmitting] =
        useState<null | "APPROVE" | "APPROVE_WITH_COMMENTS" | "REJECT">(null);

    // HOD finalize submit state (new, accepts "ACCEPT" | "REJECT")
    const [finalizeSubmitting, setFinalizeSubmitting] =
        useState<null | "ACCEPT" | "REJECT">(null);

    // Hold local (unsaved) pick
    const [pendingRec, setPendingRec] =
        useState<WirDoc["inspectorRecommendation"] | null>(null);

    // Header-level Inspector remarks (for recommendation tile)
    const [pendingRemark, setPendingRemark] = useState<string>("");

    // --- PATCH: keep showing ALL saved evidences without waiting for a refetch ---
    const uploadEvidence = useCallback(async (itemId: string, file: File) => {
        // mark uploading
        setEdit(itemId, { uploading: true, evidenceUrl: null, evidenceName: null });
        try {
            const fd = new FormData();
            fd.append("files", file);
            const meta = [{ idx: 0, itemId, kind: detectKind(file) }];
            fd.append("meta", JSON.stringify(meta));

            const { data } = await api.post(
                `/projects/${projectId}/wir/${wirId}/runner/attachments`,
                fd,
                { headers: { "Content-Type": "multipart/form-data" } }
            );

            // normalize response
            const list: any[] =
                Array.isArray(data) ? data :
                    Array.isArray((data || {}).attachments) ? data.attachments :
                        Array.isArray((data || {}).created) ? data.created : [];

            const first = list[0] || {};
            const url = first.url || first.fileUrl || first.link || null;
            const name = first.fileName || file.name || baseName(url) || null;
            const kind = (first.kind as WirItemEvidence["kind"]) || detectKind(file);
            const evId = first.evidenceId || first.id || `${itemId}:${Date.now()}`;

            // 1) Update the per-item edit buffer (so the "pending" chip still shows this upload too)
            setEdit(itemId, {
                photo: null,
                evidenceUrl: url || null,
                evidenceName: name || null,
                evidenceId: evId || null,
                uploading: false
            });

            // 2) Optimistically append to the in-memory row so the SAVED list shows ALL items
            setRow(prev => {
                if (!prev) return prev;
                const items = (prev.items || []).map(it => {
                    if (it.id !== itemId) return it;
                    const existing = Array.isArray(it.evidences) ? it.evidences : [];

                    // dedupe by id (in case of quick double-clicks or retries)
                    if (existing.some(e => e.id === evId)) return it;

                    const appended: WirItemEvidence = {
                        id: evId,
                        kind,
                        url: url || "",
                        thumbUrl: first.thumbUrl || first.thumbnailUrl || null,
                        fileName: name || null,
                        fileSize: first.fileSize || first.size || null,
                        mimeType: first.mimeType || file.type || null,
                        capturedAt: first.capturedAt || null,
                        createdAt: first.createdAt || new Date().toISOString(),
                    };

                    // newest-first (common BE order). Change to [...existing, appended] if you prefer oldest-first.
                    return {
                        ...it,
                        evidences: [appended, ...existing],
                    };
                });
                return { ...prev, items };
            });
        } catch (e: any) {
            setErr(e?.response?.data?.error || e?.message || "Upload failed.");
            setEdit(itemId, { uploading: false });
            // clear inputs so user can retry
            clearFileInputs(itemId);
        }
    }, [projectId, wirId]);

    // Upload any locally selected files for all items (no-op if none)
    // Uses existing uploadEvidence(itemId, file) to perform the actual POST.
    const uploadAllPending = useCallback(async () => {
        const pairs: Array<[string, File]> = [];
        for (const [itemId, buf] of Object.entries(edits)) {
            const staged = buf?.pendingFiles || [];
            for (const f of staged) pairs.push([itemId, f]);
        }
        if (pairs.length === 0) return;

        for (const [itemId, file] of pairs) {
            try {
                await uploadEvidence(itemId, file);
                // after successful upload, drop that file from staged list
                setEdits(m => {
                    const prev = m[itemId]?.pendingFiles || [];
                    const idx = prev.findIndex(p => p === file);
                    const next = prev.slice();
                    if (idx >= 0) next.splice(idx, 1);
                    return { ...m, [itemId]: { ...(m[itemId] || {}), pendingFiles: next } };
                });
            } catch {
                // stop on first failure; user can retry
                break;
            }
        }
    }, [edits, uploadEvidence]);

    const onPreview = useCallback(async () => {
        await uploadAllPending();
        setPreviewOpen(true);
    }, [uploadAllPending]);

    const [recLockedReject, setRecLockedReject] = useState(false);


    // derived checker: any critical item marked FAIL?
    const computeCriticalFail = useCallback(() => {
        if (!row?.items) return false;
        for (const it of row.items) {
            const isCritical =
                !!it.critical || (it.tags?.some(t => /^\s*critical\s*$/i.test(t)) ?? false);
            const st = edits[it.id]?.status ?? null;
            if (isCritical && st === "FAIL") return true;
        }
        return false;
    }, [row?.items, edits]);

    // Minimal recommend handler (posts and refreshes WIR)
    // Minimal recommend handler (posts and refreshes WIR) — no comments
    // Only set local selection; actual save happens in Save Progress
    const onRecommend = useCallback(
        (action: "APPROVE" | "APPROVE_WITH_COMMENTS" | "REJECT") => {
            if (recLockedReject) return;       // non-mutable when locked
            setPendingRec(action);
        },
        [recLockedReject]
    );

    const setEdit = (itemId: string, patch: Partial<EditBuf>) =>
        setEdits((m) => ({ ...m, [itemId]: { ...(m[itemId] || {}), ...patch } }));

    // const onPickPhoto = (itemId: string, file?: File | null) => {
    //     if (!file) { setEdit(itemId, { photo: null }); return; }
    //     // hard stop if cap reached from server-saved + local pending
    //     const saved = (row?.items?.find(x => x.id === itemId)?.evidences?.length || 0);
    //     const pending = (edits[itemId]?.photo ? 1 : 0) + (edits[itemId]?.evidenceUrl ? 1 : 0);
    //     if (saved + pending >= MAX_EVIDENCES_PER_ITEM) {
    //         setErr(`You can attach up to ${MAX_EVIDENCES_PER_ITEM} files for this item.`);
    //         clearFileInputs(itemId);
    //         return;
    //     }
    //     setEdit(itemId, { photo: file });
    //     uploadEvidence(itemId, file);
    // };
    const onPickPhoto = (itemId: string, file?: File | null) => {
        if (!file) { setEdit(itemId, { photo: null }); return; }
        // hard stop if cap reached from server-saved + local pending
        const saved = (row?.items?.find(x => x.id === itemId)?.evidences?.length || 0);
        // NOTE: pending now ONLY counts local selection; we won’t upload immediately
        const pending = (edits[itemId]?.photo ? 1 : 0);
        if (saved + pending >= MAX_EVIDENCES_PER_ITEM) {
            setErr(`You can attach up to ${MAX_EVIDENCES_PER_ITEM} files for this item.`);
            clearFileInputs(itemId);
            return;
        }
        // hold locally; upload later on Save/Preview/Send
        setEdit(itemId, { photo: file, evidenceUrl: null, evidenceName: null, evidenceId: null });
    };

    const parseNum = (s?: string) => {
        if (!s) return undefined;
        const n = Number(String(s).replace(/,/g, "").trim());
        return Number.isFinite(n) ? n : undefined;
    };

    // Build local edit buffers from saved item fields (and last run)
    const buildEditsFromRow = (doc: WirDoc) => {
        const next: Record<string, EditBuf> = {};
        for (const it of doc.items ?? []) {
            const lastRun = (it as any).runs?.[0];
            const lastEv = (it as any).evidences?.[0]; // newest first per your BE orderBy
            next[it.id] = {
                value: lastRun?.valueNumber != null ? String(lastRun.valueNumber) : "",
                remark: it.inspectorNote ?? "",
                status: it.inspectorStatus ?? undefined,
                photo: null,
                evidenceUrl: lastEv?.url ?? null,
                evidenceName: lastEv?.fileName ?? null,
                evidenceId: lastEv?.id ?? null,
            };
        }
        return next;
    };

    const saveAllItems = useCallback(async () => {
        // 0) First, upload any pending local attachments
        await uploadAllPending();
        if (!row?.items?.length) return;
        const payloadItems: Array<{
            itemId: string;
            inspectorStatus: "PASS" | "FAIL" | "NA" | null;
            note: string | null;
            valueNumber: number | undefined;
            unit: string | null;
        }> = [];

        // Validate each edited item first; stop on first non-numeric value
        for (const it of row.items) {
            const buf = edits[it.id];
            if (!buf) continue;
            const raw = (buf.value ?? "").toString().trim();
            const hasAny = raw !== "" || (buf.remark ?? "").toString().trim() !== "" || !!buf.status;
            if (!hasAny) continue;

            const valueNumber = parseNum(buf.value);
            if (raw !== "" && valueNumber === undefined) {
                // show dialog and focus the offending field
                setValErrItemId(it.id);
                // let the dialog render, then focus
                setTimeout(() => inputRefs.current[it.id]?.focus(), 0);
                return; // abort save
            }

            payloadItems.push({
                itemId: it.id,
                inspectorStatus: buf.status || null,
                note: (buf.remark || "").trim() || null,
                valueNumber,
                unit: it.unit || null,
            });
        }
        if (payloadItems.length === 0) return; // nothing to save

        const payload = {
            actorRole: "Inspector",
            items: payloadItems,
        };
        try {
            setSavingAll(true);
            await api.post(`/projects/${projectId}/wir/${wirId}/runner/inspector-save`, payload);
            const fresh = await api.get(`/projects/${projectId}/wir/${wirId}`);
            const doc = (fresh.data?.wir ?? fresh.data) as WirDoc;
            setRow(doc);
            setPendingRec(doc.inspectorRecommendation ?? null);
            setEdits(buildEditsFromRow(doc));  // repopulate from saved data
        } finally {
            setSavingAll(false);
        }

    }, [row?.items, edits, projectId, wirId, fetchWir]);

    const [hodSelectedUserId, setHodSelectedUserId] = useState<string | null>(null);

    const [hodReviewOpen, setHodReviewOpen] = useState(false);
    const [hodPlannedPatch, setHodPlannedPatch] = useState<any | null>(null);

    // Patch HOD on header (so approver is visible to all)
    const patchHodOnHeader = useCallback(
        async (hodUserId: string) => {
            await api.patch(`/projects/${projectId}/wir/${wirId}`, {
                hodId: hodUserId
                // You can also set bicUserId here if you want to explicitly show the Inspector as BIC:
                // bicUserId: (row?.bicUserId ?? undefined) || (claims?.userId ?? undefined)
            });
        },
        [projectId, wirId]
    );

    // Call BE to persist the Inspector recommendation header fields
    const postInspectorRecommend = useCallback(
        async (action: "APPROVE" | "APPROVE_WITH_COMMENTS" | "REJECT", comment?: string | null) => {
            await api.post(
                `/projects/${projectId}/wir/${wirId}/runner/inspector-recommend`,
                { action, comment: comment ?? null }
            );
        },
        [projectId, wirId]
    );

    const onConfirmSendToHod = useCallback(async () => {
        setHodConfirmOpen(false);
        if (!hodSelectedUserId) return;

        // Decide final recommendation that will be sent
        const finalRec: "APPROVE" | "APPROVE_WITH_COMMENTS" | "REJECT" =
            (recLockedReject ? "REJECT" : (pendingRec ?? "APPROVE")) as any;

        // Build the *planned* header patch we will show and (upon OK) apply
        const planned = {
            hodId: hodSelectedUserId,
            bicUserId: hodSelectedUserId,
            status: "Recommended",
            version: 1,
            ...(row?.createdById ? { contractorId: row.createdById } : {}),
            // we’ll also persist this via /runner/inspector-recommend; include here for audit parity
            inspectorRecommendation: finalRec,
        };

        setHodPlannedPatch(planned);
        setHodReviewOpen(true); // open review dialog
    }, [hodSelectedUserId, recLockedReject, pendingRec, row?.createdById]);

    // REPLACE the entire validateAllRunnerFields definition with this:
    const validateAllRunnerFields = useCallback(() => {
        if (!row?.items?.length) return { ok: false, missing: [] as Array<{ id: string; name: string }> };
        const missing: Array<{ id: string; name: string }> = [];

        for (const it of row.items) {
            const buf = edits[it.id] || {};
            const spec = (it.spec || "").trim();
            const isMandatory = /^mandatory$/i.test(spec);

            // Only enforce for Mandatory items
            if (!isMandatory) continue;

            const tags = (it.tags || []).map(t => t.trim().toLowerCase());
            const needsMeasurement = tags.includes("measurement");
            const needsEvidence = tags.includes("evidence") || tags.includes("document") || tags.includes("photo");

            // Status required for all mandatory items
            const status = buf.status ?? null;
            const hasStatus = status === "PASS" || status === "FAIL";
            if (!hasStatus) {
                missing.push({ id: it.id, name: it.name || it.code || "Item (status)" });
                continue; // avoid double-pushing; status already missing
            }

            // Measurement required only if "measurement" tag present
            if (needsMeasurement) {
                const raw = (buf.value ?? "").toString().trim();
                const val = raw === "" ? undefined : parseNum(raw);
                const hasNumeric = val !== undefined && Number.isFinite(val);
                if (!hasNumeric) {
                    missing.push({ id: it.id, name: it.name || it.code || "Item (measurement)" });
                    continue;
                }
            }

            // Evidence/Document required only if tag present
            if (needsEvidence) {
                const savedCount = (it.evidences?.length || 0);
                const pendingCount = (buf.evidenceUrl ? 1 : 0) + (buf.photo ? 1 : 0);
                if ((savedCount + pendingCount) === 0) {
                    missing.push({ id: it.id, name: it.name || it.code || "Item (evidence/document)" });
                    continue;
                }
            }
        }

        return { ok: missing.length === 0, missing };
    }, [row?.items, edits]);

    // REPLACE: load HOD derived list for this project (use helper-based derivation)
    const loadHodDerived = useCallback(async () => {
        setHodLoading(true);
        setHodErr(null);
        try {
            const ON = todayISO();
            const ROLE_KEYS: RoleKey[] = ["Admin", "Client", "IH-PMT", "Contractor", "Consultant", "PMC", "Supplier"];

            // Collect active members across base roles (dedup by userId)
            const bag = new Map<string, { userId: string; roleKey: RoleKey; u: any }>();
            for (const rk of ROLE_KEYS) {
                const rows = await listActiveMembersForProjectRole(projectId, rk, ON);
                for (const { user } of rows) {
                    const uid = String(user.userId);
                    if (!bag.has(uid)) bag.set(uid, { userId: uid, roleKey: rk, u: user });
                }
            }

            // Resolve acting role per user; keep only HOD-capable
            const out: Array<{ userId: string; fullName: string; acting: "HOD" | "Inspector+HOD" }> = [];
            for (const { userId, roleKey, u } of bag.values()) {
                try {
                    const acting = await resolveActingRoleFor(projectId, roleKey, userId);
                    if (acting === "HOD" || acting === "Inspector+HOD") {
                        out.push({ userId, fullName: displayNameLite(u), acting });
                    }
                } catch {
                    // ignore per-user failure
                }
            }

            // Sort alphabetically
            out.sort((a, b) => a.fullName.localeCompare(b.fullName));
            setHodList(out);
            setHodSelectedUserId(out[0]?.userId ?? null);
        } catch (e: any) {
            setHodErr(e?.response?.data?.error || e?.message || "Failed to derive HOD users.");
            setHodList([]);
        } finally {
            setHodLoading(false);
        }
    }, [projectId]);

    /* ---------- render helpers ---------- */

    // Hydrate local edit buffers when we first load this WIR
    useEffect(() => {
        if (!row) return;
        // Only hydrate if nothing is typed yet to avoid clobbering in-progress edits
        if (Object.keys(edits).length === 0) {
            setEdits(buildEditsFromRow(row));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [row?.wirId, row?.updatedAt, row?.items?.length]);

    useEffect(() => {
        if (!row) return;
        // seed from server each time doc refreshes
        setPendingRec(row.inspectorRecommendation ?? null);
    }, [row?.wirId, row?.updatedAt]);

    useEffect(() => {
        if (!row) return;
        setPendingRemark(row.inspectorRemarks ?? "");
    }, [row?.wirId, row?.updatedAt, row?.inspectorRemarks]);

    useEffect(() => {
        const lock = computeCriticalFail();
        setRecLockedReject(lock);
        if (lock) setPendingRec("REJECT");
    }, [computeCriticalFail]);

    // --- ADD: coerce NavState.role -> RoleKey (case-insensitive)
    const asRoleKey = (s?: string): RoleKey | null => {
        switch ((s || "").toLowerCase()) {
            case "admin": return "Admin";
            case "client": return "Client";
            case "ih-pmt": return "IH-PMT";
            case "contractor": return "Contractor";
            case "consultant": return "Consultant";
            case "pmc": return "PMC";
            case "supplier": return "Supplier";
            default: return null;
        }
    };

    // --- ADD: compute "Runner" visibility (Inspector/HOD acting role + Submitted/Recommended status)
    const [canSeeRunner, setCanSeeRunner] = useState(false);

    // --- Reschedule modal state ---
    const [reschedOpen, setReschedOpen] = useState(false);
    const [reschedDate, setReschedDate] = useState<string>("");
    const [reschedTime, setReschedTime] = useState<string>("");
    const [reschedReason, setReschedReason] = useState<string>("");
    const [reschedSubmitting, setReschedSubmitting] = useState(false);
    const [followupOpen, setFollowupOpen] = useState(false);

    useEffect(() => {
        let alive = true;
        (async () => {
            if (!row) { if (alive) setCanSeeRunner(false); return; }

            const statusCanon = canonicalWirStatus(row.status);
            const statusOk =
                statusCanon === "Submitted" ||
                statusCanon === "Recommended" ||
                statusCanon === "Approved" ||
                statusCanon === "Rejected";
            if (!statusOk) { if (alive) setCanSeeRunner(false); return; }

            const roleKey = asRoleKey((loc.state as NavState | undefined)?.role);
            const userId = String((claims as any)?.userId || (user as any)?.userId || "");
            const contractorView = roleKey === "Contractor";

            if (!roleKey || !userId) { if (alive) setCanSeeRunner(false); return; }

            try {
                const acting = await resolveActingRoleFor(projectId, roleKey, userId);
                if (alive) setActingRole((["Inspector", "HOD", "Inspector+HOD"] as const).includes(acting as any) ? (acting as any) : null);

                // Runner visibility:
                // - Inspector/HOD/Inspector+HOD → as before
                // - Contractor → read-only on Recommended/Approved/Rejected
                const contractorStatusOk =
                    contractorView && (statusCanon === "Recommended" || statusCanon === "Approved" || statusCanon === "Rejected");

                const ok = acting === "Inspector" || acting === "HOD" || acting === "Inspector+HOD" || contractorStatusOk;
                if (alive) setCanSeeRunner(ok);
            } catch {
                if (alive) { setCanSeeRunner(false); setActingRole(null); }
            }
        })();
        return () => { alive = false; };
    }, [row?.status, projectId, loc.state, claims, user]);

    // --- ADD: guard subtab if Runner becomes hidden
    useEffect(() => {
        if (subtab === "runner" && !canSeeRunner) setSubtab("overview");
    }, [canSeeRunner, subtab]);

    useEffect(() => {
        if (!reschedOpen || !row) return;
        // Seed from latest effective schedule (reschedule* if present, else original for*/time)
        const seedDateISO = (row.rescheduleForDate || row.forDate || todayISO()).slice(0, 10);
        const seedTime = row.rescheduleForTime || row.forTime || "";
        setReschedDate(seedDateISO);
        setReschedTime(seedTime);
        setReschedReason(row.rescheduleReason || "");
    }, [reschedOpen, row]);

    const headerLine = useMemo(() => {
        if (!row) return "";
        const parts = [
            row.code || undefined,
            row.title || undefined,
            typeof row.version === "number" ? `v${row.version}` : undefined,
        ].filter(Boolean);
        return parts.join(" — ");
    }, [row]);

    const nextVersionLabel = useMemo(() => {
        const v = typeof row?.version === "number" ? row!.version : null;
        return v != null ? `v${v + 1}` : "v?";
    }, [row?.version]);

    // ADD: visible only when WIR is Approved/Rejected
    const isFinalized = useMemo(() => {
        const st = canonicalWirStatus(row?.status);
        return st === "Approved" || st === "Rejected" || st === "APPROVE_WITH_COMMENTS";
    }, [row?.status]);

    const statusBadge = (value?: string | null) => {
        const v = canonicalWirStatus(value);
        const map: Record<string, string> = {
            Draft:
                "bg-gray-100 text-gray-800 border-gray-200 dark:bg-neutral-800 dark:text-gray-200 dark:border-neutral-700",
            Submitted:
                "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
            Recommended:
                "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
            Approved:
                "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
            APPROVE_WITH_COMMENTS: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
            Rejected:
                "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800",
            Returned:
                "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-200 dark:border-yellow-800",
            Unknown:
                "bg-gray-100 text-gray-800 border-gray-200 dark:bg-neutral-800 dark:text-gray-200 dark:border-neutral-700",
        };
        return <span className={`text-[10px] px-1.5 py-0.5 rounded border ${map[v]}`}>{v}</span>;
    };

    const items = row?.items ?? [];
    const totalRunnerRuns = useMemo(
        () => (row?.items ?? []).reduce((s, it) => s + ((it.runs?.length) || 0), 0),
        [row?.items]
    );
    const rec = recLockedReject ? "REJECT" : ((pendingRec ?? row?.inspectorRecommendation) ?? null);
    const itemsCount = items.length;

    // Totals for header tile
    const combinedItemsCount = useMemo(() => {
        if (row?.items?.length) return row.items.length;
        const fromChecklists = (row?.checklists ?? []).reduce(
            (sum, c) => sum + (typeof c.itemsCount === "number" ? c.itemsCount : (typeof c.itemsTotal === "number" ? c.itemsTotal : 0)),
            0
        );
        return fromChecklists || 0;
    }, [row?.items, row?.checklists]);

    const mandatoryCount = useMemo(() => {
        if (!row?.items?.length) return 0;
        return row.items.filter(it => /^mandatory$/i.test((it.spec || "").trim())).length;
    }, [row?.items]);

    const criticalCount = useMemo(() => {
        if (!row?.items?.length) return 0;
        return row.items.filter(it =>
            !!it.critical || (it.tags?.some(t => /^\s*critical\s*$/i.test(t)) ?? false)
        ).length;
    }, [row?.items]);

    // input refs per item to focus when validation fails
    const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

    // NEW: file input refs per item (to clear input value on "Remove")
    const fileRefs = useRef<Record<string, HTMLInputElement[]>>({});

    // Register multiple file inputs (0 = camera, 1 = picker)
    const registerFileRef = (itemId: string, index: number) => (el: HTMLInputElement | null) => {
        if (!fileRefs.current[itemId]) fileRefs.current[itemId] = [];
        if (el) fileRefs.current[itemId][index] = el;
    };

    // Clear both file inputs for an item
    const clearFileInputs = (itemId: string) => {
        (fileRefs.current[itemId] || []).forEach((el) => {
            if (el) el.value = "";
        });
    };

    // NEW: remove selected photo/document
    const onRemovePhoto = (itemId: string) => {
        setEdit(itemId, { photo: null, evidenceUrl: null, evidenceName: null });
        clearFileInputs(itemId);
    };

    // validation dialog state
    const [valErrItemId, setValErrItemId] = useState<string | null>(null);

    const [sendWarnOpen, setSendWarnOpen] = useState(false);
    const [sendWarnList, setSendWarnList] = useState<Array<{ id: string; name: string }>>([]);
    const [hodOpen, setHodOpen] = useState(false);
    const [hodLoading, setHodLoading] = useState(false);
    const [hodErr, setHodErr] = useState<string | null>(null);
    const [hodList, setHodList] = useState<Array<{ userId: string; fullName: string; acting: "HOD" | "Inspector+HOD" }>>([]);
    const [hodConfirmOpen, setHodConfirmOpen] = useState(false);

    const [actingRole, setActingRole] = useState<"Inspector" | "HOD" | "Inspector+HOD" | null>(null);
    const [inspRecoInspOpen, setInspRecoInspOpen] = useState(false);
    const [inspRecoHodOpen, setInspRecoHodOpen] = useState(false);
    // const canReschedule = useMemo(() => {
    //     const isInspectorish =
    //         actingRole === "Inspector" || actingRole === "Inspector+HOD";
    //     const isBicSelf = !!row?.bicUserId && String(row.bicUserId) === currentUid;
    //     return isInspectorish && isBicSelf;
    // }, [actingRole, row?.bicUserId, currentUid]);

    const canReschedule = useMemo(() => {
        const isInspectorish =
            actingRole === "Inspector" || actingRole === "Inspector+HOD";
        const isBicSelf = !!row?.bicUserId && String(row.bicUserId) === currentUid;
        const isSubmitted = canonicalWirStatus(row?.status) === "Submitted";
        return isInspectorish && isBicSelf && isSubmitted;
    }, [actingRole, row?.bicUserId, currentUid, row?.status]);

    const [hasNewerChild, setHasNewerChild] = useState(false);
    //Check for newer versions after wir loads
    useEffect(() => {
        let ignore = false;
        (async () => {
            if (!row?.code) { if (!ignore) setHasNewerChild(false); return; }
            try {
                // fetch project WIR list and compute the max version for this code
                const { data } = await api.get(`/projects/${projectId}/wir`);
                const rows: any[] = Array.isArray(data) ? data : (data?.list || data?.wirs || []);
                const siblings = rows.filter(r => (r.code ?? r.wirCode) === row.code);

                const maxV = siblings.reduce((m, r) => {
                    const v = Number(r.version ?? r.wirVersion ?? NaN);
                    return Number.isFinite(v) ? Math.max(m, v) : m;
                }, -Infinity);

                const curV = Number(row.version ?? NaN);
                const newer = Number.isFinite(curV) && maxV > curV;

                if (!ignore) setHasNewerChild(newer);
            } catch {
                if (!ignore) setHasNewerChild(false);
            }
        })();
        return () => { ignore = true; };
    }, [projectId, row?.code, row?.version]);


    // SHOW "Schedule Followup" only when:
    // 1) Inspector recommended AWC,
    // 2) HOD accepted,
    // 3) WIR is finalized (Approved/Rejected/APPROVE_WITH_COMMENTS),
    // 4) Current user is the BIC (usually the contractor after ACCEPT+AWC)
    //HIDE when a newer follow-up exists
    const showReschedCta = useMemo(() => {
        const accepted = row?.hodOutcome === "ACCEPT";
        const awc = row?.inspectorRecommendation === "APPROVE_WITH_COMMENTS";
        const isFinal = (() => {
            const st = canonicalWirStatus(row?.status);
            return st === "Approved" || st === "APPROVE_WITH_COMMENTS" || st === "Rejected";
        })();
        const isBicSelf = !!row?.bicUserId && String(row.bicUserId) === currentUid;

        // HIDE when a newer follow-up exists:
        return accepted && awc && isFinal && isBicSelf && !hasNewerChild;
    }, [
        row?.hodOutcome,
        row?.inspectorRecommendation,
        row?.status,
        row?.bicUserId,
        currentUid,
        hasNewerChild, // <-- keep in deps
    ]);

    // HOD Finalize modal state
    const [finalizeOpen, setFinalizeOpen] = useState(false);
    const [finalizeOutcome, setFinalizeOutcome] = useState<"ACCEPT" | "REJECT" | null>(null); const [finalizeNote, setFinalizeNote] = useState("");

    // Inspector display name (resolved from inspectorId for Finalize modal)
    const [inspName, setInspName] = useState<string>("");

    // Notes modal state
    const [notesOpen, setNotesOpen] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [runnerHistoryOpen, setRunnerHistoryOpen] = useState(false);
    const [actorNameMap, setActorNameMap] = useState<Record<string, string>>({});
    // helper: get display name for a user id (fallback to id)
    const nameOf = useCallback((id?: string | null) => {
        if (!id) return "—";
        const key = String(id);
        return actorNameMap[key] || key;
    }, [actorNameMap]);

    // runner no-edit permission dialog
    const [noEditPermOpen, setNoEditPermOpen] = useState(false);

    // Helper: contractor fallback uid (prefer contractorId, else createdById)
    const contractorUid = useMemo<string | null>(() => {
        const c1 = row?.contractorId ? String(row.contractorId) : null;
        const c2 = !c1 && row?.createdById ? String(row.createdById) : null;
        return c1 || c2 || null;
    }, [row?.contractorId, row?.createdById]);

    // Map local finalizeOutcome → HOD header outcome
    const mappedFinalizeOutcome = useMemo<"APPROVE" | "REJECT" | null>(() => {
        if (!finalizeOutcome) return null;
        return finalizeOutcome === "ACCEPT" ? "APPROVE" : "REJECT";
    }, [finalizeOutcome]);

    // Build Phase 1 preview payload (header patch)
    const finalizePhase1Preview = useMemo(() => {
        if (!mappedFinalizeOutcome) return null;

        // bicUserId re-assignment per rules
        let nextBic: string | null = null;
        if (mappedFinalizeOutcome === "APPROVE") {
            nextBic =
                row?.inspectorRecommendation === "APPROVE_WITH_COMMENTS"
                    ? contractorUid
                    : null;
        } else {
            // REJECT
            nextBic = contractorUid;
        }

        const p1: Record<string, any> = {
            hodOutcome: mappedFinalizeOutcome, // "APPROVE" | "REJECT"
            hodDecidedAt: new Date().toISOString(),
            bicUserId: nextBic,
        };
        const note = (finalizeNote || "").trim();
        if (note) p1.hodRemarks = note;

        return p1;
    }, [mappedFinalizeOutcome, finalizeNote, row?.inspectorRecommendation, contractorUid]);

    // Build Phase 2 preview payload (status patch)
    const finalizePhase2Preview = useMemo(() => {
        if (!mappedFinalizeOutcome) return null;
        return {
            status: mappedFinalizeOutcome === "APPROVE" ? "Approved" : "Rejected",
        };
    }, [mappedFinalizeOutcome]);

    // Header-level evidences: those not tied to any specific item/run
    const headerDocs = useMemo(
        () => {
            const all = row?.evidences ?? [];
            return all.filter((ev: any) => !ev.itemId); // itemId null/undefined => header document
        },
        [row?.evidences]
    );

    const onSendToHodClick = useCallback(async () => {
        // NEW: Guard – one recommendation must be selected
        const currentRec: "APPROVE" | "APPROVE_WITH_COMMENTS" | "REJECT" | null =
            recLockedReject
                ? "REJECT"
                : ((pendingRec ?? row?.inspectorRecommendation) ?? null);

        if (!currentRec) {
            setSendWarnList([
                {
                    id: "inspectorRecommendation",
                    name: "Select an Inspector Recommendation (Approve / Approve w/ Comments / Reject) before sending to HOD.",
                },
            ]);
            setSendWarnOpen(true);
            return;
        }

        const res = validateAllRunnerFields();
        if (!res.ok) {
            setSendWarnList(res.missing);
            setSendWarnOpen(true);
            // focus first missing measurement field if available
            const first = res.missing[0]?.id;
            if (first) {
                setTimeout(() => inputRefs.current[first]?.focus(), 0);
            }
            return;
        }

        setHodSelectedUserId(null);           // reset selection for a fresh open
        setHodConfirmOpen(true);
        loadHodDerived();
    }, [
        validateAllRunnerFields,
        inputRefs,
        loadHodDerived,
        recLockedReject,
        pendingRec,
        row?.inspectorRecommendation,
    ]);

    // onRunnerClick to show dialog when not allowed to open editable runner
    const onRunnerClick = useCallback(() => {
        if (!row) return;
        const st = canonicalWirStatus(row.status);

        // NEW: Contractor read-only flows
        const roleKey = asRoleKey((loc.state as NavState | undefined)?.role);
        const contractorView = roleKey === "Contractor";
        if (contractorView) {
            if (st === "Recommended") {
                // Inspector review summary for Contractor
                setInspRecoInspOpen(true);
                return;
            }
            if (st === "Approved" || st === "Rejected") {
                // HOD review summary for Contractor
                setInspRecoHodOpen(true);
                return;
            }
            // Submitted or other statuses: fall through to existing guards (no edit)
        }
        // Allow edit only if: (Inspector or Inspector+HOD) + Submitted + BIC === current user
        const isInspectorish = actingRole === "Inspector" || actingRole === "Inspector+HOD";
        const currentUid = String((claims as any)?.userId || (user as any)?.userId || "");
        const isBicSelf = !!row.bicUserId && String(row.bicUserId) === currentUid;

        const canOpenEditable = isInspectorish && st === "Submitted" && isBicSelf;

        if (canOpenEditable) {
            setSubtab("runner");
            return;
        }

        // Read-only summaries for Recommended (unchanged)
        if (isInspectorish && st === "Recommended") {
            setInspRecoInspOpen(true);
            return;
        }
        if (actingRole === "HOD" && st === "Recommended") {
            setInspRecoHodOpen(true);
            return;
        }

        /* Finalized → always open HOD Review (read-only) */
        if (
            (actingRole === "Inspector" || actingRole === "HOD" || actingRole === "Inspector+HOD") &&
            (st === "Approved" || st === "Rejected")
        ) {
            setInspRecoHodOpen(true);
            return;
        }
        // If Runner is visible but not eligible for edit on Submitted → dialog
        if (st === "Submitted") {
            setNoEditPermOpen(true);
        }
        // Else: no-op
    }, [row, actingRole, claims, user, setSubtab]);

    const onFinalizeNow = useCallback(async () => {
        if (!finalizeOutcome) return;
        try {
            setFinalizeSubmitting(finalizeOutcome);

            // Phase 1: persist HOD outcome (APPROVE / REJECT) AND shift BIC per rules
            const mappedOutcome: "APPROVE" | "REJECT" =
                finalizeOutcome === "ACCEPT" ? "APPROVE" : "REJECT";

            // contractor fallback: prefer contractorId, else createdById, else null
            const contractorUid =
                (row?.contractorId && String(row.contractorId)) ||
                (row?.createdById && String(row.createdById)) ||
                null;

            // Compute next BIC:
            // - If APPROVE and Inspector had APPROVE_WITH_COMMENTS → contractor
            // - If APPROVE and Inspector had APPROVE (no comments) → null
            // - If REJECT → contractor
            let nextBicUserId: string | null = null;
            if (mappedOutcome === "APPROVE") {
                nextBicUserId =
                    row?.inspectorRecommendation === "APPROVE_WITH_COMMENTS"
                        ? contractorUid
                        : null;
            } else {
                // REJECT
                nextBicUserId = contractorUid;
            }

            const p1: any = {
                hodOutcome: mappedOutcome,
                hodDecidedAt: new Date().toISOString(),
                // include hodRemarks only if user typed any
                ...(finalizeNote.trim() ? { hodRemarks: finalizeNote.trim() } : {}),
                bicUserId: nextBicUserId,
            };

            await api.patch(`/projects/${projectId}/wir/${wirId}`, p1);

            // Phase 2: set final WIR status based on HOD decision
            if (finalizeOutcome === "ACCEPT") {
                // Final status must be one of the BE-allowed enums
                await api.patch(`/projects/${projectId}/wir/${wirId}`, { status: "Approved" });
            } else {
                await api.patch(`/projects/${projectId}/wir/${wirId}`, { status: "Rejected" });
            }
            await fetchWir();
            setFinalizeOpen(false);
            setFinalizeOutcome(null);
            setFinalizeNote("");
        } finally {
            setFinalizeSubmitting(null);
        }
    }, [finalizeOutcome, finalizeNote, projectId, wirId, fetchWir
        , row?.inspectorRecommendation]);

    // Load Inspector name (from inspectorId) when modal opens OR when row changes
    useEffect(() => {
        let alive = true;
        async function loadInspectorName(id?: string | null) {
            if (!id) { if (alive) setInspName(""); return; }
            try {
                const { data } = await api.get(`/admin/users/${id}`);
                const u = (data?.user ?? data) || {};
                if (alive) setInspName(displayNameLite(u));
            } catch {
                try {
                    const { data } = await api.get(`/users/${id}`);
                    const u = (data?.user ?? data) || {};
                    if (alive) setInspName(displayNameLite(u));
                } catch {
                    if (alive) setInspName(String(id));
                }
            }
        }
        if (finalizeOpen || row?.inspectorId) loadInspectorName((row as any)?.inspectorId);
        return () => { alive = false; };
    }, [finalizeOpen, row?.inspectorId]);

    // Hydrate actor names for ids present in row.histories
    useEffect(() => {
        if (!row?.histories?.length) return;

        const need = new Set<string>();
        for (const h of row.histories) {
            const id = (h?.actorUserId || "").toString().trim();
            const hasName = !!h?.actorName || (id && actorNameMap[id]);
            if (id && !hasName) need.add(id);
        }
        if (need.size === 0) return;

        let ignore = false;
        (async () => {
            try {
                // lightweight users list (no memberships needed)
                const { data } = await api.get("/admin/users", { params: { includeMemberships: 0 } });
                const users: any[] = Array.isArray(data?.users) ? data.users : (Array.isArray(data) ? data : []);
                const next: Record<string, string> = {};
                for (const u of users) {
                    const uid = (u?.userId || "").toString();
                    if (!uid || !need.has(uid)) continue;
                    next[uid] = displayNameLite(u);
                }
                if (!ignore && Object.keys(next).length) {
                    setActorNameMap((prev) => ({ ...prev, ...next }));
                }
            } catch (e) {
                console.warn("[WIR] actor names hydrate failed", e);
            }
        })();

        return () => { ignore = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [row?.histories]);

    // Hydrate names for ids shown in the "Review changes" dialog
    useEffect(() => {
        if (!hodReviewOpen || !hodPlannedPatch) return;
        const ids = [hodPlannedPatch.hodId, hodPlannedPatch.bicUserId, hodPlannedPatch.contractorId, row?.inspectorId]
            .filter(Boolean)
            .map((x: any) => String(x));

        const missing = ids.filter(id => !actorNameMap[id]);
        if (missing.length === 0) return;

        let ignore = false;
        (async () => {
            for (const id of missing) {
                try {
                    const { data } = await api.get(`/admin/users/${id}`);
                    const u = (data?.user ?? data) || {};
                    if (!ignore) setActorNameMap(prev => ({ ...prev, [id]: displayNameLite(u) }));
                } catch {
                    try {
                        const { data } = await api.get(`/users/${id}`);
                        const u = (data?.user ?? data) || {};
                        if (!ignore) setActorNameMap(prev => ({ ...prev, [id]: displayNameLite(u) }));
                    } catch {/* ignore */ }
                }
            }
        })();

        return () => { ignore = true; };
    }, [hodReviewOpen, hodPlannedPatch, row?.inspectorId, actorNameMap]);

    return (
        <section className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border dark:border-neutral-800 p-4 sm:p-5 md:p-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-lg sm:text-xl md:text-2xl font-semibold dark:text-white truncate">
                        {headerLine || "WIR Document"}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-300 truncate">
                        {projectFromState?.code ? `${projectFromState.code} — ` : ""}
                        {projectFromState?.title || `Project: ${projectId}`}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={backToList}
                        className="text-sm px-3 py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                    >
                        Back
                    </button>
                </div>
            </div>

            {/* Meta strip */}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
                {statusBadge(row?.status)}
                <span className="px-2 py-1 rounded-lg border dark:border-neutral-800">
                    BIC: {bicName || row?.bicUserId || "—"}
                </span>
                <span className="px-2 py-1 rounded-lg border dark:border-neutral-800">
                    Date: {row?.forDate ? new Date(row.forDate).toLocaleDateString() : "—"}
                </span>
                <span className="px-2 py-1 rounded-lg border dark:border-neutral-800">Time: {row?.forTime || "—"}</span>
                <span className="px-2 py-1 rounded-lg border dark:border-neutral-800">Items: {itemsCount || "—"}</span>
                <span className="px-2 py-1 rounded-lg border dark:border-neutral-800">
                    Location: {row?.cityTown || "—"}
                </span>
            </div>

            {/* Top-level tabs */}
            <div className="mt-5 flex items-center gap-2">
                <TabButton active={tab === "document"} onClick={() => setTab("document")}>
                    Document
                </TabButton>
                <TabButton active={tab === "discussion"} onClick={() => setTab("discussion")}>
                    Discussion
                </TabButton>
                {/* Notes button (opens full-screen modal) */}
                <TabButton active={false} onClick={() => setNotesOpen(true)}>
                    Notes
                </TabButton>
            </div>

            {/* Content area */}
            <div className="mt-4 rounded-2xl border dark:border-neutral-800 p-3 sm:p-5">
                {loading ? (
                    <div className="text-sm">Loading…</div>
                ) : err ? (
                    <div className="text-sm text-rose-600">{err}</div>
                ) : !row ? (
                    <div className="text-sm">Not found.</div>
                ) : tab === "document" ? (
                    <>
                        {/* Subtabs for Document */}
                        <div className="flex items-center gap-2 mb-4">
                            <TabButton active={subtab === "overview"} onClick={() => setSubtab("overview")}>
                                Overview
                            </TabButton>
                            {canSeeRunner && (
                                <TabButton active={subtab === "runner"} onClick={onRunnerClick}>
                                    Runner
                                </TabButton>
                            )}

                        </div>

                        {subtab === "overview" ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="rounded-xl border dark:border-neutral-800 p-3">
                                    <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                                        Submission Summary
                                    </div>
                                    <div className="text-sm dark:text-white space-y-1">
                                        <div><b>Code:</b> {row.code || "—"}</div>
                                        <div><b>Title:</b> {row.title || "—"}</div>
                                        <div><b>Status:</b> {row.status || "—"}</div>
                                        <div><b>Discipline:</b> {row.discipline || "—"}</div>
                                        <div>
                                            <b>Planned:</b>{" "}
                                            {row.forDate ? new Date(row.forDate).toLocaleDateString() : "—"}
                                            {row.forTime ? ` • ${fmtTime12(row.forTime)}` : ""}
                                        </div>
                                        {(row.rescheduleForDate || row.rescheduleForTime) && (
                                            <div>
                                                <b>Rescheduled:</b>{" "}
                                                {row.rescheduleForDate
                                                    ? new Date(row.rescheduleForDate).toLocaleDateString()
                                                    : "—"}
                                                {row.rescheduleForTime ? ` • ${fmtTime12(row.rescheduleForTime)}` : ""}
                                            </div>
                                        )}

                                        <div><b>Location:</b> {row.cityTown || "—"}</div>
                                        <div><b>Version:</b> {typeof row.version === "number" ? `v${row.version}` : "—"}</div>
                                        <div><b>Checklists:</b> {combinedItemsCount} items • {mandatoryCount} mandatory • {criticalCount} critical</div>
                                        <div><b>Inspector of Record:</b> {inspName || "—"}</div>
                                        <div><b>Ball in Court:</b> {bicName || "—"}</div>                                    </div>
                                    {/* WIR History link */}
                                    <div className="pt-2 flex items-center gap-2 flex-wrap">
                                        <button
                                            type="button"
                                            onClick={() => setHistoryOpen(true)}
                                            className="text-[12px] underline underline-offset-2 text-blue-600 hover:text-blue-700 dark:text-blue-400"
                                            title="View complete WIR change history"
                                        >
                                            View WIR History{typeof row.histories?.length === "number" ? ` (${row.histories.length})` : ""}
                                        </button>

                                        <span className="text-gray-400">•</span>

                                        <button
                                            type="button"
                                            onClick={() => setRunnerHistoryOpen(true)}
                                            className="text-[12px] underline underline-offset-2 text-blue-600 hover:text-blue-700 dark:text-blue-400"
                                            title="View item-wise runner entries history"
                                        >
                                            View Runner History{totalRunnerRuns ? ` (${totalRunnerRuns})` : ""}
                                        </button>
                                    </div>

                                </div>

                                <div className="rounded-xl border dark:border-neutral-800 p-3">
                                    <div className="text:[11px] text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                                        Checklists
                                    </div>
                                    <div className="text-sm dark:text-white">
                                        {(row.checklists?.length || 0) === 0 ? (
                                            <div>None.</div>
                                        ) : (
                                            <ul className="list-disc pl-5 space-y-1">
                                                {row.checklists!.map((c) => (
                                                    <li key={c.id}>
                                                        {(c.checklistCode ? `#${c.checklistCode} ` : "") + (c.checklistTitle || "Untitled")}
                                                        {c.versionLabel ? ` • v${c.versionLabel}` : ""}
                                                        {typeof c.itemsCount === "number" ? ` • ${c.itemsCount} items` : ""}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </div>
                                {/* Documents & Evidence (header-level, read-only) */}
                                {headerDocs.length > 0 && (
                                    <div className="rounded-xl border dark:border-neutral-800 p-3 md:col-span-2">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                                Documents &amp; Evidence
                                            </div>
                                            <span className="text-[11px] uppercase tracking-wide text-slate-400">
                                                Read only
                                            </span>
                                        </div>

                                        <div className="space-y-1 text-sm dark:text-white">
                                            {headerDocs.map((ev: any) => {
                                                const displayName =
                                                    ev.fileName ||
                                                    (typeof ev.url === "string" ? ev.url.split("/").pop() : "") ||
                                                    ev.kind ||
                                                    "Attachment";

                                                return (
                                                    <div
                                                        key={ev.id || displayName}
                                                        className="flex items-center justify-between gap-2 text-[12px]"
                                                    >
                                                        <a
                                                            href={ev.url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="truncate underline decoration-dotted hover:decoration-solid"
                                                        >
                                                            {displayName}
                                                        </a>
                                                        <span className="shrink-0 text-[11px] px-2 py-0.5 rounded border dark:border-neutral-800">
                                                            {ev.kind || "File"}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Reschedule button (below Checklists) — visible only for Inspector/Inspector+HOD who is BIC */}
                                {canReschedule && (
                                    <div className="md:col-span-2 flex justify-end">
                                        <button
                                            type="button"
                                            onClick={() => setReschedOpen(true)}
                                            className="text-sm px-3 py-2 rounded-lg border dark:border-neutral-800 bg-amber-600 text-white hover:opacity-95"
                                            title="Change the planned date/time for this inspection"
                                        >
                                            Reschedule Inspection
                                        </button>
                                    </div>
                                )}

                                {/* HOD Tile (below Checklists) — visible only while InspectorRecommended AND current user is BIC */}
                                {!isFinalized &&
                                    canonicalWirStatus(row?.status) === "Recommended" &&
                                    !!row?.bicUserId &&
                                    String(row.bicUserId) === currentUid && (
                                        <div className="rounded-xl border dark:border-neutral-800 p-3 md:col-span-2">
                                            <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                                                HOD
                                            </div>
                                            <div className="text-sm dark:text-white space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[12px] px-2 py-0.5 rounded-lg border dark:border-neutral-800">
                                                        Recommendation
                                                    </span>
                                                    <span className="text-[12px] text-gray-700 dark:text-gray-200">
                                                        Inspector recommends: <b>{row.inspectorRecommendation || "—"}</b>
                                                    </span>
                                                </div>
                                                <div className="text-[12px] text-gray-700 dark:text-gray-300">
                                                    <span className="font-medium">Inspector remarks:</span>{" "}
                                                    {row.inspectorRemarks || "—"}
                                                </div>
                                                <div className="pt-1">
                                                    <button
                                                        onClick={() => setFinalizeOpen(true)}
                                                        className="text-sm px-3 py-2 rounded-lg border dark:border-neutral-800 bg-blue-600 text-white disabled:opacity-60"
                                                        disabled={
                                                            !(actingRole && (actingRole === "HOD" || actingRole === "Inspector+HOD")) ||
                                                            canonicalWirStatus(row.status) !== "Recommended"
                                                        }
                                                        title={
                                                            canonicalWirStatus(row.status) === "Recommended"
                                                                ? ((actingRole === "HOD" || actingRole === "Inspector+HOD")
                                                                    ? "Open HOD finalization"
                                                                    : "Only HOD can finalize")
                                                                : "Visible after Inspector recommends"
                                                        }
                                                    >
                                                        Finalize Now
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                {/* HOFFinalizedOutcome (visible only after HOD finalizes) */}
                                {isFinalized && (
                                    <div className="rounded-xl border dark:border-neutral-800 p-3 md:col-span-2">
                                        <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                                            HOD Finalized Outcome:
                                        </div>
                                        <div className="text-sm dark:text-white space-y-1">
                                            <div>
                                                <b>Inspector Recommendation:</b> {row.inspectorRecommendation || "—"}
                                            </div>
                                            <div>
                                                <b>Inspector Remarks:</b> {row.inspectorRemarks || "—"}
                                            </div>
                                            <div>
                                                <b>Inspector Reviewed At:</b>{" "}
                                                {row.inspectorReviewedAt ? new Date(row.inspectorReviewedAt).toLocaleString() : "—"}
                                            </div>
                                            <div className="pt-2">
                                                <b>HOD Outcome:</b> {row.hodOutcome || "—"}
                                            </div>
                                            <div>
                                                <b>HOD Remarks:</b> {row.hodRemarks || "—"}
                                            </div>
                                            <div>
                                                <b>HOD Decided At:</b>{" "}
                                                {row.hodDecidedAt ? new Date(row.hodDecidedAt).toLocaleString() : "—"}
                                            </div>
                                        </div>

                                        {/* ADD: CTA visible only for APPROVE_WITH_COMMENTS + HOD ACCEPT */}
                                        {showReschedCta && (
                                            <div className="pt-3 flex justify-end">
                                                {/* NEW: Schedule Followup v<version+1> */}
                                                <button
                                                    type="button"
                                                    onClick={() => setFollowupOpen(true)}
                                                    className="text-sm px-3 py-2 rounded-lg border dark:border-neutral-800 bg-emerald-600 text-white hover:opacity-95"
                                                    title="Schedule a follow-up inspection as next version"
                                                >
                                                    {`Schedule Followup ${nextVersionLabel}`}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                            </div>
                        ) : (
                            // RUNNER — EXACT three-tile layout per your spec
                            <div>
                                {/* Tile 1: Runner instruction */}
                                <div className="rounded-xl border dark:border-neutral-800 p-3 mb-3">
                                    <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        Runner Checklist
                                    </div>
                                    <div className="text-sm dark:text-white mt-1">
                                        Complete all mandatory items, attach required evidence, and record measurements where applicable.
                                    </div>
                                </div>
                                {/* Global Save Progress action */}
                                <div className="mb-3 flex items-center justify-end">
                                    <button
                                        onClick={saveAllItems}
                                        disabled={savingAll}
                                        className="text-sm px-4 py-2 rounded-lg border dark:border-neutral-800 bg-emerald-600 text-white disabled:opacity-60 hover:opacity-95"
                                    >
                                        {savingAll ? "Saving…" : "Save Progress"}
                                    </button>
                                </div>
                                {/* All items rendered as Tile 2 + Tile 3 */}
                                {items.length === 0 ? (
                                    <div className="text-sm">No items materialized.</div>
                                ) : (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                        {items.map((it) => {
                                            const buf = edits[it.id] || {};
                                            const tol = tolLine(it.base as any, it.plus as any, it.minus as any);
                                            const tolPill = (() => {
                                                const op = (it.tolerance || "").toString().trim();
                                                const b = it.base != null ? String(it.base) : "";
                                                const u = (it.unit || "").toString().trim();
                                                const parts = [op, b, u].filter(Boolean);
                                                return parts.length ? parts.join(" ") : null;
                                            })();

                                            return (
                                                <div key={it.id} className="rounded-2xl border dark:border-neutral-800 p-3 space-y-3">
                                                    {/* Tile 2: Item meta */}
                                                    <div>
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                {/* Title of item -- tolerance base value plus minus value */}
                                                                <div className="text-sm font-semibold dark:text-white">
                                                                    {it.name ?? "Untitled Item"}{tol ? ` — ${tolPill}` : ""}
                                                                </div>

                                                                {/* Below: Item code */}
                                                                {it.code ? (
                                                                    <div className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">
                                                                        {it.code}
                                                                    </div>
                                                                ) : null}
                                                            </div>

                                                            {it.critical ? (
                                                                <span className="text-[10px] px-2 py-0.5 rounded-full border border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200 dark:border-rose-800">
                                                                    Critical
                                                                </span>
                                                            ) : null}
                                                        </div>

                                                        {/* Pills: requirement, unit, tolerance */}
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
                                                                return null; // hide pill if not strictly Mandatory/Optional
                                                            })()}

                                                            {it.unit ? (
                                                                <span className="text-[11px] px-2 py-1 rounded-lg border dark:border-neutral-800">
                                                                    Unit: {it.unit}
                                                                </span>
                                                            ) : null}
                                                            {tolPill ? (
                                                                <span className="text-[11px] px-2 py-1 rounded-lg border dark:border-neutral-800">
                                                                    Tolerance: {tolPill}
                                                                </span>
                                                            ) : null}
                                                        </div>

                                                        {/* Tags */}
                                                        {(it.tags?.length || 0) > 0 ? (
                                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                                {it.tags!.map((t, i) => (
                                                                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full border dark:border-neutral-800">
                                                                        {t}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        ) : null}
                                                    </div>

                                                    {/* Tile 3: Inspector observation */}
                                                    <div className="rounded-xl border dark:border-neutral-800 p-3 space-y-3">
                                                        <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                                            Inspector Observation
                                                        </div>

                                                        {/* Attachments list (Saved + Staged) */}
                                                        <div className="space-y-2">
                                                            {/* Saved evidences */}
                                                            {(it.evidences?.length || 0) > 0 && (
                                                                <div className="flex flex-wrap gap-2">
                                                                    {it.evidences!.map(ev => (
                                                                        <span key={ev.id} className="inline-flex items-center gap-2 max-w-[320px] truncate text-[12px] px-2 py-1 rounded-lg border dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800 dark:text-gray-100">
                                                                            <a href={ev.url} target="_blank" rel="noreferrer" className="underline truncate">
                                                                                {ev.fileName || baseName(ev.url) || ev.kind}
                                                                            </a>
                                                                            <span className="text-[10px] px-1.5 py-0.5 rounded border dark:border-neutral-700">{ev.kind}</span>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => deleteSavedEvidence(it.id, ev.id)}
                                                                                className="ml-1 text-[11px] px-1.5 py-0.5 rounded border dark:border-neutral-700 hover:bg-gray-100 dark:hover:bg-neutral-700"
                                                                                title="Remove this file"
                                                                            >
                                                                                ✕
                                                                            </button>
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            {/* Uploader row (hide when cap reached) */}
                                                            {(() => {
                                                                const savedCount = (it.evidences?.length || 0);
                                                                const staged = edits[it.id]?.pendingFiles || [];
                                                                const total = savedCount + staged.length;
                                                                const canAdd = total < MAX_EVIDENCES_PER_ITEM;

                                                                return (
                                                                    <div className="flex flex-col gap-2">
                                                                        <div className="flex flex-wrap items-center gap-2">
                                                                            {canAdd ? (
                                                                                <>
                                                                                    {/* Take Photo (camera) */}
                                                                                    <label className="text-[12px] px-3 py-2 rounded border dark:border-neutral-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-800">
                                                                                        Take Photo
                                                                                        <input
                                                                                            type="file"
                                                                                            accept="image/*"
                                                                                            capture="environment"
                                                                                            multiple
                                                                                            className="hidden"
                                                                                            ref={registerFileRef(it.id, 0)}
                                                                                            onChange={(e) => {
                                                                                                if (!e.target.files) return;
                                                                                                addPendingFiles(it.id, e.target.files);
                                                                                                // clear the input so selecting the same file again is possible
                                                                                                e.currentTarget.value = "";
                                                                                            }}
                                                                                        />
                                                                                    </label>

                                                                                    {/* Add Photo/Document (gallery/doc picker) */}
                                                                                    <label className="text-[12px] px-3 py-2 rounded border dark:border-neutral-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-800">
                                                                                        Add Document
                                                                                        <input
                                                                                            type="file"
                                                                                            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                                                                                            multiple
                                                                                            className="hidden"
                                                                                            ref={registerFileRef(it.id, 1)}
                                                                                            onChange={(e) => {
                                                                                                if (!e.target.files) return;
                                                                                                addPendingFiles(it.id, e.target.files);
                                                                                                e.currentTarget.value = "";
                                                                                            }}
                                                                                        />
                                                                                    </label>
                                                                                </>
                                                                            ) : (
                                                                                <span className="text-[12px] px-2 py-1 rounded-lg border dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800 dark:text-gray-100">
                                                                                    Max {MAX_EVIDENCES_PER_ITEM} attachments reached
                                                                                </span>
                                                                            )}
                                                                            {/* Tiny counter */}
                                                                            <span className="text-[11px] px-1.5 py-0.5 rounded border dark:border-neutral-800">
                                                                                {total} / {MAX_EVIDENCES_PER_ITEM}
                                                                            </span>
                                                                        </div>

                                                                        {/* Staged (local, not uploaded) list */}
                                                                        {staged.length > 0 && (
                                                                            <div className="flex flex-wrap gap-2">
                                                                                {staged.map((f, idx) => (
                                                                                    <span key={`${f.name}-${idx}`} className="inline-flex items-center gap-2 max-w-[260px] truncate text-[12px] px-2 py-1 rounded-lg border dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800 dark:text-gray-100">
                                                                                        <span className="truncate" title={f.name}>{f.name}</span>
                                                                                        <span className="text-[10px] px-1.5 py-0.5 rounded border dark:border-neutral-700">Pending</span>
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => removePendingFile(it.id, idx)}
                                                                                            className="ml-1 text-[11px] px-1.5 py-0.5 rounded border dark:border-neutral-700 hover:bg-gray-100 dark:hover:bg-neutral-700"
                                                                                            title="Remove from selection"
                                                                                        >
                                                                                            ✕
                                                                                        </button>
                                                                                    </span>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>

                                                        {/* Measurement input field */}
                                                        <div>
                                                            <label className="text-[12px] block mb-1 text-gray-600 dark:text-gray-300">
                                                                Measurement {it.unit ? `(${it.unit})` : ""}
                                                            </label>
                                                            <input
                                                                ref={(el) => (inputRefs.current[it.id] = el)}
                                                                value={buf.value ?? ""}
                                                                onChange={(e) => setEdit(it.id, { value: e.target.value })}
                                                                className="w-full text-sm px-3 py-2 rounded-lg border dark:border-neutral-800 bg-white dark:bg-neutral-900"
                                                                placeholder={it.base != null ? `e.g. ${it.base}` : "Enter reading"}
                                                                inputMode="decimal"
                                                            />
                                                        </div>

                                                        {/* Mark Pass / Mark Fail buttons */}
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => setEdit(it.id, { status: "PASS" })}
                                                                className={`text-sm px-3 py-2 rounded border ${buf.status === "PASS"
                                                                    ? "bg-emerald-600 text-white border-emerald-700"
                                                                    : "dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                                                                    }`}
                                                            >
                                                                Mark Pass
                                                            </button>
                                                            <button
                                                                onClick={() => setEdit(it.id, { status: "FAIL" })}
                                                                className={`text-sm px-3 py-2 rounded border ${buf.status === "FAIL"
                                                                    ? "bg-rose-600 text-white border-rose-700"
                                                                    : "dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                                                                    }`}
                                                            >
                                                                Mark Fail
                                                            </button>
                                                        </div>

                                                        {/* Inspector Remarks input text */}
                                                        <div>
                                                            <label className="text-[12px] block mb-1 text-gray-600 dark:text-gray-300">
                                                                Inspector Remarks
                                                            </label>
                                                            <textarea
                                                                value={buf.remark ?? ""}
                                                                onChange={(e) => setEdit(it.id, { remark: e.target.value })}
                                                                className="w-full text-sm px-3 py-2 rounded-lg border dark:border-neutral-800 bg-white dark:bg-neutral-900"
                                                                rows={3}
                                                                placeholder="Write your observation…"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )
                                }
                                {/* Recommendation tile (bottom) */}
                                < div className="mt-4 rounded-2xl border dark:border-neutral-800 p-3" >
                                    <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        Recommendation
                                    </div>
                                    <div className="mt-1 text-[12px] text-gray-600 dark:text-gray-300">
                                        Outcome suggestion: <b>{rec ?? "—"}</b>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        <button
                                            onClick={() => onRecommend("APPROVE")}
                                            className={`text-sm px-3 py-2 rounded border ${rec === "APPROVE"
                                                ? "bg-emerald-600 text-white border-emerald-700"
                                                : "dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                                                }`}
                                        >
                                            Approve
                                        </button>

                                        <button
                                            onClick={() => onRecommend("APPROVE_WITH_COMMENTS")}
                                            className={`text-sm px-3 py-2 rounded border ${rec === "APPROVE_WITH_COMMENTS"
                                                ? "bg-blue-600 text-white border-blue-700"
                                                : "dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                                                }`}
                                        >
                                            Approve w/ Comments
                                        </button>

                                        <button
                                            onClick={() => onRecommend("REJECT")}
                                            className={`text-sm px-3 py-2 rounded border ${rec === "REJECT"
                                                ? "bg-rose-600 text-white border-rose-700"
                                                : "dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                                                }`}
                                        >
                                            Reject
                                        </button>

                                    </div>
                                    {/* Header-level Inspector Remarks (saved with recommendation) */}
                                    <div className="mt-3">
                                        <label className="text-[12px] block mb-1 text-gray-600 dark:text-gray-300">
                                            Inspector Remarks (max 200 chars)
                                        </label>
                                        <textarea
                                            value={pendingRemark}
                                            onChange={(e) => setPendingRemark(e.target.value.slice(0, 200))}
                                            rows={3}
                                            className="w-full text-sm px-3 py-2 rounded-lg border dark:border-neutral-800 bg-white dark:bg-neutral-900"
                                            placeholder="Write a brief summary for HOD…"
                                        />
                                        <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 text-right">
                                            {pendingRemark.length}/200
                                        </div>
                                    </div>

                                </div>
                                {/* Bottom action bar */}
                                <div className="mt-3 flex flex-wrap gap-2 justify-end">
                                    <button
                                        onClick={saveAllItems}
                                        disabled={savingAll || !!recSubmitting}
                                        className="text-sm px-4 py-2 rounded-lg border dark:border-neutral-800 bg-emerald-600 text-white disabled:opacity-60"
                                    >
                                        {savingAll ? "Saving…" : "Save Progress"}
                                    </button>

                                    <button
                                        onClick={onPreview}
                                        disabled={savingAll || !!recSubmitting}
                                        className="text-sm px-4 py-2 rounded-lg border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800 disabled:opacity-60"
                                    >
                                        Preview
                                    </button>
                                    <button
                                        onClick={onSendToHodClick}
                                        disabled={savingAll || !!recSubmitting}
                                        className="text-sm px-4 py-2 rounded-lg border dark:border-neutral-800 bg-blue-600 text-white disabled:opacity-60"
                                    >
                                        {recSubmitting === "APPROVE" ? "Sending…" : "Send to HOD"}
                                    </button>

                                </div>

                            </div>
                        )}
                    </>
                ) : (
                    /* Discussion tab */
                    <WIRDiscussion
                        wirCode={row?.code ?? null}
                        wirId={row?.wirId ?? wirId}   // always a string from params as fallback
                        creatorName={creatorName}
                    />
                )}
            </div>
            {/* ADD: Full-screen Notes modal */}
            {notesOpen && (
                <div
                    className="fixed inset-0 z-[120] bg-black/40"
                    role="dialog"
                    aria-modal="true"
                >
                    <div className="absolute inset-0 p-3 sm:p-4 md:p-6">
                        <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border dark:border-neutral-800 w-full h-full flex flex-col">
                            {/* Header */}
                            <div className="flex items-center justify-between p-3 sm:p-4 border-b dark:border-neutral-800">
                                <div className="text-base sm:text-lg font-semibold dark:text-white">
                                    Notes — How this screen works
                                </div>
                                <button
                                    className="text-sm px-3 py-2 rounded-lg border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                                    onClick={() => setNotesOpen(false)}
                                >
                                    Close
                                </button>
                            </div>

                            {/* Scrollable content */}
                            <div className="flex-1 overflow-auto p-3 sm:p-4 md:p-6 text-sm leading-6 dark:text-white">
                                <section className="space-y-6 max-w-3xl">
                                    <div>
                                        <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Runner tab (the button itself)</div>
                                        {/* Runner tab (the button itself) */}
                                        <ul className="list-disc pl-5 space-y-1">
                                            <li>
                                                The WIR’s status is <b>Submitted</b> or <b>Recommended</b>, <i>or</i> it is
                                                <b> Approved</b>/<b>Rejected</b> (finalized shows only for <b>Inspector</b>, <b>HOD</b>, or <b>Inspector+HOD</b>).
                                            </li>
                                            <li>
                                                You are viewing as someone who can act as <b>Inspector</b> or <b>HOD</b> (includes <b>Inspector+HOD</b>).
                                            </li>
                                            <li>If any of the above isn’t true, the Runner tab won’t show.</li>
                                        </ul>

                                    </div>

                                    <div>
                                        <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">When you click Runner</div>
                                        <ul className="list-disc pl-5 space-y-1">
                                            <li><b>Inspector or Inspector+HOD + Submitted + BIC is you</b> → opens the <b>Runner items</b> (editable).</li>
                                            <li><b>Inspector or Inspector+HOD + Submitted + BIC is someone else</b> → shows the <b>Runner — Edit Not Allowed</b> dialog.</li>
                                            <li><b>Inspector or Inspector+HOD + Recommended</b> → opens <b>Inspector Review</b> (read-only summary modal).</li>
                                            <li><b>HOD + Recommended</b> → opens <b>HOD Review</b> (read-only summary modal).</li>
                                            <li><b>Inspector or HOD or Inspector+HOD + Rejected/Approved </b> → opens <b>HOD Review</b> (read-only summary modal).</li>
                                            <li>All other combinations → no action here (use the visible tiles on the screen).</li>
                                        </ul>

                                    </div>

                                    <div>
                                        <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Runner items (what you need to fill)</div>
                                        <p className="mb-2">For each item you want to include in a send:</p>
                                        <ul className="list-disc pl-5 space-y-1">
                                            <li>Enter a <b>numeric measurement</b> (e.g., 10 or 10.5).</li>
                                            <li>Choose <b>Pass</b> or <b>Fail</b>.<br /><span className="text-gray-600 dark:text-gray-300">(Remarks and photo are optional unless your process says otherwise.)</span></li>
                                        </ul>
                                    </div>

                                    <div>
                                        <div className="text:[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Save Progress (button works when…)</div>
                                        <ul className="list-disc pl-5 space-y-1">
                                            <li>The WIR is loaded.</li>
                                            <li>You’ve entered at least some changes.<br /><span className="text-gray-600 dark:text-gray-300">If a measurement isn’t numeric, you’ll get a prompt and the field is focused for fixing.</span></li>
                                        </ul>
                                    </div>

                                    <div>
                                        <div className="text:[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Recommendation (Approve / Reject)</div>
                                        <ul className="list-disc pl-5 space-y-1">
                                            <li>You can pick any option locally while working.</li>
                                            <li>If any <b>critical</b> item is marked <b>Fail</b>, the recommendation is <b>auto-locked to Reject</b>.</li>
                                        </ul>
                                    </div>

                                    <div>
                                        <div className="text:[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Send to HOD (to move from Submitted → Recommended)</div>
                                        <ul className="list-disc pl-5 space-y-1">
                                            <li>All items have a <b>numeric measurement</b> and a <b>Pass/Fail</b> status.</li>
                                            <li>If anything’s missing, a warning lists the items to complete.</li>
                                            <li>You pick a <b>HOD</b> from the derived list (only HOD-capable users are shown).</li>
                                            <li>On confirm, the header is updated and the Inspector recommendation is saved. Resulting WIR status becomes <b>Recommended</b>.</li>
                                        </ul>
                                    </div>

                                    <div>
                                        <div className="text:[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">HOD tile (the blue “Finalize Now” area)</div>
                                        <ul className="list-disc pl-5 space-y-1">
                                            <li><b>Visible</b> only while the WIR is <b>Recommended</b> (and not already Approved/Rejected).</li>
                                            <li><b>Finalize Now</b> enabled only if you’re acting as <b>HOD</b> or <b>Inspector+HOD</b>.</li>
                                        </ul>
                                    </div>

                                    <div>
                                        <div className="text:[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Finalize Now (Approve/Reject)</div>
                                        <ul className="list-disc pl-5 space-y-1">
                                            <li>Choose <b>Approve</b> or <b>Reject</b> and (optionally) add a short note.</li>
                                            <li>On finalize, WIR moves to <b>Approved</b> or <b>Rejected</b> and the HOD outcome/notes/time are recorded.</li>
                                        </ul>
                                    </div>

                                    <div>
                                        <div className="text:[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">After finalization</div>
                                        <ul className="list-disc pl-5 space-y-1">
                                            <li>The HOD tile hides, and the <b>HOD Finalized Outcome</b> summary appears.</li>
                                        </ul>
                                    </div>

                                    <div>
                                        <div className="text:[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Preview (read-only snapshot)</div>
                                        <ul className="list-disc pl-5 space-y-1">
                                            <li>Always available in the Runner view to see what will be submitted (no editing there).</li>
                                        </ul>
                                    </div>

                                    <div>
                                        <div className="text:[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Small safety rails:</div>
                                        <ul className="list-disc pl-5 space-y-1">
                                            <li><b>Auto-lock to Reject</b> if any <b>critical</b> item is marked <b>Fail</b>.</li>
                                            <li><b>Numeric guard:</b> if a measurement isn’t a number, you’ll be asked to correct it.</li>
                                            <li><b>Missing fields list</b> appears if you try <b>Send to HOD</b> with incomplete items.</li>
                                            <li>If the Runner tab ever becomes hidden (e.g., status changes), the screen auto-returns to <b>Overview</b>.</li>
                                        </ul>
                                    </div>
                                </section>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {reschedOpen && row && (
                <div
                    className="fixed inset-0 z-[112] flex items-center justify-center bg-black/40"
                    role="dialog"
                    aria-modal="true"
                >
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl border dark:border-neutral-800 w-[92vw] max-w-lg p-4">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div className="text-base font-semibold dark:text-white">Reschedule Inspection</div>
                            <button
                                className="text-sm px-3 py-2 rounded-lg border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                                onClick={() => setReschedOpen(false)}
                            >
                                Close
                            </button>
                        </div>

                        {/* Body */}
                        <div className="mt-3 space-y-3 text-sm">
                            {/* Plan summary (original vs current) */}
                            <div className="rounded-xl border dark:border-neutral-800 p-3">
                                <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                                    Plan
                                </div>
                                <div className="dark:text-white space-y-1">
                                    <div>
                                        <b>Original:</b>{" "}
                                        {row.forDate ? new Date(row.forDate).toLocaleDateString() : "—"}{" "}
                                        • <b>Time:</b> {row.forTime || "—"}
                                    </div>
                                    <div>
                                        <b>Current:</b>{" "}
                                        {(row.rescheduleForDate
                                            ? new Date(row.rescheduleForDate).toLocaleDateString()
                                            : (row.forDate ? new Date(row.forDate).toLocaleDateString() : "—"))}{" "}
                                        • <b>Time:</b>{" "}
                                        {row.rescheduleForTime || row.forTime || "—"}
                                    </div>
                                </div>
                            </div>
                            <div className="rounded-xl border dark:border-neutral-800 p-3 space-y-3">
                                <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                    New Schedule
                                </div>

                                <div>
                                    <label className="text-[12px] block mb-1 text-gray-600 dark:text-gray-300">Date</label>
                                    <input
                                        type="date"
                                        value={reschedDate}
                                        onChange={(e) => setReschedDate(e.target.value)}
                                        className="w-full text-sm px-3 py-2 rounded-lg border dark:border-neutral-800 bg-white dark:bg-neutral-900"
                                    />
                                </div>

                                <div>
                                    <label className="text-[12px] block mb-1 text-gray-600 dark:text-gray-300">Time</label>
                                    <input
                                        type="time"
                                        value={reschedTime}
                                        onChange={(e) => setReschedTime(e.target.value)}
                                        className="w-full text-sm px-3 py-2 rounded-lg border dark:border-neutral-800 bg-white dark:bg-neutral-900"
                                    />
                                </div>

                                <div>
                                    <label className="text-[12px] block mb-1 text-gray-600 dark:text-gray-300">Reason</label>
                                    <textarea
                                        value={reschedReason}
                                        onChange={(e) => setReschedReason(e.target.value)}
                                        rows={3}
                                        placeholder="Why is this being rescheduled?"
                                        className="w-full text-sm px-3 py-2 rounded-lg border dark:border-neutral-800 bg-white dark:bg-neutral-900"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                className="px-3 py-2 text-sm rounded-lg border dark:border-neutral-800"
                                onClick={() => setReschedOpen(false)}
                            >
                                Cancel
                            </button>
                            <button
                                className="px-3 py-2 text-sm rounded-lg bg-amber-600 text-white disabled:opacity-60"
                                disabled={reschedSubmitting || !reschedDate || !reschedTime || !reschedReason.trim()}
                                onClick={async () => {
                                    try {
                                        setReschedSubmitting(true);
                                        await api.patch(`/projects/${projectId}/wir/${wirId}`, {
                                            rescheduleForDate: reschedDate || null,
                                            rescheduleForTime: reschedTime || null,
                                            rescheduleReason: reschedReason.trim() || null,
                                            rescheduledById: currentUid || null,
                                        });
                                        await fetchWir();
                                        setReschedOpen(false);
                                    } finally {
                                        setReschedSubmitting(false);
                                    }
                                }}
                            >
                                {reschedSubmitting ? "Saving…" : "Save Reschedule"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {historyOpen && row && (
                <div
                    className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40"
                    role="dialog"
                    aria-modal="true"
                >
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl border dark:border-neutral-800 w-[96vw] max-w-3xl max-h-[85vh] overflow-auto">
                        {/* Header */}
                        <div className="p-4 border-b dark:border-neutral-800 flex items-center justify-between">
                            <div className="text-base sm:text-lg font-semibold dark:text-white">
                                WIR History — {row.code || row.wirId}
                            </div>
                            <button
                                className="text-sm px-3 py-2 rounded-lg border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                                onClick={() => setHistoryOpen(false)}
                            >
                                Close
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-4">
                            {(row.histories?.length || 0) === 0 ? (
                                <div className="text-sm text-gray-600 dark:text-gray-300">No history recorded.</div>
                            ) : (
                                <ul className="space-y-3">
                                    {[...(row.histories || [])]
                                        .slice()
                                        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                                        .map((h) => (
                                            <li key={h.id} className="rounded-xl border dark:border-neutral-800 p-3">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div className="text-sm dark:text-white font-medium">
                                                        {h.action || "Action"}
                                                    </div>
                                                    <div className="text-[12px] text-gray-600 dark:text-gray-300">
                                                        {h.createdAt ? new Date(h.createdAt).toLocaleString() : "—"}
                                                    </div>
                                                </div>
                                                <div className="mt-1 text-[12px] text-gray-700 dark:text-gray-300">
                                                    <b>Actor:</b>{" "}
                                                    {h.actorName || (h.actorUserId ? actorNameMap[String(h.actorUserId)] : "") || h.actorUserId || "—"}
                                                </div>

                                                {h.notes?.toString().trim() ? (
                                                    <div className="mt-1 text-[12px] text-gray-700 dark:text-gray-300">
                                                        <b>Notes:</b> {h.notes}
                                                    </div>
                                                ) : null}
                                                { /*         {h.meta ? (
                                                    <details className="mt-2">
                                                        <summary className="cursor-pointer text-[12px] text-gray-600 dark:text-gray-400">
                                                            Show metadata
                                                        </summary>
                                                        <pre className="mt-1 text-[11px] overflow-auto p-2 rounded bg-gray-50 dark:bg-neutral-800 dark:text-gray-200">
                                                            {JSON.stringify(h.meta, null, 2)}
                                                        </pre>
                                                    </details>
                                                ) : null}
                                           */}
                                            </li>
                                        ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {runnerHistoryOpen && row && (
                <div
                    className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40"
                    role="dialog"
                    aria-modal="true"
                >
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl border dark:border-neutral-800 w-[96vw] max-w-4xl max-h-[85vh] overflow-auto">
                        {/* Header */}
                        <div className="p-4 border-b dark:border-neutral-800 flex items-center justify-between">
                            <div className="text-base sm:text-lg font-semibold dark:text-white">
                                Runner Items History — {row.code || row.wirId}
                            </div>
                            <button
                                className="text-sm px-3 py-2 rounded-lg border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                                onClick={() => setRunnerHistoryOpen(false)}
                            >
                                Close
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-4">
                            {((row.items?.some(it => (it.runs?.length || 0) > 0)) ? false : true) ? (
                                <div className="text-sm text-gray-600 dark:text-gray-300">No runner history recorded.</div>
                            ) : (
                                <ul className="space-y-4">
                                    {(row.items ?? [])
                                        .filter(it => (it.runs?.length || 0) > 0)
                                        .map((it) => (
                                            <li key={it.id} className="rounded-xl border dark:border-neutral-800 p-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-semibold dark:text-white">
                                                            {it.name || "Untitled Item"} {it.code ? `— ${it.code}` : ""}
                                                        </div>
                                                        {(it.unit || it.tolerance) ? (
                                                            <div className="text-[12px] text-gray-600 dark:text-gray-300 mt-0.5">
                                                                {it.unit ? `Unit: ${it.unit}` : ""}{it.unit && it.tolerance ? " • " : ""}
                                                                {it.tolerance ? `Tolerance: ${it.tolerance}` : ""}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                    {it.critical ? (
                                                        <span className="text-[10px] px-2 py-0.5 rounded-full border border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200 dark:border-rose-800">
                                                            Critical
                                                        </span>
                                                    ) : null}
                                                </div>

                                                <div className="mt-2">
                                                    <ul className="space-y-2">
                                                        {[...(it.runs || [])]
                                                            .slice()
                                                            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                                                            .map((r, idx) => (
                                                                <li key={idx} className="rounded-lg border dark:border-neutral-800 p-2">
                                                                    <div className="flex items-center justify-between gap-2">
                                                                        <div className="text-[12px] text-gray-700 dark:text-gray-300">
                                                                            <b>When:</b> {r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}
                                                                        </div>
                                                                        <div className="text-[11px] px-2 py-0.5 rounded border dark:border-neutral-800">
                                                                            {r.status || "—"}
                                                                        </div>
                                                                    </div>
                                                                    <div className="mt-1 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[12px] text-gray-700 dark:text-gray-300">
                                                                        <div>
                                                                            <b>Value:</b> {r.valueNumber != null ? r.valueNumber : "—"}{r.unit ? ` ${r.unit}` : ""}
                                                                        </div>
                                                                        <div className="sm:col-span-2">
                                                                            <b>Comment:</b> {r.comment?.toString().trim() ? r.comment : "—"}
                                                                        </div>
                                                                    </div>
                                                                </li>
                                                            ))}
                                                    </ul>
                                                </div>
                                            </li>
                                        ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {previewOpen && (
                <div
                    className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40"
                    role="dialog"
                    aria-modal="true"
                >
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl border dark:border-neutral-800 w-[96vw] max-w-5xl max-h-[88vh] flex flex-col">
                        {/* Modal header */}
                        <div className="p-4 border-b dark:border-neutral-800 flex items-center justify-between">
                            <div className="text-base sm:text-lg font-semibold dark:text-white">
                                Preview — Runner (Read only)
                            </div>
                            <button
                                className="text-sm px-3 py-2 rounded-lg border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                                onClick={() => setPreviewOpen(false)}
                            >
                                Close
                            </button>
                        </div>

                        {/* Modal content */}
                        <div className="p-4 overflow-auto">
                            {items.length === 0 ? (
                                <div className="text-sm">No items materialized.</div>
                            ) : (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                    {items.map((it) => {
                                        const buf = edits[it.id] || {};
                                        const tol = tolLine(it.base as any, it.plus as any, it.minus as any);
                                        const tolPill = (() => {
                                            const op = (it.tolerance || "").toString().trim();
                                            const b = it.base != null ? String(it.base) : "";
                                            const u = (it.unit || "").toString().trim();
                                            const parts = [op, b, u].filter(Boolean);
                                            return parts.length ? parts.join(" ") : null; // e.g., "<= 20 mm"
                                        })();
                                        const req = (it.spec || "").trim();
                                        const isMandatory = /^mandatory$/i.test(req);
                                        const isOptional = /^optional$/i.test(req);
                                        // PATCH: per-item evidence helpers
                                        const MAX_EVIDENCES = 5;
                                        const savedCount = (it.evidences?.length || 0);
                                        const canAddEvidence = savedCount < MAX_EVIDENCES;
                                        return (
                                            <div key={it.id} className="rounded-2xl border dark:border-neutral-800 p-3 space-y-3">
                                                {/* Item meta (same header info as runner card) */}
                                                <div>
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-semibold dark:text-white">
                                                                {it.name ?? "Untitled Item"}{tol ? ` — ${tolPill}` : ""}
                                                            </div>
                                                            {it.code ? (
                                                                <div className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">
                                                                    {it.code}
                                                                </div>
                                                            ) : null}
                                                        </div>

                                                        {it.critical ? (
                                                            <span className="text-[10px] px-2 py-0.5 rounded-full border border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200 dark:border-rose-800">
                                                                Critical
                                                            </span>
                                                        ) : null}
                                                    </div>

                                                    {/* Pills: requirement, unit, tolerance */}
                                                    <div className="mt-2 flex flex-wrap gap-2">
                                                        {isMandatory && (
                                                            <span className="text-[11px] px-2 py-1 rounded-lg border dark:border-neutral-800">
                                                                Mandatory
                                                            </span>
                                                        )}
                                                        {isOptional && (
                                                            <span className="text-[11px] px-2 py-1 rounded-lg border dark:border-neutral-800">
                                                                Optional
                                                            </span>
                                                        )}
                                                        {it.unit ? (
                                                            <span className="text-[11px] px-2 py-1 rounded-lg border dark:border-neutral-800">
                                                                Unit: {it.unit}
                                                            </span>
                                                        ) : null}
                                                        {tolPill ? (
                                                            <span className="text-[11px] px-2 py-1 rounded-lg border dark:border-neutral-800">
                                                                Tolerance: {tolPill}
                                                            </span>
                                                        ) : null}
                                                    </div>

                                                    {/* Tags */}
                                                    {(it.tags?.length || 0) > 0 ? (
                                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                                            {it.tags!.map((t, i) => (
                                                                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full border dark:border-neutral-800">
                                                                    {t}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : null}
                                                </div>

                                                {/* Read-only observation summary */}
                                                <div className="rounded-xl border dark:border-neutral-800 p-3 space-y-2">
                                                    <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                                        Inspector Observation (Read only)
                                                    </div>

                                                    <div className="text-sm">
                                                        <b>Measurement{it.unit ? ` (${it.unit})` : ""}:</b>{" "}
                                                        {buf.value?.toString().trim() ? buf.value : "—"}
                                                    </div>

                                                    <div className="text-sm flex items-center gap-2">
                                                        <b>Status:</b>
                                                        <span
                                                            className={`text-[11px] px-2 py-0.5 rounded border ${buf.status === "PASS"
                                                                ? "bg-emerald-600 text-white border-emerald-700"
                                                                : "dark:border-neutral-800"
                                                                }`}
                                                        >
                                                            {buf.status ?? "—"}
                                                        </span>
                                                    </div>

                                                    <div className="text-sm">
                                                        <b>Remarks:</b>{" "}
                                                        {buf.remark?.toString().trim() ? buf.remark : "—"}
                                                    </div>

                                                    <div className="text-sm">
                                                        <b>Attachments:</b>{" "}
                                                        {((it.evidences?.length || 0) === 0 && !buf.evidenceUrl && !buf.photo)
                                                            ? "—"
                                                            : (
                                                                <div className="mt-1 flex flex-col gap-1">
                                                                    {(it.evidences || []).map(ev => (
                                                                        <div key={ev.id} className="text-[12px]">
                                                                            • <a className="underline" href={ev.url} target="_blank" rel="noreferrer">
                                                                                {ev.fileName || baseName(ev.url) || ev.kind}
                                                                            </a> <span className="ml-1 text-[10px] px-1 py-0.5 rounded border dark:border-neutral-800">{ev.kind}</span>
                                                                        </div>
                                                                    ))}
                                                                    {buf.evidenceUrl && (
                                                                        <div className="text-[12px]">
                                                                            • <a className="underline" href={buf.evidenceUrl} target="_blank" rel="noreferrer">
                                                                                {buf.evidenceName || baseName(buf.evidenceUrl) || "Attachment"}
                                                                            </a> <span className="ml-1 text-[10px] px-1 py-0.5 rounded border dark:border-neutral-800">Pending</span>
                                                                        </div>
                                                                    )}
                                                                    {buf.photo && !buf.evidenceUrl && (
                                                                        <div className="text-[12px]">• {buf.photo.name} <span className="ml-1 text-[10px] px-1 py-0.5 rounded border dark:border-neutral-800">Pending</span></div>
                                                                    )}
                                                                </div>
                                                            )
                                                        }
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
            )}

            {hodConfirmOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl border dark:border-neutral-800 w-[92vw] max-w-lg p-4">
                        <div className="flex items-center justify-between">
                            <div className="text-base font-semibold dark:text-white">Send to HOD — Confirmation</div>
                            <button
                                className="text-sm px-3 py-2 rounded-lg border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                                onClick={() => setHodConfirmOpen(false)}
                            >
                                Close
                            </button>
                        </div>

                        <div className="mt-3 text-sm">
                            <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                                HOD (Derived for this project)
                            </div>

                            {hodLoading ? (
                                <div>Loading…</div>
                            ) : hodErr ? (
                                <div className="text-rose-600">{hodErr}</div>
                            ) : hodList.length === 0 ? (
                                <div>No HOD role discovered for this project.</div>
                            ) : (
                                <ul className="space-y-1">
                                    {hodList.map(u => {
                                        const checked = hodSelectedUserId === u.userId;
                                        return (
                                            <li
                                                key={u.userId}
                                                className={`flex items-center justify-between rounded border dark:border-neutral-800 px-3 py-2 cursor-pointer ${checked ? "ring-2 ring-blue-500" : ""
                                                    }`}
                                                onClick={() => setHodSelectedUserId(u.userId)}
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <input
                                                        type="radio"
                                                        name="hod-pick"
                                                        className="shrink-0"
                                                        checked={checked}
                                                        onChange={() => setHodSelectedUserId(u.userId)}
                                                    />
                                                    <span className="truncate">{u.fullName}</span>
                                                </div>
                                                <span className="text-[11px] px-2 py-0.5 rounded-lg border dark:border-neutral-800">
                                                    {u.acting}
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ul>

                            )}
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                className="px-3 py-2 text-sm rounded-lg border dark:border-neutral-800"
                                onClick={() => setHodConfirmOpen(false)}
                            >
                                Cancel
                            </button>
                            <button
                                className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-60"
                                onClick={onConfirmSendToHod}
                                disabled={hodLoading || !hodSelectedUserId}   // <— gate by selection
                            >
                                Proceed & Send
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {hodReviewOpen && hodPlannedPatch && (
                <div className="fixed inset-0 z-[101] flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl border dark:border-neutral-800 w-[92vw] max-w-md p-4">
                        <div className="text-base font-semibold dark:text-white">Review changes</div>

                        <div className="mt-3 text-sm text-gray-700 dark:text-gray-300 space-y-1">
                            <div><b>Inspector Recommendation →</b> {hodPlannedPatch.inspectorRecommendation}</div>
                            {hodPlannedPatch.contractorId && (
                                <div><b>Contractor →</b> {nameOf(hodPlannedPatch.contractorId)}</div>
                            )}
                            <div><b>Inspector →</b> {nameOf(row?.inspectorId)}</div>
                            <div><b>HOD →</b> {nameOf(hodPlannedPatch.hodId)}</div>
                            <div><b>BIC →</b> {nameOf(hodPlannedPatch.bicUserId)}</div>
                        </div>

                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                className="px-3 py-2 text-sm rounded-lg border dark:border-neutral-800"
                                onClick={() => { setHodReviewOpen(false); setHodPlannedPatch(null); }}
                            >
                                Cancel
                            </button>
                            <button
                                className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-60"
                                onClick={async () => {
                                    try {
                                        setRecSubmitting(hodPlannedPatch.inspectorRecommendation);
                                        setHodReviewOpen(false);

                                        // 1) Upload pending attachments, then save runner entries
                                        await uploadAllPending();
                                        await saveAllItems();

                                        // 2) Apply header patch in one go (hodId, bicUserId, status, version, contractorId)
                                        await api.patch(`/projects/${projectId}/wir/${wirId}`, hodPlannedPatch);

                                        // 3) Persist the recommendation via BE endpoint (keeps audit/version parity)
                                        const remark =
                                            (pendingRemark || "").slice(0, 200).trim() || null;

                                        await api.post(
                                            `/projects/${projectId}/wir/${wirId}/runner/inspector-recommend`,
                                            {
                                                action: hodPlannedPatch.inspectorRecommendation,
                                                comment: remark,
                                            }
                                        );

                                        // 4) Refresh
                                        await fetchWir();
                                        backToList(); // navigate to list after successful send

                                    } finally {
                                        setRecSubmitting(null);
                                        setHodPlannedPatch(null);
                                    }
                                }}
                            >
                                OK
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {valErrItemId && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
                    role="dialog"
                    aria-modal="true"
                >
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl border dark:border-neutral-800 w-[92vw] max-w-md p-4">
                        <div className="text-base font-semibold dark:text-white">
                            Measurement must be a number
                        </div>
                        <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                            Please enter a numeric value  (e.g., <b>10</b> or <b>10.5</b>) and try again.
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                className="px-3 py-2 text-sm rounded-lg border dark:border-neutral-800"
                                onClick={() => {
                                    const id = valErrItemId;
                                    setValErrItemId(null);
                                    // re-focus after closing
                                    setTimeout(() => id && inputRefs.current[id]?.focus(), 0);
                                }}
                            >
                                Go to field
                            </button>
                            <button
                                className="px-3 py-2 text-sm rounded-lg bg-emerald-600 text-white"
                                onClick={() => setValErrItemId(null)}
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {sendWarnOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl border dark:border-neutral-800 w-[92vw] max-w-md p-4">
                        <div className="text-base font-semibold dark:text-white">Missing required fields</div>
                        <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                            All <b>Mandatory</b> items must have a <b>Pass/Fail</b> status,
                            a numeric <b>Measurement</b> if tagged <i>measurement</i>,
                            an attached <b>Photo/Document</b> if tagged <i>evidence/document</i>,
                            and one <b>Recommendation</b> (Approve / Approve w/ Comments / Reject) selected.
                        </div>

                        {sendWarnList.length > 0 && (
                            <ul className="mt-3 text-sm list-disc pl-5 max-h-48 overflow-auto">
                                {sendWarnList.map(it => (
                                    <li key={it.id}>{it.name}</li>
                                ))}
                            </ul>
                        )}
                        <div className="mt-4 flex justify-end">
                            <button
                                className="px-3 py-2 text-sm rounded-lg bg-emerald-600 text-white"
                                onClick={() => setSendWarnOpen(false)}
                            >
                                Got it
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* ADD: Inspector review modal */}
            {inspRecoInspOpen && row && (
                <InspRecoInspRunner
                    wir={row}
                    onClose={() => setInspRecoInspOpen(false)}
                />
            )}

            {/* ADD: HOD review modal */}
            {inspRecoHodOpen && row && (
                <InspRecoHODRunner
                    wir={row}
                    onClose={() => setInspRecoHodOpen(false)}
                />
            )}
            {noEditPermOpen && (
                <div className="fixed inset-0 z-[105] flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl border dark:border-neutral-800 w-[92vw] max-w-md p-4">
                        <div className="text-base font-semibold dark:text-white">Runner — Edit Not Allowed</div>
                        <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                            Editable Runner opens only when <b>Inspector + Submitted + BIC is you</b>.
                            You currently don’t meet this condition.
                        </div>
                        <div className="mt-4 flex justify-end">
                            <button
                                className="px-3 py-2 text-sm rounded-lg border dark:border-neutral-800"
                                onClick={() => setNoEditPermOpen(false)}
                            >
                                OK
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {finalizeOpen && row && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border dark:border-neutral-800 w-[96vw] max-w-lg max-h-[90vh] overflow-auto p-4 sm:p-5">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div className="text-base sm:text-lg font-semibold dark:text-white">Finalize Outcome</div>
                            <button
                                className="text-sm px-3 py-2 rounded-lg border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                                onClick={() => setFinalizeOpen(false)}
                            >
                                Close
                            </button>
                        </div>

                        {/* Tile 1: Details */}
                        <section className="mt-3 rounded-xl border dark:border-neutral-800 p-3">
                            <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                                Finalize Outcome
                            </div>
                            <div className="text-sm dark:text-white space-y-1">
                                <div><b>WIR:</b> {(row.code || row.wirId) + (row.title ? ` — ${row.title}` : "")}</div>
                                <div><b>Inspector:</b> {inspName || "—"}</div>
                                <div><b>Inspector Recommendation:</b> {row.inspectorRecommendation || "—"}</div>
                            </div>
                        </section>

                        {/* Tile 2: Select Outcome */}
                        <section className="mt-3 rounded-xl border dark:border-neutral-800 p-3 space-y-3">
                            <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                Select Outcome
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => setFinalizeOutcome("ACCEPT")}
                                    className={`text-sm px-3 py-2 rounded-lg border ${finalizeOutcome === "ACCEPT"
                                        ? "bg-emerald-600 text-white border-emerald-700"
                                        : "dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                                        }`}
                                >
                                    Accept
                                </button>
                                {/*        <button
                                    type="button"
                                    onClick={() => setFinalizeOutcome("REJECT")}
                                    className={`text-sm px-3 py-2 rounded-lg border ${finalizeOutcome === "REJECT"
                                        ? "bg-rose-600 text-white border-rose-700"
                                        : "dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                                        }`}
                                >
                                    Reject
                                </button>
                          */}
                            </div>

                            <div>
                                <label className="text-[12px] block mb-1 text-gray-600 dark:text-gray-300">
                                    Note (optional, max 200 chars)
                                </label>
                                <textarea
                                    value={finalizeNote}
                                    onChange={(e) => setFinalizeNote(e.target.value.slice(0, 200))}
                                    rows={3}
                                    className="w-full text-sm px-3 py-2 rounded-lg border dark:border-neutral-800 bg-white dark:bg-neutral-900"
                                    placeholder="Write a brief note for this decision…"
                                />
                                <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 text-right">
                                    {finalizeNote.length}/200
                                </div>
                            </div>
                        </section>

                        {/* Tile 3: What will be sent */}
                        <section className="mt-3 rounded-xl border dark:border-neutral-800 p-3 space-y-3">
                            <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                What will be sent
                            </div>

                            <div className="text-[12px] text-gray-700 dark:text-gray-300">
                                When HOD clicks <b>“Finalize Now”</b>:
                            </div>

                            {/* Phase 1 — header patch */}
                            <div className="rounded-lg border dark:border-neutral-800 p-3">
                                <div className="text-[12px] font-semibold mb-1">Phase 1 — header patch (single PATCH)</div>
                                {mappedFinalizeOutcome ? (
                                    <pre className="text-[11px] overflow-auto whitespace-pre-wrap leading-5 bg-gray-50 dark:bg-neutral-800 dark:text-gray-100 p-2 rounded">
                                        {JSON.stringify(finalizePhase1Preview, null, 2)}
                                    </pre>
                                ) : (
                                    <div className="text-[12px] text-gray-600 dark:text-gray-400">
                                        Pick <b>Accept</b> or <b>Reject</b> to preview the exact payload.
                                    </div>
                                )}
                                <ul className="mt-2 list-disc pl-5 text-[12px] text-gray-700 dark:text-gray-300 space-y-1">
                                    <li><code>hodOutcome</code> = <code>"APPROVE"</code> for Accept, <code>"REJECT"</code> for Reject (mapped from local <code>"ACCEPT"</code> | <code>"REJECT"</code>).</li>
                                    <li><code>hodDecidedAt</code> = current ISO timestamp.</li>
                                    <li><code>hodRemarks</code> included only if note is non-empty (trimmed).</li>
                                    <li><code>bicUserId</code> reassigned per rules:
                                        <ul className="list-disc pl-5 mt-1">
                                            <li>APPROVE + Inspector <code>APPROVE_WITH_COMMENTS</code> → contractorUid (fallback: <code>contractorId</code>, else <code>createdById</code>, else <code>null</code>)</li>
                                            <li>APPROVE + Inspector plain <code>APPROVE</code> → <code>null</code></li>
                                            <li>REJECT → contractorUid (same fallback)</li>
                                        </ul>
                                    </li>
                                </ul>
                            </div>

                            {/* Phase 2 — status patch */}
                            <div className="rounded-lg border dark:border-neutral-800 p-3">
                                <div className="text-[12px] font-semibold mb-1">Phase 2 — status patch (separate PATCH)</div>
                                {mappedFinalizeOutcome ? (
                                    <pre className="text-[11px] overflow-auto whitespace-pre-wrap leading-5 bg-gray-50 dark:bg-neutral-800 dark:text-gray-100 p-2 rounded">
                                        {JSON.stringify(finalizePhase2Preview, null, 2)}
                                    </pre>
                                ) : (
                                    <div className="text-[12px] text-gray-600 dark:text-gray-400">
                                        Pick an outcome to see the final status payload.
                                    </div>
                                )}
                                <ul className="mt-2 list-disc pl-5 text-[12px] text-gray-700 dark:text-gray-300 space-y-1">
                                    <li>If Accept → <code>{"{ status: \"Approved\" }"}</code></li>
                                    <li>If Reject → <code>{"{ status: \"Rejected\" }"}</code></li>
                                </ul>
                            </div>

                            <div className="text-[12px] text-gray-700 dark:text-gray-300">
                                Then the app refreshes the document via <code>fetchWir()</code>, closes the modal, and clears local finalize state.
                            </div>
                        </section>

                        {/* Footer actions */}
                        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setFinalizeOpen(false)}
                                className="w-full sm:w-auto text-sm px-3 py-2 rounded-lg border dark:border-neutral-800"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={onFinalizeNow}
                                disabled={!finalizeOutcome || !!finalizeSubmitting}
                                className={`w-full sm:w-auto text-sm px-3 py-2 rounded-lg border ${finalizeOutcome && !recSubmitting
                                    ? "bg-blue-600 text-white hover:bg-blue-700 dark:border-blue-700"
                                    : "bg-blue-600/60 text-white cursor-not-allowed dark:border-blue-700"
                                    }`}
                                title={finalizeOutcome ? "Finalize this WIR" : "Pick Approve or Reject"}
                            >
                                {finalizeSubmitting ? "Finalizing…" : "Finalize Now"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {followupOpen && row && (
                <FollowupScheduleModal
                    projectId={projectId}
                    wir={row}
                    nextVersionLabel={nextVersionLabel}
                    onClose={() => setFollowupOpen(false)}
                    onCreated={(newWirId?: string) => {
                        setFollowupOpen(false);
                        if (newWirId) {
                            const role = (loc.state as NavState | undefined)?.role;
                            const project = (loc.state as NavState | undefined)?.project || { projectId };
                            // Open Create in EDIT mode for this freshly created follow-up
                            navigate(
                                `/home/projects/${projectId}/wir/create?mode=followup&editId=${newWirId}`,
                                { state: { role, project }, replace: true }
                            );
                        }
                    }}
                />
            )}

        </section>
    );
}