// pms-frontend/src/views/admin/ref/activitylib/ActivityLib.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "../../../../api/client";


/* ========================= JWT helper (same as other admin screens) ========================= */
function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
    return JSON.parse(atob(b64 + pad));
  } catch {
    return null;
  }
}

/* ========================= Enums (align with Prisma) ========================= */
const DISCIPLINES = ["Civil", "MEP", "Finishes"] as const;
type Discipline = typeof DISCIPLINES[number];

const STATUS_OPTIONS = ["Active", "Draft", "Inactive", "Archived"] as const;
type ActivityStatus = typeof STATUS_OPTIONS[number];

/* Stage library (borrowed from the HTML prototype) */
const STAGE_LIBRARY: Record<string, string[]> = {
  Civil: [
    "Structural • Foundation",
    "Structural • Footing",
    "Structural • Column",
    "Structural • Beam",
    "Structural • Slab",
    "Structural • Staircase",
    "Masonry • Blockwork",
    "Masonry • Brickwork",
    "Plaster • Internal",
    "Plaster • External",
  ],
  MEP: [
    "Services • Electrical",
    "Services • Lighting",
    "Services • Conduits / Wiring",
    "Services • Plumbing",
    "Services • Drainage",
    "Services • Firefighting",
    "Services • HVAC",
    "Services • Earthing",
    "Services • BMS",
  ],
  Finishes: [
    "Finishes • Flooring",
    "Finishes • Tiling",
    "Finishes • Skirting",
    "Finishes • Painting",
    "Finishes • False Ceiling",
    "Finishes • Doors",
    "Finishes • Windows",
    "Finishes • Waterproofing",
  ],
};

/* Tag facets lifted from prototype; map to string[] columns in Prisma */
const FACETS = {
  System: [
    "SYS.ELE.LV",
    "SYS.ELE.ELV.CCTV",
    "SYS.PHE.WSUP",
    "SYS.PHE.DRAIN",
    "SYS.HVC.DUCT",
    "SYS.FLS.SPRINKLER",
    "SYS.SOLAR.PV",
  ],
  Nature: [
    "NAT.INSTALL",
    "NAT.INSPECT",
    "NAT.TEST",
    "NAT.POUR",
    "NAT.COMMISSION",
    "NAT.DOCUMENT",
    "NAT.CLEAN",
  ],
  Method: [
    "MET.CAST_IN_SITU",
    "MET.PRECAST",
    "MET.POST_TENSION",
    "MET.AAC_BLOCK",
    "MET.RAIL_MOUNT",
    "MET.BOLTED_SUPPORT",
  ],
  Phase: [
    "Substructure",
    "Superstructure",
    "Services",
    "Finishes",
    "Commissioning",
  ],
  Element: [
    "Footing",
    "Column",
    "Beam",
    "Slab",
    "Wall",
    "Staircase",
    "Door",
    "Window",
    "Duct",
    "Pipe",
  ],
};

/* ========================= Types ========================= */
export type RefActivity = {
  id: string;
  code: string | null; // optional unique
  title: string;
  discipline: Discipline;
  stageLabel: string | null; // nullable
  phase?: string[];
  element?: string[];
  system: string[];
  nature: string[];
  method: string[];
  version: number; // numeric in schema; UI uses text box but coerces to number
  versionLabel?: string | null;
  notes: string | null;
  status: ActivityStatus; // Active | Draft | Inactive | Archived
  updatedAt: string; // ISO
  createdAt?: string;
};

/* Minimal list item type to render table rows */
type ActivityLite = RefActivity;

/* Query params / server payload helpers */
type ListResp = { items: ActivityLite[]; total: number } | ActivityLite[];

