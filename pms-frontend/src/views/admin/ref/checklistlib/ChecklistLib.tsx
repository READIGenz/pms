// pms-frontend/src/views/admin/ref/checklist/ChecklistLib.tsx

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "../../../../api/client";

/* ========================= JWT helper ========================= */
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

/* ========================= Enums / Constants ========================= */
const DISCIPLINES = ["Civil", "MEP", "Finishes"] as const;
type Discipline = typeof DISCIPLINES[number];

const STATUS_OPTIONS = ["Active", "Draft", "Inactive", "Archived"] as const;
type ChecklistStatus = typeof STATUS_OPTIONS[number];

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
    Architecture: [
        "Architecture • Design",
        "Architecture • External Works",
        "Architecture • Interiors",
    ],
};

const itemsCount = (r: ChecklistLite) =>
    Number(
        (r as any).itemsCount ??
        (r as any)._count?.items ??
        (Array.isArray(r.items) ? r.items.length : 0)
    );

/* ========================= Types ========================= */
export type RefChecklist = {
    id: string;
    code: string | null;          // prisma has code: String @unique
    title: string;                // prisma: title
    discipline: Discipline;       // prisma: Discipline
    stageLabel: string | null;    // prisma: stageLabel
    tags?: string[] | null;       // prisma: tags (string[])
    status: ChecklistStatus;      // prisma: status
    version: number | null;       // prisma: Int @default(1)
    // tolerant extras so UI can show 1.2.3 if backend adds them later:

    versionLabel?: string | null;
    versionMajor?: number | null;
    versionMinor?: number | null;
    versionPatch?: number | null;
    items?: Array<any> | null;    // when backend expands relation
    itemsCount?: number | null;   // or when backend sends count only
    _count?: { items?: number } | null;
    aiDefault?: boolean | null;   // optional UI flag (HTML prototype)
    updatedAt: string;            // prisma: updatedAt
    createdAt?: string;
};

type ChecklistLite = RefChecklist;
type ListResp = { items: ChecklistLite[]; total: number } | ChecklistLite[];

/* ========================= Small UI bits ========================= */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="mb-6 bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border dark:border-neutral-800 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-3">{title}</div>
            {children}
        </div>
    );
}

function StatusPill({ value }: { value: ChecklistStatus }) {
    const cls =
        value === "Active"
            ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-300 dark:border-emerald-900"
            : value === "Draft"
                ? "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/20 dark:text-sky-300 dark:border-sky-900"
                : value === "Inactive"
                    ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-300 dark:border-amber-900"
                    : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-300 dark:border-rose-900";
    return <span className={`inline-block px-2 py-0.5 rounded border text-xs ${cls}`}>{value}</span>;
}

