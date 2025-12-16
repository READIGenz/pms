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
    disabled = false,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: Array<{ value: string; label: string }>;
    placeholder?: string;
    disabled?: boolean;
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
                disabled={disabled}
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

// --- trust-header helpers ---
function pickActiveActivityId(wir: any): string {
    // 1) header wins
    if (wir?.activityRefId) return String(wir.activityRefId);
    // 2) fallback to first history meta.activityId (if any)
    if (Array.isArray(wir?.histories)) {
        const h = wir.histories.find((x: any) => x?.meta?.activityId);
        if (h?.meta?.activityId) return String(h.meta.activityId);
    }
    return "";
}

// function pickSelectedChecklistIds(wir: any): string[] {
//     if (!Array.isArray(wir?.checklists)) return [];
//     const ids = wir.checklists
//         .map((c: any) => String(c?.checklistId ?? c?.id ?? ""))
//         .filter(Boolean);
//     return Array.from(new Set(ids));
// }
function pickSelectedChecklistIds(wir: any): string[] {
    const out = new Set<string>();

    // 1) Normal drafts/edits: checklists[] present
    if (Array.isArray(wir?.checklists) && wir.checklists.length) {
        for (const c of wir.checklists) {
            const id = String(c?.checklistId ?? c?.id ?? "");
            if (id) out.add(id);
        }
    }

    // 2) Follow-up drafts: checklists[] empty, but items[] carry sourceChecklistId
    if (out.size === 0 && Array.isArray(wir?.items)) {
        for (const it of wir.items) {
            const id = String(it?.sourceChecklistId ?? it?.checklistId ?? "");
            if (id) out.add(id);
        }
    }

    return Array.from(out);
}

// --- constants/types ---
const DISCIPLINES = ["Civil", "MEP", "Finishes"] as const;
type Discipline = typeof DISCIPLINES[number];

type ActivityLite = {
    id: string;
    title: string;
    discipline?: string | null;
};

// Header documents (WIR-level, not item runners)
type HeaderDocsState = {
    drawings?: File[];
    itp?: File[];
    other?: File[];
    photos?: File[];
    material?: File[];
    safety?: File[];
};

function extractWirIdFromResponse(res: any): string | null {
    if (!res) return null;
    const data = res.data ?? res;
    const id =
        data?.data?.wirId ??
        data?.wir?.wirId ??
        data?.wirId ??
        data?.id ??
        null;
    return id ? String(id) : null;
}

// UI type for the Compliance modal rows
// type UiComplianceItem = {
//     id: string;
//     text: string;
//     refId: string;
//     code: string | null;
//     requirement: string | null;
//     required: boolean | null;
//     critical: boolean | null;
//     tags: string[];
//     units: string | null;
//     tolOp: string | null;
//     base: number | null;
//     plus: number | null;
//     minus: number | null;
//     refCode: string | null;
//     refTitle: string | null;
// };
// UI type for the Compliance modal rows (also reused for Follow-up viewer)
type UiComplianceItem = {
    id: string;
    text: string;
    refId: string | null;
    code: string | null;
    requirement: string | null;
    required: boolean | null;
    critical: boolean;
    tags: string[];
    units: string | null;
    tolOp: string | null;
    base: number | null;
    plus: number | null;
    minus: number | null;
    refCode: string | null;
    refTitle: string | null;
};

type WirItemLike = {
    id: string;
    name?: string | null;
    spec?: string | null;
    tolerance?: string | null;
    unit?: string | null;
    base?: string | number | null;
    plus?: string | number | null;
    minus?: string | number | null;
    code?: string | null;
    tags?: string[] | null;
    critical?: boolean | null;
    checklistId?: string | null;
    sourceChecklistId?: string | null;
};

type ChecklistMetaMap = Record<string, { code?: string | null; title?: string | null }>;

