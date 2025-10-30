// pms-frontend/src/views/home/modules/WIR.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { api } from "../../../api/client";
import { useAuth } from "../../../hooks/useAuth";

// --- JWT (local to this file) ---
function decodeJwtPayload(token: string): any | null {
  try {
    const [_, b64] = token.split(".");
    if (!b64) return null;
    const norm = b64.replace(/-/g, "+").replace(/_/g, "/");
    const pad = norm.length % 4 ? "=".repeat(4 - (norm.length % 4)) : "";
    return JSON.parse(atob(norm + pad));
  } catch {
    return null;
  }
}

const getToken = (): string | null =>
  localStorage.getItem("token") ||
  sessionStorage.getItem("token") ||
  (window as any).__AUTH_TOKEN ||
  null;

const getClaims = (): any | null => {
  const t = getToken();
  return t ? decodeJwtPayload(t) : null;
};

/* ========================= Role helpers ========================= */
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

const isIsoLike = (v: any) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v);
const fmtDate = (v: any) => (isIsoLike(v) ? new Date(v).toLocaleDateString() : (v ?? ""));
const fmtDateTime = (v: any) => (isIsoLike(v) ? new Date(v).toLocaleString() : (v ?? ""));

const DISCIPLINES = ["Civil", "MEP", "Finishes"] as const;

/* ========================= Types (UI-lean) ========================= */
type WIRProps = {
  hideTopHeader?: boolean;        // <-- suppress the in-tile header row (title + Back)
  onBackOverride?: () => void;    // keep existing navigate(-1) fallback
};

type WirItem = {
  id: string;
  name: string;
  spec?: string | null;
  required?: string | null;
  tolerance?: string | null;
  photoCount?: number | null;
  status?: string | null; // e.g. OK / NCR / Pending
};

type WirRecord = {
  wirId: string;
  code?: string | null; // e.g. IR-0001
  title: string;
  projectId: string;
  projectCode?: string | null;
  projectTitle?: string | null;

  // core status/health
  status?: string | null;   // Draft | Submitted | Recommended | Approved | Rejected
  health?: string | null;   // Green | Amber | Red | Unknown

  // meta
  discipline?: string | null; // Civil / MEP / Finishes
  stage?: string | null;

  // schedule-ish
  forDate?: string | null;   // planned inspection date
  forTime?: string | null;   // optional

  // location / ref data
  cityTown?: string | null;
  stateName?: string | null;

  // people
  contractorName?: string | null;
  inspectorName?: string | null;
  hodName?: string | null;

  // items
  items?: WirItem[];

  // misc
  description?: string | null;
  updatedAt?: string | null;
};

type FetchState = {
  list: WirRecord[];
  loading: boolean;
  error: string | null;
};

type NewWirForm = {
  projectCode?: string | null;
  projectTitle?: string | null;
  activityId?: string | null;      // from Activity Library (later)
  activityLabel?: string | null;   // display text for now
  discipline?: string | null;      // Civil / MEP / Finishes
  dateISO: string;                 // yyyy-mm-dd
  time12h: string;                 // HH:MM AM/PM
  location?: string | null;
  details?: string;                // multi-line

  // attachments
  drawingFiles: File[];
  itpFiles: File[];
  otherDocs: File[];
  photos: File[];
  materialApprovalFiles: File[];
  safetyClearanceFiles: File[];

  // checklists
  pickedChecklistIds: string[];    // from library
  pickedComplianceIds: string[];   // shown in "View Items"
};

type ActivityLite = {
  id: string;
  code?: string | null;
  title?: string | null;
  discipline?: string | null;
  status?: string | null;
};

type ActivityState = {
  rows: ActivityLite[];
  loading: boolean;
  error: string | null;
};

type ChecklistLite = {
  id: string;
  code?: string | null;
  title?: string | null;
  discipline?: string | null;
  status?: string | null;
  aiDefault?: boolean | null;
};

type ChecklistState = {
  rows: ChecklistLite[];
  loading: boolean;
  error: string | null;
};

// --- tiny safe GET with timeout ---
async function apiGetSafe<T = any>(
  url: string,
  { params, timeoutMs = 12000 }: { params?: any; timeoutMs?: number } = {}
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await api.get(url, { params, signal: controller.signal });
    return res.data as T;
  } finally {
    clearTimeout(timer);
  }
}

/* ========================= Badges (parity with other pages) ========================= */
function Badge({ kind, value }: { kind: "status" | "health"; value?: string | null }) {
  const v = (value || "").toString().trim();
  if (!v) return null;

  let cls =
    "bg-gray-100 text-gray-800 border-gray-200 dark:bg-neutral-800 dark:text-gray-200 dark:border-neutral-700";
  if (kind === "status") {
    const map: Record<string, string> = {
      Draft: "bg-gray-100 text-gray-800 border-gray-200 dark:bg-neutral-800 dark:text-gray-200 dark:border-neutral-700",
      Submitted: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
      Recommended: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
      Approved: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
      Rejected: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800",
    };
    cls = map[v] || cls;
  } else {
    const map: Record<string, string> = {
      Green: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
      Amber: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
      Red: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800",
      Unknown: "bg-gray-100 text-gray-800 border-gray-200 dark:bg-neutral-800 dark:text-gray-200 dark:border-neutral-700",
    };
    cls = map[v] || cls;
  }

  return <span className={`text-[10px] px-1.5 py-0.5 rounded border ${cls}`}>{v}</span>;
}

/* ========================= Small bits ========================= */
function Pill({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: any }) {
  return (
    <button
      onClick={onClick}
      className={
        "px-3 py-1.5 rounded-full border text-xs sm:text-sm " +
        (active
          ? "bg-emerald-600 text-white border-emerald-700"
          : "bg-white dark:bg-neutral-900 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800")
      }
    >
      {children}
    </button>
  );
}

function SectionCard({ title, children }: { title: string; children: any }) {
  return (
    <div className="bg-gray-50/60 dark:bg-neutral-900 rounded-xl border dark:border-neutral-800 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-3">
        {title}
      </div>
      {children}
    </div>
  );
}

function FieldRow({ label, value, wide = false }: { label: string; value?: any; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-0.5 font-medium dark:text-white break-words">{value || "—"}</div>
    </div>
  );
}
function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nowTime12h() {
  const d = new Date();
  let hh = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, "0");
  const am = hh < 12;
  hh = hh % 12 || 12;
  return `${String(hh).padStart(2, "0")}:${mm} ${am ? "AM" : "PM"}`;
}