/* ========================= Component ========================= */
export default function ActivityLib() {
  const location = useLocation();
  const nav = useNavigate();

  /* ---- Admin gate ---- */
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      nav("/login", { replace: true });
      return;
    }
    const payload = decodeJwtPayload(token);
    const isAdmin = !!(
      payload &&
      (payload.isSuperAdmin ||
        payload.role === "Admin" ||
        payload.userRole === "Admin")
    );
    if (!isAdmin) nav("/landing", { replace: true });
  }, [nav]);

  /* ---- List state ---- */
  const [q, setQ] = useState("");
  const [discipline, setDiscipline] = useState<Discipline | "">("");
  const [stage, setStage] = useState<string>("");
  const [status, setStatus] = useState<ActivityStatus | "">("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [rows, setRows] = useState<ActivityLite[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  /* ---- Editor / View state ---- */
  const emptyForm: Partial<RefActivity> = {
    id: "",
    code: "",
    title: "",
    discipline: "Civil",
    stageLabel: "",
    phase: [],
    element: [],
    system: [],
    nature: [],
    method: [],
    version: 1,
    versionLabel: "1.0.0",
    notes: "",
    status: "Draft",
    updatedAt: new Date().toISOString(),
  };

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<RefActivity> | null>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewItem, setViewItem] = useState<ActivityLite | null>(null);

  const openView = (row: ActivityLite) => {
    setViewItem(row);
    setViewOpen(true);
  };
  const closeView = () => {
    setViewOpen(false);
    setViewItem(null);
  };

  const isNew = !editing?.id;
  const canSave = useMemo(
    () => !!(editing && editing.title && editing.discipline),
    [editing?.title, editing?.discipline]
  );

  type ActivityStats = {
    total: number;
    byStatus: Record<ActivityStatus, number>;
  };

  const defaultStats: ActivityStats = {
    total: 0,
    byStatus: { Active: 0, Draft: 0, Inactive: 0, Archived: 0 },
  };

  const [stats, setStats] = useState<ActivityStats>(defaultStats);
  const [statsLoading, setStatsLoading] = useState(false);

  /* ---- Sorting (client-side) ---- */
  type SortKey =
    | "activity"
    | "discStage"
    | "phase"
    | "element"
    | "system"
    | "nature"
    | "method"
    | "version"
    | "updated"
    | "status";

  const [sortBy, setSortBy] = useState<SortKey>("updated");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const firstOrDash = (arr?: string[]) => (arr && arr.length ? arr[0] : "—");
  const cmp = (a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0);

  const statusCounts = useMemo(() => {
    const base = { Active: 0, Draft: 0, Inactive: 0, Archived: 0 } as Record<ActivityStatus, number>;
    for (const r of rows) {
      if (r.status in base) base[r.status as ActivityStatus] += 1;
    }
    return base;
  }, [rows]);

  function parseParts(v?: string | number | null) {
  const s = v == null ? "" : String(v);
  const m = s.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
  if (!m) return [0, 0, 0];
  return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)];
}

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((A, B) => {
      let av: any = "";
      let bv: any = "";
      switch (sortBy) {
        case "activity":
          av = (A.code ? `${A.code} • ` : "") + (A.title || "");
          bv = (B.code ? `${B.code} • ` : "") + (B.title || "");
          break;
        case "discStage":
          av = `${A.discipline} • ${A.stageLabel ?? ""}`;
          bv = `${B.discipline} • ${B.stageLabel ?? ""}`;
          break;
        case "phase":
          av = firstOrDash(A.phase);
          bv = firstOrDash(B.phase);
          break;
        case "element":
          av = firstOrDash(A.element);
          bv = firstOrDash(B.element);
          break;
        case "system":
          av = firstOrDash(A.system);
          bv = firstOrDash(B.system);
          break;
        case "nature":
          av = firstOrDash(A.nature);
          bv = firstOrDash(B.nature);
          break;
        case "method":
          av = firstOrDash(A.method);
          bv = firstOrDash(B.method);
          break;
        case "version": {
  const [a1, a2, a3] = parseParts((A as any).versionLabel ?? A.version);
  const [b1, b2, b3] = parseParts((B as any).versionLabel ?? B.version);
  av = a1 * 1e6 + a2 * 1e3 + a3;
  bv = b1 * 1e6 + b2 * 1e3 + b3;
  break;
}
        case "updated":
          av = new Date(A.updatedAt || 0).getTime();
          bv = new Date(B.updatedAt || 0).getTime();
          break;
        case "status":
          av = A.status || "";
          bv = B.status || "";
          break;
      }
      const res = cmp(av, bv);
      return sortDir === "asc" ? res : -res;
    });
    return copy;
  }, [rows, sortBy, sortDir]);

  const requestSort = (key: SortKey) => {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortDir("asc");
    }
  };

  /* ========================= API ========================= */
  const fetchList = async () => {
    setErr(null);
    setLoading(true);
    try {
      const { data } = await api
        .get("/admin/ref/activities", {
          params: { q, discipline, stageLabel: stage, status, page, pageSize },
        })
        .catch(async (e: any) => {
          // Fallback to GET all without pagination if backend doesn’t support it
          if (e?.response?.status === 404) {
            const { data: all } = await api.get("/admin/ref/activities");
            return { data: all };
          }
          throw e;
        });

      let items: ActivityLite[] = [];
      let ttl = 0;
      if (Array.isArray(data)) {
        items = data;
        ttl = data.length;
      } else {
        items = Array.isArray((data as any).items) ? (data as any).items : [];
        ttl =
          typeof (data as any).total === "number"
            ? (data as any).total
            : items.length;
      }

      setRows(items);
      setTotal(ttl);
    } catch (e: any) {
      setRows([]);
      setTotal(0);
      setErr(
        e?.response?.data?.error ||
        e?.message ||
        "Failed to load activities."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, discipline, stage, status, page, pageSize]);

  const fetchStats = async () => {
  setStatsLoading(true);
  try {
    const { data } = await api.get("/admin/ref/activitylib/stats");
    // Defensive merge (in case backend adds fields later)
    setStats({
      total: Number(data?.total ?? 0),
      byStatus: {
        Active: Number(data?.byStatus?.Active ?? 0),
        Draft: Number(data?.byStatus?.Draft ?? 0),
        Inactive: Number(data?.byStatus?.Inactive ?? 0),
        Archived: Number(data?.byStatus?.Archived ?? 0),
      },
    });
  } catch (e) {
    // keep silent on UI; optional: surface a toast if you have one
    setStats(defaultStats);
  } finally {
    setStatsLoading(false);
  }
};

useEffect(() => {
  fetchStats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

  const fetchOne = async (id: string): Promise<RefActivity | null> => {
    try {
      const { data } = await api.get(`/admin/ref/activities/${id}`);
      return data;
    } catch {
      return null;
    }
  };

  const handleSave = async (payloadFromChild: Partial<RefActivity>) => {
    // const payload: any = normalizeForSubmit(payloadFromChild);
    // Ensure tag arrays are always present before normalizing (covers "Create" flow)
    const payload: any = normalizeForSubmit({
      ...payloadFromChild,
      phase: Array.isArray(payloadFromChild.phase)
        ? payloadFromChild.phase
        : [],
      element: Array.isArray(payloadFromChild.element)
        ? payloadFromChild.element
        : [],
      system: Array.isArray(payloadFromChild.system) ? payloadFromChild.system : [],
      nature: Array.isArray(payloadFromChild.nature) ? payloadFromChild.nature : [],
      method: Array.isArray(payloadFromChild.method) ? payloadFromChild.method : [],
    });
    setErr(null);
    setSaving(true);
    try {
      if (!payloadFromChild.id) {
        await api.post("/admin/ref/activities", payload);
      } else {
        await api.patch(`/admin/ref/activities/${payloadFromChild.id}`, payload);
      }
      setEditorOpen(false);
      setEditing(emptyForm);
      await fetchList();
    } catch (e: any) {
      const s = e?.response?.status;
      const msg =
        s === 401
          ? "Unauthorized (401). Please sign in again."
          : e?.response?.data?.error || e?.message || "Failed to save activity.";
      setErr(msg);
      if (s === 401) {
        localStorage.removeItem("token");
        setTimeout(() => nav("/login", { replace: true }), 250);
      }
    } finally {
      setSaving(false);
    }
  };

  /* ========================= Helpers ========================= */
  function normalizeForSubmit(p: Partial<RefActivity>) {
  const out: any = {};
  const copyFields = [
    "code","title","discipline","stageLabel",
    "phase","element","system","nature","method",
    "notes","status"
  ];
  copyFields.forEach((k) => (out[k] = (p as any)[k]));

  // arrays
  ["system","nature","method","phase","element"].forEach((k) => {
    out[k] = Array.isArray(out[k]) ? out[k] : [];
  });

  // strings
  ["code","title","stageLabel","notes"].forEach((k) => {
    if (out[k] != null) out[k] = String(out[k]).trim();
  });

  // NEW: pass versionLabel (preferred by backend)
  const vl = (p as any).versionLabel;
  out.versionLabel = typeof vl === "string" ? vl.trim() : (p.version != null ? String(p.version) : null);

  // Keep legacy version as fallback (backend still accepts it)
  const vNum = Number((p as any).version);
  out.version = Number.isFinite(vNum) ? vNum : 1;

  if (out.code === "") out.code = null;
  if (out.stageLabel === "") out.stageLabel = null;
  if (!STATUS_OPTIONS.includes(out.status)) out.status = "Draft";

  return out;
}


  const openNew = () => {
    // setEditing({ ...emptyForm, id: "" });
    // setEditorOpen(true);
    nav("/admin/ref/activitylib/new");
  };

  const openEdit = async (id: string) => {
    // const one = await fetchOne(id);
    // if (!one) return;
    // setEditing({ ...one });
    // setEditorOpen(true);
    // Navigate to the route-based editor
    nav(`/admin/ref/activitylib/${id}/edit`);
  };

  const setEdit = <K extends keyof RefActivity>(key: K, val: RefActivity[K]) =>
    setEditing((f) => ({ ...(f || {}), [key]: val }));
  //const asChip = (arr?: string[]) => (arr && arr.length ? arr[0] : "—");
  const asList = (arr?: string[]) => (arr && arr.length ? arr.join(", ") : "—");

  const clearFilters = () => {
    setQ("");
    setDiscipline("");
    setStage("");
    setStatus("");
    setPage(1);
  };

  const refresh = () => {fetchList();  fetchStats();};


  const exportCsv = () => {
    // Columns shown in table, in the same order
    const header = [
      "Activity",
      "Discipline • Stage",
      "Phase",
      "Element",
      "System",
      "Nature",
      "Method",
      "Version",
      "Updated",
      "Status",
      "Id",
    ];

    const rowsToExport = sortedRows.map((r) => [
      r.code ? `${r.code} • ${r.title}` : r.title,
      `${r.discipline} • ${r.stageLabel || "—"}`,
      (r.phase || []).join("|"),
      (r.element || []).join("|"),
      (r.system || []).join("|"),
      (r.nature || []).join("|"),
      (r.method || []).join("|"),
`v${(r as any).versionLabel ?? r.version}`,
      fmt(r.updatedAt),
      r.status,
      r.id,
    ]);

    const escapeCsv = (v: string) =>
      /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

    const csv =
      header.map(escapeCsv).join(",") +
      "\n" +
      rowsToExport.map((row) => row.map(escapeCsv).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const date = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.download = `activity-lib-${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* ========================= UI ========================= */
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-indigo-50 dark:from-neutral-900 dark:to-neutral-950 px-4 sm:px-6 lg:px-10 py-8">
      <div className="mx-auto max-w-7xl">
        {/* Header (Users.tsx-like: title + actions to the right) */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold dark:text-white">Activity Library</h1>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Reusable activities that power inspections and workflows.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="px-3 py-2 rounded border text-sm hover:bg-gray-50 dark:border-neutral-800 dark:hover:bg-neutral-800"
              onClick={refresh}
              type="button"
              title="Refresh"
            >
              Refresh
            </button>
            <button
              className="px-3 py-2 rounded border text-sm hover:bg-gray-50 dark:border-neutral-800 dark:hover:bg-neutral-800"
              onClick={exportCsv}
              type="button"
              title="Export CSV"
            >
              Export CSV
            </button>
            <button
              className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-sm"
              onClick={openNew}
              type="button"
              title="Create Activity"
            >
              + Create
            </button>
          </div>
        </div>

        {err && (
          <div className="mb-4 p-3 rounded-lg text-sm text-red-700 bg-red-50 dark:bg-red-950/30 dark:text-red-300 border border-red-200 dark:border-red-900">
            {err}
          </div>
        )}

        {/* KPIs (global, ignore pagination/filters) */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
          <div className="rounded-2xl bg-white dark:bg-neutral-900 border dark:border-neutral-800 p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Active</div>
            <div className="mt-1 text-2xl font-semibold dark:text-white">
              {statsLoading ? "…" : stats.byStatus.Active}
            </div>
          </div>
          <div className="rounded-2xl bg-white dark:bg-neutral-900 border dark:border-neutral-800 p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Draft</div>
            <div className="mt-1 text-2xl font-semibold dark:text-white">
      {statsLoading ? "…" : stats.byStatus.Draft}
              </div>
          </div>
          <div className="rounded-2xl bg-white dark:bg-neutral-900 border dark:border-neutral-800 p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Inactive</div>
            <div className="mt-1 text-2xl font-semibold dark:text-white">
      {statsLoading ? "…" : stats.byStatus.Inactive}
              </div>
          </div>
          <div className="rounded-2xl bg-white dark:bg-neutral-900 border dark:border-neutral-800 p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Archived</div>
            <div className="mt-1 text-2xl font-semibold dark:text-white">
      {statsLoading ? "…" : stats.byStatus.Archived}
              </div>
          </div>
        </div>

        {/* Filters (Users-style: tidy grid + Clear) */}
        <Section title="Find">
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
            <Input
              label="Search"
              value={q}
              onChange={setQ}
              placeholder="id, code, title, stage…"
            />
            <SelectStrict
              label="Discipline"
              value={discipline}
              onChange={(v) => {
                setDiscipline(v as Discipline | "");
                setStage("");
                setPage(1);
              }}
              options={["", ...DISCIPLINES].map((d) => ({
                value: d as any,
                label: d || "All",
              }))}
            />
            <SelectStrict
              label="Stage"
              value={stage}
              onChange={(v) => {
                setStage(v);
                setPage(1);
              }}
              options={[
                "",
                ...(discipline
                  ? STAGE_LIBRARY[discipline] || []
                  : Object.values(STAGE_LIBRARY).flat()),
              ].map((s) => ({ value: s, label: s || "All" }))}
            />
            <SelectStrict
              label="Status"
              value={status}
              onChange={(v) => {
                setStatus(v as ActivityStatus | "");
                setPage(1);
              }}
              options={["", ...STATUS_OPTIONS].map((s) => ({
                value: s as any,
                label: s || "All",
              }))}
            />
            <div className="flex items-end">
              <button
                className="w-full px-3 py-2 rounded border text-sm hover:bg-gray-50 dark:border-neutral-800 dark:hover:bg-neutral-800"
                onClick={clearFilters}
                type="button"
                title="Clear filters"
              >
                Clear
              </button>
            </div>
          </div>
        </Section>

        {/* Table */}
        <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">
          {loading ? "Loading…" : `${total} item${total === 1 ? "" : "s"}`}
        </div>

        {/* Scroll wrapper gives BOTH horizontal and vertical scroll */}
        <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border dark:border-neutral-800 overflow-hidden">
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full min-w-[1400px] text-sm table-fixed [word-break:break-word] [overflow-wrap:anywhere]">
              <colgroup>
                <col className="w-[140px]" />  {/* Actions */}
                <col className="w-[300px]" />   {/* Activity column width (adjust as you like) */}
                <col span={9} />               {/* the rest of the columns */}
              </colgroup>

              <thead className="bg-gray-50 dark:bg-neutral-900/60 sticky top-0 z-10">
                <tr className="text-left text-[12px] uppercase tracking-wide text-gray-600 dark:text-gray-400">
                  <th className="px-3 py-2 sticky left-0 bg-white dark:bg-neutral-900">Actions</th>

                  <Th
                    className="w-[320px]"
                    onClick={() => requestSort("activity")}
                    active={sortBy === "activity"}
                    dir={sortDir}
                  >
                    Activity
                  </Th>
                  <Th onClick={() => requestSort("discStage")} active={sortBy === "discStage"} dir={sortDir}>
                    Discipline • Stage
                  </Th>
                  <Th onClick={() => requestSort("phase")} active={sortBy === "phase"} dir={sortDir}>
                    Phase
                  </Th>
                  <Th onClick={() => requestSort("element")} active={sortBy === "element"} dir={sortDir}>
                    Element
                  </Th>
                  <Th onClick={() => requestSort("system")} active={sortBy === "system"} dir={sortDir}>
                    System
                  </Th>
                  <Th onClick={() => requestSort("nature")} active={sortBy === "nature"} dir={sortDir}>
                    Nature
                  </Th>
                  <Th onClick={() => requestSort("method")} active={sortBy === "method"} dir={sortDir}>
                    Method
                  </Th>
                  <Th onClick={() => requestSort("version")} active={sortBy === "version"} dir={sortDir}>
                    Version
                  </Th>
                  <Th onClick={() => requestSort("updated")} active={sortBy === "updated"} dir={sortDir}>
                    Updated
                  </Th>
                  <Th onClick={() => requestSort("status")} active={sortBy === "status"} dir={sortDir}>
                    Status
                  </Th>
                </tr>
              </thead>

              <tbody>
                {sortedRows.map((r) => (
                  <tr key={r.id} className="border-t dark:border-neutral-800">
                    {/* Actions FIRST */}
                    <td className="px-3 py-2 sticky left-0 bg-white dark:bg-neutral-900">
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="px-2 py-1 rounded border text-xs hover:bg-gray-50 dark:border-neutral-800 dark:hover:bg-neutral-800"
                          onClick={() => openView(r)}
                        >
                          View
                        </button>
                        <button
                          className="px-2 py-1 rounded border text-xs hover:bg-gray-50 dark:border-neutral-800 dark:hover:bg-neutral-800"
                          onClick={() => openEdit(r.id)}
                        >
                          Edit
                        </button>
                      </div>
                    </td>

                    {/* Activity */}
                    <td className="px-3 py-2 w-[300px] max-w-[300px]">
                      <div className="font-semibold line-clamp-2 break-words">
                        {r.code ? `${r.code} • ${r.title}` : r.title}
                      </div>
                    </td>

                    {/* Discipline • Stage */}
                    <td className="px-3 py-2">
                      {r.discipline} • {r.stageLabel || "—"}
                    </td>

                    {/* Phase / Element */}
                    <td className="px-3 py-2">{asList(r.phase)}</td>
                    <td className="px-3 py-2">{asList(r.element)}</td>

                    {/* System / Nature / Method */}
                    <td className="px-3 py-2">{asList(r.system)}</td>
                    <td className="px-3 py-2">{asList(r.nature)}</td>
                    <td className="px-3 py-2">{asList(r.method)}</td>

                    {/* Version / Updated / Status */}
<td className="px-3 py-2">v{(r as any).versionLabel ?? r.version}</td>
                    <td className="px-3 py-2">{fmt(r.updatedAt)}</td>
                    <td className="px-3 py-2">
                      <StatusPill value={r.status} />
                    </td>
                  </tr>
                ))}
                {!sortedRows.length && !loading && (
                  <tr>
                    {/* still 11 columns total, so colspan stays 11 */}
                    <td className="px-3 py-6 text-center text-gray-500" colSpan={11}>
                      No activities found.
                    </td>
                  </tr>
                )}
              </tbody>

            </table>
          </div>
        </div>

        {/* Pagination (Users-style: left info, right controls) */}
        <div className="flex items-center justify-between mt-3 text-sm">
          <div className="text-gray-600 dark:text-gray-400">
            Page {page} / {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1 rounded border dark:border-neutral-800 disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <button
              className="px-3 py-1 rounded border dark:border-neutral-800 disabled:opacity-50"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
            <select
              className="px-2 py-1 rounded border dark:border-neutral-800"
              value={pageSize}
              onChange={(e) => {
                setPageSize(parseInt(e.target.value, 10));
                setPage(1);
              }}
            >
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}/page
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* View Modal */}
      {/* View Modal (Users.tsx-style centered dialog) */}
      {viewOpen && viewItem && (
        <div className="fixed inset-0 z-50">
          {/* overlay */}
          <div className="absolute inset-0 bg-black/40" onClick={closeView} aria-hidden="true" />
          {/* card */}
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-neutral-900 border dark:border-neutral-800 shadow-xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b dark:border-neutral-800">
                <div className="flex flex-col">
                  <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Activity
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold dark:text-white">
                      {viewItem.code ? `${viewItem.code} • ${viewItem.title}` : viewItem.title}
                    </h3>
                    {viewItem.discipline ? (
                      <span
                        className="text-xs px-2 py-0.5 rounded border dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 text-gray-700 dark:text-gray-200"
                        title="Discipline"
                      >
                        {viewItem.discipline}
                      </span>
                    ) : null}
                    {viewItem.status ? (
                      <span className="text-xs">
                        <StatusPill value={viewItem.status} />
                      </span>
                    ) : null}
                  </div>
                </div>

                <button
                  className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50 dark:hover:bg-neutral-800"
                  onClick={closeView}
                >
                  Close
                </button>
              </div>

              {/* Body */}
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <KV k="Code" v={viewItem.code || "—"} />
                <KV k="Title" v={viewItem.title || "—"} />
                <KV k="Discipline • Stage" v={`${viewItem.discipline} • ${viewItem.stageLabel || "—"}`} />
                <KV k="Phase" v={viewItem.phase?.join(", ") || "—"} />
                <KV k="Element" v={viewItem.element?.join(", ") || "—"} />
                <KV k="System" v={viewItem.system?.join(", ") || "—"} />
                <KV k="Nature" v={viewItem.nature?.join(", ") || "—"} />
                <KV k="Method" v={viewItem.method?.join(", ") || "—"} />
<KV k="Version" v={`v${(viewItem as any).versionLabel ?? (viewItem.version ?? 1)}`} />
                <KV k="Updated" v={fmt(viewItem.updatedAt)} />
                <KV k="Status" v={<StatusPill value={viewItem.status} />} />
                <div className="sm:col-span-2">
                  <KV k="Notes" v={viewItem.notes || "—"} />
                </div>
              </div>

              {/* Footer */}
              <div className="px-4 py-3 border-t dark:border-neutral-800 text-right">
                <button
                  className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={closeView}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Editor Modal (UserEdit.tsx-style via ActivityLibEdit)
      <ActivityLibEdit
        open={editorOpen}
        initial={editing || undefined}
        saving={saving}
        onClose={() => setEditorOpen(false)}
        onSave={handleSave}
      />
 */}

    </div>
  );
}

/* ========================= Small UI bits (kept consistent) ========================= */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border dark:border-neutral-800 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-3">
        {title}
      </div>
      {children}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
        {label}
      </span>
      <input
        className="w-full px-3 py-2 rounded-md border dark:border-neutral-800 dark:bg-neutral-900 dark:text-white focus:outline-none focus:ring"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
        {label}
      </span>
      <textarea
        className="w-full px-3 py-2 rounded-md border dark:border-neutral-800 dark:bg-neutral-900 dark:text-white focus:outline-none focus:ring resize-y"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
      />
    </label>
  );
}

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
      <span className="block text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
        {label}
      </span>
      <select
        className="w-full px-3 py-2 rounded-md border dark:border-neutral-800 dark:bg-neutral-900 dark:text-white focus:outline-none focus:ring"
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

function StatusPill({ value }: { value: ActivityStatus }) {
  const cls =
    value === "Active"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-300 dark:border-emerald-900"
      : value === "Draft"
        ? "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/20 dark:text-sky-300 dark:border-sky-900"
        : value === "Inactive"
          ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-300 dark:border-amber-900"
          : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-300 dark:border-rose-900";
  return (
    <span className={`inline-block px-2 py-0.5 rounded border text-xs ${cls}`}>
      {value}
    </span>
  );
}

function TagPicker({
  label,
  all,
  selected,
  onChange,
}: {
  label: string;
  all: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (v: string) => {
    const has = selected.includes(v);
    const next = has ? selected.filter((x) => x !== v) : [...selected, v];
    onChange(next);
  };
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
        {label}
      </div>
      <div className="flex flex-wrap gap-2">
        {all.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => toggle(v)}
            className={`px-2 py-1 rounded-full border text-xs ${selected.includes(v)
              ? "bg-neutral-900 text-white border-neutral-800 dark:bg-white dark:text-neutral-900"
              : "hover:bg-gray-50 dark:hover:bg-neutral-800 dark:border-neutral-800"
              }`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

function fmt(iso?: string) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso!;
  }
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-3">
      <div className="text-gray-500 dark:text-gray-400">{k}</div>
      <div className="dark:text-white">{v}</div>
    </div>
  );
}

const SortIcon = ({ active, dir }: { active: boolean; dir: "asc" | "desc" }) => (
  <span className="inline-block ml-1 text-[10px] opacity-70">
    {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
  </span>
);

function Th({
  children,
  onClick,
  active,
  dir,
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: "asc" | "desc";
  className?: string;
}) {
  return (
    <th className={`px-3 py-2 ${className}`}>
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-1 select-none hover:underline"
        title="Sort"
      >
        <span>{children}</span>
        <SortIcon active={active} dir={dir} />
      </button>
    </th>
  );
}
