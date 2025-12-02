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

type NavState = {
    role?: string;
    project?: { projectId: string; code?: string | null; title?: string | null };
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
    hodOutcome?: "APPROVE" | "REJECT" | null;
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
    photo?: File | null;                   // camera capture (optional)
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
    const [recSubmitting, setRecSubmitting] = useState<null | "APPROVE" | "APPROVE_WITH_COMMENTS" | "REJECT">(null);
    // Hold local (unsaved) pick
    const [pendingRec, setPendingRec] =
        useState<WirDoc["inspectorRecommendation"] | null>(null);
    const onPreview = useCallback(() => {
        setPreviewOpen(true);
    }, []);
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

    const onPickPhoto = (itemId: string, file?: File | null) =>
        setEdit(itemId, { photo: file || null });

    const parseNum = (s?: string) => {
        if (!s) return undefined;
        const n = Number(String(s).replace(/,/g, "").trim());
        return Number.isFinite(n) ? n : undefined;
    };

    // Build local edit buffers from saved item fields (and last run)
    const buildEditsFromRow = (doc: WirDoc) => {
        const next: Record<string, EditBuf> = {};
        for (const it of doc.items ?? []) {
            const lastRun = (it as any).runs?.[0]; // available after BE change
            const savedValue =
                lastRun?.valueNumber != null
                    ? String(lastRun.valueNumber)
                    : undefined;

            next[it.id] = {
                value: savedValue ?? "",                       // measurement
                remark: it.inspectorNote ?? "",                // saved remarks
                status: it.inspectorStatus ?? undefined,       // PASS / FAIL / NA
                photo: null,
            };
        }
        return next;
    };

    const saveAllItems = useCallback(async () => {
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

    // require: every item must have measurement (numeric) AND status PASS/FAIL (remarks optional)
    const validateAllRunnerFields = useCallback(() => {
        if (!row?.items?.length) return { ok: false, missing: [] as Array<{ id: string; name: string }> };
        const missing: Array<{ id: string; name: string }> = [];
        for (const it of row.items) {
            const buf = edits[it.id] || {};
            const raw = (buf.value ?? "").toString().trim();
            const val = raw === "" ? undefined : parseNum(raw);
            const status = buf.status ?? null;
            const hasStatus = status === "PASS" || status === "FAIL";
            const hasValue = val !== undefined && Number.isFinite(val);
            if (!hasValue || !hasStatus) {
                missing.push({ id: it.id, name: it.name || it.code || "Item" });
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
            const userId =
                String((claims as any)?.userId || (user as any)?.userId || "");

            if (!roleKey || !userId) { if (alive) setCanSeeRunner(false); return; }

            try {
                const acting = await resolveActingRoleFor(projectId, roleKey, userId);
                if (alive) setActingRole((["Inspector", "HOD", "Inspector+HOD"] as const).includes(acting as any) ? (acting as any) : null);

                const ok = acting === "Inspector" || acting === "HOD" || acting === "Inspector+HOD";
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

    // ADD: visible only when WIR is Approved/Rejected
    const isFinalized = useMemo(() => {
        const st = canonicalWirStatus(row?.status);
        return st === "Approved" || st === "Rejected";
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
    const canReschedule = useMemo(() => {
        const isInspectorish =
            actingRole === "Inspector" || actingRole === "Inspector+HOD";
        const isBicSelf = !!row?.bicUserId && String(row.bicUserId) === currentUid;
        return isInspectorish && isBicSelf;
    }, [actingRole, row?.bicUserId, currentUid]);

    // HOD Finalize modal state
    const [finalizeOpen, setFinalizeOpen] = useState(false);
    const [finalizeOutcome, setFinalizeOutcome] = useState<"APPROVE" | "REJECT" | null>(null);
    const [finalizeNote, setFinalizeNote] = useState("");

    // Inspector display name (resolved from inspectorId for Finalize modal)
    const [inspName, setInspName] = useState<string>("");

    // Notes modal state
    const [notesOpen, setNotesOpen] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [actorNameMap, setActorNameMap] = useState<Record<string, string>>({});

    // runner no-edit permission dialog
    const [noEditPermOpen, setNoEditPermOpen] = useState(false);

    // click handler used by the button
    const onSendToHodClick = useCallback(async () => {
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
        setHodSelectedUserId(null);           // <— reset selection for a fresh open
        setHodConfirmOpen(true);
        loadHodDerived();
    }, [validateAllRunnerFields, inputRefs, loadHodDerived]);

    // onRunnerClick to show dialog when not allowed to open editable runner
    const onRunnerClick = useCallback(() => {
        if (!row) return;
        const st = canonicalWirStatus(row.status);

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
    setRecSubmitting(finalizeOutcome);

    // Phase 1: ONLY required fields; omit empty hodRemarks
    const p1: any = {
      hodOutcome: finalizeOutcome as "APPROVE" | "REJECT",
      hodDecidedAt: new Date().toISOString(),
    };
    const note = finalizeNote.trim();
    if (note) p1.hodRemarks = note; // ← include only if non-empty

    await api.patch(`/projects/${projectId}/wir/${wirId}`, p1);

    // Phase 2: flip header status (Title-case)
    const headerStatus = finalizeOutcome === "APPROVE" ? "Approved" : "Rejected";
    await api.patch(`/projects/${projectId}/wir/${wirId}`, { status: headerStatus });

    await fetchWir();
    setFinalizeOpen(false);
    setFinalizeOutcome(null);
    setFinalizeNote("");
  } finally {
    setRecSubmitting(null);
  }
}, [finalizeOutcome, finalizeNote, projectId, wirId, fetchWir]);

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
                                    <div className="pt-2">
                                        <button
                                            type="button"
                                            onClick={() => setHistoryOpen(true)}
                                            className="text-[12px] underline underline-offset-2 text-blue-600 hover:text-blue-700 dark:text-blue-400"
                                            title="View complete WIR change history"
                                        >
                                            View WIR History{typeof row.histories?.length === "number" ? ` (${row.histories.length})` : ""}
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

                                {/* HOD Tile (below Checklists) — visible only while InspectorRecommended */}
                                {!isFinalized && canonicalWirStatus(row?.status) === "Recommended" && (
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
                                                {row.inspectorReviewedAt
                                                    ? new Date(row.inspectorReviewedAt).toLocaleString()
                                                    : "—"}
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

                                                        {/* Button Add photo to take a picture from camera */}
                                                        <div className="flex items-center gap-2">
                                                            <label className="text-[12px] px-3 py-2 rounded border dark:border-neutral-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-800">
                                                                Add photo
                                                                <input
                                                                    type="file"
                                                                    accept="image/*"
                                                                    capture="environment"
                                                                    className="hidden"
                                                                    onChange={(e) => onPickPhoto(it.id, e.target.files?.[0] || null)}
                                                                />
                                                            </label>
                                                            {buf.photo ? (
                                                                <span className="text-[12px] text-gray-600 dark:text-gray-300 truncate max-w-[180px]">
                                                                    {buf.photo.name}
                                                                </span>
                                                            ) : null}
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
                                )}
                                {/* Recommendation tile (bottom) */}
                                <div className="mt-4 rounded-2xl border dark:border-neutral-800 p-3">
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
                                                        <b>Photo:</b>{" "}
                                                        {buf.photo?.name ? buf.photo.name : "—"}
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
                            <div><b>hodId →</b> {hodPlannedPatch.hodId}</div>
                            <div><b>bicUserId →</b> {hodPlannedPatch.bicUserId}</div>
                            <div><b>inspectorRecommendation →</b> {hodPlannedPatch.inspectorRecommendation}</div>
                            <div><b>status →</b> {hodPlannedPatch.status}</div>
                            <div><b>version →</b> {hodPlannedPatch.version}</div>
                            {hodPlannedPatch.contractorId && (
                                <div><b>contractorId →</b> {hodPlannedPatch.contractorId}</div>
                            )}
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

                                        // 1) Save all runner entries first (existing behavior)
                                        await saveAllItems();

                                        // 2) Apply header patch in one go (hodId, bicUserId, status, version, contractorId)
                                        await api.patch(`/projects/${projectId}/wir/${wirId}`, hodPlannedPatch);

                                        // 3) Persist the recommendation via BE endpoint (keeps audit/version parity)
                                        await api.post(
                                            `/projects/${projectId}/wir/${wirId}/runner/inspector-recommend`,
                                            { action: hodPlannedPatch.inspectorRecommendation, comment: null }
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
                            Each runner item must have a numeric <b>Measurement</b> and a <b>Pass/Fail</b> status.
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
                                    onClick={() => setFinalizeOutcome("APPROVE")}
                                    className={`text-sm px-3 py-2 rounded-lg border ${finalizeOutcome === "APPROVE"
                                        ? "bg-emerald-600 text-white border-emerald-700"
                                        : "dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                                        }`}
                                >
                                    Approve
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFinalizeOutcome("REJECT")}
                                    className={`text-sm px-3 py-2 rounded-lg border ${finalizeOutcome === "REJECT"
                                        ? "bg-rose-600 text-white border-rose-700"
                                        : "dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                                        }`}
                                >
                                    Reject
                                </button>
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
                                disabled={!finalizeOutcome || !!recSubmitting}
                                className={`w-full sm:w-auto text-sm px-3 py-2 rounded-lg border ${finalizeOutcome && !recSubmitting
                                    ? "bg-blue-600 text-white hover:bg-blue-700 dark:border-blue-700"
                                    : "bg-blue-600/60 text-white cursor-not-allowed dark:border-blue-700"
                                    }`}
                                title={finalizeOutcome ? "Finalize this WIR" : "Pick Approve or Reject"}
                            >
                                {recSubmitting ? "Finalizing…" : "Finalize Now"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