const SortIcon = ({ active, dir }: { active: boolean; dir: "asc" | "desc" }) => (
    <span className="inline-block ml-1 text-[10px] opacity-70">{active ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
);

function Th({ children, onClick, active, dir, className = "" }: {
    children: React.ReactNode; onClick: () => void; active: boolean; dir: "asc" | "desc"; className?: string;
}) {
    return (
        <th className={`px-3 py-2 ${className}`}>
            <button type="button" onClick={onClick} className="flex items-center gap-1 select-none hover:underline" title="Sort">
                <span>{children}</span>
                <SortIcon active={active} dir={dir} />
            </button>
        </th>
    );
}

function Input({ label, value, onChange, placeholder, type = "text" }: {
    label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
    return (
        <label className="block">
            <span className="block text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">{label}</span>
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

function SelectStrict({ label, value, onChange, options, placeholder = "Select…" }: {
    label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }>; placeholder?: string;
}) {
    return (
        <label className="block">
            <span className="block text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">{label}</span>
            <select
                className="w-full px-3 py-2 rounded-md border dark:border-neutral-800 dark:bg-neutral-900 dark:text-white focus:outline-none focus:ring"
                value={value}
                onChange={(e) => onChange(e.target.value)}
            >
                <option value="">{placeholder}</option>
                {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
        </label>
    );
}

function fmt(iso?: string) {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleString(); } catch { return iso!; }
}

/* ========================= Page ========================= */
export default function ChecklistLib() {
    //   const openNew = () =>
    //   nav("/admin/ref/checklistlib/new", { state: { from: location.pathname } });

    // const openEdit = (id: string) =>
    //   nav(`/admin/ref/checklistlib/${id}/edit`, { state: { from: location.pathname } });

    const location = useLocation();
    const nav = useNavigate();

    useEffect(() => {
        const refreshFlag = (location.state as any)?.refresh;
        if (refreshFlag) {
            fetchList();
            fetchStats();
            nav(location.pathname, { replace: true, state: {} });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.state]);

    /* ---- Admin gate ---- */
    useEffect(() => {
        const token = localStorage.getItem("token");
        if (!token) { nav("/login", { replace: true }); return; }
        const payload = decodeJwtPayload(token);
        const isAdmin = !!(payload && (payload.isSuperAdmin || payload.role === "Admin" || payload.userRole === "Admin"));
        if (!isAdmin) nav("/landing", { replace: true });
    }, [nav]);

    /* ---- List state ---- */
    const [q, setQ] = useState("");
    const [discipline, setDiscipline] = useState<Discipline | "">("");
    const [stageLabel, setStageLabel] = useState<string>("");
    const [status, setStatus] = useState<ChecklistStatus | "">("");
    const [aiDefault, setAiDefault] = useState<"" | "on" | "off">("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);

    const [rows, setRows] = useState<ChecklistLite[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    /* ---- KPIs ---- */
    const [stats, setStats] = useState({
        total: 0,
        byStatus: { Active: 0, Draft: 0, Inactive: 0, Archived: 0 },
    });
    const [statsLoading, setStatsLoading] = useState(false);

    async function fetchStats() {
        setStatsLoading(true);
        try {
            const { data } = await api.get("/admin/ref/checklists/stats");
            setStats({
                total: Number(data?.total ?? 0),
                byStatus: {
                    Active: Number(data?.byStatus?.Active ?? 0),
                    Draft: Number(data?.byStatus?.Draft ?? 0),
                    Inactive: Number(data?.byStatus?.Inactive ?? 0),
                    Archived: Number(data?.byStatus?.Archived ?? 0),
                },
            });
        } finally {
            setStatsLoading(false);
        }
    }

    /* ---- Sorting ---- */
    type SortKey =
        | "checklist"
        | "discStage"
        | "version"
        | "items"
        | "aiDefault"
        | "tags"
        | "updated"
        | "status";

    const [sortBy, setSortBy] = useState<SortKey>("updated");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

    const cmp = (a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0);
    function parseSemverParts(v?: string | number | null) {
        const s = v == null ? "" : String(v);
        const m = s.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
        if (!m) return [0, 0, 0];
        return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)];
    }

    const sortedRows = useMemo(() => {
        const copy = [...rows];
        copy.sort((A, B) => {
            let av: any = "", bv: any = "";
            switch (sortBy) {
                case "checklist":
                    av = `${A.code ? A.code + " • " : ""}${A.title || ""}`;
                    bv = `${B.code ? B.code + " • " : ""}${B.title || ""}`;
                    break;
                case "discStage":
                    av = `${A.discipline || ""} • ${A.stageLabel || ""}`;
                    bv = `${B.discipline || ""} • ${B.stageLabel || ""}`;
                    break;
                case "version": {
                    const [a1, a2, a3] = parseSemverParts((A as any).versionLabel ?? A.version);
                    const [b1, b2, b3] = parseSemverParts((B as any).versionLabel ?? B.version);
                    av = a1 * 1e6 + a2 * 1e3 + a3;
                    bv = b1 * 1e6 + b2 * 1e3 + b3;
                    break;
                }
                case "items": {
                    const ai = Number(A.itemsCount ?? (Array.isArray(A.items) ? A.items.length : 0));
                    const bi = Number(B.itemsCount ?? (Array.isArray(B.items) ? B.items.length : 0));
                    av = ai; bv = bi;
                    break;
                }
                case "aiDefault":
                    av = (A.aiDefault ? 1 : 0);
                    bv = (B.aiDefault ? 1 : 0);
                    break;
                case "tags":
                    av = (A.tags || []).join(", ");
                    bv = (B.tags || []).join(", ");
                    break;
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
        else { setSortBy(key); setSortDir("asc"); }
    };

    /* ========================= API ========================= */
    const fetchList = async () => {
        setErr(null);
        setLoading(true);
        try {
            const params: any = { q, discipline, stageLabel, status, page, pageSize };
            if (aiDefault) params.aiDefault = aiDefault === "on";

            const { data } = await api
                .get("/admin/ref/checklists", { params })
                .catch(async (e: any) => {
                    if (e?.response?.status === 404) {
                        const { data: all } = await api.get("/admin/ref/checklists");
                        return { data: all };
                    }
                    throw e;
                });

            let items: ChecklistLite[] = [];
            let ttl = 0;
            if (Array.isArray(data)) { items = data; ttl = data.length; }
            else {
                items = Array.isArray((data as any).items) ? (data as any).items : [];
                ttl = typeof (data as any).total === "number" ? (data as any).total : items.length;
            }

            setRows(items);
            setTotal(ttl);
        } catch (e: any) {
            const s = e?.response?.status;
            if (s === 401) {
                localStorage.removeItem("token");
                nav("/login", { replace: true });
                return;
            }
            setRows([]);
            setTotal(0);
            setErr(e?.response?.data?.error || e?.message || "Failed to load checklists.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchList(); /* eslint-disable-next-line */ }, [q, discipline, stageLabel, status, aiDefault, page, pageSize]);
    useEffect(() => { fetchStats(); /* eslint-disable-next-line */ }, []);
    useEffect(() => {
        const refreshFlag = (location.state as any)?.refresh;
        if (refreshFlag) {
            fetchList();
            fetchStats();
            // clear state so it doesn't refire on next renders
            nav(location.pathname, { replace: true, state: {} });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.state]);

    /* ---- View Modal ---- */
    const [viewOpen, setViewOpen] = useState(false);
    const [viewItem, setViewItem] = useState<ChecklistLite | null>(null);
    const [viewLoading, setViewLoading] = useState(false);

    async function openView(id: string) {
        setViewOpen(true);
        setViewLoading(true);
        try {
            const { data } = await api.get(`/admin/ref/checklists/${id}`);
            setViewItem(data);
        } catch {
            setViewItem(null);
        } finally {
            setViewLoading(false);
        }
    }
    function closeView() {
        setViewOpen(false);
        setViewItem(null);
    }

    /* ---- UI helpers ---- */
    const asChips = (arr?: string[] | null) =>
        (arr && arr.length) ? arr.map((t) => (
            <span key={t} className="inline-block mr-1 mb-1 px-2 py-0.5 rounded-full border text-xs bg-gray-50 dark:bg-neutral-800 dark:border-neutral-700">
                {t}
            </span>
        )) : "—";

    const versionText = (r: ChecklistLite) =>
        `v${(r as any).versionLabel ?? (r.version ?? 1)}`;

    const itemsCount = (r: ChecklistLite) =>
        Number(r.itemsCount ?? (Array.isArray(r.items) ? r.items.length : 0));

    /* ---- UI actions ---- */
    //   const openNew = () => nav("/admin/ref/checklistlib/new");
    //   const openEdit = (id: string) => nav(`/admin/ref/checklistlib/${id}/edit`);
    const openNew = () =>
        nav("/admin/ref/checklistlib/new", { state: { from: location.pathname } });

    const openEdit = (id: string) =>
        nav(`/admin/ref/checklistlib/${id}/edit`, { state: { from: location.pathname } });

    const exportCsv = () => {
        const header = [
            "Checklist",
            "Discipline • Stage",
            "Version",
            "Items",
            "AI Default",
            "Tags",
            "Updated",
            "Status",
            "Id",
        ];
        const rowsToExport = sortedRows.map((r) => [
            r.code ? `${r.code} • ${r.title}` : r.title,
            `${r.discipline || ""} • ${r.stageLabel || "—"}`,
            versionText(r),
            String(itemsCount(r)),
            r.aiDefault ? "On" : "Off",
            (r.tags || []).join("|"),
            fmt(r.updatedAt),
            r.status,
            r.id,
        ]);
        const escapeCsv = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
        const csv =
            header.map(escapeCsv).join(",") +
            "\n" +
            rowsToExport.map((row) => row.map(escapeCsv).join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const date = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        a.download = `checklist-lib-${date}.csv`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const clearFilters = () => {
        setQ("");
        setDiscipline("");
        setStageLabel("");
        setStatus("");
        setAiDefault("");
        setPage(1);
    };

    const refresh = () => { fetchList(); fetchStats(); };

    /* ========================= UI ========================= */
    return (
        <div className="min-h-screen bg-gradient-to-b from-sky-50 to-indigo-50 dark:from-neutral-900 dark:to-neutral-950 px-4 sm:px-6 lg:px-10 py-8">
            <div className="mx-auto max-w-7xl">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-semibold dark:text-white">Checklist Library</h1>
                        <p className="text-sm text-gray-600 dark:text-gray-300">Standardised checklists for PMS modules.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button className="px-3 py-2 rounded border text-sm hover:bg-gray-50 dark:border-neutral-800 dark:hover:bg-neutral-800" onClick={refresh} type="button">Refresh</button>
                        <button className="px-3 py-2 rounded border text-sm hover:bg-gray-50 dark:border-neutral-800 dark:hover:bg-neutral-800" onClick={exportCsv} type="button">Export CSV</button>
                        <button className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-sm" onClick={openNew} type="button">+ Create</button>
                    </div>
                </div>

                {err && (
                    <div className="mb-4 p-3 rounded-lg text-sm text-red-700 bg-red-50 dark:bg-red-950/30 dark:text-red-300 border border-red-200 dark:border-red-900">
                        {err}
                    </div>
                )}

                {/* KPIs */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
                    <div className="rounded-2xl bg-white dark:bg-neutral-900 border dark:border-neutral-800 p-4">
                        <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Active</div>
                        <div className="mt-1 text-2xl font-semibold dark:text-white">{statsLoading ? "…" : stats.byStatus.Active}</div>
                    </div>
                    <div className="rounded-2xl bg-white dark:bg-neutral-900 border dark:border-neutral-800 p-4">
                        <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Draft</div>
                        <div className="mt-1 text-2xl font-semibold dark:text-white">{statsLoading ? "…" : stats.byStatus.Draft}</div>
                    </div>
                    <div className="rounded-2xl bg-white dark:bg-neutral-900 border dark:border-neutral-800 p-4">
                        <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Inactive</div>
                        <div className="mt-1 text-2xl font-semibold dark:text-white">{statsLoading ? "…" : stats.byStatus.Inactive}</div>
                    </div>
                    <div className="rounded-2xl bg-white dark:bg-neutral-900 border dark:border-neutral-800 p-4">
                        <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Archived</div>
                        <div className="mt-1 text-2xl font-semibold dark:text-white">{statsLoading ? "…" : stats.byStatus.Archived}</div>
                    </div>
                </div>

                {/* Filters */}
                <Section title="Find">
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                        <Input label="Search" value={q} onChange={setQ} placeholder="id/code, title, stage…" />
                        <SelectStrict
                            label="Discipline"
                            value={discipline}
                            onChange={(v) => { setDiscipline(v as Discipline | ""); setStageLabel(""); setPage(1); }}
                            options={["", ...DISCIPLINES].map((d) => ({ value: d as any, label: d || "All" }))}
                        />
                        <SelectStrict
                            label="Stage"
                            value={stageLabel}
                            onChange={(v) => { setStageLabel(v); setPage(1); }}
                            options={[
                                "",
                                ...(discipline ? STAGE_LIBRARY[discipline] || [] : Object.values(STAGE_LIBRARY).flat()),
                            ].map((s) => ({ value: s, label: s || "All" }))}
                        />
                        <SelectStrict
                            label="Status"
                            value={status}
                            onChange={(v) => { setStatus((v as ChecklistStatus) || ""); setPage(1); }}
                            options={["", ...STATUS_OPTIONS].map((s) => ({ value: s as any, label: s || "All" }))}
                        />
                        <SelectStrict
                            label="AI Default"
                            value={aiDefault}
                            onChange={(v) => setAiDefault((v as any) || "")}
                            options={[
                                { value: "on", label: "On" },
                                { value: "off", label: "Off" },
                            ]}
                            placeholder="Any"
                        />
                    </div>
                    <div className="mt-3">
                        <button className="px-3 py-2 rounded border text-sm hover:bg-gray-50 dark:border-neutral-800 dark:hover:bg-neutral-800" onClick={clearFilters} type="button">
                            Clear
                        </button>
                    </div>
                </Section>

                {/* Table info */}
                <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">{loading ? "Loading…" : `${total} item${total === 1 ? "" : "s"}`}</div>

                {/* Table */}
                <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border dark:border-neutral-800 overflow-hidden">
                    <div className="overflow-auto max-h-[70vh]">
                        <table className="w-full min-w-[1400px] text-sm table-fixed [word-break:break-word] [overflow-wrap:anywhere]">
                            <colgroup>
                                <col className="w-[160px]" /> {/* Actions */}
                                <col className="w-[360px]" /> {/* Checklist */}
                                <col span={7} />
                            </colgroup>
                            <thead className="bg-gray-50 dark:bg-neutral-900/60 sticky top-0 z-10">
                                <tr className="text-left text-[12px] uppercase tracking-wide text-gray-600 dark:text-gray-400">
                                    <th className="px-3 py-2 sticky left-0 bg-white dark:bg-neutral-900">Actions</th>
                                    <Th className="w-[360px]" onClick={() => requestSort("checklist")} active={sortBy === "checklist"} dir={sortDir}>Checklist (Code • Title)</Th>
                                    <Th onClick={() => requestSort("discStage")} active={sortBy === "discStage"} dir={sortDir}>Discipline • Stage</Th>
                                    <Th onClick={() => requestSort("version")} active={sortBy === "version"} dir={sortDir}>Version</Th>
                                    <Th onClick={() => requestSort("items")} active={sortBy === "items"} dir={sortDir}>Items</Th>
                                    <Th onClick={() => requestSort("aiDefault")} active={sortBy === "aiDefault"} dir={sortDir}>AI (Default)</Th>
                                    <Th onClick={() => requestSort("tags")} active={sortBy === "tags"} dir={sortDir}>Tags</Th>
                                    <Th onClick={() => requestSort("updated")} active={sortBy === "updated"} dir={sortDir}>Updated</Th>
                                    <Th onClick={() => requestSort("status")} active={sortBy === "status"} dir={sortDir}>Status</Th>
                                </tr>
                            </thead>

                            <tbody>
                                {sortedRows.map((r) => (
                                    <tr key={r.id} className="border-t dark:border-neutral-800">
                                        {/* Actions */}
                                        <td className="px-3 py-2 sticky left-0 bg-white dark:bg-neutral-900">
                                            <div className="flex flex-wrap gap-2">
                                                <button className="px-2 py-1 rounded border text-xs hover:bg-gray-50 dark:border-neutral-800 dark:hover:bg-neutral-800" onClick={() => openView(r.id)}>
                                                    View
                                                </button>
                                                <button className="px-2 py-1 rounded border text-xs hover:bg-gray-50 dark:border-neutral-800 dark:hover:bg-neutral-800" onClick={() => openEdit(r.id)}>
                                                    Edit
                                                </button>
                                            </div>
                                        </td>

                                        {/* Checklist (Code • Title) */}
                                        <td className="px-3 py-2">
                                            <div className="font-semibold line-clamp-2 break-words">
                                                {r.code ? `${r.code} • ${r.title}` : r.title}
                                            </div>
                                        </td>

                                        {/* Discipline • Stage */}
                                        <td className="px-3 py-2">{(r.discipline || "—") + " • " + (r.stageLabel || "—")}</td>

                                        {/* Version (1 / 1.2 / 1.2.3) */}
                                        <td className="px-3 py-2">{versionText(r)}</td>

                                        {/* Items (count) */}
                                        <td className="px-3 py-2">{itemsCount(r)}</td>

                                        {/* AI (Default) */}
                                        <td className="px-3 py-2">
                                            {r.aiDefault ? (
                                                <span className="inline-block px-2 py-0.5 rounded-full border text-xs bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-300 dark:border-emerald-900">
                                                    On
                                                </span>
                                            ) : (
                                                <span className="inline-block px-2 py-0.5 rounded-full border text-xs bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-300 dark:border-rose-900">
                                                    Off
                                                </span>
                                            )}
                                        </td>

                                        {/* Tags */}
                                        <td className="px-3 py-2">
                                            {(r.tags && r.tags.length) ? r.tags.join(", ") : "—"}
                                        </td>

                                        {/* Updated */}
                                        <td className="px-3 py-2">{fmt(r.updatedAt)}</td>

                                        {/* Status */}
                                        <td className="px-3 py-2"><StatusPill value={r.status} /></td>
                                    </tr>
                                ))}

                                {!sortedRows.length && !loading && (
                                    <tr>
                                        <td className="px-3 py-6 text-center text-gray-500" colSpan={9}>No checklists found.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between mt-3 text-sm">
                    <div className="text-gray-600 dark:text-gray-400">Page {page} / {totalPages}</div>
                    <div className="flex items-center gap-2">
                        <button className="px-3 py-1 rounded border dark:border-neutral-800 disabled:opacity-50" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
                        <button className="px-3 py-1 rounded border dark:border-neutral-800 disabled:opacity-50" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
                        <select className="px-2 py-1 rounded border dark:border-neutral-800" value={pageSize} onChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setPage(1); }}>
                            {[10, 20, 50, 100].map((n) => (<option key={n} value={n}>{n}/page</option>))}
                        </select>
                    </div>
                </div>
            </div>

            {/* View Modal */}
            {viewOpen && (
                <div className="fixed inset-0 z-50">
                    <div className="absolute inset-0 bg-black/40" onClick={closeView} />
                    <div className="absolute inset-0 flex items-center justify-center p-4">
                        <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-neutral-900 border dark:border-neutral-800 shadow-xl overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-3 border-b dark:border-neutral-800">
                                <div className="flex flex-col">
                                    <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Checklist</div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="text-lg font-semibold dark:text-white">
                                            {viewItem?.code ? `${viewItem.code} • ${viewItem.title}` : (viewItem?.title || "—")}
                                        </h3>
                                        {viewItem?.status ? (<span className="text-xs"><StatusPill value={viewItem.status} /></span>) : null}
                                    </div>
                                </div>
                                <button className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50 dark:hover:bg-neutral-800" onClick={closeView}>
                                    Close
                                </button>
                            </div>

                            <div className="p-4 text-sm">
                                {viewLoading ? (
                                    <div className="py-10 text-center text-gray-500 dark:text-gray-400">Loading…</div>
                                ) : viewItem ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <KV k="Code" v={viewItem.code || "—"} />
                                        <KV k="Title" v={viewItem.title || "—"} />
                                        <KV k="Discipline • Stage" v={`${viewItem.discipline} • ${viewItem.stageLabel || "—"}`} />
                                        <KV k="Version" v={versionText(viewItem)} />
                                        <KV k="Items" v={String(itemsCount(viewItem))} />
                                        <KV k="AI Default" v={viewItem.aiDefault ? "On" : "Off"} />
                                        <KV k="Tags" v={(viewItem.tags && viewItem.tags.length) ? viewItem.tags.join(", ") : "—"} />
                                        <KV k="Updated" v={fmt(viewItem.updatedAt)} />
                                        <div className="sm:col-span-2">
                                            <KV k="Status" v={<StatusPill value={viewItem.status} />} />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="py-10 text-center text-red-600">Failed to load.</div>
                                )}
                            </div>

                            <div className="px-4 py-3 border-t dark:border-neutral-800 text-right">
                                <button className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white" onClick={closeView}>
                                    Done
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ========================= Bits ========================= */
function KV({ k, v }: { k: string; v: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-3">
            <div className="text-gray-500 dark:text-gray-400">{k}</div>
            <div className="dark:text-white">{v}</div>
        </div>
    );
}