function mapWirItemToUiComplianceItem(it: WirItemLike, checklistMap: ChecklistMetaMap): UiComplianceItem {
    const refId = it.checklistId || it.sourceChecklistId || null;
    const ref = refId ? checklistMap[refId] : undefined;

    return {
        id: it.id,
        text: it.name || "—",
        refId,
        code: it.code ?? null,
        // drives Mandatory / Optional pills
        requirement: it.spec ?? null,
        required: null,
        critical: !!it.critical,
        tags: Array.isArray(it.tags) ? it.tags : [],
        units: it.unit ?? null,
        tolOp: it.tolerance ?? null,
        base: it.base != null ? Number(it.base) : null,
        plus: it.plus != null ? Number(it.plus) : null,
        minus: it.minus != null ? Number(it.minus) : null,
        refCode: ref?.code ?? null,
        refTitle: ref?.title ?? null,
    };
}
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

    const initialFollowupFlag =
        search.get("mode") === "followup" ||
        !!(loc.state as any)?.followup ||
        !!(loc.state as any)?.followupMode;
    const [isFollowupMode, setIsFollowupMode] = useState<boolean>(initialFollowupFlag);

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

    // Section 3: header-level documents (WIR header, not item runner)
    const [docs, setDocs] = useState<HeaderDocsState>({});

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
    const [wirIdForModal, setWirIdForModal] = useState<string>(editId || "");

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

    // // PATCH: follow-up viewer state (near other useState/useRef)
    // const editWirRef = useRef<any>(null);

    // type FailedUiItem = {
    //     id: string;
    //     text: string;
    //     code: string | null;
    //     refCode: string | null;   // checklist code
    //     refTitle: string | null;  // checklist title
    //     inspectorStatus: string | null;
    //     status: string | null;
    //     lastRunStatus: string | null;
    //     units: string | null;
    //     tolOp: string | null;
    //     base: number | null;
    //     plus: number | null;
    //     minus: number | null;
    // };

    // const [fuOpen, setFuOpen] = useState(false);
    // const [fuLoading, setFuLoading] = useState(false);
    // const [fuErr, setFuErr] = useState<string | null>(null);
    // const [fuItems, setFuItems] = useState<FailedUiItem[]>([]);

    // PATCH: follow-up viewer state (near other useState/useRef)
    const editWirRef = useRef<any>(null);

    const [fuOpen, setFuOpen] = useState(false);
    const [fuLoading, setFuLoading] = useState(false);
    const [fuErr, setFuErr] = useState<string | null>(null);
    const [fuItems, setFuItems] = useState<UiComplianceItem[]>([]);

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

                // ---- Infer follow-up from row ----
                const inferredFollowup =
                    String(row?.mode || row?.meta?.mode || "")
                        .toLowerCase() === "followup" ||
                    row?.meta?.followup === true ||
                    row?.followup === true ||
                    row?.isFollowup === true ||
                    row?.is_followup === true ||
                    !!(row?.prevWirId || row?.parentWirId || row?.sourceWirId || row?.followupOf || row?.revisionOf) ||
                    // pattern: items exist (carried from prev), but checklists[] absent/empty
                    (Array.isArray(row?.items) && row.items.length > 0 &&
                        (!Array.isArray(row?.checklists) || row.checklists.length === 0));

                if (inferredFollowup && !isFollowupMode) {
                    setIsFollowupMode(true);
                }
                editWirRef.current = row;
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

                // Always trust header: activityRefId wins; fall back to history only if header is empty
                const resolvedActivityId = pickActiveActivityId(row);
                setActivityId(resolvedActivityId);

                logWir("edit:activity resolution", {
                    header_activityRefId: row.activityRefId ?? null,
                    resolvedActivityId,
                });

                if (!resolvedActivityId && typeof row.title === "string" && row.title.trim()) {
                    pendingActivityTitleRef.current = row.title.trim();
                }

                // Ensure activity options visible when discipline present
                //  if (row.discipline) ensureActivitiesRef.current(true, String(row.discipline));
                if (row.discipline && !isFollowupMode) {
                    ensureActivitiesRef.current(true, String(row.discipline));
                }
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

                // ---- Preselect attached reference checklists (trust header only) ----
                // const refIds = pickSelectedChecklistIds(row);
                // setSelectedRefIds(refIds);
                const refIds = pickSelectedChecklistIds(row);
                const isFU = inferredFollowup || isFollowupMode;
                // In follow-up, items already exist (only failed). Do NOT preselect checklists to avoid re-materialization.
                setSelectedRefIds(isFU ? [] : refIds);
                logWir("edit:checklists preselect", {
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

    const hasCarriedFailed = useMemo(() => {
        const row = editWirRef.current;
        return !!(row && Array.isArray(row.items) && row.items.length > 0);
    }, [editWirRef.current]);

    // Optional: if you want follow-up UI to toggle on when items are carried
    useEffect(() => {
        if (isEdit && !isFollowupMode && hasCarriedFailed) {
            setIsFollowupMode(true);
        }
    }, [isEdit, isFollowupMode, hasCarriedFailed]);

    // Footer
    const [submitting, setSubmitting] = useState<boolean>(false);
    const [submitErr, setSubmitErr] = useState<string | null>(null);

    const roleCanCreate = role === "Contractor" || role === "PMC" || role === "IH-PMT" || role === "Admin";

    const backToWirList = () => {
        const base =
            role === "Contractor"
                ? `/home/projects/${projectId}/wir`
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

    // ---- NEW: stable way to read current user id from auth/claims ----
    const currentUserId =
        (claims as any)?.sub ||          // common JWT 'subject'
        (claims as any)?.userId ||
        (claims as any)?.id ||
        (user as any)?.userId ||
        (user as any)?.id ||
        null;

    // (optional) quick debug
    if (!currentUserId) {
        console.warn("[WIR] currentUserId not found in auth claims/user");
    }

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

    // // PATCH: open Failed Items viewer for follow-up edit
    // const openViewFailed = async () => {
    //     setFuErr(null);
    //     setFuLoading(true);
    //     setFuOpen(true);

    //     try {
    //         const row = editWirRef.current || {};
    //         const checklists: Array<any> = Array.isArray(row.checklists) ? row.checklists : [];
    //         const byChecklistId = new Map(
    //             checklists.map((c: any) => [
    //                 String(c?.checklistId ?? c?.id ?? ""),
    //                 {
    //                     code: (c?.checklistCode ?? c?.code ?? null) as string | null,
    //                     title: (c?.checklistTitle ?? c?.title ?? null) as string | null,
    //                 },
    //             ])
    //         );

    //         const items: Array<any> = Array.isArray(row.items) ? row.items : [];
    //         const list: FailedUiItem[] = items.map((it: any) => {
    //             const cid = String(it?.sourceChecklistId ?? it?.checklistId ?? "");
    //             const meta = byChecklistId.get(cid) || { code: null, title: null };
    //             return {
    //                 id: String(it?.id ?? crypto.randomUUID()),
    //                 text: String(it?.name ?? it?.text ?? it?.title ?? "—"),
    //                 code: (it?.code ?? null) as string | null,
    //                 refCode: meta.code,
    //                 refTitle: meta.title,
    //                 inspectorStatus: (it?.inspectorStatus ?? null) as string | null,
    //                 status: (it?.status ?? null) as string | null,
    //                 lastRunStatus: (Array.isArray(it?.runs) && it.runs.length ? it.runs[0]?.status : null) as string | null,
    //                 units: (it?.unit ?? null) as string | null,
    //                 tolOp: (it?.tolerance ?? null) as string | null,
    //                 base: (it?.base ?? null) as number | null,
    //                 plus: (it?.plus ?? null) as number | null,
    //                 minus: (it?.minus ?? null) as number | null,
    //             };
    //         });

    //         setFuItems(list);
    //     } catch (e: any) {
    //         setFuErr(e?.response?.data?.error || e?.message || "Failed to load follow-up items.");
    //     } finally {
    //         setFuLoading(false);
    //     }
    // };

    // PATCH: open Failed Items viewer for follow-up edit (reuse UiComplianceItem mapper)
    const openViewFailed = async () => {
        setFuErr(null);
        setFuLoading(true);
        setFuOpen(true);

        try {
            const row = editWirRef.current || {};
            const checklists: Array<any> = Array.isArray(row.checklists) ? row.checklists : [];

            const checklistMap: ChecklistMetaMap = {};
            for (const c of checklists) {
                const cid = String(c?.checklistId ?? c?.id ?? "");
                if (!cid) continue;
                checklistMap[cid] = {
                    code: (c?.checklistCode ?? c?.code ?? null) as string | null,
                    title: (c?.checklistTitle ?? c?.title ?? null) as string | null,
                };
            }

            const items: Array<WirItemLike> = Array.isArray(row.items) ? row.items : [];
            const list: UiComplianceItem[] = items.map((it) => mapWirItemToUiComplianceItem(it, checklistMap));

            setFuItems(list);
        } catch (e: any) {
            setFuErr(e?.response?.data?.error || e?.message || "Failed to load follow-up items.");
        } finally {
            setFuLoading(false);
        }
    };

    /* ---------------- validation ---------------- */

    const hasRequiredForSubmit = useMemo(() => {
        const hasDT = !!composeDateTimeISO(dateISO, hh, mm, ampm);
        const baseOk = Boolean(discipline && activityId && hasDT);
        // In follow-up, we keep carried items; no need to pick new checklists.
        return isFollowupMode ? baseOk : Boolean(baseOk && selectedRefIds.length > 0);
    }, [discipline, activityId, dateISO, hh, mm, ampm, selectedRefIds, isFollowupMode]);

    // Upload WIR header documents to:
    // POST /projects/:projectId/wir/:wirId/documents (multipart/form-data, files[])
    async function uploadHeaderDocs(projectId: string, wirId: string, docsState: HeaderDocsState) {
        if (!projectId || !wirId) return;

        const allFiles: File[] = [];
        (["drawings", "itp", "other", "photos", "material", "safety"] as const).forEach((key) => {
            const arr = docsState[key];
            if (arr && arr.length) allFiles.push(...arr);
        });

        if (!allFiles.length) return;

        const form = new FormData();
        for (const f of allFiles) {
            form.append("files", f);
        }

        try {
            await api.post(`/projects/${projectId}/wir/${wirId}/documents`, form, {
                headers: { "Content-Type": "multipart/form-data" },
            });
        } catch (err) {
            // keep business flow unchanged; just log for now
            console.warn("[WIR] header docs upload failed:", err);
        }
    }

    // Build the exact draft payload (same keys you already send in saveDraft)
    function buildDraftPayload(isPatch = false) {
        const dtISO = composeDateTimeISO(dateISO, hh, mm, ampm) || undefined;
        const activityTitle = getActivityTitleById(activityId, activities, activityOpts) || undefined;

        const forDateISO = dtISO ? dtISO.slice(0, 10) : undefined; // "YYYY-MM-DD"
        const forTimeStr = dtISO ? `${hh}:${mm}` : undefined;       // "HH:MM"

        // Build the header patch ONCE and mirror it.
        const headerPatch: any = {
            discipline: discipline || undefined,
            activityId: activityId || undefined,
            title: activityTitle,
            cityTown: locationText || undefined,
            description: workInspection || undefined,
            forDate: forDateISO,
            forTime: forTimeStr,
        };

        const payload: any = {
            status: "Draft",
            // mirror header fields at top-level for backward compatibility
            ...headerPatch,
            header: headerPatch,
            // plannedAt only for POST/create; omit on PATCH to avoid BE ignoring split fields
            plannedAt: isPatch ? undefined : dtISO,
            // refChecklistIds: selectedRefIds.length ? selectedRefIds : undefined,
            // materializeItemsFromRef: false,
            // In follow-up: keep existing items only (failed). Do NOT re-materialize.
            refChecklistIds: isFollowupMode ? undefined : (selectedRefIds.length ? selectedRefIds : undefined),
            materializeItemsFromRef: isFollowupMode ? false : false,
            assignCode: false,
            clientHints: {
                dateText,
                timeText,
                selectedRefCount: selectedRefIds.length,
                attachmentsMeta: buildAttachmentsMeta(docs as any),
            },
        };

        if (currentUserId) {
            if (!isEdit) {
                payload.createdById = currentUserId;
            } else if (payload.createdById == null) {
                payload.createdById = currentUserId;
            }
        }

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

    function tolPillOf(it: UiComplianceItem): string | null {
        const op = (it.tolOp || "").toString().trim();          // e.g., "<=", "±", ">= "
        const base = it.base != null ? String(it.base) : "";     // e.g., "20"
        const u = (it.units || "").toString().trim();            // e.g., "mm"
        const parts = [op, base, u].filter(Boolean);
        return parts.length ? parts.join(" ") : null;            // "<= 20 mm"
    }

    /* ---------------- submit handlers ---------------- */

    const saveDraft = async () => {
        if (!projectId || submitting) return;
        setSubmitting(true);
        setSubmitErr(null);
        try {
            const isPatch = isEdit && !!editId;
            const path = isPatch ? `/projects/${projectId}/wir/${editId}` : `/projects/${projectId}/wir`;
            const method = isPatch ? "PATCH" : "POST";

            const payload = buildDraftPayload(isPatch);
            if (isPatch) delete payload.plannedAt; // hard guard

            logWir(`saveDraft -> ${method} ${path}`, payload);
            const res = method === "PATCH" ? await api.patch(path, payload) : await api.post(path, payload);
            logWir("saveDraft <- response", res?.data);

            // Optional: sanity GET to ensure DB reflects new header now
            if (isPatch) {
                const check = await api.get(`/projects/${projectId}/wir/${editId}`);
                logWir("saveDraft:verify <- GET", check?.data);
            }

            // Header docs upload (if any)
            const wirId = extractWirIdFromResponse(res) || (isPatch ? editId : null);
            if (wirId) {
                await uploadHeaderDocs(projectId, wirId, docs);
            }

            // Keep checklist sync (non-blocking)
            //if (isPatch && selectedRefIds.length) {
            if (isPatch && selectedRefIds.length && !isFollowupMode) {
                try {
                    await api.post(
                        `/projects/${projectId}/wir/${editId}/sync-checklists`,
                        { refChecklistIds: selectedRefIds, materializeItemsFromRef: false, replace: true }
                    );
                } catch (e: any) {
                    console.warn("[WIR] sync-checklists (draft) warn:", e?.response?.data || e?.message || e);
                }
            }

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

                // refChecklistIds: selectedRefIds,
                // materializeItemsFromRef: true,
                // Follow-up: keep the existing (failed) items; no re-materialization
                refChecklistIds: isFollowupMode ? undefined : selectedRefIds,
                materializeItemsFromRef: isFollowupMode ? false : true,
            };

            if (currentUserId) {
                if (!isEdit) {
                    payload.createdById = currentUserId;
                } else if (payload.createdById == null) {
                    payload.createdById = currentUserId;
                }
            }

            let res;
            if (isEdit && editId) {
                res = await api.patch(`/projects/${projectId}/wir/${editId}`, payload);
            } else {
                res = await api.post(`/projects/${projectId}/wir`, payload);
            }

            // Header docs upload (if any)
            const wirId = extractWirIdFromResponse(res) || (isEdit ? editId : null);
            if (wirId) {
                await uploadHeaderDocs(projectId, wirId, docs);
            }

            backToWirList();
        } catch (e: any) {
            setSubmitErr(e?.response?.data?.error || e?.message || "Failed to submit WIR.");
        } finally {
            setSubmitting(false);
        }
    };

    const saveDraftBeforeDispatch = async () => {
        if (!projectId || submitting) return;
        setSubmitting(true);
        setSubmitErr(null);
        try {
            // treat presence of wirIdForModal as PATCH; else POST to create
            const isPatch = !!wirIdForModal;
            const path = isPatch ? `/projects/${projectId}/wir/${wirIdForModal}` : `/projects/${projectId}/wir`;
            const method: "POST" | "PATCH" = isPatch ? "PATCH" : "POST";

            const payload = buildDraftPayload(isPatch);
            if (isPatch) delete payload.plannedAt; // guard: PATCH uses split fields

            logWir(`autoSaveDraft -> ${method} ${path}`, payload);
            const res = method === "PATCH" ? await api.patch(path, payload) : await api.post(path, payload);
            logWir("autoSaveDraft <- response", res?.data);

            // // Extract a stable wirId from common API shapes
            // const newId =
            //     String(
            //         res?.data?.data?.wirId ??
            //         res?.data?.wir?.wirId ??
            //         res?.data?.wirId ??
            //         res?.data?.id ??
            //         ""
            //     ) || wirIdForModal;

            // if (newId) setWirIdForModal(newId);
            // Extract a stable wirId from common API shapes
            const newId = extractWirIdFromResponse(res) || wirIdForModal;
            if (newId) {
                setWirIdForModal(newId);
                // Header docs upload (if any) before opening dispatch modal
                await uploadHeaderDocs(projectId, newId, docs);
            }
            // open the dispatch modal now that we’re sure a draft exists
            setDispatchOpen(true);

        } catch (e: any) {
            const err = e?.response?.data || e?.message || e;
            console.error("[WIR] autoSaveDraft error:", err);
            setSubmitErr(err?.error || err?.message || "Failed to save draft before dispatch.");
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
                {isFollowupMode && (
                    <div className="mt-2">
                        <div className="inline-flex items-center gap-2 text-[12px] px-2.5 py-1 rounded-lg border dark:border-neutral-800 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-300" />
                            Follow-up mode: existing failed items preserved; Library disabled.
                        </div>
                    </div>
                )}
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
                                disabled={isFollowupMode}  // ← FREEZE when follow-up
                                onChange={(v: string) => {
                                    if (isFollowupMode) return;          // ← guard: immutable in follow-up
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
                                        onChange={(e) => {
                                            if (isFollowupMode) return;        // ← guard: immutable in follow-up
                                            setActivityId(e.target.value);
                                        }}
                                        onPointerDownCapture={() => {
                                            if (!discipline || isFollowupMode) return;   // ← don't open/load in follow-up
                                            ensureActivities(false, discipline);
                                        }}
                                        disabled={!discipline || isFollowupMode}       // ← FREEZE when follow-up
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
                                        disabled={!discipline || activityLoading || isFollowupMode}  // ← disable in follow-up
                                        onClick={() => {
                                            if (isFollowupMode) return;         // ← guard
                                            ensureActivities(true, discipline);
                                        }}
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
                        <Note className="mt-2">
                            Files are grouped here and uploaded to the WIR header when you Save Draft or Submit.
                        </Note>
                    </div>

                    {/* Section 4 — Checklist Library */}
                    <div className="rounded-2xl border dark:border-neutral-800 p-3 sm:p-5">
                        <SectionTitle>Checklist Library</SectionTitle>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="text-[13px] sm:text-sm dark:text-white">
                                Selected: <b>{combinedSelectedCount}</b> checklists
                                {combinedItemsCount ? <> · <b>{combinedItemsCount}</b> items</> : null}
                                {isFollowupMode && (
                                    <span className="ml-2 text-[12px] text-emerald-700 dark:text-emerald-300">
                                        (Follow-up: library is disabled)
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={() => !isFollowupMode && setLibOpen(true)}
                                disabled={isFollowupMode}
                                title={isFollowupMode ? "Disabled in follow-up: items already carried over" : "Add from Library"}
                                className={`text-sm w-full sm:w-auto px-3 py-3 sm:py-2 rounded-lg border
       dark:border-neutral-800
       ${isFollowupMode ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-50 dark:hover:bg-neutral-800"}`}
                            >
                                {isFollowupMode ? "Add from Library (disabled)" : "Add from Library"}
                            </button>
                        </div>
                        {refErr && <div className="mt-2 text-sm text-rose-600">{refErr}</div>}
                    </div>

                    {/* Section 5 — Compliance Checklist */}
                    <div className="rounded-2xl border dark:border-neutral-800 p-3 sm:p-5 mb-24 sm:mb-0">
                        <SectionTitle>{isFollowupMode ? "Follow-up Items (Failed from previous)" : "Compliance Checklist"}</SectionTitle>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="text-[13px] sm:text-sm text-gray-700 dark:text-gray-200">
                                {isFollowupMode
                                    ? "View the carried failed items that will be included in this follow-up."
                                    : "View the combined list of items from your selected checklists."}
                            </div>

                            <div className="flex gap-2">
                                {/* NEW: Dedicated Failed Items button when carried items exist */}
                                {hasCarriedFailed && (
                                    <button
                                        onClick={openViewFailed}
                                        className="text-sm w-full sm:w-auto px-3 py-3 sm:py-2 rounded-lg border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                                    >
                                        View Failed Items
                                    </button>
                                )}

                                {/* Keep the existing Combined Items button logic */}
                                <button
                                    onClick={openViewCompliance}
                                    disabled={!selectedRefIds.length || isFollowupMode} // disable in follow-up to avoid confusion
                                    className={`text-sm w-full sm:w-auto px-3 py-3 sm:py-2 rounded-lg border ${!isFollowupMode && selectedRefIds.length
                                        ? "dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                                        : "opacity-60 cursor-not-allowed"
                                        }`}
                                    title={isFollowupMode ? "Disabled in follow-up mode" : ""}
                                >
                                    View Combined Items
                                </button>
                            </div>
                        </div>

                        {!isFollowupMode && viewErr && <div className="mt-2 text-sm text-rose-600">{viewErr}</div>}
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
                                const isPatch = isEdit && !!editId;
                                const payload = buildDraftPayload(isPatch);
                                if (isPatch) delete payload.plannedAt;

                                const path = isPatch ? `/projects/${projectId}/wir/${editId}` : `/projects/${projectId}/wir`;
                                const method: "POST" | "PATCH" = isPatch ? "PATCH" : "POST";

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
                            onClick={saveDraftBeforeDispatch}
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

                                        // Header docs upload (if any)
                                        const wirId = extractWirIdFromResponse(res) || (saveMethodRef.current === "PATCH" ? editId : null);
                                        if (wirId) {
                                            await uploadHeaderDocs(projectId, wirId, docs);
                                        }

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
                            <div className="text-sm">Loading…</div>
                        ) : viewErr ? (
                            <div className="text-sm text-rose-600">{viewErr}</div>
                        ) : (combinedItems.length === 0) ? (
                            <div className="text-sm">No checklist items.</div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {combinedItems.map((it) => {
                                    const tol = tolPillOf(it); // e.g., "<= 20 mm"
                                    const codeLine = [it.refCode, it.code].filter(Boolean).join(" - "); // e.g., "STR - BM - 992"
                                    const req = (it.requirement || "").toString().trim(); // "Mandatory" | "Optional" | ""
                                    const isMandatory = it.required === true || /^mandatory$/i.test(req);
                                    const isOptional = it.required === false || /^optional$/i.test(req);

                                    return (
                                        <div key={it.id} className="rounded-2xl border dark:border-neutral-800 p-3">
                                            {/* Title + tolerance (like Runner) */}
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="text-sm font-semibold dark:text-white">
                                                        {it.text || "Untitled"}{tol ? ` — ${tol}` : ""}
                                                    </div>

                                                    {/* Code line (checklist code + item code) */}
                                                    {codeLine && (
                                                        <div className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">
                                                            {codeLine}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Critical pill */}
                                                {it.critical ? (
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200 dark:border-rose-800">
                                                        Critical
                                                    </span>
                                                ) : null}
                                            </div>

                                            {/* Pills row (Mandatory/Optional, Unit, Tolerance) */}
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
                                                {it.units && (
                                                    <span className="text-[11px] px-2 py-1 rounded-lg border dark:border-neutral-800">
                                                        Unit: {it.units}
                                                    </span>
                                                )}
                                                {tol && (
                                                    <span className="text-[11px] px-2 py-1 rounded-lg border dark:border-neutral-800">
                                                        Tolerance: {tol}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Tags row (e.g., visual, measurement) */}
                                            {(it.tags?.length || 0) > 0 && (
                                                <div className="mt-2 flex flex-wrap gap-1.5">
                                                    {it.tags!.map((t, i) => (
                                                        <span key={i} className="text-[10px] px-2 py-0.5 rounded-full border dark:border-neutral-800">
                                                            {t}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        {viewErr && <div className="mt-2 text-sm text-rose-600">{viewErr}</div>}
                    </div>
                </div>
            )}
            {/* PATCH: Follow-up Failed Items Modal */}
            {fuOpen && (
                <div className="fixed inset-0 z-40 bg-black/40">
                    <div className="absolute inset-x-0 bottom-0 sm:static sm:mx-auto w-full sm:w-auto sm:max-w-xl sm:rounded-2xl bg-white dark:bg-neutral-900 border-t sm:border dark:border-neutral-800 p-4 sm:p-5 h-[75vh] sm:h-auto sm:max-h-[85vh] rounded-t-2xl sm:rounded-2xl overflow-auto flex flex-col">
                        <div className="flex items-center justify-between">
                            <div className="text-base font-semibold dark:text-white">Follow-up Items</div>
                            <button onClick={() => setFuOpen(false)} className="text-sm px-3 py-2 rounded border dark:border-neutral-800">
                                Close
                            </button>
                        </div>

                        {fuLoading ? (
                            <div className="mt-4 text-sm">Loading…</div>
                        ) : fuItems.length === 0 ? (
                            <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                                No items to display. This follow-up does not have carried failed items.
                            </div>
                        ) : (
                            <div className="mt-3 h-[65vh] sm:max-h-[50vh] overflow-auto pr-1">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {fuItems.map((it) => {
                                        const tol = tolPillOf(it);
                                        const codeLine = [it.refCode, it.code].filter(Boolean).join(" - ");
                                        const req = (it.requirement || "").toString().trim();
                                        const isMandatory = it.required === true || /^mandatory$/i.test(req);
                                        const isOptional = it.required === false || /^optional$/i.test(req);

                                        return (
                                            <div key={it.id} className="rounded-2xl border dark:border-neutral-800 p-3">
                                                {/* Title + tolerance (like Compliance) */}
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-semibold dark:text-white">
                                                            {it.text || "Untitled"}
                                                            {tol ? ` — ${tol}` : ""}
                                                        </div>
                                                        {codeLine && (
                                                            <div className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">
                                                                {codeLine}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {it.critical && (
                                                        <span className="text-[10px] px-2 py-0.5 rounded-full border border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200 dark:border-rose-800">
                                                            Critical
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Pills row (Mandatory/Optional + Unit/Tolerance) */}
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
                                                    {it.units && (
                                                        <span className="text-[11px] px-2 py-1 rounded-lg border dark:border-neutral-800">
                                                            Unit: {it.units}
                                                        </span>
                                                    )}
                                                    {tol && (
                                                        <span className="text-[11px] px-2 py-1 rounded-lg border dark:border-neutral-800">
                                                            Tolerance: {tol}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Tags row (if any) */}
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
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {fuErr && <div className="mt-2 text-sm text-rose-600">{fuErr}</div>}
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
                wirId={wirIdForModal || ""}
            />

        </div>
    );
}
