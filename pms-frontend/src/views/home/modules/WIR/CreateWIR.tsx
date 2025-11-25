// pms-frontend/src/views/home/modules/WIR/CreateWIR.tsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../../../../api/client";
import { useAuth } from "../../../../hooks/useAuth";
import {
    listRefChecklistLibrary,
    listProjectRefChecklistItems,
    type RefChecklistMeta,
    formatTolerance,
} from "../../../../api/RefChecklists";
import DispatchWIRModal from "./DispatchWIRModal";

/* ---------------- helpers ---------------- */
// --- debug helper (log a safe clone + stash for quick access) ---
function logWir(label: string, obj: any) {
    try {
        console.info(`[WIR] ${label}:`, JSON.parse(JSON.stringify(obj)));
    } catch {
        console.info(`[WIR] ${label}:`, obj);
    }
    (window as any).__lastWirPayload = obj; // quick access in devtools
}

const normalizeRole = (raw?: string) => {
    const norm = (raw || "").toString().trim().replace(/[_\s-]+/g, "").toLowerCase();
    switch (norm) {
        case "admin": return "Admin";
        case "client": return "Client";
        case "ihpmt": return "IH-PMT";
        case "contractor": return "Contractor";
        case "consultant": return "Consultant";
        case "pmc": return "PMC";
        case "supplier": return "Supplier";
        default: return raw || "";
    }
};

type ProjectState = {
    projectId: string;
    code?: string | null;
    title?: string | null;
};

type NavState = {
    role?: string;
    project?: ProjectState;
};

function FieldLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={`text-[12px] sm:text-sm text-gray-600 dark:text-gray-300 mb-1 ${className}`}>
            {children}
        </div>
    );
}
function Note({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={`text-[12px] text-gray-500 dark:text-gray-400 ${className}`}>
            {children}
        </div>
    );
}
function SectionTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={`text-sm sm:text-base font-semibold dark:text-white mb-3 ${className}`}>
            {children}
        </div>
    );
}

