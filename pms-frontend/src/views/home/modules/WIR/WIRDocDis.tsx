// pms-frontend/src/views/home/modules/WIR/WIRDocDis.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../../../../api/client";
import { useAuth } from "../../../../hooks/useAuth";
import { useBicNameMap, pickBicName } from "./wir.bicNames";
import type { BicAware } from "./wir.bicNames";

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
    base?: number | null;            // WirItem.base
    plus?: number | null;            // WirItem.plus
    minus?: number | null;           // WirItem.minus

    inspectorStatus?: "PASS" | "FAIL" | "NA" | null; // WirItem.inspectorStatus
    inspectorNote?: string | null;                   // WirItem.inspectorNote
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
    version?: number | null;
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
};

const canonicalWirStatus = (s?: string | null) => {
    const n = (s || "").toString().trim().replace(/\s|_/g, "").toLowerCase();
    if (!n) return "Unknown";
    if (n.includes("draft")) return "Draft";
    if (n.includes("submit")) return "Submitted";
    if (n.includes("recommend")) return "InspectorRecommended";
    if (n.includes("approve")) return "HODApproved";
    if (n.includes("reject")) return "HODRejected";
    if (n.includes("hold")) return "OnHold";
    if (n.includes("close")) return "Closed";
    return "Unknown";
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

    const setEdit = (itemId: string, patch: Partial<EditBuf>) =>
        setEdits((m) => ({ ...m, [itemId]: { ...(m[itemId] || {}), ...patch } }));

    const onPickPhoto = (itemId: string, file?: File | null) =>
        setEdit(itemId, { photo: file || null });

    const parseNum = (s?: string) => {
        if (!s) return undefined;
        const n = Number(String(s).replace(/,/g, "").trim());
        return Number.isFinite(n) ? n : undefined;
    };

    const saveOneItem = useCallback(
        async (it: WirItem) => {
            const buf = edits[it.id] || {};
            const valueNumber = parseNum(buf.value);

            // Inspector save payload aligned with BE runner endpoint
            const payload = {
                actorRole: "Inspector",
                items: [
                    {
                        itemId: it.id,
                        inspectorStatus: buf.status || null,
                        note: (buf.remark || "").trim() || null,
                        valueNumber,
                        unit: it.unit || null,
                    },
                ],
            };

            await api.post(
                `/projects/${projectId}/wir/${wirId}/runner/inspector-save`,
                payload
            );

            // NOTE: Photo upload can be wired to /evidence later. The UI already captures the file via input[capture].

            // Refresh and clear local inputs (keep current PASS/FAIL selection for speed if you like)
            await fetchWir();
            setEdits((m) => ({
                ...m,
                [it.id]: { value: "", remark: "", status: buf.status, photo: null },
            }));
        },
        [projectId, wirId, edits, fetchWir]
    );

    /* ---------- render helpers ---------- */

    const headerLine = useMemo(() => {
        if (!row) return "";
        const parts = [
            row.code || undefined,
            row.title || undefined,
            typeof row.version === "number" ? `v${row.version}` : undefined,
        ].filter(Boolean);
        return parts.join(" — ");
    }, [row]);

    const statusBadge = (value?: string | null) => {
        const v = canonicalWirStatus(value);
        const map: Record<string, string> = {
            Draft:
                "bg-gray-100 text-gray-800 border-gray-200 dark:bg-neutral-800 dark:text-gray-200 dark:border-neutral-700",
            Submitted:
                "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
            InspectorRecommended:
                "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
            HODApproved:
                "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
            HODRejected:
                "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800",
            OnHold:
                "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-200 dark:border-yellow-800",
            Closed:
                "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-800",
            Unknown:
                "bg-gray-100 text-gray-800 border-gray-200 dark:bg-neutral-800 dark:text-gray-200 dark:border-neutral-700",
        };
        return <span className={`text-[10px] px-1.5 py-0.5 rounded border ${map[v]}`}>{v}</span>;
    };

    const items = row?.items ?? [];
    const itemsCount = items.length;

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
                            <TabButton active={subtab === "runner"} onClick={() => setSubtab("runner")}>
                                Runner
                            </TabButton>
                        </div>

                        {subtab === "overview" ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="rounded-xl border dark:border-neutral-800 p-3">
                                    <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                                        Header
                                    </div>
                                    <div className="text-sm dark:text-white space-y-1">
                                        <div><b>Code:</b> {row.code || "—"}</div>
                                        <div><b>Title:</b> {row.title || "—"}</div>
                                        <div><b>Status:</b> {row.status || "—"}</div>
                                        <div><b>Discipline:</b> {row.discipline || "—"}</div>
                                        <div>
                                            <b>Planned:</b>{" "}
                                            {row.forDate ? new Date(row.forDate).toLocaleDateString() : "—"}
                                            {row.forTime ? ` • ${row.forTime}` : ""}
                                        </div>
                                        <div><b>Location:</b> {row.cityTown || "—"}</div>
                                        <div><b>Version:</b> {typeof row.version === "number" ? `v${row.version}` : "—"}</div>
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

                                {/* All items rendered as Tile 2 + Tile 3 */}
                                {items.length === 0 ? (
                                    <div className="text-sm">No items materialized.</div>
                                ) : (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                        {items.map((it) => {
                                            const buf = edits[it.id] || {};
                                            const tol = tolLine(it.base as any, it.plus as any, it.minus as any);

                                            return (
                                                <div key={it.id} className="rounded-2xl border dark:border-neutral-800 p-3 space-y-3">
                                                    {/* Tile 2: Item meta */}
                                                    <div>
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                {/* Title of item -- tolerance base value plus minus value */}
                                                                <div className="text-sm font-semibold dark:text-white">
                                                                    {it.name ?? "Untitled Item"}{tol ? ` — ${tol}` : ""}
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
                                                            {tol ? (
                                                                <span className="text-[11px] px-2 py-1 rounded-lg border dark:border-neutral-800">
                                                                    Tolerance: {tol}
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

                                                        {/* Save button */}
                                                        <div className="flex items-center justify-end">
                                                            <button
                                                                onClick={() => saveOneItem(it)}
                                                                className="text-sm px-4 py-2 rounded-lg border dark:border-neutral-800 bg-emerald-600 text-white hover:opacity-95"
                                                            >
                                                                Save
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                ) : (
                    // Discussion tab placeholder
                    <div>
                        <div className="text-sm text-gray-600 dark:text-gray-300">
                            Discussion thread for <b>{row.code || row.wirId}</b> will appear here.
                        </div>
                        <div className="mt-3 rounded-xl border dark:border-neutral-800 p-3">
                            <div className="text-[12px] text-gray-500 dark:text-gray-400">
                                Signed in as: {creatorName}
                            </div>
                            <div className="mt-2 text-sm">
                                <em>Coming soon: comments list + add comment box.</em>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