/* ========================= Main Component ========================= */
export default function WIR({ hideTopHeader, onBackOverride }: WIRProps) {
  const { projectId = "" } = useParams<{ projectId: string }>();
  const location = useLocation();
  const navState = (location.state as any) || {};

  const navigate = useNavigate();

  // prefer role from JWT claims; then navState; then useAuth fallbacks
  const { user, claims } = useAuth();
  const claimsFromJwt = getClaims() || {};
  const passedRole = normalizeRole(navState?.role);
  const role =
    passedRole ||
    normalizeRole(
      claimsFromJwt?.role ??
      claimsFromJwt?.userRole ??
      claimsFromJwt?.roleName ??
      (user as any)?.role ??
      (claims as any)?.role ??
      (claims as any)?.userRole ??
      (claims as any)?.roleName ??
      ""
    );

  // project label from state for immediate header info
  const passedProject = navState?.project as
    | { projectId?: string; code?: string | null; title?: string | null }
    | undefined;

  const [q, setQ] = useState("");
  const [state, setState] = useState<FetchState>({ list: [], loading: true, error: null });
  const [view, setView] = useState<"list" | "detail" | "new">("list");
  const [activeTab, setActiveTab] = useState<"overview" | "items" | "schedule" | "revisions">("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Pre-fill project chips in Create view from navigation state
  const [newForm, setNewForm] = useState<NewWirForm>({
    projectCode: passedProject?.code ?? null,
    projectTitle: passedProject?.title ?? null,
    activityId: null,
    activityLabel: null,
    discipline: null,
    dateISO: todayISO(),
    time12h: nowTime12h(),
    location: "",
    details: "",

    drawingFiles: [],
    itpFiles: [],
    otherDocs: [],
    photos: [],
    materialApprovalFiles: [],
    safetyClearanceFiles: [],

    pickedChecklistIds: [],
    pickedComplianceIds: [],
  });
  const [activities, setActivities] = useState<ActivityState>({
    rows: [],
    loading: false,
    error: null,
  });
  const [checklists, setChecklists] = useState<ChecklistState>({
    rows: [],
    loading: false,
    error: null,
  });

  const loadActivities = async () => {
    setActivities(s => ({ ...s, loading: true, error: null }));
    try {
      const data = await apiGetSafe('/admin/ref/activities', {
        params: { status: 'Active', page: 1, pageSize: 200 /*, discipline: newForm.discipline || undefined*/ },
      });

      const raw: any[] =
        (Array.isArray(data) ? data :
          Array.isArray((data as any)?.items) ? (data as any).items :
            Array.isArray((data as any)?.records) ? (data as any).records :
              Array.isArray((data as any)?.activities) ? (data as any).activities :
                []) as any[];

      const rows: ActivityLite[] = raw.map((x: any) => ({
        id: String(x.id ?? x.activityId ?? x.code ?? x.slug ?? ''),
        code: x.code ?? null,
        title: x.title ?? x.name ?? null,
        discipline: x.discipline ?? null,
        status: x.status ?? null,
      })).filter(a => a.id);

      setActivities({ rows, loading: false, error: null });
    } catch (e: any) {
      setActivities({
        rows: [],
        loading: false,
        error:
          e?.name === 'CanceledError' || e?.message?.includes('aborted')
            ? 'Timed out. Click Reload.'
            : (e?.response?.data?.error || e?.message || 'Failed to load activities'),
      });
    }
  };

  const loadChecklists = async () => {
    setChecklists(s => ({ ...s, loading: true, error: null }));
    try {
      const data = await apiGetSafe('/admin/ref/checklists', {
        params: { status: 'Active', page: 1, pageSize: 200, discipline: newForm.discipline || undefined },
      });

      const raw: any[] =
        (Array.isArray(data) ? data :
          Array.isArray((data as any)?.items) ? (data as any).items :
            Array.isArray((data as any)?.records) ? (data as any).records :
              Array.isArray((data as any)?.checklists) ? (data as any).checklists :
                []) as any[];

      const rows: ChecklistLite[] = raw.map((x: any) => ({
        id: String(x.id ?? x.checklistId ?? x.code ?? x.slug ?? ''),
        code: x.code ?? null,
        title: x.title ?? x.name ?? null,
        discipline: x.discipline ?? null,
        status: x.status ?? null,
        aiDefault: x.aiDefault ?? null,
      })).filter(c => c.id);

      setChecklists({ rows, loading: false, error: null });
    } catch (e: any) {
      setChecklists({
        rows: [],
        loading: false,
        error:
          e?.name === 'CanceledError' || e?.message?.includes('aborted')
            ? 'Timed out. Click Reload.'
            : (e?.response?.data?.error || e?.message || 'Failed to load checklists'),
      });
    }
  };

  // Picker modal state
  const [clLibOpen, setClLibOpen] = useState(false);
  const [clQuery, setClQuery] = useState("");
  const [clPicked, setClPicked] = useState<Set<string>>(new Set());
  const [roViewOpen, setRoViewOpen] = useState(false);

  type ViewMode = "create" | "edit" | "readonly";
  const [mode, setMode] = useState<ViewMode>("create");
  const isRO = mode === "readonly";

  // Attachment “pills” (derived)
  const hasDrawing = newForm.drawingFiles.length > 0;
  const hasITP = newForm.itpFiles.length > 0;
  const hasOther = newForm.otherDocs.length > 0;
  const hasPhotos = newForm.photos.length > 0;
  const hasMA = newForm.materialApprovalFiles.length > 0;
  const hasSafety = newForm.safetyClearanceFiles.length > 0;

  const selected = useMemo(
    () => state.list.find((w) => String(w.wirId) === String(selectedId)) || null,
    [state.list, selectedId]
  );

  // Role-based primary actions (UI only; wire to APIs later)
  const primaryActionLabel = useMemo(() => {
    const r = normalizeRole(role);
    if (r === "Contractor") return view === "detail" ? "Submit IR" : "+Create New WIR";
    if (r === "PMC" || r === "IH-PMT" || r === "Consultant") return "Recommend";
    if (r === "Admin" || r === "Client") return "Approve";
    return "Action";
  }, [role, view]);

  const checklistLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of checklists.rows) {
      const label = [c.code, c.title].filter(Boolean).join(": ");
      map.set(c.id, label || c.id);
    }
    return map;
  }, [checklists.rows]);

  const resetNewForm = () => setNewForm({
    projectCode: passedProject?.code ?? null,
    projectTitle: passedProject?.title ?? null,
    activityId: null,
    activityLabel: null,
    discipline: null,
    dateISO: todayISO(),
    time12h: nowTime12h(),
    location: "",
    details: "",
    drawingFiles: [],
    itpFiles: [],
    otherDocs: [],
    photos: [],
    materialApprovalFiles: [],
    safetyClearanceFiles: [],
    pickedChecklistIds: [],
    pickedComplianceIds: [],
  });

  const mapWirToForm = (x: any): NewWirForm => ({
    projectCode: x?.project?.code ?? passedProject?.code ?? null,
    projectTitle: x?.project?.title ?? passedProject?.title ?? null,
    activityId: x?.activityId ?? null,
    activityLabel: x?.activityLabel ?? ([x?.activity?.code, x?.activity?.title].filter(Boolean).join(": ") || null),
    discipline: x?.discipline ?? null,
    dateISO: (x?.forDate && String(x.forDate).slice(0, 10)) || todayISO(),
    time12h: x?.forTime || nowTime12h(),
    location: x?.cityTown ?? "",
    details: x?.description ?? "",

    // evidence – wire real files later (keep empty arrays for now)
    drawingFiles: [],
    itpFiles: [],
    otherDocs: [],
    photos: [],
    materialApprovalFiles: [],
    safetyClearanceFiles: [],

    // checklists – if backend returns items/checklists, map ids/titles
    pickedChecklistIds: Array.isArray(x?.items) ? x.items.map((it: any) => it?.name || it?.code || it?.id).filter(Boolean) : [],
    pickedComplianceIds: [],
  });

  const loadWir = async (pid: string, wid: string) => {
    // Try project route first, then admin fallback
    const { data } = await api.get(`/projects/${pid}/wir/${wid}`).catch(async () => {
      return await api.get(`/admin/projects/${pid}/wir/${wid}`);
    });
    return data;
  };

  const goToList = (afterReload = true) => {
    const finish = () => {
      setSelectedId(null);
      setView("list");
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { }
    };
    if (afterReload) {
      reloadWirList().finally(finish);
    } else {
      finish();
    }
  };

  // ----- AUTH GATE + ensure Authorization header -----
  useEffect(() => {
    const token = getToken();
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }
    (api.defaults.headers.common as any).Authorization = `Bearer ${token}`;
  }, [navigate]);

  /* ========================= Load WIR list =========================
     Replace endpoints with your real ones. Kept forgiving on shapes. */
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        // Try: /projects/:id/wir
        const { data } = await api.get(`/projects/${projectId}/wir`).catch(async () => {
          // Fallback: /admin/projects/:id/wir
          return await api.get(`/admin/projects/${projectId}/wir`);
        });

        const arr: any[] = Array.isArray(data) ? data : (Array.isArray(data?.records) ? data.records : []);
        const list: WirRecord[] = arr.map((x) => ({
          wirId: x.wirId ?? x.id,
          code: x.code ?? x.irCode ?? null,
          title: x.title ?? x.name ?? "Inspection Request",
          projectId: x.projectId ?? projectId,
          projectCode: x.project?.code ?? null,
          projectTitle: x.project?.title ?? null,
          status: x.status ?? null,
          health: x.health ?? null,
          discipline: x.discipline ?? null,
          stage: x.stage ?? null,
          forDate: x.forDate ?? x.plannedDate ?? null,
          forTime: x.forTime ?? null,
          cityTown: x.cityTown ?? x.location?.cityTown ?? null,
          stateName: x.state?.name ?? (typeof x.state === "string" ? x.state : null),
          contractorName: x.contractor?.name ?? x.participants?.contractor ?? null,
          inspectorName: x.inspector?.name ?? x.participants?.inspector ?? null,
          hodName: x.hod?.name ?? x.participants?.hod ?? null,
          items: (x.items || []).map((it: any, i: number) => ({
            id: it.id ?? `it-${i}`,
            name: it.name ?? it.title ?? `Item ${i + 1}`,
            spec: it.spec ?? it.specification ?? null,
            required: it.required ?? it.requirement ?? null,
            tolerance: it.tolerance ?? null,
            photoCount: it.photoCount ?? (Array.isArray(it.photos) ? it.photos.length : null),
            status: it.status ?? null,
          })),
          description: x.description ?? x.notes ?? null,
          updatedAt: x.updatedAt ?? x.modifiedAt ?? x.createdAt ?? null,
        }));

        if (!cancelled) setState({ list, loading: false, error: null });
      } catch (e: any) {
        if (!cancelled)
          setState({
            list: [],
            loading: false,
            error: e?.response?.data?.error || e?.message || "Failed to load WIRs",
          });
      }
    };
    run();
    return () => { cancelled = true; };
  }, [projectId]);

  // useEffect(() => {
  //   if (view !== "new") return;

  //   let cancelled = false;
  //   (async () => {
  //     setActivities(s => ({ ...s, loading: true, error: null }));
  //     try {
  //       // Ask only for Active. Pull many in one shot.
  //       const { data } = await api.get('/admin/ref/activities', {
  //         params: {
  //           status: 'Active',
  //           page: 1,
  //           pageSize: 200,
  //           // You can also pass discipline to server if you prefer server-side filter:
  //           // discipline: newForm.discipline || undefined,
  //         },
  //       });

  //       // Be forgiving about the payload shape
  //       const raw: any[] =
  //         (Array.isArray(data) ? data : null) ||
  //         (Array.isArray(data?.items) ? data.items : null) ||
  //         (Array.isArray(data?.records) ? data.records : null) ||
  //         (Array.isArray(data?.activities) ? data.activities : null) ||
  //         [];

  //       const rows: ActivityLite[] = raw
  //         .map((x: any) => ({
  //           id: String(x.id ?? x.activityId ?? x.code ?? x.slug ?? ''),
  //           code: x.code ?? null,
  //           title: x.title ?? x.name ?? null,
  //           discipline: x.discipline ?? null,
  //           status: x.status ?? null,
  //         }))
  //         .filter(a => a.id); // keep only valid ids

  //       if (!cancelled) setActivities({ rows, loading: false, error: null });
  //     } catch (e: any) {
  //       if (!cancelled) setActivities({
  //         rows: [],
  //         loading: false,
  //         error: e?.response?.data?.error || e?.message || 'Failed to load activities',
  //       });
  //     }
  //   })();

  //   return () => { cancelled = true; };
  // }, [view, newForm.discipline]);

  // useEffect(() => {
  //   if (view !== "new") return;

  //   let cancelled = false;
  //   (async () => {
  //     setChecklists(s => ({ ...s, loading: true, error: null }));
  //     try {
  //       const { data } = await api.get('/admin/ref/checklists', {
  //         params: {
  //           status: 'Active',
  //           page: 1,
  //           pageSize: 200,
  //           // discipline filter to server (optional but preferred):
  //           discipline: newForm.discipline || undefined,
  //         },
  //       });

  //       const raw: any[] =
  //         (Array.isArray(data) ? data : null) ||
  //         (Array.isArray(data?.items) ? data.items : null) ||
  //         (Array.isArray(data?.records) ? data.records : null) ||
  //         (Array.isArray(data?.checklists) ? data.checklists : null) ||
  //         [];

  //       const rows: ChecklistLite[] = raw.map((x: any) => ({
  //         id: String(x.id ?? x.checklistId ?? x.code ?? x.slug ?? ''),
  //         code: x.code ?? null,
  //         title: x.title ?? x.name ?? null,
  //         discipline: x.discipline ?? null,
  //         status: x.status ?? null,
  //         aiDefault: x.aiDefault ?? null,
  //       })).filter(c => c.id);

  //       if (!cancelled) setChecklists({ rows, loading: false, error: null });
  //     } catch (e: any) {
  //       if (!cancelled) setChecklists({
  //         rows: [],
  //         loading: false,
  //         error: e?.response?.data?.error || e?.message || 'Failed to load checklists',
  //       });
  //     }
  //   })();

  //   return () => { cancelled = true; };
  // }, [view, newForm.discipline]);

  const visibleActivities = useMemo(() => {
    if (!newForm.discipline) return activities.rows;
    return activities.rows.filter(a => (a.discipline || '').toLowerCase() === newForm.discipline!.toLowerCase());
  }, [activities.rows, newForm.discipline]);


  const visibleChecklists = useMemo(() => {
    // discipline guard (in case server didn’t filter)
    const disc = (newForm.discipline || "").toLowerCase();
    let rows = !disc
      ? checklists.rows
      : checklists.rows.filter(c => (c.discipline || '').toLowerCase() === disc);

    const q = clQuery.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter(c => {
      const hay = [c.code, c.title, c.discipline].map(v => (v || "").toLowerCase());
      return hay.some(h => h.includes(q));
    });
  }, [checklists.rows, newForm.discipline, clQuery]);


  /* ========================= Derived ========================= */
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return state.list;
    return state.list.filter((w) =>
      [
        w.title, w.code, w.status, w.discipline, w.cityTown, w.stateName,
        w.contractorName, w.inspectorName, w.hodName,
      ]
        .map((s) => (s || "").toString().toLowerCase())
        .some((s) => s.includes(needle))
    );
  }, [state.list, q]);

  const pageHeading = useMemo(() => {
    // When editing a saved draft, show "CODE — Title" like the list cards
    if (mode === "edit" && selected) {
      const code = selected.code ? `${selected.code} — ` : "";
      const ttl = selected.title || newForm.activityLabel || "Inspection Request";
      return `${code}${ttl}`;
    }
    // Default heading for list / create-new
    return "Work Inspection Requests";
  }, [mode, selected, newForm.activityLabel]);

  const projectLabel = useMemo(() => {
    const code =
      newForm.projectCode ??
      selected?.projectCode ??
      passedProject?.code ??
      "";
    const title =
      newForm.projectTitle ??
      selected?.projectTitle ??
      passedProject?.title ??
      "";
    if (code || title) return `${code ? code + " — " : ""}${title}`;
    return `Project: ${projectId}`;
  }, [
    newForm.projectCode,
    newForm.projectTitle,
    selected?.projectCode,
    selected?.projectTitle,
    passedProject?.code,
    passedProject?.title,
    projectId,
  ]);

  const normStatus = (s?: string | null) =>
    (s || "Draft").toString().trim().toLowerCase();

  const kpis = useMemo(() => {
    const total = state.list.length;

    let approved = 0, rejected = 0, pending = 0;
    // Pending = Submitted OR Recommended (Drafts are not pending)
    for (const w of state.list) {
      const st = normStatus(w.status);
      if (st === "approved") approved++;
      else if (st === "rejected") rejected++;
      else if (st === "submitted" || st === "recommended") pending++;
    }

    return { total, pending, approved, rejected };
  }, [state.list]);

  /* ========================= Actions (stubs) ========================= */
  const onPrimary = async () => {
    const r = normalizeRole(role);

    // From LIST: Contractors click "+Create New WIR"
    if (r === "Contractor" && view === "list") {
      openCreateNew();         // ← ensures full reset every time
      return;
    }

    // From DETAIL: role-based actions
    if (!selected) return;

    try {
      if (r === "Contractor") {
        // Submit IR
        await api.post(`/projects/${projectId}/wir/${selected.wirId}/submit`, { role: r });
        await reloadWirList();
        alert("Submitted.");
        goToList(true);
        return;
      }
      if (r === "PMC" || r === "IH-PMT" || r === "Consultant") {
        await api.post(`/projects/${projectId}/wir/${selected.wirId}/recommend`, { role: r });
        await reloadWirList();
        alert("Recommended.");
        goToList(true);
        return;
      }
      if (r === "Admin" || r === "Client") {
        await api.post(`/projects/${projectId}/wir/${selected.wirId}/approve`, { role: r });
        await reloadWirList();
        alert("Approved.");
        goToList(true);
        return;
      }

      alert("No action available for your role.");
    } catch (e: any) {
      const s = e?.response?.status;
      const msg = e?.response?.data?.error || e?.message || "Failed";
      alert(`Error ${s ?? ''} ${msg}`);
    }
  };


  const onOpen = async (id: string) => {
    try {
      setSelectedId(id);

      // find status from already-fetched list (fast path)
      const row = state.list.find(w => String(w.wirId) === String(id));
      let status = row?.status || "Draft";

      // load full record to prefill fields
      const full = await loadWirListIfNeededAndGet(id);

      // if API didn’t return status earlier, try from full
      status = full?.status || status;

      // pre-fill form (used for showing some text fields even in read-only modal)
      setNewForm(mapWirToForm(full || {}));
      if (!checklists.rows.length && !checklists.loading) {
        // fetch once so checklistLabelById can resolve nice labels in RO + Edit
        loadChecklists();
      }

      const statusLower = (status || "").toLowerCase();

      if (statusLower === "draft") {
        // DRAFT -> go to editable form as before
        setMode("edit");
        setView("new");
        setActiveTab("overview");
        try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { }
      } else {
        // NON-DRAFT -> open compact read-only modal, keep list in the background
        setMode("readonly");
        setActiveTab("overview");
        setRoViewOpen(true);
      }
    } catch (e: any) {
      const s = e?.response?.status;
      const msg = e?.response?.data?.error || e?.message || "Failed to open WIR";
      alert(`Error ${s ?? ""} ${msg}`);
    }
  };


  // helper: if the single-get is not available, try list as fallback
  const loadWirListIfNeededAndGet = async (id: string) => {
    try {
      const full = await loadWir(projectId, id); // uses the single-get above
      return full;
    } catch {
      // fallback: ensure list is fresh, then return from list
      if (!state.list.length) await reloadWirList();
      return state.list.find(w => String(w.wirId) === String(id)) || {};
    }
  };

  const onBack = () => {
    if (view === "detail" || view === "new") {
      setView("list");
      setSelectedId(null);
      return;
    }
    if (onBackOverride) return onBackOverride();
    navigate(-1);
  };

  // ------ File inputs ------
  const onPickFiles = (key: keyof NewWirForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isRO) return;
    const files = Array.from(e.target.files || []);
    setNewForm(f => ({ ...f, [key]: files }));
  };

  // ------ Checklist Library (stub) ------
  const onAddFromLibrary = async () => {
    // TODO: replace with modal / picker wired to Checklist Library
    // Stub: push a fake checklist id
    setNewForm(f => ({ ...f, pickedChecklistIds: Array.from(new Set([...f.pickedChecklistIds, "chk-001"])) }));
    alert("Checklist ‘Concrete Pouring – Base’ added (stub).");
  };

  // ------ Compliance View Items (stub) ------
  const onViewCompliance = () => {
    // TODO: open a modal showing compliance items for selected checklists
    alert(`Compliance items (stub):\n• Safety Helmets\n• Harnesses\n• Permit-to-Work\n(From ${newForm.pickedChecklistIds.length} checklist(s))`);
  };

  // Build POST/PATCH body from form
  const buildWirPayload = () => ({
    title: newForm.activityLabel || "Inspection Request",
    code: null,
    discipline: newForm.discipline,
    stage: null,
    forDate: newForm.dateISO,       // yyyy-mm-dd
    forTime: newForm.time12h,       // "HH:MM AM/PM"
    cityTown: newForm.location || null,
    stateName: null,
    description: newForm.details || null,
    // For now, map picked checklist ids into simple items (adjust later when real items exist)
    items: (newForm.pickedChecklistIds || []).map((id) => ({
      name: id,
      spec: null,
      required: null,
      tolerance: null,
      photoCount: 0,
      status: "Unknown",
    })),
  });

  const reloadWirList = async () => {
    const { data } = await api.get(`/projects/${projectId}/wir`).catch(async () => {
      return await api.get(`/admin/projects/${projectId}/wir`);
    });
    const arr: any[] = Array.isArray(data) ? data : (Array.isArray(data?.records) ? data.records : []);
    const list: WirRecord[] = arr.map((x) => ({
      wirId: x.wirId ?? x.id,
      code: x.code ?? x.irCode ?? null,
      title: x.title ?? x.name ?? "Inspection Request",
      projectId: x.projectId ?? projectId,
      projectCode: x.project?.code ?? null,
      projectTitle: x.project?.title ?? null,
      status: x.status ?? null,
      health: x.health ?? null,
      discipline: x.discipline ?? null,
      stage: x.stage ?? null,
      forDate: x.forDate ?? x.plannedDate ?? null,
      forTime: x.forTime ?? null,
      cityTown: x.cityTown ?? x.location?.cityTown ?? null,
      stateName: x.state?.name ?? (typeof x.state === "string" ? x.state : null),
      contractorName: x.contractor?.name ?? x.participants?.contractor ?? null,
      inspectorName: x.inspector?.name ?? x.participants?.inspector ?? null,
      hodName: x.hod?.name ?? x.participants?.hod ?? null,
      items: (x.items || []).map((it: any, i: number) => ({
        id: it.id ?? `it-${i}`,
        name: it.name ?? it.title ?? `Item ${i + 1}`,
        spec: it.spec ?? it.specification ?? null,
        required: it.required ?? it.requirement ?? null,
        tolerance: it.tolerance ?? null,
        photoCount: it.photoCount ?? (Array.isArray(it.photos) ? it.photos.length : null),
        status: it.status ?? null,
      })),
      description: x.description ?? x.notes ?? null,
      updatedAt: x.updatedAt ?? x.modifiedAt ?? x.createdAt ?? null,
    }));
    setState({ list, loading: false, error: null });
  };

  // ------ Save/Submit ------
  // ------ Save/Submit ------
  const canSubmit = () => {
    const basicsOk = !!newForm.discipline && !!newForm.dateISO && !!newForm.time12h;
    const hasAtLeastOneChecklist = (newForm.pickedChecklistIds?.length || 0) > 0;

    // If editing an existing Draft (opened from list), allow Submit without activityId.
    // Backend only checks status/role on submit anyway.
    if (selectedId) return basicsOk && hasAtLeastOneChecklist;

    // For brand-new form (no ID yet), keep the stricter rule if you want:
    // (you can drop the activityId here too if desired)
    const hasActivity = !!newForm.activityId;
    return hasActivity && basicsOk && hasAtLeastOneChecklist;
  };

  const onSaveDraft = async () => {
    try {
      const body = buildWirPayload();

      if (!selectedId) {
        // CREATE (Draft)
        const { data } = await api.post(`/projects/${projectId}/wir`, body);
        alert("Draft created.");
        resetNewForm();
        goToList(true);
        return;
      }

      // UPDATE existing Draft
      await api.patch(`/projects/${projectId}/wir/${selectedId}`, body);
      alert("Draft updated.");
      resetNewForm();
      goToList(true);
    } catch (e: any) {
      const s = e?.response?.status;
      const data = e?.response?.data;
      const msg =
        (typeof data === "string" && data) ||
        data?.message ||
        data?.error ||
        e?.message ||
        "Failed";

      console.error("WIR API error:", { status: s, data });
      alert(`Error ${s ?? ""} ${msg}`);
    }
  };

  const onSubmitNew = async () => {
    try {
      if (!canSubmit()) {
        alert("Select activity, discipline, date/time, and at least one checklist to submit.");
        return;
      }

      // If it's a brand new form (no selectedId), create Draft first…
      let id = selectedId;
      if (!id) {
        const { data } = await api.post(`/projects/${projectId}/wir`, buildWirPayload());
        id = String(data?.wirId || data?.id);
        setSelectedId(id || null);
      }

      if (!id) throw new Error("Could not determine WIR ID to submit.");

      // …then submit (lock)
      await api.post(`/projects/${projectId}/wir/${id}/submit`, { role: role || "Contractor" });
      alert("WIR submitted.");
      resetNewForm();     // clear for next
      goToList(true);     // ← back to List (refresh)
    } catch (e: any) {
      const s = e?.response?.status;
      const data = e?.response?.data;
      const msg =
        (typeof data === "string" && data) ||
        data?.message ||
        data?.error ||
        e?.message ||
        "Failed";

      console.error("WIR API error:", { status: s, data });
      alert(`Error ${s ?? ""} ${msg}`);
    }
  };

  // open modal pre-filled with existing selection
  const openChecklistPicker = () => {
    if (isRO) return;
    setClPicked(new Set(newForm.pickedChecklistIds));
    setClLibOpen(true);
  };

  // add/remove inside modal
  const toggleClPick = (id: string) => {
    setClPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // commit selection from modal
  const confirmChecklistPick = () => {
    const ids = Array.from(new Set(clPicked));
    // sort by label for nicer UX
    ids.sort((a, b) => (checklistLabelById.get(a) || a).localeCompare(checklistLabelById.get(b) || b));
    setNewForm(f => ({ ...f, pickedChecklistIds: ids }));
    setClLibOpen(false);
  };

  // remove from already selected list (outside modal)
  const removeChecklist = (id: string) => {
    setNewForm(f => ({ ...f, pickedChecklistIds: f.pickedChecklistIds.filter(x => x !== id) }));
  };

  const openCreateNew = () => {
    setSelectedId(null);
    setMode("create");
    resetNewForm();            // ← full clean slate (keeps passedProject prefill)
    setActiveTab("overview");
    setView("new");
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { }
  };

  /* ======= NEW: Esc-to-close & background scroll lock for RO modal ======= */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && roViewOpen) setRoViewOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [roViewOpen]);

  useEffect(() => {
    if (!roViewOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [roViewOpen]);

  /* ========================= Render ========================= */
  return (
    <section className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border dark:border-neutral-800 p-4 sm:p-5 md:p-6">
      {/* Header (can be hidden when wrapped under a page header) */}
      {!hideTopHeader && (
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg sm:text-xl md:text-2xl font-semibold dark:text-white whitespace-normal break-words">
            {pageHeading}
          </h1>
          <button
            onClick={onBack}
            className="text-sm px-3 py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
          >
            Back
          </button>
        </div>
      )}
      {/* Subheader: project & role chips */}
      {/* Subheader: project & role chips */}
      <div className="mt-2 flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs px-2 py-1 rounded border dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800 dark:text-gray-100">
            {projectLabel}
          </span>
          {role && (
            <span className="text-xs px-2 py-1 rounded-full border dark:border-neutral-800 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
              Role: {role}
            </span>
          )}
        </div>

        {/* KPI Row – show only on List view */}
        {view === "list" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs px-2 py-1 rounded-lg border dark:border-neutral-800 bg-white dark:bg-neutral-900">
              <b>Total:</b> {kpis.total}
            </span>
            <span className="text-xs px-2 py-1 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              <b>Pending:</b> {kpis.pending}
            </span>
            <span className="text-xs px-2 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
              <b>Approved:</b> {kpis.approved}
            </span>
            <span className="text-xs px-2 py-1 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
              <b>Rejected:</b> {kpis.rejected}
            </span>
          </div>
        )}
      </div>

      {/* Search / actions */}
      {view === "list" && (
        <div className="mt-4 flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search IRs by code, title, status, discipline…"
            className="w-full text-sm border rounded-lg px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
          />
          <button
            onClick={onPrimary}
            className="shrink-0 px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-sm"
          >
            {primaryActionLabel}
          </button>
        </div>
      )}

      {/* List */}
      {view === "list" && (
        <div className="mt-4">
          {state.loading && (
            <div className="text-sm text-gray-700 dark:text-gray-300">Loading WIRs…</div>
          )}
          {state.error && !state.loading && (
            <div className="text-sm text-red-700 dark:text-red-400">{state.error}</div>
          )}
          {!state.loading && !state.error && filtered.length === 0 && (
            <div className="text-sm text-gray-600 dark:text-gray-400">No WIRs yet.</div>
          )}

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((w) => (
              <button
                key={w.wirId}
                onClick={() => onOpen(w.wirId)}
                className="group text-left rounded-2xl border dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 sm:p-5 shadow-sm hover:shadow-md transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="h-10 w-10 flex-shrink-0 rounded-xl grid place-items-center bg-emerald-100 text-emerald-700 dark:bg-neutral-800 dark:text-emerald-300">
                    <svg width="20" height="20" viewBox="0 0 24 24" className="fill-current" aria-hidden="true">
                      <path d="M3 21h18v-2H3v2z" />
                      <path d="M5 19h14V8H5v11z" />
                      <path d="M9 10h2v2H9zM9 14h2v2H9zM13 10h2v2h-2zM13 14h2v2h-2z" />
                      <path d="M11 17h2v2h-2z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-base sm:text-lg font-semibold dark:text-white whitespace-normal break-words">
                      {(w.code ? `${w.code} — ` : "") + w.title}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge kind="status" value={w.status} />
                      <Badge kind="health" value={w.health} />
                      {w.discipline && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border bg-gray-50 dark:bg-neutral-800 dark:text-gray-200 dark:border-neutral-700">
                          {w.discipline}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                      {w.forDate ? `For: ${fmtDate(w.forDate)}${w.forTime ? `, ${w.forTime}` : ""}` : ""}
                      {w.updatedAt ? ` · Updated: ${fmtDateTime(w.updatedAt)}` : ""}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ======= CREATE NEW ======= */}
      {view === "new" && (
        <div className="mt-4 grid grid-cols-1 gap-4">
          {/* Tile 1: Projects & References */}
          <SectionCard title="Projects & References">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FieldRow
                label="Project"
                wide
                value={
                  <div className="text-sm">
                    <span className="font-semibold">
                      {(newForm.projectCode ? `${newForm.projectCode} — ` : "") + (newForm.projectTitle || "Project")}
                    </span>
                    <span className="ml-2 text-xs opacity-70">(auto from selection)</span>
                  </div>
                }
              />

              {/* Activity (stub select until wired to Activity Library) */}
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Select Activity</div>

                <select
                  className="mt-1 w-full text-sm border rounded-lg px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800 disabled:opacity-60"
                  value={newForm.activityId || ""}
                  disabled={activities.loading || isRO || activities.error === 'none'} // (no-op flag)
                  onFocus={() => { if (!activities.rows.length && !activities.loading) loadActivities(); }}
                  onClick={() => { if (!activities.rows.length && !activities.loading) loadActivities(); }}
                  onChange={(e) => {
                    const id = e.target.value || null;
                    const picked = visibleActivities.find(a => String(a.id) === String(id)) || null;
                    const label = picked ? [picked.code, picked.title].filter(Boolean).join(': ') : null;
                    setNewForm(f => ({ ...f, activityId: id, activityLabel: label }));
                  }}
                >
                  {!activities.rows.length && !activities.loading && !activities.error && (
                    <option value="">Click to load…</option>
                  )}
                  {activities.loading && <option value="">Loading…</option>}
                  {activities.error && !activities.loading && (
                    <option value="" disabled>{activities.error}</option>
                  )}
                  {!activities.loading && !activities.error && activities.rows.length === 0 && (
                    <option value="" disabled>No activities found</option>
                  )}
                  {visibleActivities.map(a => (
                    <option key={a.id} value={a.id}>
                      {[a.code, a.title].filter(Boolean).join(': ')}{a.discipline ? ` — ${a.discipline}` : ''}
                    </option>
                  ))}
                </select>

                <div className="mt-1 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={loadActivities}
                    className="text-xs px-2 py-1 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                    title="Reload"
                    disabled={activities.loading}
                  >
                    {activities.loading ? 'Loading…' : 'Reload'}
                  </button>
                  {newForm.discipline && (
                    <span className="text-[11px] text-gray-600 dark:text-gray-300">
                      Filtering by discipline: <b>{newForm.discipline}</b>
                    </span>
                  )}
                </div>
              </div>


              {/* Discipline */}
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Select Discipline</div>
                <select
                  className="mt-1 w-full text-sm border rounded-lg px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                  value={newForm.discipline || ""}
                  disabled={isRO}
                  onChange={(e) => setNewForm(f => ({ ...f, discipline: e.target.value || null }))}
                >
                  <option value="">— Select —</option>
                  {DISCIPLINES.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              {/* Date + Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Date</div>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="date"
                      className="w-full text-sm border rounded-lg px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800 disabled:opacity-60"
                      value={newForm.dateISO}
                      disabled={isRO}
                      onChange={(e) => setNewForm(f => ({ ...f, dateISO: e.target.value }))}
                    />
                    <button
                      className="px-2 py-2 rounded border dark:border-neutral-800 disabled:opacity-60"
                      onClick={() => setNewForm(f => ({ ...f, dateISO: todayISO() }))}
                      title="Today"
                      disabled={isRO}
                    >
                      📅
                    </button>

                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Time</div>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      inputMode="text"
                      placeholder="HH:MM AM/PM"
                      className="w-full text-sm border rounded-lg px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800 disabled:opacity-60"
                      value={newForm.time12h}
                      disabled={isRO}
                      onChange={(e) => setNewForm(f => ({ ...f, time12h: e.target.value }))}
                    />
                    <button
                      className="px-2 py-2 rounded border dark:border-neutral-800 disabled:opacity-60"
                      onClick={() => setNewForm(f => ({ ...f, time12h: nowTime12h() }))}
                      title="Now"
                      disabled={isRO}
                    >
                      🕒
                    </button>

                  </div>
                </div>
              </div>

              {/* Location */}
              <div className="md:col-span-2">
                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Location</div>
                <input
                  className="mt-1 w-full text-sm border rounded-lg px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800 disabled:opacity-60"
                  placeholder="Write area/zone (e.g., Block A, Footing F2)"
                  value={newForm.location || ""}
                  disabled={isRO}
                  onChange={(e) => setNewForm(f => ({ ...f, location: e.target.value }))}
                />

              </div>
            </div>
          </SectionCard>

          {/* Tile 2: Work Inspection (details) */}
          <SectionCard title="Work Inspection">
            <textarea
              rows={5}
              className="w-full text-sm border rounded-lg px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800 disabled:opacity-60"
              placeholder="Write inspection details…"
              value={newForm.details}
              disabled={isRO}
              onChange={(e) => setNewForm(f => ({ ...f, details: e.target.value }))}
            />

          </SectionCard>

          {/* Tile 3: Documents and Evidence */}
          <SectionCard title="Documents and Evidence">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Each tile uses a hidden <input type="file"> */}
              {[
                { key: "drawingFiles", label: "Attach Drawing", pill: "Drawing", active: hasDrawing },
                { key: "itpFiles", label: "Attach ITP", pill: "ITP", active: hasITP },
                { key: "otherDocs", label: "Attach Other Document", pill: "Other", active: hasOther },
                { key: "photos", label: "Upload Photos", pill: "Photos", active: hasPhotos, multiple: true, accept: "image/*" },
                { key: "materialApprovalFiles", label: "Material Approval", pill: "MA", active: hasMA },
                { key: "safetyClearanceFiles", label: "Safety Clearance", pill: "Safety", active: hasSafety },
              ].map((t) => {
                const inputId = `wir-${t.key}`;
                return (
                  <label
                    key={t.key}
                    htmlFor={inputId}
                    className={
                      "cursor-pointer rounded-xl border dark:border-neutral-800 p-4 flex items-start gap-3 " +
                      (t.active ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-white dark:bg-neutral-900")
                    }
                  >
                    <input
                      id={inputId}
                      type="file"
                      className="hidden"
                      multiple={!!t.multiple}
                      accept={t.accept as any}
                      disabled={isRO}
                      onChange={onPickFiles(t.key as keyof NewWirForm)}
                    />

                    <div className="h-10 w-10 grid place-items-center rounded-lg bg-gray-100 dark:bg-neutral-800">📎</div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm dark:text-white">{t.label}</div>
                      <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                        {t.active ? "Attached" : "No file selected"}
                      </div>
                      {t.active && (
                        <div className="mt-1">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
                            {t.pill}
                          </span>
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
            {/* Compact pill row (always visible) */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {hasDrawing && <span className="text-[10px] px-1.5 py-0.5 rounded-full border">Drawing</span>}
              {hasITP && <span className="text-[10px] px-1.5 py-0.5 rounded-full border">ITP</span>}
              {hasOther && <span className="text-[10px] px-1.5 py-0.5 rounded-full border">Other</span>}
              {hasPhotos && <span className="text-[10px] px-1.5 py-0.5 rounded-full border">Photos</span>}
              {hasMA && <span className="text-[10px] px-1.5 py-0.5 rounded-full border">MA</span>}
              {hasSafety && <span className="text-[10px] px-1.5 py-0.5 rounded-full border">Safety</span>}
            </div>
          </SectionCard>

          {/* Tile 4: Checklist Library */}
          <SectionCard title="Checklist Library">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (!isRO) {
                    setClPicked(new Set(newForm.pickedChecklistIds));
                    setClLibOpen(true);
                    if (!checklists.rows.length && !checklists.loading) loadChecklists();
                  }
                }}
                className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-sm disabled:opacity-60"
                disabled={isRO}
              >
                {checklists.loading ? "Loading…" : "Add from Library"}
              </button>


              {newForm.discipline && (
                <span className="text-[11px] text-gray-600 dark:text-gray-300">
                  Filtering by discipline: <b>{newForm.discipline}</b>
                </span>
              )}
              {checklists.error && (
                <span className="text-[11px] text-rose-600 dark:text-rose-400">
                  {checklists.error}
                </span>
              )}
            </div>

            {newForm.pickedChecklistIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {newForm.pickedChecklistIds.map(id => {
                  const label = checklistLabelById.get(id) || id;  // fallback to id if not found
                  return (
                    <span key={id} className="text-[11px] px-2 py-1 rounded-full border dark:border-neutral-700 flex items-center gap-1">
                      {label}
                      {!isRO && (
                        <button
                          onClick={() => removeChecklist(id)}
                          className="ml-1 text-xs opacity-70 hover:opacity-100"
                          title="Remove"
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            )}

          </SectionCard>


          {/* Tile 5: Compliance Checklist */}
          <SectionCard title="Compliance Checklist">
            <button
              onClick={onViewCompliance}
              className="px-3 py-2 rounded border dark:border-neutral-800 text-sm hover:bg-gray-50 dark:hover:bg-neutral-800"
            >
              View Items
            </button>
            {newForm.pickedComplianceIds.length > 0 && (
              <div className="mt-2 text-xs text-gray-700 dark:text-gray-300">
                Items: {newForm.pickedComplianceIds.length}
              </div>
            )}
          </SectionCard>

          {/* Actions + Note */}
          <div className="flex flex-wrap items-center gap-3">
            {mode !== "readonly" ? (
              <>
                <button onClick={onSaveDraft} className="px-4 py-2 rounded border dark:border-neutral-800 text-sm hover:bg-gray-50 dark:hover:bg-neutral-800">
                  Save Draft
                </button>
                <button
                  onClick={onSubmitNew}
                  disabled={!canSubmit()}
                  className={
                    "px-4 py-2 rounded text-sm text-white " +
                    (canSubmit() ? "bg-emerald-600 hover:bg-emerald-700" : "bg-emerald-400 cursor-not-allowed")
                  }
                >
                  Submit
                </button>
              </>
            ) : (
              <div className="px-3 py-2 rounded border dark:border-neutral-800 text-sm text-gray-600 dark:text-gray-300">
                Read-only — this WIR is {selected?.status || "Submitted"}.
              </div>
            )}

            {clLibOpen && (
              <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="w-full max-w-2xl rounded-2xl border dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xl">
                  <button
                    onClick={() => {
                      if (!isRO) {
                        setClPicked(new Set(newForm.pickedChecklistIds));
                        setClLibOpen(true);
                        if (!checklists.rows.length && !checklists.loading) loadChecklists();
                      }
                    }}
                    className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-sm disabled:opacity-60"
                    disabled={isRO}
                  >
                    {checklists.loading ? "Loading…" : "Add from Library"}
                  </button>


                  <div className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        value={clQuery}
                        onChange={e => setClQuery(e.target.value)}
                        placeholder="Search by code, title…"
                        className="w-full text-sm border rounded-lg px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
                      />
                      <button
                        onClick={() => setClQuery("")}
                        className="text-xs px-2 py-1 rounded border dark:border-neutral-800"
                      >
                        Clear
                      </button>
                    </div>

                    <div className="max-h-72 overflow-auto rounded border dark:border-neutral-800">
                      {checklists.loading ? (
                        <div className="p-3 text-sm text-gray-600 dark:text-gray-300">Loading…</div>
                      ) : checklists.error ? (
                        <div className="p-3 text-sm text-rose-600 dark:text-rose-400">{checklists.error}</div>
                      ) : visibleChecklists.length === 0 ? (
                        <div className="p-3 text-sm text-gray-600 dark:text-gray-300">No checklists found.</div>
                      ) : (
                        <ul className="divide-y dark:divide-neutral-800">
                          {visibleChecklists.map(c => {
                            const label = [c.code, c.title].filter(Boolean).join(": ");
                            const picked = clPicked.has(c.id);
                            const toggleClPick = (id: string) => {
                              if (isRO) return;
                              setClPicked(prev => {
                                const next = new Set(prev);
                                if (next.has(id)) next.delete(id); else next.add(id);
                                return next;
                              });
                            };

                            const confirmChecklistPick = () => {
                              if (isRO) return;
                              const ids = Array.from(new Set(clPicked));
                              ids.sort((a, b) => (checklistLabelById.get(a) || a).localeCompare(checklistLabelById.get(b) || b));
                              setNewForm(f => ({ ...f, pickedChecklistIds: ids }));
                              setClLibOpen(false);
                            };

                            return (
                              <li key={c.id} className="p-2">
                                <label className="flex items-start gap-3 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={picked}
                                    onChange={() => toggleClPick(c.id)}
                                    className="mt-1"
                                    disabled={isRO}
                                  />
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium dark:text-white truncate">{label || c.id}</div>
                                    <div className="text-xs text-gray-600 dark:text-gray-300">
                                      {c.discipline || "—"} {c.aiDefault ? "• AI Default" : ""}
                                    </div>
                                  </div>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-xs text-gray-600 dark:text-gray-300">
                        Selected: {clPicked.size}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setClPicked(new Set())}
                          className="text-sm px-3 py-2 rounded border dark:border-neutral-800 disabled:opacity-60"
                          disabled={isRO}
                        >
                          Clear Selection
                        </button>
                        <button
                          onClick={confirmChecklistPick}
                          className="text-sm px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
                          disabled={checklists.loading || isRO}
                        >
                          Add Selected
                        </button>

                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="text-xs text-gray-600 dark:text-gray-400">
              Note: Select activity, discipline, date/time, and at least one checklist to submit.
            </div>
          </div>
        </div>
      )}
      {/* ===== Read-only View Modal for Submitted/Locked WIR ===== */}
      {roViewOpen && selected && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-stretch justify-center p-0 sm:p-4"
          onClick={() => setRoViewOpen(false)}
        >
          {/* Panel */}
          <div
            className="relative w-full max-w-3xl h-dvh sm:h-auto sm:max-h-[90dvh] bg-white dark:bg-neutral-900 rounded-none sm:rounded-2xl border dark:border-neutral-800 shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {/* Floating Close (mobile) */}
            <button
              onClick={() => setRoViewOpen(false)}
              aria-label="Close"
              className="sm:hidden fixed right-3 top-3 z-20 rounded-full border dark:border-neutral-700 bg-white/90 dark:bg-neutral-900/90 p-2 shadow"
            >
              ✕
            </button>

            {/* Header (sticky) */}
            <div className="sticky top-0 z-10 p-3 sm:p-4 border-b dark:border-neutral-800 bg-white/95 dark:bg-neutral-900/95 backdrop-blur supports-[backdrop-filter]:bg-white/70">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">
                    {projectLabel}
                  </div>
                  <div className="text-base sm:text-lg font-semibold dark:text-white truncate">
                    {(selected.code ? `${selected.code} — ` : "") + (selected.title || "Inspection Request")}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge kind="status" value={selected.status} />
                  <Badge kind="health" value={selected.health} />
                  <button
                    onClick={() => setRoViewOpen(false)}
                    className="text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>

            {/* Body (scrollable) */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
              {/* Overview */}
              <SectionCard title="Overview">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FieldRow label="Discipline" value={selected.discipline || "—"} />
                  <FieldRow label="Stage" value={selected.stage || "—"} />
                  <FieldRow
                    label="Scheduled For"
                    value={
                      selected.forDate
                        ? `${fmtDate(selected.forDate)}${selected.forTime ? `, ${selected.forTime}` : ""}`
                        : "—"
                    }
                  />
                  <FieldRow label="Updated" value={selected.updatedAt ? fmtDateTime(selected.updatedAt) : "—"} />
                </div>
              </SectionCard>

              {/* Location */}
              <SectionCard title="Location">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FieldRow label="City/Town" value={selected.cityTown || "—"} />
                  <FieldRow label="State" value={selected.stateName || "—"} />
                </div>
              </SectionCard>

              {/* People */}
              <SectionCard title="People">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <FieldRow label="Contractor" value={selected.contractorName || "—"} />
                  <FieldRow label="Inspector" value={selected.inspectorName || "—"} />
                  <FieldRow label="HOD" value={selected.hodName || "—"} />
                </div>
              </SectionCard>

              {/* Description */}
              <SectionCard title="Description">
                <div className="text-sm dark:text-white whitespace-pre-wrap">
                  {newForm.details || selected.description || "—"}
                </div>
              </SectionCard>

              {/* Items */}
              <SectionCard title="Items">
                {Array.isArray(selected.items) && selected.items.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2">
                    {selected.items.map((it) => (
                      <div
                        key={it.id}
                        className="rounded-lg border dark:border-neutral-800 p-3 text-sm dark:text-white"
                      >
                        <div className="font-medium">
                          {checklistLabelById.get(it.name || it.id) || it.name || it.id}
                        </div>
                        <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                          {[
                            it.spec ? `Spec: ${it.spec}` : "",
                            it.required ? `Req: ${it.required}` : "",
                            it.tolerance ? `Tol: ${it.tolerance}` : "",
                            typeof it.photoCount === "number" ? `Photos: ${it.photoCount}` : "",
                            it.status ? `Status: ${it.status}` : "",
                          ]
                            .filter(Boolean)
                            .join(" • ")}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-600 dark:text-gray-300">No items.</div>
                )}
              </SectionCard>

              {/* Checklists (from form mapping) */}
              <SectionCard title="Checklists">
                {newForm.pickedChecklistIds.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {newForm.pickedChecklistIds.map((id) => {
                      const label = checklistLabelById.get(id) || id;
                      return (
                        <span
                          key={id}
                          className="text-[11px] px-2 py-1 rounded-full border dark:border-neutral-700"
                        >
                          {label}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-gray-600 dark:text-gray-300">No checklists selected.</div>
                )}
              </SectionCard>
            </div>

            {/* Footer (sticky) */}
            <div className="sticky bottom-0 z-10 p-3 sm:p-4 border-t dark:border-neutral-800 bg-white/95 dark:bg-neutral-900/95 backdrop-blur supports-[backdrop-filter]:bg-white/70">
              <div className="flex items-center justify-end">
                <button
                  onClick={() => setRoViewOpen(false)}
                  className="text-sm px-3 py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800 w-full sm:w-auto"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </section>

  );

}