/** Strict select wrapper (mobile-friendly sizing) */
function SelectStrict({
    label,
    value,
    onChange,
    options,
    placeholder = "Select…",
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: Array<{ value: string; label: string }>;
    placeholder?: string;
}) {
    return (
        <label className="block">
            <span className="block text-[11px] sm:text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                {label}
            </span>
            <select
                className="w-full px-3 py-3 sm:py-2 rounded-lg border dark:border-neutral-800 dark:bg-neutral-900 dark:text-white focus:outline-none focus:ring"
                value={value}
                onChange={(e) => onChange(e.target.value)}
            >
                <option value="">{placeholder}</option>
                {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>
        </label>
    );
}

const HOURS_12 = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")); // 01..12
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0")); // 00..55

function parseDDMMYYtoISO(v: string): string | null {
    const t = v.trim();
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(t);
    if (!m) return null;
    let [_, dd, mm, yy] = m;
    const day = Number(dd), mon = Number(mm);
    if (day < 1 || day > 31 || mon < 1 || mon > 12) return null;
    let year = Number(yy);
    if (yy.length === 2) year = year >= 70 ? 1900 + year : 2000 + year;
    return `${String(year).padStart(4, "0")}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function composeDateTimeISO(dateISO: string | null, hour12: string, minute: string, ampm: "AM" | "PM") {
    if (!dateISO) return null;
    let h = Number(hour12);
    if (ampm === "PM" && h !== 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    const hh = String(h).padStart(2, "0");
    const mm = String(Number(minute)).padStart(2, "0");
    return `${dateISO}T${hh}:${mm}:00`;
}

function getActivityTitleById(
    id: string,
    activities: Array<{ id: string; title: string }>,
    activityOpts: Array<{ value: string; label: string }>
): string | undefined {
    if (!id) return undefined;
    const fromActivities = activities.find(a => a.id === id)?.title;
    if (fromActivities) return String(fromActivities).trim();

    const opt = activityOpts.find(o => o.value === id)?.label;
    if (opt) {
        // strip possible "CODE • " prefix
        const parts = opt.split("•");
        return (parts.length > 1 ? parts.slice(1).join("•") : opt).trim();
    }
    return undefined;
}

// --- constants/types ---
const DISCIPLINES = ["Civil", "MEP", "Finishes"] as const;
type Discipline = typeof DISCIPLINES[number];

type ActivityLite = {
    id: string;
    title: string;
    discipline?: string | null;
};

// UI type for the Compliance modal rows
type UiComplianceItem = {
    id: string;
    text: string;
    refId: string;
    code: string | null;
    requirement: string | null;
    required: boolean | null;
    critical: boolean | null;
    tags: string[];
    units: string | null;
    tolOp: string | null;
    base: number | null;
    plus: number | null;
    minus: number | null;
    refCode: string | null;
    refTitle: string | null;
};

function normalizeArrayish(payload: any): any[] {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    const cands = [
        payload.items, payload.list, payload.data,
        payload?.data?.items, payload?.data?.list,
        payload?.result?.items, payload?.result?.list,
        payload?.content, payload?.rows,
    ];
    for (const c of cands) if (Array.isArray(c)) return c;
    return [];
}

function getRefId(m: any): string {
    return String(
        m?.id ??
        m?.refChecklistId ??
        m?.checklistId ??
        m?.refId ??
        m?.uuid ??
        m?.code ?? // last resort if code is unique
        ""
    );
}

function getRefCode(m: any): string {
    return String(
        m?.code ??
        m?.refCode ??
        m?.refChecklistCode ??
        m?.shortCode ??
        m?.slug ??
        ""
    );
}

function getRefTitle(m: any): string {
    return String(
        m?.title ??
        m?.name ??
        m?.label ??
        m?.refTitle ??
        m?.refName ??
        m?.refChecklistTitle ??
        m?.displayName ??
        m?.code ??  // fallback so the card is never blank
        "Untitled"
    );
}

function normalizeParts(raw: unknown): string[] {
    if (Array.isArray(raw)) return raw.map(String);
    if (raw == null) return [];
    // support "Civil", " civil ", "Civil,MEP", "Civil / Finishes", etc.
    return String(raw)
        .split(/[;,/]/)
        .map((s) => s.trim())
        .filter(Boolean);
}

function toArray(data: any): any[] {
    if (Array.isArray(data)) return data;
    const d = data as any;
    if (Array.isArray(d?.items)) return d.items;
    if (Array.isArray(d?.list)) return d.list;
    if (Array.isArray(d?.records)) return d.records;
    if (Array.isArray(d?.data?.items)) return d.data.items;
    if (Array.isArray(d?.data?.list)) return d.data.list;
    return [];
}

function buildAttachmentsMeta(docs: Record<string, File[] | undefined>) {
    const meta: Record<string, Array<{ name: string; size: number; type: string }>> = {};
    for (const [k, arr] of Object.entries(docs || {})) {
        if (!arr || !arr.length) continue;
        meta[k] = arr.map(f => ({ name: f.name, size: f.size, type: f.type }));
    }
    return meta;
}

function splitPlannedAtToParts(iso?: string | null) {
    if (!iso) return { dateISO: null, dateText: "", hh: "09", mm: "00", ampm: "AM", timeText: "09:00 AM" };
    const d = new Date(iso);
    const Y = d.getFullYear();
    const M = String(d.getMonth() + 1).padStart(2, "0");
    const D = String(d.getDate()).padStart(2, "0");
    let h24 = d.getHours();
    const m = String(d.getMinutes()).padStart(2, "0");
    const ampm = h24 >= 12 ? "PM" : "AM";
    let h12 = h24 % 12;
    if (h12 === 0) h12 = 12;
    const hh = String(h12).padStart(2, "0");
    const dateISO = `${Y}-${M}-${D}`;
    const dateText = `${D}/${M}/${String(Y).slice(2)}`;
    const timeText = `${hh}:${m} ${ampm}`;
    return { dateISO, dateText, hh, mm: m, ampm: ampm as "AM" | "PM", timeText };
}

function combineDateTimeISO(dateStr?: string | null, timeStr?: string | null) {
    if (!dateStr) return null;
    // timeStr could be "09:00", "9:00", "09:00:00", or null
    const t = (timeStr || "09:00").trim();
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
    let hh = "09", mm = "00", ss = "00";
    if (m) {
        hh = String(Math.min(23, Math.max(0, parseInt(m[1]!, 10)))).padStart(2, "0");
        mm = String(Math.min(59, Math.max(0, parseInt(m[2]!, 10)))).padStart(2, "0");
        ss = String(Math.min(59, Math.max(0, parseInt(m[3] || "0", 10)))).padStart(2, "0");
    }
    return `${dateStr}T${hh}:${mm}:${ss}`;
}

/* ---------------- main ---------------- */

export default function CreateWIR() {
    const { user, claims } = useAuth();
    const loc = useLocation();
    // detect edit mode (now we have `loc`)
    const search = new URLSearchParams(loc.search);
    const editId = search.get("editId") || (loc.state as any)?.wir?.wirId || null;
    const isEdit = !!editId;
    console.log("[WIR] edit: flags", { isEdit, editId, search: loc.search });

    const navigate = useNavigate();
    const params = useParams<{ projectId: string }>();

    const role = normalizeRole(
        (user as any)?.role ??
        (claims as any)?.role ??
        (claims as any)?.userRole ??
        (claims as any)?.roleName ??
        (loc.state as NavState | undefined)?.role ??
        ""
    );

    const activitySelectRef = useRef<HTMLSelectElement | null>(null);

    const projectFromState = (loc.state as NavState | undefined)?.project;
    const projectId = params.projectId || projectFromState?.projectId || "";

    useEffect(() => {
        document.title = isEdit
            ? "Trinity PMS — Edit WIR"
            : "Trinity PMS — Create WIR";
    }, [isEdit]);

    /* ---------------- form state ---------------- */

    // Section 1:
    const [discipline, setDiscipline] = useState<Discipline | "">("");
    const [activityId, setActivityId] = useState<string>("");
    const [dateISO, setDateISO] = useState<string | null>(null);
    const [dateText, setDateText] = useState<string>(""); // DD/MM/YY
    const [hh, setHH] = useState<string>("09");
    const [mm, setMM] = useState<string>("00");
    const [ampm, setAMPM] = useState<"AM" | "PM">("AM");
    const [timeText, setTimeText] = useState<string>("09:00 AM");
    const [locationText, setLocationText] = useState<string>("");

    // Section 2:
    const [workInspection, setWorkInspection] = useState<string>(""); // 200 chars

    // Section 3: (tiles) – placeholders for now
    const [docs, setDocs] = useState<{ drawings?: File[]; itp?: File[]; other?: File[]; photos?: File[]; material?: File[]; safety?: File[] }>({});

    // Section 4/5:
    const [refLoading, setRefLoading] = useState<boolean>(false);
    const [refErr, setRefErr] = useState<string | null>(null);
    const [refMeta, setRefMeta] = useState<RefChecklistMeta[]>([]);
    const [libOpen, setLibOpen] = useState<boolean>(false);
    const [viewOpen, setViewOpen] = useState<boolean>(false);
    const [selectedRefIds, setSelectedRefIds] = useState<string[]>([]);
    const [combinedItems, setCombinedItems] = useState<UiComplianceItem[]>([]);
    const [viewErr, setViewErr] = useState<string | null>(null);
    const [viewLoading, setViewLoading] = useState<boolean>(false);
    // === Save-Confirm dialog state ===
    const [saveDlgOpen, setSaveDlgOpen] = useState(false);
    const [saveDlgBusy, setSaveDlgBusy] = useState(false);
    const [saveDlgErr, setSaveDlgErr] = useState<string | null>(null);
    const [saveDlgRows, setSaveDlgRows] = useState<Array<{ label: string; apiKey: string; value: any }>>([]);

    // Refs to hold what we'll submit once user confirms
    const savePayloadRef = useRef<any>(null);
    const savePathRef = useRef<string>("");
    const saveMethodRef = useRef<"POST" | "PATCH">("POST");

    // Activities (lazy)
    const [activityOpts, setActivityOpts] = useState<Array<{ value: string; label: string }>>([]);
    const [activityLoading, setActivityLoading] = useState(false);
    const [activityErr, setActivityErr] = useState<string | null>(null);
    const [activities, setActivities] = useState<ActivityLite[]>([]);
    const lastLoadedFor = useRef<string | null>(null); // remembers discipline for which options were built
    // near other refs at top of component
    const pendingActivityTitleRef = useRef<string | null>(null);

    const [dispatchOpen, setDispatchOpen] = useState(false);

    function matchActivityIdFromTitle(title: string): string | null {
        if (!title) return null;
        const t = title.trim().toLowerCase();

        // try activities list first (exact title match)
        for (const a of activities) {
            if ((a.title || "").trim().toLowerCase() === t) return a.id;
        }

        // then try options; strip "CODE • " prefix while comparing
        for (const opt of activityOpts) {
            const raw = opt.label || "";
            const parts = raw.split("•");
            const label = (parts.length > 1 ? parts.slice(1).join("•") : raw).trim().toLowerCase();
            if (label === t) return opt.value;
        }
        return null;
    }
    useEffect(() => {
        const title = pendingActivityTitleRef.current;
        if (!title) return;
        const id = matchActivityIdFromTitle(title);
        if (id) {
            setActivityId(id);
            pendingActivityTitleRef.current = null;
        }
    }, [activities, activityOpts]);

    const buildActivityOptions = useCallback((raw: any[], d: string | "") => {
        const want = (d || "").trim().toLowerCase();

        // accept activities whose discipline/category contains ANY of the parts
        const byDiscipline = raw.filter((r) => {
            const val = String(r.discipline ?? r.category ?? "").toLowerCase();
            if (!want) return true;
            const parts = normalizeParts(val).map((p) => p.toLowerCase());
            return parts.includes(want);
        });

        const opts = byDiscipline
            .map((r) => ({
                value: String(r.id ?? r.activityId ?? r.code ?? r.slug ?? r.uuid ?? r.refId ?? r.refCode ?? ""),
                label:
                    (r.code ? `${r.code} • ` : "") +
                    String(r.title ?? r.name ?? r.label ?? r.code ?? r.refTitle ?? r.refName ?? "Untitled"),
            }))
            .filter((o) => !!o.value && !!o.label)
            .sort((a, b) => a.label.localeCompare(b.label));

        return opts;
    }, []);

    // Lazy loader: call only on Activity <select> focus or Reload click
    const ensureActivities = useCallback(
        async (force = false, disciplineHint?: string) => {
            const d = (disciplineHint ?? discipline) as string;
            if (!d) return; // require discipline first
            if (!force && lastLoadedFor.current === d && activityOpts.length) return;
            if (activityLoading) return;

            setActivityLoading(true);
            setActivityErr(null);

            try {
                const { data } = await api.get("/admin/ref/activities", {
                    params: { status: "Active", page: 1, pageSize: 200 },
                });

                const raw = normalizeArrayish(data);

                setActivities(
                    raw
                        .map((r: any) => ({
                            id: String(r.id ?? r.activityId ?? r.code ?? r.uuid),
                            title: String(r.title ?? r.name ?? r.code ?? "Untitled"),
                            discipline: (r.discipline ?? r.category ?? null) as string | null,
                        }))
                        .filter((x: ActivityLite) => x.id && x.title)
                );

                const opts = buildActivityOptions(raw, d);
                setActivityOpts(opts);
                lastLoadedFor.current = d;
            } catch (e: any) {
                setActivityErr(e?.response?.data?.error || e?.message || "Failed to load activities.");
            } finally {
                setActivityLoading(false);
            }
        },
        [activityLoading, activityOpts.length, buildActivityOptions, discipline]
    );
    const ensureActivitiesRef = useRef(ensureActivities);
    useEffect(() => { ensureActivitiesRef.current = ensureActivities; }, [ensureActivities]);

    // Edit-loader effect
    useEffect(() => {
        if (!isEdit || !projectId || !editId) return;

        // --- BEGIN: edit-loader patch with detailed logs ---
        (async () => {
            try {
                const res = await api.get(`/projects/${projectId}/wir/${editId}`);

                // Unwrap
                const row = (res?.data?.data ?? res?.data?.wir ?? res?.data) || {};
                logWir("edit:GET <- raw", res?.data);
                logWir("edit:row (unwrapped)", row);

                // ---- Normalize plannedAt from (forDate, forTime) ----
                const rawForDate = row.forDate ?? row.for_date ?? null;

                // Keep the local calendar day intact; avoid UTC conversion
                const dateOnly =
                    rawForDate == null
                        ? null
                        : /^\d{4}-\d{2}-\d{2}/.test(String(rawForDate))
                            ? String(rawForDate).slice(0, 10) // "YYYY-MM-DD" from either "YYYY-MM-DD" or "YYYY-MM-DDTHH..."
                            : (() => {
                                const d = new Date(rawForDate); // handles Date or ISO
                                const y = d.getFullYear();
                                const m = String(d.getMonth() + 1).padStart(2, "0");
                                const da = String(d.getDate()).padStart(2, "0");
                                return `${y}-${m}-${da}`; // local calendar date
                            })();

                const plannedAtFromParts = combineDateTimeISO(dateOnly, row.forTime ?? row.for_time);
                const plannedAt =
                    row.plannedAt ?? row.planned_at ?? row.plannedAtUtc ?? plannedAtFromParts ?? null;

                logWir("edit:plannedAt inputs", {
                    rawForDate,
                    dateOnly,
                    forTime: row.forTime ?? row.for_time ?? null,
                });
                logWir("edit:plannedAt result", plannedAt);

                // ---- Split into UI parts ----
                const { dateISO: dISO, dateText: dTxt, hh: H, mm: M, ampm: AP, timeText: T } =
                    splitPlannedAtToParts(plannedAt);

                setDateISO(dISO);
                setDateText(dTxt);
                setHH(H);
                setMM(M);
                setAMPM(AP as "AM" | "PM");
                setTimeText(T);

                logWir("edit:UI time parts", { dISO, dTxt, H, M, AP, T });

                // ---- Discipline / Activity ----
                setDiscipline((row.discipline ?? "") as Discipline | "");

                // Recover activityId from history.meta if not on the row
                let activityIdFromHistory: string | "" = "";
                if (Array.isArray(row.histories)) {
                    const createdH = row.histories.find((h: any) => h?.action === "Created");
                    const metaAct = createdH?.meta?.activityId;
                    if (typeof metaAct === "string" && metaAct.trim()) activityIdFromHistory = metaAct.trim();
                }
                const resolvedActivityId = String(row.activityId ?? activityIdFromHistory ?? "");
                setActivityId(resolvedActivityId);

                logWir("edit:activity resolution", {
                    rowActivityId: row.activityId ?? null,
                    activityIdFromHistory,
                    resolvedActivityId,
                });
                // >>> NEW: if activityId is absent but header carries a title,
                // queue that title to be matched to options once they load.
                if (!resolvedActivityId && typeof row.title === "string" && row.title.trim()) {
                    pendingActivityTitleRef.current = row.title.trim();
                }

                // Ensure activity options visible when discipline present
                if (row.discipline) ensureActivitiesRef.current(true, String(row.discipline));

                // ---- Location: prefer cityTown (drafts), then common aliases (snake + nests) ----
                const locText =
                    row.cityTown ??
                    row.city_town ??
                    row.location ??
                    row.siteLocation ??
                    row.site_location ??
                    row.loc ??
                    row.header?.cityTown ??
                    row.header?.city_town ??
                    row.header?.location ??
                    row.header?.siteLocation ??
                    row.header?.site_location ??
                    "";

                setLocationText(String(locText));

                logWir("edit:location mapping", {
                    cityTown: row.cityTown ?? null,
                    city_town: row.city_town ?? null,
                    location: row.location ?? null,
                    siteLocation: row.siteLocation ?? null,
                    site_location: row.site_location ?? null,
                    header_cityTown: row.header?.cityTown ?? null,
                    header_city_town: row.header?.city_town ?? null,
                    header_location: row.header?.location ?? null,
                    chosen: locText,
                });

                // ---- Work Inspection: drafts store it in description; include snake_case + nests; NEVER use title as fallback ----
                const wiCandidate =
                    row.description ??
                    row.header?.description ??
                    row.workInspection ??
                    row.work_inspection ??
                    row.details?.workInspection ??
                    row.details?.work_inspection ??
                    row.scope ??
                    row.work ??
                    ""; // intentionally exclude row.title

                setWorkInspection(String(wiCandidate));

                logWir("edit:workInspection mapping", {
                    description: row.description ?? null,
                    header_description: row.header?.description ?? null,
                    workInspection: row.workInspection ?? null,
                    work_inspection: row.work_inspection ?? null,
                    details_workInspection: row.details?.workInspection ?? null,
                    details_work_inspection: row.details?.work_inspection ?? null,
                    scope: row.scope ?? null,
                    work: row.work ?? null,
                    chosen: wiCandidate,
                });

                // ---- Preselect attached reference checklists ----
                // Prefer explicit refChecklistIds (used by Drafts) but also support hydrated checklists.
                const refIdsFromHydrated: string[] = Array.isArray(row.checklists)
                    ? row.checklists.map((c: any) => String(c?.checklistId ?? c?.id ?? c)).filter(Boolean)
                    : [];

                const refIdsFromField: string[] = Array.isArray(row.refChecklistIds)
                    ? row.refChecklistIds.map((x: any) => String(x)).filter(Boolean)
                    : [];

                const refIds = (refIdsFromField.length ? refIdsFromField : refIdsFromHydrated);
                setSelectedRefIds(refIds);

                logWir("edit:checklists preselect", {
                    fromField: refIdsFromField,
                    fromHydrated: refIdsFromHydrated,
                    chosen: refIds,
                });

            } catch (e: any) {
                const errMsg = e?.response?.data?.error || e?.message || "Failed to load WIR.";
                console.error("[WIR] edit:GET error:", e?.response?.data ?? e?.message ?? e);
                setSubmitErr(errMsg);
            }
        })();
        // --- END: edit-loader patch with detailed logs ---

        //}, [isEdit, projectId, editId, ensureActivities]);
    }, [isEdit, projectId, editId]);
    // Footer
    const [submitting, setSubmitting] = useState<boolean>(false);
    const [submitErr, setSubmitErr] = useState<string | null>(null);

    const roleCanCreate = role === "Contractor" || role === "PMC" || role === "IH-PMT" || role === "Admin";

    const backToWirList = () => {
        const base =
            role === "Contractor"
                ? `/home/contractor/projects/${projectId}/wir`
                : role === "PMC"
                    ? `/home/pmc/projects/${projectId}/wir`
                    : role === "IH-PMT"
                        ? `/home/ihpmt/projects/${projectId}/wir`
                        : role === "Client"
                            ? `/home/client/projects/${projectId}/wir`
                            : `/home/projects/${projectId}/wir`;

        navigate(base, { state: { role, project: projectFromState || { projectId } }, replace: true });
    };

    // Build creator display name from auth
    const creatorName =
        (user as any)?.fullName ||
        (user as any)?.name ||
        (user as any)?.displayName ||
        [(user as any)?.firstName, (user as any)?.lastName].filter(Boolean).join(" ") ||
        (claims as any)?.fullName ||
        (claims as any)?.name ||
        (claims as any)?.displayName ||
        "User";

    /* ---------------- load reference checklists ---------------- */

    const loadRefs = useCallback(async () => {
        if (!projectId) return;
        setRefLoading(true);
        setRefErr(null);
        try {
            const rows = await listRefChecklistLibrary(projectId, {
                status: "Active",
                page: 1,
                pageSize: 200,
                discipline: discipline || undefined, // allow discipline hint to reduce payload
            });

            // keep as-is; you already filter/label with getRefId/getRefCode/getRefTitle elsewhere
            setRefMeta(rows as RefChecklistMeta[]);
        } catch (e: any) {
            setRefErr(e?.response?.data?.error || e?.message || "Failed to load reference checklists.");
            setRefMeta([]);
        } finally {
            setRefLoading(false);
        }
    }, [projectId, discipline]);

    useEffect(() => {
        loadRefs();
    }, [loadRefs]);

    /* ---------------- derived ---------------- */

    useMemo(() => activities, [activities]); // parity no-op

    const filteredRefMeta = useMemo(() => {
        if (!discipline) return refMeta;
        const want = String(discipline).trim().toLowerCase();
        return refMeta.filter((r) => {
            const raw = (r as any)?.discipline ?? (r as any)?.category ?? "";
            const parts = normalizeParts(raw).map((p) => p.toLowerCase());
            return parts.includes(want);
        });
    }, [refMeta, discipline]);

    // Library modal UI state
    const [libSearch, setLibSearch] = useState<string>("");

    // Build the list to show in modal (discipline-aware, then search)
    const libAll = discipline ? filteredRefMeta : refMeta;

    const libVisible = useMemo(() => {
        const q = libSearch.trim().toLowerCase();
        if (!q) return libAll;
        return libAll.filter((m) => {
            const code = getRefCode(m).toLowerCase();
            const title = getRefTitle(m).toLowerCase();
            // match in either code or title
            return code.includes(q) || title.includes(q);
        });
    }, [libAll, libSearch]);

    const visibleIds = useMemo(() => libVisible.map(getRefId), [libVisible]);

    const allVisibleSelected = useMemo(
        () => visibleIds.length > 0 && visibleIds.every((id) => selectedRefIds.includes(id)),
        [visibleIds, selectedRefIds]
    );

    const toggleSelectAllVisible = useCallback(() => {
        setSelectedRefIds((prev) => {
            const set = new Set(prev);
            if (allVisibleSelected) {
                visibleIds.forEach((id) => set.delete(id));
            } else {
                visibleIds.forEach((id) => id && set.add(id));
            }
            return Array.from(set);
        });
    }, [allVisibleSelected, visibleIds]);

    const combinedSelectedCount = useMemo(() => selectedRefIds.length, [selectedRefIds]);

    const combinedItemsCount = useMemo(() => {
        if (combinedItems.length) return combinedItems.length;
        let s = 0;
        for (const m of filteredRefMeta) {
            const id = String((m as any).id ?? (m as any).refChecklistId ?? (m as any).code);
            if (!selectedRefIds.includes(id)) continue;
            const c =
                (m as any).itemsCount ??
                ((m as any).items ? (m as any).items.length : undefined) ??
                (m as any).count ??
                0;
            s += Number(c) || 0;
        }
        return s;
    }, [combinedItems, filteredRefMeta, selectedRefIds]);

    /* ---------------- date/time sync ---------------- */

    useEffect(() => {
        setTimeText(`${hh}:${mm} ${ampm}`);
    }, [hh, mm, ampm]);

    const onTimeTextBlur = () => {
        const t = timeText.trim();
        const m = /^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/.exec(t);
        if (!m) return;
        let [_, H, M, AP] = m;
        let Hn = Number(H);
        if (Hn < 1 || Hn > 12) return;
        if (!/^\d{2}$/.test(M)) return;
        setHH(String(Hn).padStart(2, "0"));
        setMM(M);
        setAMPM(AP.toUpperCase() as "AM" | "PM");
    };

    const onDateTextBlur = () => {
        const iso = parseDDMMYYtoISO(dateText);
        if (iso) setDateISO(iso);
    };

    const onNativeDateChange = (v: string) => {
        setDateISO(v || null);
        if (v) {
            const [Y, M, D] = v.split("-");
            setDateText(`${D}/${M}/${Y.slice(2)}`);
        }
    };

    /* ---------------- checklist modals ---------------- */

    const toggleSelectChecklist = (id: string) => {
        setSelectedRefIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    /** Prefer the real checklist id for fetching, even if selection stored a code */
    function resolveRefFetchId(rid: string): string {
        const m = [...refMeta, ...filteredRefMeta].find((x: any) => {
            const id = String(x?.id ?? x?.refChecklistId ?? "");
            const code = String(x?.code ?? x?.refCode ?? "");
            return id === rid || code === rid;
        });
        // if we found meta with a real id, use it; otherwise fall back to rid
        return String((m as any)?.id ?? (m as any)?.refChecklistId ?? rid);
    }

    const openViewCompliance = async () => {
        setViewErr(null);
        setViewLoading(true);
        setViewOpen(true);
        try {
            // lookup to show nicer checklist caption in the modal
            const refLookup: Record<string, { code?: string | null; title?: string | null }> = {};
            for (const m of refMeta as any[]) {
                const rid = String(m?.id ?? m?.refChecklistId ?? m?.code ?? "");
                if (rid) refLookup[rid] = { code: (m as any).code ?? null, title: (m as any).title ?? null };
            }

            // fetch all selected checklists’ items via PROJECT route
            // (keeps requests parallel; you can throttle if needed)
            const arrays = await Promise.all(
                selectedRefIds.map(async (rid) => {
                    try {
                        const realId = resolveRefFetchId(rid);
                        const items = await listProjectRefChecklistItems(projectId, realId);
                        return items.map((it: any) => ({
                            id: it.id ?? `${rid}-${Math.random()}`,
                            text: it.text ?? it.title ?? it.name ?? "—",
                            refId: rid,
                            code: it.code ?? it.itemCode ?? null,
                            requirement:
                                it.requirement ??
                                it.mandatory ??
                                (it.required === true ? "Mandatory" : it.required === false ? "Optional" : null),
                            required: typeof it.required === "boolean" ? it.required : null,
                            critical: typeof it.critical === "boolean" ? it.critical : null,
                            tags: Array.isArray(it.tags) ? it.tags : [],
                            units: it.units ?? it.unit ?? it.uom ?? null,
                            tolOp: it.tolerance ?? null,
                            base: it.base ?? null,
                            plus: it.plus ?? null,
                            minus: it.minus ?? null,
                            refCode: refLookup[rid]?.code ?? null,
                            refTitle: refLookup[rid]?.title ?? null,
                        }));
                    } catch {
                        // if project route fails for a specific rid, yield empty (no admin fallback here)
                        return [];
                    }
                })
            );

            const all = arrays.flat();
            setCombinedItems(all);
        } catch (e: any) {
            setViewErr(e?.response?.data?.error || e?.message || "Failed to load checklist items.");
        } finally {
            setViewLoading(false);
        }
    };
    /* ---------------- validation ---------------- */

    const hasRequiredForSubmit = useMemo(() => {
        const hasDT = !!composeDateTimeISO(dateISO, hh, mm, ampm);
        return Boolean(discipline && activityId && hasDT && selectedRefIds.length > 0);
    }, [discipline, activityId, dateISO, hh, mm, ampm, selectedRefIds]);

    // Build the exact draft payload (same keys you already send in saveDraft)
    function buildDraftPayload() {
        const dtISO = composeDateTimeISO(dateISO, hh, mm, ampm) || undefined;
        const activityTitle =
            getActivityTitleById(activityId, activities, activityOpts) || undefined;

        // >>> ADD these two lines: split so PATCH works with BE's UpdateWirHeaderDto
        // ✅ Only the calendar date part (what BE expects)
        const forDateISO = dtISO ? dtISO.slice(0, 10) : undefined; // "YYYY-MM-DD"
        const forTimeStr = dtISO ? `${hh}:${mm}` : undefined;                 // "HH:MM"

        const payload: any = {
            status: "Draft",
            discipline: discipline || undefined,
            activityId: activityId || undefined,

            // keep plannedAt for POST/create (BE create splits it)
            plannedAt: dtISO,

            // >>> ADD these two keys so PATCH/updateHeader gets exactly what it expects
            forDate: forDateISO,
            forTime: forTimeStr,

            cityTown: locationText || undefined,      // Location -> cityTown
            description: workInspection || undefined, // Work Inspection -> description
            title: activityTitle,                     // Activity title -> title
            refChecklistIds: selectedRefIds.length ? selectedRefIds : undefined,
            materializeItemsFromRef: false,
            clientHints: {
                dateText,
                timeText,
                selectedRefCount: selectedRefIds.length,
                attachmentsMeta: buildAttachmentsMeta(docs as any),
            },
        };
        return payload;
    }

    // Human-readable rows for the dialog
    function buildPreviewRows(payload: any) {
        return [
            { label: "Status", apiKey: "status", value: payload.status },
            { label: "Discipline", apiKey: "discipline", value: payload.discipline ?? "—" },
            { label: "Activity ID", apiKey: "activityId", value: payload.activityId ?? "—" },
            { label: "Title (Activity)", apiKey: "title", value: payload.title ?? "—" },
            { label: "Planned At (ISO)", apiKey: "plannedAt", value: payload.plannedAt ?? "—" },
            // >>> ADD THESE
            { label: "forDate", apiKey: "forDate", value: payload.forDate ?? "—" },
            { label: "forTime", apiKey: "forTime", value: payload.forTime ?? "—" },

            { label: "City/Town", apiKey: "cityTown", value: payload.cityTown ?? "—" },
            { label: "Description (WI)", apiKey: "description", value: payload.description ?? "—" },
            { label: "Checklists Count", apiKey: "refChecklistIds", value: Array.isArray(payload.refChecklistIds) ? payload.refChecklistIds.length : 0 },
            { label: "Materialize Items", apiKey: "materializeItemsFromRef", value: String(payload.materializeItemsFromRef) },
            { label: "UI Date Text", apiKey: "clientHints.dateText", value: payload.clientHints?.dateText ?? "—" },
            { label: "UI Time Text", apiKey: "clientHints.timeText", value: payload.clientHints?.timeText ?? "—" },
        ];
    }

    /* ---------------- submit handlers ---------------- */

    const saveDraft = async () => {
        if (!projectId || submitting) return;
        setSubmitting(true);
        setSubmitErr(null);
        try {
            // <<< single source of truth
            const payload = buildDraftPayload();

            const path =
                isEdit && editId
                    ? `/projects/${projectId}/wir/${editId}`
                    : `/projects/${projectId}/wir`;
            const method = isEdit && editId ? "PATCH" : "POST";

            logWir(`saveDraft -> ${method} ${path}`, payload);

            const res = method === "PATCH"
                ? await api.patch(path, payload)
                : await api.post(path, payload);

            logWir("saveDraft <- response", res?.data);
            backToWirList();
        } catch (e: any) {
            const err = e?.response?.data || e?.message || e;
            console.error("[WIR] saveDraft error:", err);
            setSubmitErr(err?.error || err?.message || "Failed to save draft.");
        } finally {
            setSubmitting(false);
        }
    };

    const submitFinal = async () => {
        if (!projectId || submitting || !hasRequiredForSubmit) return;
        setSubmitting(true);
        setSubmitErr(null);
        try {
            const dtISO = composeDateTimeISO(dateISO, hh, mm, ampm)!;

            const forDateISO = dtISO.slice(0, 10); // "YYYY-MM-DD"
            const forTimeStr = `${hh}:${mm}`;       // "HH:MM"
            const activityTitle = getActivityTitleById(activityId, activities, activityOpts) || undefined;

            const payload: any = {
                status: "Submitted",
                discipline: discipline || undefined,
                activityId: activityId || undefined,
                title: activityTitle,                       // keep title on header
                plannedAt: dtISO,                           // for BE create splitters
                forDate: forDateISO,                        // PATCH-friendly split fields
                forTime: forTimeStr,

                cityTown: locationText || undefined,        // <<< use cityTown
                description: workInspection || undefined,   // <<< use description

                refChecklistIds: selectedRefIds,
                materializeItemsFromRef: true,
            };

            if (isEdit && editId) {
                await api.patch(`/projects/${projectId}/wir/${editId}`, payload);
            } else {
                await api.post(`/projects/${projectId}/wir`, payload);
            }

            backToWirList();
        } catch (e: any) {
            setSubmitErr(e?.response?.data?.error || e?.message || "Failed to submit WIR.");
        } finally {
            setSubmitting(false);
        }
    };

    /* ---------------- UI (mobile-first) ---------------- */

    return (
        <div className="min-h-[100svh] md:min-h-screen flex flex-col">
            <section className="flex-1 overflow-y-auto touch-pan-y overscroll-contain pb-28 bg-white dark:bg-neutral-900 rounded-2xl sm:rounded-2xl shadow-sm border dark:border-neutral-800 p-4 sm:p-5 md:p-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
                    <div className="min-w-0">
                        <div className="text-base sm:text-xl md:text-2xl font-semibold dark:text-white">
                            {isEdit ? "Edit Work Inspection Request" : "Create Work Inspection Request"}
                        </div>
                        <div className="text-[13px] sm:text-sm text-gray-600 dark:text-gray-300 truncate">
                            {projectFromState?.code ? `${projectFromState.code} — ` : ""}
                            {projectFromState?.title || `Project: ${projectId}`}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={backToWirList}
                            className="text-sm w-full sm:w-auto px-3 py-2 rounded-lg border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                        >
                            Cancel
                        </button>
                    </div>
                </div>

                {/* Body grid */}
                <div className="mt-4 sm:mt-5 space-y-4 sm:space-y-5">
                    {/* ===== Section 1 — Project & Reference ===== */}
                    <section className="rounded-2xl border dark:border-neutral-800 p-3 sm:p-5">
                        <div className="text-sm sm:text-base font-semibold dark:text-white mb-3">Project & Reference</div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                            {/* Project Code/Title (read-only display) */}
                            <div className="sm:col-span-3">
                                <div className="text-[12px] sm:text-sm text-gray-600 dark:text-gray-300 mb-1">Project</div>
                                <div className="rounded-lg border px-3 py-3 sm:py-2 dark:border-neutral-800 dark:text-white">
                                    {(projectFromState?.code ? projectFromState.code + " — " : "") +
                                        (projectFromState?.title || `Project: ${projectId}`)}
                                </div>
                            </div>

                            {/* Select Discipline */}
                            <SelectStrict
                                label="Discipline"
                                value={discipline}
                                onChange={(v: string) => {
                                    setDiscipline(v as Discipline | "");
                                    setActivityId("");
                                    setActivityOpts([]);
                                    lastLoadedFor.current = null;

                                    // Immediately load for this discipline (mobile-safe)
                                    if (v) ensureActivities(true, v);
                                }}

                                options={DISCIPLINES.map((d) => ({ value: d, label: d }))}
                            />

                            {/* Select Activity (lazy: fire fetch in CAPTURE phase before menu opens) */}
                            <label className="block">
                                <span className="block text-[11px] sm:text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                                    Activity
                                </span>

                                <div className="flex items-center gap-2">
                                    <select
                                        ref={activitySelectRef}
                                        className="w-full px-3 py-3 sm:py-2 rounded-lg border dark:border-neutral-800 dark:bg-neutral-900 dark:text-white focus:outline-none focus:ring"
                                        value={activityId}
                                        onChange={(e) => setActivityId(e.target.value)}
                                        onPointerDownCapture={() => discipline && ensureActivities(false, discipline)}
                                        //    onMouseDownCapture={() => discipline && ensureActivities(false, discipline)}
                                        //    onTouchStartCapture={() => discipline && ensureActivities(false, discipline)}
                                        //    onFocus={() => discipline && ensureActivities(false, discipline)}
                                        //    onKeyDown={(e) => {
                                        //        if (!discipline) return;
                                        //        if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") ensureActivities(false, discipline);
                                        //    }}
                                        disabled={!discipline}
                                    >
                                        <option value="">
                                            {!discipline
                                                ? "Select Discipline first"
                                                : activityLoading && !activityOpts.length
                                                    ? "Loading…"
                                                    : activityOpts.length
                                                        ? "Select…"
                                                        : "Tap again after loading…"}
                                        </option>
                                        {activityOpts.map((opt) => (
                                            <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>

                                    <button
                                        type="button"
                                        className="text-xs px-2 py-2 rounded-lg border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800 whitespace-nowrap"
                                        disabled={!discipline || activityLoading}
                                        onClick={() => ensureActivities(true, discipline)}
                                        title="Reload activities"
                                    >
                                        {activityLoading ? "…" : "Reload"}
                                    </button>
                                </div>
                                {activityErr && (
                                    <div className="mt-1 text-xs text-red-600 dark:text-red-400">{activityErr}</div>
                                )}
                            </label>
                        </div>
                    </section>

                    {/* Location */}
                    <div>
                        <FieldLabel>Location</FieldLabel>
                        <input
                            value={locationText}
                            onChange={(e) => setLocationText(e.target.value)}
                            placeholder="e.g., Block A, Podium Level"
                            className="w-full text-[15px] sm:text-sm border rounded-lg px-3 py-3 sm:py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                        />
                    </div>

                    {/* Date (Calendar + DD/MM/YY) */}
                    <div>
                        <FieldLabel>Date *</FieldLabel>
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                value={dateISO ?? ""}
                                onChange={(e) => onNativeDateChange(e.target.value)}
                                className="flex-1 text-[15px] sm:text-sm border rounded-lg px-3 py-3 sm:py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                            />
                            <input
                                value={dateText}
                                onChange={(e) => setDateText(e.target.value)}
                                onBlur={onDateTextBlur}
                                placeholder="DD/MM/YY"
                                inputMode="numeric"
                                className="w-32 text-[15px] sm:text-sm border rounded-lg px-3 py-3 sm:py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                            />
                        </div>
                        <Note>Pick from calendar or type in DD/MM/YY.</Note>
                    </div>

                    {/* Time (Selects + free text) */}
                    <div>
                        <FieldLabel>Time *</FieldLabel>
                        <div className="flex items-center gap-2">
                            <select
                                value={hh}
                                onChange={(e) => setHH(e.target.value)}
                                className="w-24 text-[15px] sm:text-sm border rounded-lg px-2 py-3 sm:py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                            >
                                {HOURS_12.map((h) => (
                                    <option key={h} value={h}>
                                        {h}
                                    </option>
                                ))}
                            </select>
                            <span className="opacity-60">:</span>
                            <select
                                value={mm}
                                onChange={(e) => setMM(e.target.value)}
                                className="w-24 text-[15px] sm:text-sm border rounded-lg px-2 py-3 sm:py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                            >
                                {MINUTES.map((m) => (
                                    <option key={m} value={m}>
                                        {m}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={ampm}
                                onChange={(e) => setAMPM(e.target.value as "AM" | "PM")}
                                className="w-24 text-[15px] sm:text-sm border rounded-lg px-2 py-3 sm:py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                            >
                                <option>AM</option>
                                <option>PM</option>
                            </select>
                        </div>
                        <input
                            value={timeText}
                            onChange={(e) => setTimeText(e.target.value)}
                            onBlur={onTimeTextBlur}
                            placeholder="HH:MM AM/PM"
                            className="mt-2 w-44 text-[15px] sm:text-sm border rounded-lg px-3 py-3 sm:py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                        />
                    </div>

                    {/* Section 2 — Work Inspection (200 chars) */}
                    <div className="rounded-2xl border dark:border-neutral-800 p-3 sm:p-5">
                        <SectionTitle>Work Inspection</SectionTitle>
                        <textarea
                            value={workInspection}
                            onChange={(e) => {
                                const v = e.target.value;
                                if (v.length <= 200) setWorkInspection(v);
                            }}
                            rows={4}
                            placeholder="Describe the work to be inspected (max 200 chars)…"
                            className="w-full text-[15px] sm:text-sm border rounded-lg px-3 py-3 sm:py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                        />
                        <div className="text-right text-[12px] text-gray-500 dark:text-gray-400">{workInspection.length}/200</div>
                    </div>

                    {/* Section 3 — Documents & Evidence (tiles) */}
                    <div className="rounded-2xl border dark:border-neutral-800 p-3 sm:p-5">
                        <SectionTitle>Documents & Evidence</SectionTitle>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                            {[
                                { key: "drawings", label: "Attach Drawings" },
                                { key: "itp", label: "Attach ITP" },
                                { key: "other", label: "Attach Other Document" },
                                { key: "photos", label: "Upload Photos" },
                                { key: "material", label: "Material Approval" },
                                { key: "safety", label: "Safety Clearance" },
                            ].map((tile) => (
                                <label
                                    key={tile.key}
                                    className="cursor-pointer rounded-xl border dark:border-neutral-800 p-3 text-center hover:bg-gray-50 dark:hover:bg-neutral-800"
                                >
                                    <div className="text-[13px] sm:text-sm dark:text-white">{tile.label}</div>
                                    <input
                                        type="file"
                                        className="hidden"
                                        multiple
                                        onChange={(e) => {
                                            const files = e.target.files ? Array.from(e.target.files) : [];
                                            setDocs((prev) => ({ ...prev, [tile.key]: files }));
                                        }}
                                    />
                                    <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                                        {(docs as any)[tile.key]?.length ? `${(docs as any)[tile.key].length} file(s)` : "Choose files"}
                                    </div>
                                </label>
                            ))}
                        </div>
                        <Note className="mt-2">Uploading to server can be wired later; this records user selection in state now.</Note>
                    </div>

                    {/* Section 4 — Checklist Library */}
                    <div className="rounded-2xl border dark:border-neutral-800 p-3 sm:p-5">
                        <SectionTitle>Checklist Library</SectionTitle>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="text-[13px] sm:text-sm dark:text-white">
                                Selected: <b>{combinedSelectedCount}</b> checklists
                                {combinedItemsCount ? <> · <b>{combinedItemsCount}</b> items</> : null}
                            </div>
                            <button
                                onClick={() => setLibOpen(true)}
                                className="text-sm w-full sm:w-auto px-3 py-3 sm:py-2 rounded-lg border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                            >
                                Add from Library
                            </button>
                        </div>
                        {refErr && <div className="mt-2 text-sm text-rose-600">{refErr}</div>}
                    </div>

                    {/* Section 5 — Compliance Checklist */}
                    <div className="rounded-2xl border dark:border-neutral-800 p-3 sm:p-5 mb-24 sm:mb-0">
                        <SectionTitle>Compliance Checklist</SectionTitle>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="text-[13px] sm:text-sm text-gray-700 dark:text-gray-200">
                                View the combined list of items from your selected checklists.
                            </div>
                            <button
                                onClick={openViewCompliance}
                                disabled={!selectedRefIds.length}
                                className={`text-sm w-full sm:w-auto px-3 py-3 sm:py-2 rounded-lg border ${selectedRefIds.length
                                    ? "dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                                    : "opacity-60 cursor-not-allowed"
                                    }`}
                            >
                                View
                            </button>
                        </div>
                        {viewErr && <div className="mt-2 text-sm text-rose-600">{viewErr}</div>}
                    </div>
                </div>

            </section>

            {/* Sticky Action Bar (mobile-first) */}
            <div className="sticky bottom-0 left-0 right-0 z-20 -mx-4 sm:mx-0">
                <div className="px-4 sm:px-0 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-3 bg-white/95 dark:bg-neutral-900/95 backdrop-blur border-t dark:border-neutral-800">
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                        {submitErr && <div className="text-sm text-rose-600 sm:mr-auto">{submitErr}</div>}
                        <button
                            onClick={() => {
                                const payload = buildDraftPayload();
                                const path =
                                    isEdit && editId
                                        ? `/projects/${projectId}/wir/${editId}`
                                        : `/projects/${projectId}/wir`;
                                const method: "POST" | "PATCH" = isEdit && editId ? "PATCH" : "POST";

                                savePayloadRef.current = payload;
                                savePathRef.current = path;
                                saveMethodRef.current = method;

                                setSaveDlgErr(null);
                                setSaveDlgRows(buildPreviewRows(payload));
                                setSaveDlgOpen(true);
                            }}
                            disabled={!roleCanCreate || submitting}
                            className={`w-full sm:w-auto text-sm px-3 py-3 sm:py-2 rounded-lg border dark:border-neutral-800 ${!roleCanCreate || submitting ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-50 dark:hover:bg-neutral-800"}`}
                        >
                            Save Draft
                        </button>

                        <button
                            onClick={() => setDispatchOpen(true)}
                            disabled={!roleCanCreate || submitting || !hasRequiredForSubmit}
                            className={`w-full sm:w-auto text-sm px-3 py-3 sm:py-2 rounded-lg border ${!roleCanCreate || submitting || !hasRequiredForSubmit
                                ? "bg-emerald-600/60 text-white cursor-not-allowed"
                                : "bg-emerald-600 text-white hover:bg-emerald-700 dark:border-emerald-700"
                                }`}
                            title="Discipline, Activity, Date/Time, and at least one Checklist are required"
                        >
                            Submit
                        </button>

                    </div>
                </div>
            </div>

            {/* Save Draft – Confirm Dialog */}
            {saveDlgOpen && (
                <div className="fixed inset-0 z-50 bg-black/40">
                    <div className="absolute inset-x-0 bottom-0 sm:static sm:mx-auto w-full sm:w-auto sm:max-w-xl sm:rounded-2xl bg-white dark:bg-neutral-900 border-t sm:border dark:border-neutral-800 p-4 sm:p-5 h-[75vh] sm:h-auto sm:max-h-[85vh] rounded-t-2xl sm:rounded-2xl overflow-auto flex flex-col">
                        <div className="flex items-center justify-between">
                            <div className="text-base font-semibold dark:text-white">Review Draft Save</div>
                            <button
                                onClick={() => !saveDlgBusy && setSaveDlgOpen(false)}
                                className="text-sm px-3 py-2 rounded border dark:border-neutral-800 disabled:opacity-60"
                                disabled={saveDlgBusy}
                            >
                                Close
                            </button>
                        </div>
                        <div className="text-[12px] text-gray-500 dark:text-gray-400 mt-1">
                            This is exactly what will be saved to the WIR draft.
                        </div>

                        <div className="mt-3 flex-1 min-h-0 overflow-auto pr-1 divide-y">
                            {saveDlgRows.map((r, i) => (
                                <div key={i} className="py-2">
                                    <div className="text-[12px] text-gray-500 dark:text-gray-400">{r.label}</div>
                                    <div className="text-[13px] sm:text-sm dark:text-white break-all">
                                        {String(r.value)}
                                    </div>
                                    <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                                        API key: <span className="font-mono">{r.apiKey}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {saveDlgErr && <div className="mt-2 text-sm text-rose-600">{saveDlgErr}</div>}

                        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-end gap-2">
                            <button
                                onClick={() => setSaveDlgOpen(false)}
                                className="w-full sm:w-auto text-sm px-3 py-3 sm:py-2 rounded-lg border dark:border-neutral-800 disabled:opacity-60"
                                disabled={saveDlgBusy}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    if (saveDlgBusy) return;
                                    setSaveDlgBusy(true);
                                    setSaveDlgErr(null);
                                    try {
                                        const payload = savePayloadRef.current;
                                        const path = savePathRef.current;
                                        const method = saveMethodRef.current;
                                        logWir(`saveDraft(confirm) -> ${method} ${path}`, payload);
                                        const res = method === "PATCH"
                                            ? await api.patch(path, payload)
                                            : await api.post(path, payload);
                                        logWir("saveDraft(confirm) <- response", res?.data);
                                        setSaveDlgBusy(false);
                                        setSaveDlgOpen(false);
                                        backToWirList();
                                    } catch (e: any) {
                                        const err = e?.response?.data || e?.message || e;
                                        console.error("[WIR] saveDraft(confirm) error:", err);
                                        setSaveDlgErr(err?.error || err?.message || "Failed to save draft.");
                                        setSaveDlgBusy(false);
                                    }
                                }}
                                className={`w-full sm:w-auto text-sm px-3 py-3 sm:py-2 rounded-lg border ${saveDlgBusy ? "opacity-60 cursor-not-allowed" : "bg-emerald-600 text-white hover:bg-emerald-700 dark:border-emerald-700"}`}
                                disabled={saveDlgBusy}
                            >
                                {saveDlgBusy ? "Saving…" : "Confirm & Save"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ---------- Modals ---------- */}
            {/* Add from Library Modal */}
            {libOpen && (
                <div className="fixed inset-0 z-40 bg-black/40">
                    <div className="absolute inset-x-0 bottom-0 sm:static sm:mx-auto w-full sm:w-auto sm:max-w-xl sm:rounded-2xl bg-white dark:bg-neutral-900 border-t sm:border dark:border-neutral-800 p-4 sm:p-5 h-[75vh] sm:h-auto sm:max-h-[85vh] rounded-t-2xl sm:rounded-2xl overflow-auto flex flex-col">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div className="text-base font-semibold dark:text-white">Checklist Library</div>
                            <button onClick={() => setLibOpen(false)} className="text-sm px-3 py-2 rounded border dark:border-neutral-800">
                                Close
                            </button>
                        </div>
                        <div className="text-[12px] text-gray-500 dark:text-gray-400 mt-1">
                            {discipline ? <>Filtered by discipline <b>{discipline}</b></> : "All disciplines"}
                        </div>

                        {/* Search + bulk toggle */}
                        <div className="mt-3 flex items-center gap-2">
                            <input
                                value={libSearch}
                                onChange={(e) => setLibSearch(e.target.value)}
                                placeholder="Search by code or title…"
                                className="flex-1 text-[15px] sm:text-sm border rounded-lg px-3 py-3 sm:py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                            />
                            <button
                                type="button"
                                onClick={toggleSelectAllVisible}
                                className="text-xs sm:text-sm px-3 py-2 rounded-lg border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800 whitespace-nowrap"
                                disabled={!libVisible.length}
                                title={allVisibleSelected ? "Clear all (visible)" : "Select all (visible)"}
                            >
                                {allVisibleSelected ? "Clear" : "Select all"}
                            </button>
                        </div>

                        {/* List */}
                        {refLoading ? (
                            <div className="mt-4 text-sm">Loading…</div>
                        ) : (
                            <div className="mt-4 h-[65vh] sm:max-h-[50vh] overflow-auto space-y-2 pr-1">
                                {libVisible.length === 0 ? (
                                    <div className="text-sm text-gray-600 dark:text-gray-400 p-2">No checklists found.</div>
                                ) : (
                                    libVisible.map((m) => {
                                        const id = getRefId(m);
                                        const code = getRefCode(m);
                                        const title = getRefTitle(m);
                                        const checked = selectedRefIds.includes(id);
                                        const anyM = m as any;
                                        const tol = anyM?.tolerance;
                                        const itemsCnt =
                                            anyM?.itemsCount ??
                                            (Array.isArray(anyM?.items) ? anyM.items.length : undefined) ??
                                            anyM?.count ??
                                            anyM?.totalItems ??
                                            anyM?.recordsCount ??
                                            null;

                                        const metaLine = [
                                            anyM?.version ? `v${anyM.version}` : null,
                                            anyM?.discipline ?? anyM?.category ?? null,
                                            tol != null ? `Tol: ${formatTolerance(tol)}` : null,
                                            itemsCnt ? `${itemsCnt} items` : null,
                                        ]
                                            .filter(Boolean)
                                            .join(" · ");

                                        return (
                                            <label
                                                key={id}
                                                className="flex items-start gap-3 p-3 rounded-xl border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800 cursor-pointer"
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="mt-0.5 h-5 w-5 sm:h-4 sm:w-4"
                                                    checked={checked}
                                                    onChange={() => toggleSelectChecklist(id)}
                                                />
                                                <div className="min-w-0">
                                                    <div className="text-[13px] sm:text-sm dark:text-white truncate">
                                                        {code ? <span className="font-medium">#{code} • </span> : null}
                                                        {title}
                                                    </div>
                                                    {metaLine ? (
                                                        <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{metaLine}</div>
                                                    ) : null}
                                                </div>
                                            </label>
                                        );
                                    })
                                )}
                            </div>
                        )}

                        {/* Footer */}
                        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
                            <div className="text-gray-700 dark:text-gray-300">
                                Selected <b>{combinedSelectedCount}</b>
                                {combinedItemsCount ? <> · Items <b>{combinedItemsCount}</b></> : null}
                            </div>
                            <button
                                onClick={() => setLibOpen(false)}
                                className="w-full sm:w-auto px-3 py-3 sm:py-2 rounded-lg border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Compliance View Modal */}
            {viewOpen && (
                <div className="fixed inset-0 z-40 bg-black/40">
                    <div className="absolute inset-x-0 bottom-0 sm:static sm:mx-auto w-full sm:w-auto sm:max-w-xl sm:rounded-2xl bg-white dark:bg-neutral-900 border-t sm:border dark:border-neutral-800 p-4 sm:p-5 h-[75vh] sm:h-auto sm:max-h-[85vh] rounded-t-2xl sm:rounded-2xl overflow-auto flex flex-col">
                        <div className="flex items-center justify-between">
                            <div className="text-base font-semibold dark:text-white">Compliance Checklist</div>
                            <button onClick={() => setViewOpen(false)} className="text-sm px-3 py-2 rounded border dark:border-neutral-800">
                                Close
                            </button>
                        </div>

                        {viewLoading ? (
                            <div className="mt-4 text-sm">Loading…</div>
                        ) : combinedItems.length === 0 ? (
                            <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">No items to display. Add checklists first.</div>
                        ) : (
                            <div className="mt-3 h-[65vh] sm:max-h-[55vh] overflow-auto pr-1 divide-y">
                                {combinedItems.map((it) => {
                                    const tolStr =
                                        formatTolerance(it.tolOp, it.base, it.plus, it.minus, it.units) || null;

                                    return (
                                        <div key={it.id} className="py-3">
                                            {/* Primary line */}
                                            <div className="text-[13px] sm:text-sm dark:text-white leading-snug">
                                                {it.text}
                                            </div>

                                            {/* Meta row: checklist, code, requirement, critical, tolerance, units, tags */}
                                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                                {/* Checklist pill (uses refCode/title if available, else shows id) */}
                                                <span className="text-[11px] px-2 py-1 rounded-full border dark:border-neutral-800 text-gray-600 dark:text-gray-300">
                                                    {it.refCode ? `#${it.refCode}` : `Checklist: ${it.refId}`}
                                                    {it.refTitle ? ` • ${it.refTitle}` : ""}
                                                </span>

                                                {it.code ? (
                                                    <span className="text-[11px] px-2 py-1 rounded-full border dark:border-neutral-800 text-gray-600 dark:text-gray-300">
                                                        Item: #{it.code}
                                                    </span>
                                                ) : null}

                                                {it.requirement ? (
                                                    <span
                                                        className={`text-[11px] px-2 py-1 rounded-full border ${String(it.requirement).toLowerCase() === "mandatory"
                                                            ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300"
                                                            : "dark:border-neutral-800 text-gray-600 dark:text-gray-300"
                                                            }`}
                                                    >
                                                        {String(it.requirement)}
                                                    </span>
                                                ) : null}

                                                {it.critical ? (
                                                    <span className="text-[11px] px-2 py-1 rounded-full border bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300">
                                                        Critical
                                                    </span>
                                                ) : null}

                                                {tolStr ? (
                                                    <span className="text-[11px] px-2 py-1 rounded-full border dark:border-neutral-800 text-gray-700 dark:text-gray-200">
                                                        Tol: {tolStr}
                                                    </span>
                                                ) : null}

                                                {it.units ? (
                                                    <span className="text-[11px] px-2 py-1 rounded-full border dark:border-neutral-800 text-gray-700 dark:text-gray-200">
                                                        Units: {it.units}
                                                    </span>
                                                ) : null}

                                                {Array.isArray(it.tags) && it.tags.length > 0
                                                    ? it.tags.slice(0, 4).map((t: string, idx: number) => (
                                                        <span
                                                            key={`${it.id}-tag-${idx}`}
                                                            className="text-[11px] px-2 py-1 rounded-full border dark:border-neutral-800 text-gray-600 dark:text-gray-300"
                                                        >
                                                            {t}
                                                        </span>
                                                    ))
                                                    : null}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {viewErr && <div className="mt-2 text-sm text-rose-600">{viewErr}</div>}
                    </div>
                </div>
            )}
            <DispatchWIRModal
                open={dispatchOpen}
                onClose={() => setDispatchOpen(false)}
                creatorName={creatorName}
                role={role}
                projectCaption={
                    projectFromState?.code
                        ? `${projectFromState.code} — ${projectFromState.title || `Project: ${projectId}`}`
                        : (projectFromState?.title || `Project: ${projectId}`)
                }
                projectId={projectId}
                wirId={editId || ""}
            />

        </div>
    );
}
