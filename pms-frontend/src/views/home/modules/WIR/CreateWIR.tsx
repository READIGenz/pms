// pms-frontend/src/views/home/modules/WIR/CreateWIR.tsx
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import type { ReactNode } from "react";
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
    case "admin":
      return "Admin";
    case "client":
      return "Client";
    case "ihpmt":
      return "IH-PMT";
    case "contractor":
      return "Contractor";
    case "consultant":
      return "Consultant";
    case "pmc":
      return "PMC";
    case "supplier":
      return "Supplier";
    default:
      return raw || "";
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

function FieldLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`text-[12px] sm:text-sm text-gray-600 dark:text-gray-300 mb-1 ${className}`}>{children}</div>;
}
function Note({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`text-[12px] text-gray-500 dark:text-gray-400 ${className}`}>{children}</div>;
}
function SectionTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`text-sm sm:text-base font-semibold dark:text-white mb-3 ${className}`}>{children}</div>;
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
        className="w-full px-3 py-2 rounded-full border dark:border-neutral-800 dark:bg-neutral-900 dark:text-white focus:outline-none focus:ring"
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

/* ---------------- tiny icons (no external deps) ---------------- */
function IconRefresh({ className = "" }: { className?: string }) {
  // single rounded arrow, smaller and cleaner than recycle
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-3.2-6.9" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}
function IconDoc({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}
function IconImage({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M8.5 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />
      <path d="M21 16l-5-5-4 4-2-2-5 5" />
    </svg>
  );
}

const HOURS_12 = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")); // 01..12
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0")); // 00..55

function parseDDMMYYtoISO(v: string): string | null {
  const t = v.trim();
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(t);
  if (!m) return null;
  let [_, dd, mm, yy] = m;
  const day = Number(dd),
    mon = Number(mm);
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
  const fromActivities = activities.find((a) => a.id === id)?.title;
  if (fromActivities) return String(fromActivities).trim();

  const opt = activityOpts.find((o) => o.value === id)?.label;
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
type Discipline = (typeof DISCIPLINES)[number];

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

type WirFile = File & {
  existing?: boolean;
  url?: string;
  id?: string;
  category?: string;
  tag?: string;
};

function normalizeArrayish(payload: any): any[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  const cands = [
    payload.items,
    payload.list,
    payload.data,
    payload?.data?.items,
    payload?.data?.list,
    payload?.result?.items,
    payload?.result?.list,
    payload?.content,
    payload?.rows,
  ];
  for (const c of cands) if (Array.isArray(c)) return c;
  return [];
}

function getRefId(m: any): string {
  return String(m?.id ?? m?.refChecklistId ?? m?.checklistId ?? m?.refId ?? m?.uuid ?? m?.code ?? "");
}

function getRefCode(m: any): string {
  return String(m?.code ?? m?.refCode ?? m?.refChecklistCode ?? m?.shortCode ?? m?.slug ?? "");
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
      m?.code ??
      "Untitled"
  );
}

function normalizeParts(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (raw == null) return [];
  return String(raw)
    .split(/[;,/]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildAttachmentsMeta(docs: Record<string, File[] | undefined>) {
  const meta: Record<string, Array<{ name: string; size: number; type: string }>> = {};
  for (const [k, arr] of Object.entries(docs || {})) {
    if (!arr || !arr.length) continue;
    meta[k] = arr.map((f) => ({ name: f.name, size: f.size, type: f.type }));
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
  const t = (timeStr || "09:00").trim();
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  let hh = "09",
    mm = "00",
    ss = "00";
  if (m) {
    hh = String(Math.min(23, Math.max(0, parseInt(m[1]!, 10)))).padStart(2, "0");
    mm = String(Math.min(59, Math.max(0, parseInt(m[2]!, 10)))).padStart(2, "0");
    ss = String(Math.min(59, Math.max(0, parseInt(m[3] || "0", 10)))).padStart(2, "0");
  }
  return `${dateStr}T${hh}:${mm}:${ss}`;
}

/* ---------------- UI helpers (Docs tiles) ---------------- */
function fileSummary(files?: File[] | undefined) {
  if (!files?.length) return "";
  // show all file names (comma-separated)
  return files.map((f) => f.name).join(", ");
}

function tolPillOf(it: UiComplianceItem): string | null {
  const op = (it.tolOp || "").toString().trim();
  const base = it.base != null ? String(it.base) : "";
  const u = (it.units || "").toString().trim();
  const parts = [op, base, u].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

// Header-level docs state (per tile)
type HeaderDocsState = {
  drawings?: WirFile[];
  itp?: WirFile[];
  other?: WirFile[];
  photos?: WirFile[];
  material?: WirFile[];
  safety?: WirFile[];
};

function extractWirIdFromResponse(res: any): string | null {
  if (!res) return null;
  const d = res.data ?? res;

  const candidates = [
    d?.data?.wirId,
    d?.data?.id,
    d?.wir?.wirId,
    d?.wirId,
    d?.id,
  ];

  for (const c of candidates) {
    if (c != null && c !== "") return String(c);
  }
  return null;
}

export function ComplianceItemsGrid({ items }: { items: UiComplianceItem[] }) {
  if (!items.length) {
    return <div className="text-sm">No checklist items.</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {items.map((it) => {
        const tol = tolPillOf(it);
        const codeLine = [it.refCode, it.code].filter(Boolean).join(" - ");
        const req = (it.requirement || "").toString().trim();
        const isMandatory = it.required === true || /^mandatory$/i.test(req);
        const isOptional = it.required === false || /^optional$/i.test(req);

        return (
          <div key={it.id} className="rounded-2xl border dark:border-neutral-800 p-3">          <div className="flex items-start justify-between gap-3">
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

            {it.critical ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200 dark:border-rose-800">
                Critical
              </span>
            ) : null}
          </div>

            <div className="mt-2 flex flex-wrap gap-2">
              {isMandatory && (
                <span className="text-[11px] px-2 py-1 rounded-full border dark:border-neutral-800">
                  Mandatory
                </span>
              )}
              {isOptional && (
                <span className="text-[11px] px-2 py-1 rounded-full border dark:border-neutral-800">
                  Optional
                </span>
              )}
              {it.units && (
                <span className="text-[11px] px-2 py-1 rounded-full border dark:border-neutral-800">
                  Unit: {it.units}
                </span>
              )}
              {tol && (
                <span className="text-[11px] px-2 py-1 rounded-full border dark:border-neutral-800">
                  Tolerance: {tol}
                </span>
              )}
            </div>

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
  );
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
    search.get("mode") === "followup" || !!(loc.state as any)?.followup || !!(loc.state as any)?.followupMode;
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
    document.title = isEdit ? "Trinity PMS — Edit WIR" : "Trinity PMS — Create WIR";
  }, [isEdit]);

  /* ---------------- form state ---------------- */

  // Section 1:
  const [discipline, setDiscipline] = useState<Discipline | "">("");
  const [activityId, setActivityId] = useState<string>("");
  const [dateISO, setDateISO] = useState<string | null>(null);
  const [dateText, setDateText] = useState<string>(""); // DD/MM/YY (kept for payload hints)
  const [hh, setHH] = useState<string>("09");
  const [mm, setMM] = useState<string>("00");
  const [ampm, setAMPM] = useState<"AM" | "PM">("AM");
  const [timeText, setTimeText] = useState<string>("09:00 AM"); // kept for payload hints
  const [locationText, setLocationText] = useState<string>("");

  // Section 2:
  const [workInspection, setWorkInspection] = useState<string>(""); // 200 chars

  // Section 3:
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
  useEffect(() => {
    ensureActivitiesRef.current = ensureActivities;
  }, [ensureActivities]);

  // PATCH: follow-up viewer state (near other useState/useRef)
  const editWirRef = useRef<any>(null);

  type FailedUiItem = {
    id: string;
    text: string;
    code: string | null;
    refCode: string | null; // checklist code
    refTitle: string | null; // checklist title
    inspectorStatus: string | null;
    status: string | null;
    lastRunStatus: string | null;
    units: string | null;
    tolOp: string | null;
    base: number | null;
    plus: number | null;
    minus: number | null;
  };

  const [fuOpen, setFuOpen] = useState(false);
  const [fuLoading, setFuLoading] = useState(false);
  const [fuErr, setFuErr] = useState<string | null>(null);
  const [fuItems, setFuItems] = useState<FailedUiItem[]>([]);

  // Edit-loader effect
  useEffect(() => {
    if (!isEdit || !projectId || !editId) return;

    (async () => {
      try {
        const res = await api.get(`/projects/${projectId}/wir/${editId}`);

        // Unwrap
        const row = (res?.data?.data ?? res?.data?.wir ?? res?.data) || {};
        logWir("edit:GET <- raw", res?.data);
        logWir("edit:row (unwrapped)", row);

        // ---- Infer follow-up from row ----
        const inferredFollowup =
          String(row?.mode || row?.meta?.mode || "").toLowerCase() === "followup" ||
          row?.meta?.followup === true ||
          row?.followup === true ||
          row?.isFollowup === true ||
          row?.is_followup === true ||
          !!(row?.prevWirId || row?.parentWirId || row?.sourceWirId || row?.followupOf || row?.revisionOf) ||
          // pattern: items exist (carried from prev), but checklists[] absent/empty
          (Array.isArray(row?.items) && row.items.length > 0 && (!Array.isArray(row?.checklists) || row.checklists.length === 0));

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
            ? String(rawForDate).slice(0, 10)
            : (() => {
                const d = new Date(rawForDate);
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, "0");
                const da = String(d.getDate()).padStart(2, "0");
                return `${y}-${m}-${da}`;
              })();

        const plannedAtFromParts = combineDateTimeISO(dateOnly, row.forTime ?? row.for_time);
        const plannedAt = row.plannedAt ?? row.planned_at ?? row.plannedAtUtc ?? plannedAtFromParts ?? null;

        logWir("edit:plannedAt inputs", {
          rawForDate,
          dateOnly,
          forTime: row.forTime ?? row.for_time ?? null,
        });
        logWir("edit:plannedAt result", plannedAt);

        // ---- Split into UI parts ----
        const { dateISO: dISO, dateText: dTxt, hh: H, mm: M, ampm: AP, timeText: T } = splitPlannedAtToParts(plannedAt);

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

        // ---- Work Inspection ----
        const wiCandidate =
          row.description ??
          row.header?.description ??
          row.workInspection ??
          row.work_inspection ??
          row.details?.workInspection ??
          row.details?.work_inspection ??
          row.scope ??
          row.work ??
          "";

        setWorkInspection(String(wiCandidate));
        // ---------------------------------------------
        // Hydrate documents/evidences from backend WIR
        // ---------------------------------------------
        if (Array.isArray(row.evidences)) {
          const grouped: any = {
            drawings: [],
            itp: [],
            photos: [],
            material: [],
            safety: [],
            other: [],
          };

          const detectCategory = (mime: string, name: string) => {
            const ext = name.toLowerCase();

            if (mime.startsWith("image/")) return "photos";
            if (ext.endsWith(".pdf") || ext.endsWith(".dwg")) return "drawings";
            if (ext.includes("itp")) return "itp";
            if (ext.includes("mat") || ext.includes("material")) return "material";
            if (ext.includes("sft") || ext.includes("safety")) return "safety";
            return "other";
          };

          const tagMap = {
            drawings: "dwg",
            itp: "itp",
            photos: "pic",
            material: "mat",
            safety: "sft",
            other: "doc",
          };

          row.evidences.forEach((e: any) => {
            const category = detectCategory(e.mimeType, e.fileName);
            const tag = tagMap[category];

            const fakeFile: WirFile = {
              name: e.fileName,
              size: e.fileSize,
              type: e.mimeType,
              url: e.url,
              existing: true,
              id: e.id,
              category,
              tag,
            } as WirFile;

            grouped[category].push(fakeFile);
          });

          setDocs(grouped);
          console.log("[WIR] hydrated docs from backend:", grouped);
        }

        // ---- Preselect attached reference checklists ----
        const refIds = pickSelectedChecklistIds(row);
        const isFU = inferredFollowup || isFollowupMode;
        setSelectedRefIds(isFU ? [] : refIds);

      } catch (e: any) {
        const errMsg = e?.response?.data?.error || e?.message || "Failed to load WIR.";
        console.error("[WIR] edit:GET error:", e?.response?.data ?? e?.message ?? e);
        setSubmitErr(errMsg);
      }
    })();
  }, [isEdit, projectId, editId, isFollowupMode]);

  const hasCarriedFailed = useMemo(() => {
    const row = editWirRef.current;
    return !!(row && Array.isArray(row.items) && row.items.length > 0);
  }, [editWirRef.current]);

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
    (claims as any)?.sub || // common JWT 'subject'
    (claims as any)?.userId ||
    (claims as any)?.id ||
    (user as any)?.userId ||
    (user as any)?.id ||
    null;

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
        discipline: discipline || undefined,
      });

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

  useMemo(() => activities, [activities]);

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

  const libAll = discipline ? filteredRefMeta : refMeta;

  const libVisible = useMemo(() => {
    const q = libSearch.trim().toLowerCase();
    if (!q) return libAll;
    return libAll.filter((m) => {
      const code = getRefCode(m).toLowerCase();
      const title = getRefTitle(m).toLowerCase();
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
        (m as any).itemsCount ?? ((m as any).items ? (m as any).items.length : undefined) ?? (m as any).count ?? 0;
      s += Number(c) || 0;
    }
    return s;
  }, [combinedItems, filteredRefMeta, selectedRefIds]);

  /* ---------------- date/time sync ---------------- */
  useEffect(() => {
    setTimeText(`${hh}:${mm} ${ampm}`);
  }, [hh, mm, ampm]);

  // (kept, not used directly in UI now)
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

  // (kept, not used directly in UI now)
  const onDateTextBlur = () => {
    const iso = parseDDMMYYtoISO(dateText);
    if (iso) setDateISO(iso);
  };

  const onNativeDateChange = (v: string) => {
    setDateISO(v || null);
    if (v) {
      const [Y, M, D] = v.split("-");
      setDateText(`${D}/${M}/${Y.slice(2)}`);
    } else {
      setDateText("");
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
    return String((m as any)?.id ?? (m as any)?.refChecklistId ?? rid);
  }

  const openViewCompliance = async () => {
    setViewErr(null);
    setViewLoading(true);
    setViewOpen(true);
    try {
      const refLookup: Record<string, { code?: string | null; title?: string | null }> = {};
      for (const m of refMeta as any[]) {
        const rid = String(m?.id ?? m?.refChecklistId ?? m?.code ?? "");
        if (rid) refLookup[rid] = { code: (m as any).code ?? null, title: (m as any).title ?? null };
      }

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

  // PATCH: open Failed Items viewer for follow-up edit
  const openViewFailed = async () => {
    setFuErr(null);
    setFuLoading(true);
    setFuOpen(true);

    try {
      const row = editWirRef.current || {};
      const checklists: Array<any> = Array.isArray(row.checklists) ? row.checklists : [];
      const byChecklistId = new Map(
        checklists.map((c: any) => [
          String(c?.checklistId ?? c?.id ?? ""),
          {
            code: (c?.checklistCode ?? c?.code ?? null) as string | null,
            title: (c?.checklistTitle ?? c?.title ?? null) as string | null,
          },
        ])
      );

      const items: Array<any> = Array.isArray(row.items) ? row.items : [];
      const list: FailedUiItem[] = items.map((it: any) => {
        const cid = String(it?.sourceChecklistId ?? it?.checklistId ?? "");
        const meta = byChecklistId.get(cid) || { code: null, title: null };
        return {
          id: String(it?.id ?? crypto.randomUUID()),
          text: String(it?.name ?? it?.text ?? it?.title ?? "—"),
          code: (it?.code ?? null) as string | null,
          refCode: meta.code,
          refTitle: meta.title,
          inspectorStatus: (it?.inspectorStatus ?? null) as string | null,
          status: (it?.status ?? null) as string | null,
          lastRunStatus: (Array.isArray(it?.runs) && it.runs.length ? it.runs[0]?.status : null) as string | null,
          units: (it?.unit ?? null) as string | null,
          tolOp: (it?.tolerance ?? null) as string | null,
          base: (it?.base ?? null) as number | null,
          plus: (it?.plus ?? null) as number | null,
          minus: (it?.minus ?? null) as number | null,
        };
      });

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
    return isFollowupMode ? baseOk : Boolean(baseOk && selectedRefIds.length > 0);
  }, [discipline, activityId, dateISO, hh, mm, ampm, selectedRefIds, isFollowupMode]);

  function buildDraftPayload(isPatch = false) {
    const dtISO = composeDateTimeISO(dateISO, hh, mm, ampm) || undefined;
    const activityTitle = getActivityTitleById(activityId, activities, activityOpts) || undefined;

    const forDateISO = dtISO ? dtISO.slice(0, 10) : undefined; // "YYYY-MM-DD"
    const forTimeStr = dtISO ? `${hh}:${mm}` : undefined; // "HH:MM"

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
      ...headerPatch,
      header: headerPatch,
      plannedAt: isPatch ? undefined : dtISO,
      refChecklistIds: isFollowupMode ? undefined : selectedRefIds.length ? selectedRefIds : undefined,
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

  function buildPreviewRows(payload: any) {
    return [
      { label: "Status", apiKey: "status", value: payload.status },
      { label: "Discipline", apiKey: "discipline", value: payload.discipline ?? "—" },
      { label: "Activity ID", apiKey: "activityId", value: payload.activityId ?? "—" },
      { label: "Title (Activity)", apiKey: "title", value: payload.title ?? "—" },
      { label: "Planned At (ISO)", apiKey: "plannedAt", value: payload.plannedAt ?? "—" },
      { label: "forDate", apiKey: "forDate", value: payload.forDate ?? "—" },
      { label: "forTime", apiKey: "forTime", value: payload.forTime ?? "—" },
      { label: "City/Town", apiKey: "cityTown", value: payload.cityTown ?? "—" },
      { label: "Description (WI)", apiKey: "description", value: payload.description ?? "—" },
      {
        label: "Checklists Count",
        apiKey: "refChecklistIds",
        value: Array.isArray(payload.refChecklistIds) ? payload.refChecklistIds.length : 0,
      },
      { label: "Materialize Items", apiKey: "materializeItemsFromRef", value: String(payload.materializeItemsFromRef) },
      { label: "UI Date Text", apiKey: "clientHints.dateText", value: payload.clientHints?.dateText ?? "—" },
      { label: "UI Time Text", apiKey: "clientHints.timeText", value: payload.clientHints?.timeText ?? "—" },
    ];
  }

  function tolPillOf(it: UiComplianceItem): string | null {
    const op = (it.tolOp || "").toString().trim();
    const base = it.base != null ? String(it.base) : "";
    const u = (it.units || "").toString().trim();
    const parts = [op, base, u].filter(Boolean);
    return parts.length ? parts.join(" ") : null;
  }

  /* ---------------- submit handlers ---------------- */
  async function uploadHeaderDocs(projectId: string, wirId: string, docs: any) {
    const form = new FormData();

    const categories: string[] = [];
    const tags: string[] = [];

    for (const key of Object.keys(docs || {})) {
      const arr = docs[key];
      if (!arr || !arr.length) continue;

      for (const f of arr) {
        // Skip backend (existing) files
        if ((f as any).existing) continue;

        // Append file
        form.append("files", f);

        // Append category/tag aligned by index
        categories.push(f.category || key);
        tags.push(f.tag || null);
      }
    }

    if (categories.length > 0) {
      categories.forEach((c) => form.append("categories", c));
      tags.forEach((t) => form.append("tags", t));
    }

    if (form.has("files")) {
      await api.post(
        `/projects/${projectId}/wir/${wirId}/documents`,
        form,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
    } else {
      console.log("[WIR] No NEW files to upload on submit.");
    }
  }

  const saveDraft = async () => {
    if (!projectId || submitting) return;
    setSubmitting(true);
    setSubmitErr(null);
    try {
      const isPatch = isEdit && !!editId;
      const path = isPatch ? `/projects/${projectId}/wir/${editId}` : `/projects/${projectId}/wir`;
      const method = isPatch ? "PATCH" : "POST";

      const payload = buildDraftPayload(isPatch);
      if (isPatch) delete payload.plannedAt;

      logWir(`saveDraft -> ${method} ${path}`, payload);
      const res = method === "PATCH" ? await api.patch(path, payload) : await api.post(path, payload);
      logWir("saveDraft <- response", res?.data);

      if (isPatch) {
        const check = await api.get(`/projects/${projectId}/wir/${editId}`);
        logWir("saveDraft:verify <- GET", check?.data);
      }

      if (isPatch && selectedRefIds.length && !isFollowupMode) {
        try {
          await api.post(`/projects/${projectId}/wir/${editId}/sync-checklists`, {
            refChecklistIds: selectedRefIds,
            materializeItemsFromRef: false,
            replace: true,
          });
        } catch (e: any) {
          console.warn("[WIR] sync-checklists (draft) warn:", e?.response?.data || e?.message || e);
        }
      }

      // NEW: upload header docs for this WIR
      const wirId =
        extractWirIdFromResponse(res) ||
        (isPatch ? editId || "" : "");
      if (wirId) {
        await uploadHeaderDocs(projectId, wirId, docs);
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

      const forDateISO = dtISO.slice(0, 10);
      const forTimeStr = `${hh}:${mm}`;
      const activityTitle = getActivityTitleById(activityId, activities, activityOpts) || undefined;

      const payload: any = {
        status: "Submitted",
        discipline: discipline || undefined,
        activityId: activityId || undefined,
        title: activityTitle,
        plannedAt: dtISO,
        forDate: forDateISO,
        forTime: forTimeStr,

        cityTown: locationText || undefined,
        description: workInspection || undefined,

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

      // Upload header docs for this WIR
      const wirId =
        extractWirIdFromResponse(res) ||
        (isEdit ? editId || "" : "");

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
      const isPatch = !!wirIdForModal;
      const path = isPatch ? `/projects/${projectId}/wir/${wirIdForModal}` : `/projects/${projectId}/wir`;
      const method: "POST" | "PATCH" = isPatch ? "PATCH" : "POST";

      const payload = buildDraftPayload(isPatch);
      if (isPatch) delete payload.plannedAt;

      logWir(`autoSaveDraft -> ${method} ${path}`, payload);
      const res = method === "PATCH" ? await api.patch(path, payload) : await api.post(path, payload);
      logWir("autoSaveDraft <- response", res?.data);

      const newId =
        extractWirIdFromResponse(res) ||
        wirIdForModal;

      if (newId) {
        setWirIdForModal(newId);
        // NEW: upload header docs for this WIR
        await uploadHeaderDocs(projectId, newId, docs);
      }

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

  // Docs tiles config (UI only)
  const docTiles = useMemo(
    () => [
      { key: "drawings" as const, label: "Drawings", hint: "PDF / DWG", accept: ".pdf,.dwg,.dxf", Icon: IconDoc },
      { key: "itp" as const, label: "ITP", hint: "PDF / DOC", accept: ".pdf,.doc,.docx", Icon: IconDoc },
      { key: "other" as const, label: "Other Documents", hint: "Any file", accept: "", Icon: IconDoc },
      { key: "photos" as const, label: "Photos", hint: "JPG / PNG", accept: "image/*", Icon: IconImage },
      { key: "material" as const, label: "Material Approval", hint: "PDF / IMG", accept: ".pdf,image/*", Icon: IconDoc },
      { key: "safety" as const, label: "Safety Clearance", hint: "PDF", accept: ".pdf", Icon: IconDoc },
    ],
    []
  );

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
              className="text-sm w-full sm:w-auto px-4 py-2 rounded-full border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
          </div>
        </div>

        {isFollowupMode && (
          <div className="mt-2">
            <div className="inline-flex items-center gap-2 text-[12px] px-3 py-1 rounded-full border dark:border-neutral-800 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
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
                <div className="rounded-full border px-4 py-2 dark:border-neutral-800 dark:text-white">
                  {(projectFromState?.code ? projectFromState.code + " — " : "") +
                    (projectFromState?.title || `Project: ${projectId}`)}
                </div>
              </div>

              {/* Select Discipline */}
              <SelectStrict
                label="Discipline"
                value={discipline}
                disabled={isFollowupMode}
                onChange={(v: string) => {
                  if (isFollowupMode) return;
                  setDiscipline(v as Discipline | "");
                  setActivityId("");
                  setActivityOpts([]);
                  lastLoadedFor.current = null;
                  if (v) ensureActivities(true, v);
                }}
                options={DISCIPLINES.map((d) => ({ value: d, label: d }))}
              />

              {/* Select Activity */}
              <label className="block sm:col-span-2">
                <span className="block text-[11px] sm:text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                  Activity
                </span>

                <div className="flex items-center gap-2">
                  <select
                    ref={activitySelectRef}
                    className="w-full px-3 py-2 rounded-full border dark:border-neutral-800 dark:bg-neutral-900 dark:text-white focus:outline-none focus:ring"
                    value={activityId}

                    onChange={(e) => {
                      if (isFollowupMode) return;
                      setActivityId(e.target.value);
                    }}
                    onPointerDownCapture={() => {
                      if (!discipline || isFollowupMode) return;
                      ensureActivities(false, discipline);
                    }}
                    disabled={!discipline || isFollowupMode}
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

                  {/* smaller, single-arrow icon */}
                  <button
                    type="button"
                    className="shrink-0 h-9 w-9 rounded-full border border-emerald-200 text-emerald-700
                               hover:bg-emerald-50 active:scale-[0.98]
                               dark:border-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/20
                               disabled:opacity-60 disabled:cursor-not-allowed
                               inline-flex items-center justify-center"
                    disabled={!discipline || activityLoading || isFollowupMode}
                    onClick={() => {
                      if (isFollowupMode) return;
                      ensureActivities(true, discipline);
                    }}
                    title="Reload activities"
                    aria-label="Reload activities"
                  >
                    <IconRefresh className={`h-4 w-4 ${activityLoading ? "animate-spin" : ""}`} />
                  </button>
                </div>

                {activityErr && <div className="mt-1 text-xs text-red-600 dark:text-red-400">{activityErr}</div>}
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
              className="w-full text-[15px] sm:text-sm border rounded-full px-4 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
            />
          </div>

          {/* Date (ONLY one input; removed extra DD/MM/YY pill) */}
          <div>
            <FieldLabel>Date *</FieldLabel>
            <input
              type="date"
              value={dateISO ?? ""}
              onChange={(e) => onNativeDateChange(e.target.value)}
              className="w-full text-[15px] sm:text-sm border rounded-full px-4 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
            />
          </div>

          {/* Time (ONLY selects; removed extra 09:00 AM pill) */}
          <div>
            <FieldLabel>Time *</FieldLabel>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={hh}
                onChange={(e) => setHH(e.target.value)}
                className="w-24 text-[15px] sm:text-sm border rounded-full px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
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
                className="w-24 text-[15px] sm:text-sm border rounded-full px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
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
                className="w-24 text-[15px] sm:text-sm border rounded-full px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
              >
                <option>AM</option>
                <option>PM</option>
              </select>
            </div>
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
              className="w-full text-[15px] sm:text-sm border rounded-2xl px-4 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
            />
            <div className="text-right text-[12px] text-gray-500 dark:text-gray-400">{workInspection.length}/200</div>
          </div>

          {/* Section 3 — Documents & Evidence */}
          <div className="rounded-2xl border dark:border-neutral-800 p-3 sm:p-5">
            <SectionTitle>Documents & Evidence</SectionTitle>

            {/* auto-fit grid with minimum card width (prevents skinny columns / vertical text) */}
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
              {docTiles.map((tile) => {
                const files = (docs as any)[tile.key] as WirFile[] | undefined;
                const has = !!files?.length;
                const Icon = tile.Icon;

                return (
                  <label
                    key={tile.key}
                    className={[
                      "cursor-pointer rounded-2xl border p-3 transition",
                      "hover:bg-gray-50 dark:hover:bg-neutral-800",
                      "min-h-[112px]",
                      has
                        ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-900/10"
                        : "border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <span
                          className={[
                            "h-10 w-10 rounded-2xl border flex items-center justify-center shrink-0",
                            has
                              ? "border-emerald-200 text-emerald-700 bg-white dark:bg-neutral-900 dark:border-emerald-900/40 dark:text-emerald-300"
                              : "border-gray-200 text-gray-600 bg-white dark:bg-neutral-900 dark:border-neutral-800 dark:text-gray-300",
                          ].join(" ")}
                        >
                          <Icon className="h-5 w-5" />
                        </span>

                        <div className="min-w-0">
                          <div
                            className="text-[13px] sm:text-sm font-semibold leading-snug dark:text-white truncate"
                            title={tile.label}
                          >
                            {tile.label}
                          </div>
                          <div
                            className="mt-0.5 text-[11px] sm:text-[12px] text-gray-600 dark:text-gray-300 leading-snug truncate"
                            title={tile.hint}
                          >
                            Upload: <span className="font-medium">{tile.hint}</span>
                          </div>
                          {/* Summary line (count) */}
                          <div
                            className="mt-2 text-[11px] text-gray-500 dark:text-gray-400"
                            title={has ? fileSummary(files) : "Tap to choose files"}
                          >
                            {has ? `${files!.length} file${files!.length === 1 ? "" : "s"} selected` : "Tap to choose files"}
                          </div>

                          {/* Per-file rows with remove option */}
                          {has && (
                            <div className="mt-2 space-y-1 max-h-24 overflow-y-auto pr-1">
                              {files!.map((f, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between gap-2 text-[11px] text-gray-700 dark:text-gray-200
                   bg-gray-50/80 dark:bg-neutral-800/60 rounded-full px-2 py-1"
                                >
                                  <span className="truncate" title={f.name}>
                                    {f.name}
                                  </span>

                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation(); // avoid reopening file dialog when deleting

                                      setDocs((prev) => {
                                        const current = (prev as any)[tile.key] as File[] | undefined;
                                        if (!current) return prev;

                                        const next = current.filter((_, i) => i !== idx);
                                        return {
                                          ...prev,
                                          [tile.key]: next.length ? next : undefined,
                                        };
                                      });
                                    }}
                                    className="ml-1 shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border border-gray-300
                     text-gray-600 hover:bg-gray-200
                     dark:border-neutral-600 dark:text-gray-200 dark:hover:bg-neutral-700"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                        </div>
                      </div>

                      <span
                        className={[
                          "text-[11px] px-2 py-0.5 rounded-full border shrink-0",
                          has
                            ? "border-emerald-200 text-emerald-700 bg-white dark:bg-neutral-900 dark:border-emerald-900/40 dark:text-emerald-300"
                            : "border-gray-200 text-gray-500 bg-white dark:bg-neutral-900 dark:border-neutral-800 dark:text-gray-400",
                        ].join(" ")}
                      >
                        {has ? `${files!.length}` : "0"}
                      </span>
                    </div>

                    <input
                      type="file"
                      className="hidden"
                      multiple
                      accept={tile.accept}
                      onChange={(e) => {
  const picked = e.target.files ? Array.from(e.target.files) : [];
  if (!picked.length) return;

  // Wrap into WirFile with category/tag + existing flag
  const enhanced = picked.map((file) =>
    Object.assign(file, {
      existing: false,
      category: tile.key,
      tag: {
        drawings: "dwg",
        itp: "itp",
        photos: "pic",
        material: "mat",
        safety: "sft",
        other: "doc",
      }[tile.key],
    } as Partial<WirFile>)
  ) as WirFile[];

  setDocs((prev) => {
    const existing = (prev as any)[tile.key] as WirFile[] | undefined;
    const base: WirFile[] = existing ? [...existing] : [];

    // simple de-dup by name+size+lastModified
    for (const f of enhanced) {
      if (!base.some((g) => g.name === f.name && g.size === f.size && g.lastModified === f.lastModified)) {
        base.push(f);
      }
    }

    return { ...prev, [tile.key]: base };
  });
}}


                    />
                  </label>
                );
              })}
              <Note className="mt-2">
                Selected documents and photos will be uploaded when you save or submit this WIR.
              </Note>

              {/* Section 4 — Checklist Library */}
              <div className="rounded-2xl border dark:border-neutral-800 p-3 sm:p-5">
                <SectionTitle>Checklist Library</SectionTitle>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="text-[13px] sm:text-sm dark:text-white">
                    Selected: <b>{combinedSelectedCount}</b> checklists
                    {combinedItemsCount ? (
                      <>
                        {" "}
                        · <b>{combinedItemsCount}</b> items
                      </>
                    ) : null}
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
                    className={`text-sm w-full sm:w-auto px-4 py-2 rounded-full border dark:border-neutral-800
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
                    {hasCarriedFailed && (
                      <button
                        onClick={openViewFailed}
                        className="text-sm w-full sm:w-auto px-4 py-2 rounded-full border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                      >
                        View Failed Items
                      </button>
                    )}

                    <button
                      onClick={openViewCompliance}
                      disabled={!selectedRefIds.length || isFollowupMode}
                      className={`text-sm w-full sm:w-auto px-4 py-2 rounded-full border ${
                    !isFollowupMode && selectedRefIds.length
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
          </div>

          {/* Sticky Action Bar (mobile-first, pill-shaped buttons, no box) */}
          <div className="sticky bottom-0 left-0 right-0 z-20 -mx-4 sm:mx-0">
            <div className="px-4 sm:px-0 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 flex flex-col sm:flex-row gap-2 sm:gap-3 items-center justify-end bg-transparent">
              {submitErr && <div className="text-sm text-rose-600 sm:mr-auto w-full sm:w-auto">{submitErr}</div>}

              {/* Save Draft – outline pill */}
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
                className={`w-full sm:w-auto text-sm px-5 py-2 rounded-full border dark:border-neutral-800
              ${!roleCanCreate || submitting ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-50 dark:hover:bg-neutral-800"}`}
              >
                Save Draft
              </button>

              {/* Submit – solid pill */}
              <button
                onClick={saveDraftBeforeDispatch}
                disabled={!roleCanCreate || submitting || !hasRequiredForSubmit}
                className={`w-full sm:w-auto text-sm px-6 py-2 rounded-full border
              ${
                !roleCanCreate || submitting || !hasRequiredForSubmit
                      ? "bg-emerald-600/60 text-white cursor-not-allowed dark:border-emerald-700"
                      : "bg-emerald-600 text-white hover:bg-emerald-700 dark:border-emerald-700"
                  }`}
                title="Discipline, Activity, Date/Time, and at least one Checklist are required"
              >
                Submit
              </button>
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
                    className="text-sm px-4 py-2 rounded-full border dark:border-neutral-800 disabled:opacity-60"
                    disabled={saveDlgBusy}
                  >
                    Close
                  </button>
                </div>
                <div className="text-[12px] text-gray-500 dark:text-gray-400 mt-1">This is exactly what will be saved to the WIR draft.</div>

                <div className="mt-3 flex-1 min-h-0 overflow-auto pr-1 divide-y">
                  {saveDlgRows.map((r, i) => (
                    <div key={i} className="py-2">
                      <div className="text-[12px] text-gray-500 dark:text-gray-400">{r.label}</div>
                      <div className="text-[13px] sm:text-sm dark:text-white break-all">{String(r.value)}</div>
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
                    className="w-full sm:w-auto text-sm px-4 py-2 rounded-full border dark:border-neutral-800 disabled:opacity-60"
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

                        const res = method === "PATCH" ? await api.patch(path, payload) : await api.post(path, payload);
                        logWir("saveDraft(confirm) <- response", res?.data);

                        // NEW: upload header docs for this WIR
                        const wirId =
                          extractWirIdFromResponse(res) ||
                          (method === "PATCH" ? editId || "" : "");
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
                    className={`w-full sm:w-auto text-sm px-5 py-2 rounded-full border ${
                  saveDlgBusy
                      ? "opacity-60 cursor-not-allowed"
                      : "bg-emerald-600 text-white hover:bg-emerald-700 dark:border-emerald-700"
                    }`}
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
                  <button
                    onClick={() => setLibOpen(false)}
                    className="text-sm px-4 py-2 rounded-full border dark:border-neutral-800"
                  >
                    Close
                  </button>
                </div>
                <div className="text-[12px] text-gray-500 dark:text-gray-400 mt-1">
                  {discipline ? (
                    <>
                      Filtered by discipline <b>{discipline}</b>
                    </>
                  ) : (
                    "All disciplines"
                  )}
                </div>

                {/* Search + bulk toggle */}
                <div className="mt-3 flex items-center gap-2">
                  <input
                    value={libSearch}
                    onChange={(e) => setLibSearch(e.target.value)}
                    placeholder="Search by code or title…"
                    className="flex-1 text-[15px] sm:text-sm border rounded-full px-4 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                  />
                  <button
                    type="button"
                    onClick={toggleSelectAllVisible}
                    className="text-xs sm:text-sm px-4 py-2 rounded-full border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800 whitespace-nowrap"
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
                            className="flex items-start gap-3 p-3 rounded-2xl border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800 cursor-pointer"
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
                    {combinedItemsCount ? (
                      <>
                        {" "}
                        · Items <b>{combinedItemsCount}</b>
                      </>
                    ) : null}
                  </div>
                  <button
                    onClick={() => setLibOpen(false)}
                    className="w-full sm:w-auto px-4 py-2 rounded-full border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
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
                  <button
                    onClick={() => setViewOpen(false)}
                    className="text-sm px-4 py-2 rounded-full border dark:border-neutral-800"
                  >
                    Close
                  </button>
                </div>

            {viewLoading ? (
              <div className="text-sm">Loading…</div>
            ) : viewErr ? (
              <div className="text-sm text-rose-600">{viewErr}</div>
            ) : combinedItems.length === 0 ? (
              <div className="text-sm">No checklist items.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {combinedItems.map((it) => {
                  const tol = tolPillOf(it);
                  const codeLine = [it.refCode, it.code].filter(Boolean).join(" - ");
                  const req = (it.requirement || "").toString().trim();
                  const isMandatory = it.required === true || /^mandatory$/i.test(req);
                  const isOptional = it.required === false || /^optional$/i.test(req);

                  return (
                    <div key={it.id} className="rounded-2xl border dark:border-neutral-800 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold dark:text-white">
                            {it.text || "Untitled"}
                            {tol ? ` — ${tol}` : ""}
                          </div>
                          {codeLine && <div className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">{codeLine}</div>}
                        </div>

                        {it.critical ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full border border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200 dark:border-rose-800">
                            Critical
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2">
                        {isMandatory && <span className="text-[11px] px-2 py-1 rounded-full border dark:border-neutral-800">Mandatory</span>}
                        {isOptional && <span className="text-[11px] px-2 py-1 rounded-full border dark:border-neutral-800">Optional</span>}
                        {it.units && <span className="text-[11px] px-2 py-1 rounded-full border dark:border-neutral-800">Unit: {it.units}</span>}
                        {tol && <span className="text-[11px] px-2 py-1 rounded-full border dark:border-neutral-800">Tolerance: {tol}</span>}
                      </div>

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
                  <button
                    onClick={() => setFuOpen(false)}
                    className="text-sm px-4 py-2 rounded-full border dark:border-neutral-800"
                  >
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
                        const op = it.tolOp === "+-" ? "±" : it.tolOp;
                        const tol = formatTolerance(op, it.base, it.minus, it.plus, it.units) || null;
                        const codeLine = [it.refCode, it.code].filter(Boolean).join(" - ");

                        return (
                          <div key={it.id} className="rounded-2xl border dark:border-neutral-800 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold dark:text-white">
                                  {it.text || "Untitled"}
                                  {tol ? ` — ${tol}` : ""}
                                </div>
                                {codeLine && <div className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">{codeLine}</div>}
                              </div>
                            </div>

                            <div className="mt-2 flex flex-wrap gap-2">
                              {it.units && <span className="text-[11px] px-2 py-1 rounded-full border dark:border-neutral-800">Unit: {it.units}</span>}
                              {tol && <span className="text-[11px] px-2 py-1 rounded-full border dark:border-neutral-800">Tolerance: {tol}</span>}
                            </div>
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
                : projectFromState?.title || `Project: ${projectId}`
            }
            projectId={projectId}
            wirId={wirIdForModal || ""}
          />
        </div> {/* closes body grid div */}
      </section> {/* closes main section */}
    </div>
  );
}
