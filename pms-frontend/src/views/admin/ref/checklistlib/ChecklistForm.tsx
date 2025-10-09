// pms-frontend/src/views/admin/ref/checklist/ChecklistForm.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../../../api/client";

/* ========================= Error helper (same as MaterialForm) ========================= */
function extractServerError(e: any): string {
    const data = e?.response?.data;
    const prismaCode = data?.code || data?.meta?.code || e?.code;
    if (prismaCode === "P2002") {
        const target = data?.meta?.target || data?.target || "Unique field";
        return `Duplicate value: ${Array.isArray(target) ? target.join(", ") : target} must be unique.`;
    }
    if (Array.isArray(data?.message) && data?.message.length) return data.message.join(", ");
    if (typeof data?.message === "string" && data.message) return data.message;
    if (typeof data?.error === "string" && data.error) return data.error;
    if (typeof data?.detail === "string" && data.detail) return data.detail;
    if (typeof data === "string" && data) return data;
    if (typeof e?.message === "string" && e.message) return e.message;
    return "Request failed (400). Please check the field values and try again.";
}

/* ========================= Types / Constants ========================= */
const DISCIPLINES = ["Civil", "MEP", "Finishes", "Architecture"] as const;
type Discipline = typeof DISCIPLINES[number];

const STATUSES = ["Active", "Draft", "Inactive", "Archived"] as const;
type ChecklistStatus = typeof STATUSES[number];

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

export type RefChecklist = {
    id: string;
    code: string | null;
    title: string;
    discipline: Discipline;
    stageLabel: string | null;
    tags?: string[] | null;
    status: ChecklistStatus;
    version: number | null;
    versionLabel?: string | null;
    versionMajor?: number | null;
    versionMinor?: number | null;
    versionPatch?: number | null;
    aiDefault?: boolean | null;
    items?: any[] | null;
    itemsCount?: number | null;
    _count?: { items?: number } | null;
    updatedAt: string;
    createdAt?: string;
};

/* ========================= UI helpers (same vibe as MaterialForm) ========================= */
function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
    return (
        <label className="grid gap-1">
            <span className="text-sm text-neutral-600 dark:text-neutral-300">
                {label} {required ? <span className="text-red-600">*</span> : null}
            </span>
            {children}
        </label>
    );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input
            {...props}
            className={
                "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white " +
                (props.className || "")
            }
        />
    );
}
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select
            {...props}
            className={
                "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white " +
                (props.className || "")
            }
        />
    );
}

/* CSV helpers for tags */
function toCSV(a?: string[] | null) {
    return a && a.length ? a.join(", ") : "";
}
function fromCSV(s: string): string[] {
    return s
        .split(/[,\n]/)
        .map((x) => x.trim())
        .filter(Boolean);
}

/* ========================= Data hook ========================= */
function useChecklist(id?: string) {
    const [data, setData] = useState<Partial<RefChecklist> | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) {
            // Defaults for NEW
            setData({
                code: "",
                title: "",
                discipline: "Civil",
                stageLabel: "",
                version: 1,
                versionLabel: "1.0.0",
                aiDefault: false,
                tags: [],
                status: "Draft",
            } as Partial<RefChecklist>);
            return;
        }
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const res = await api.get(`/admin/ref/checklists/${id}`);
                if (!cancelled) {
                    const r = res.data;
                    setData({
                        ...r,
                        versionLabel: (r as any).versionLabel ?? (r.version != null ? String(r.version) : "1.0.0"),
                        tags: Array.isArray(r?.tags) ? [...r.tags] : [],
                    });
                }
            } catch (e: any) {
                if (!cancelled) setError(e?.message || "Failed to load");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [id]);

    return { data, setData, loading, error } as const;
}

/* ========================= Form Body ========================= */
function FormBody({
    data,
    setData,
}: {
    data: Partial<RefChecklist>;
    setData: (p: Partial<RefChecklist>) => void;
}) {
    function patch(p: Partial<RefChecklist>) {
        setData({ ...data, ...p });
    }

    const stageOptions = useMemo(
        () => (data?.discipline ? STAGE_LIBRARY[data.discipline] || [] : []),
        [data?.discipline]
    );

    return (
        <div className="grid gap-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Code" required>
                    <Input value={String(data.code ?? "")} onChange={(e) => patch({ code: e.target.value })} placeholder="Unique code (required)" />
                </Field>
                <Field label="Title" required>
                    <Input value={String(data.title ?? "")} onChange={(e) => patch({ title: e.target.value })} placeholder="Checklist title" />
                </Field>
                <Field label="Status" required>
                    <Select value={(data.status as any) || "Draft"} onChange={(e) => patch({ status: e.target.value as ChecklistStatus })}>
                        {STATUSES.map((s) => (
                            <option key={s} value={s}>
                                {s}
                            </option>
                        ))}
                    </Select>
                </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Discipline">
                    <Select
                        value={(data.discipline as any) || "Civil"}
                        onChange={(e) => patch({ discipline: (e.target.value as Discipline) || "Civil", stageLabel: "" })}
                    >
                        {DISCIPLINES.map((d) => (
                            <option key={d} value={d}>
                                {d}
                            </option>
                        ))}
                    </Select>
                </Field>
                <Field label="Stage">
                    <Select value={String(data.stageLabel ?? "")} onChange={(e) => patch({ stageLabel: e.target.value || "" })}>
                        <option value="">—</option>
                        {(data.discipline ? stageOptions : []).map((s) => (
                            <option key={s} value={s}>
                                {s}
                            </option>
                        ))}
                    </Select>
                </Field>
                <Field label="Version (e.g., 1, 1.2, 1.2.3)">
                    <Input
                        type="text"
                        value={String((data as any).versionLabel ?? (data.version != null ? String(data.version) : ""))}
                        onChange={(e) => patch({ ...(data as any), versionLabel: e.target.value })}
                        placeholder="1.2.3"
                        pattern="^\d+(?:\.\d+){0,2}$"
                        title="Use 1 or 1.2 or 1.2.3"
                    />
                </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="AI Default">
                    <Select
                        value={(data.aiDefault ? "on" : "off") as string}
                        onChange={(e) => patch({ aiDefault: e.target.value === "on" })}
                    >
                        <option value="on">On</option>
                        <option value="off">Off</option>
                    </Select>
                </Field>
                <Field label="Tags (comma separated)">
                    <Input
                        value={toCSV(data.tags)}
                        onChange={(e) => patch({ tags: fromCSV(e.target.value) })}
                        placeholder="safety, documentation, structural"
                    />
                </Field>
                {/* spacer */}
                <div />
            </div>

            <div className="text-xs text-neutral-500 dark:text-neutral-400">
                {data.updatedAt ? `Last updated: ${new Date(data.updatedAt).toLocaleString()}` : "—"}
            </div>
        </div>
    );
}

/* ========================= Create Page ========================= */
export function ChecklistNewPage() {
    const nav = useNavigate();
    const { data, setData } = useChecklist(undefined);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    async function onSave() {
        if (!data?.code || !data?.title) {
            setErr("Code and Title are required.");
            return;
        }
        setSaving(true);
        try {
            const payload = {
                code: String(data.code ?? "").trim(),
                title: String(data.title ?? "").trim(),
                discipline: (data.discipline as Discipline) || "Civil",
                stageLabel: (data.stageLabel || null) as any,
                versionLabel: (data as any).versionLabel ?? (data.version != null ? String(data.version) : null),
                aiDefault: !!data.aiDefault,
                tags: Array.isArray(data.tags) ? data.tags : [],
                status: (data.status as ChecklistStatus) || "Draft",
            };

            const problems: string[] = [];
            if (!payload.code) problems.push("Code is required.");
            if (!payload.title) problems.push("Title is required.");
            const vlabel = payload.versionLabel?.trim();
            if (vlabel && !/^\d+(?:\.\d+){0,2}$/.test(vlabel)) problems.push("Version must be 1, 1.2, or 1.2.3.");
            if (problems.length) {
                setErr(problems.join(" "));
                setSaving(false);
                return;
            }

            await api.post("/admin/ref/checklists", payload);
            //nav("/admin/ref/checklistlib");
            nav("/admin/ref/checklistlib", { state: { refresh: true } });
        } catch (e: any) {
            setErr(extractServerError(e));
        } finally {
            setSaving(false);
        }
    }

    if (!data) return null;
    return (
        <div className="p-4 md:p-6">
            <div className="mb-4 flex items-center justify-between">
                <h1 className="text-xl font-semibold dark:text-white">New Checklist</h1>
                <div className="flex items-center gap-2">
                    <button className="px-3 py-2 rounded-lg bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-white" onClick={() => nav(-1)}>
                        Cancel
                    </button>
                    <button
                        className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                        disabled={saving}
                        onClick={onSave}
                    >
                        Save
                    </button>
                </div>
            </div>
            {err && <div className="mb-3 text-sm text-red-600">{err}</div>}
            <FormBody data={data} setData={setData as any} />
        </div>
    );
}

/* ========================= Edit Page ========================= */
export function ChecklistEditPage() {
    const nav = useNavigate();
    const { id } = useParams(); // route should be /admin/ref/checklistlib/:id/edit
    const { data, setData, loading, error } = useChecklist(id);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    async function onSave() {
        if (!data?.code || !data?.title) {
            setErr("Code and Title are required.");
            return;
        }
        setSaving(true);
        try {
            const payload = {
                code: String(data.code ?? "").trim(),
                title: String(data.title ?? "").trim(),
                discipline: (data.discipline as Discipline) || "Civil",
                stageLabel: (data.stageLabel || null) as any,
                versionLabel: (data as any).versionLabel ?? (data.version != null ? String(data.version) : null),
                aiDefault: !!data.aiDefault,
                tags: Array.isArray(data.tags) ? data.tags : [],
                status: (data.status as ChecklistStatus) || "Draft",
            };

            const problems: string[] = [];
            if (!payload.code) problems.push("Code is required.");
            if (!payload.title) problems.push("Title is required.");
            const vlabel = payload.versionLabel?.trim();
            if (vlabel && !/^\d+(?:\.\d+){0,2}$/.test(vlabel)) problems.push("Version must be 1, 1.2, or 1.2.3.");
            if (problems.length) {
                setErr(problems.join(" "));
                setSaving(false);
                return;
            }

            await api.patch(`/admin/ref/checklists/${id}`, payload);
            //nav("/admin/ref/checklistlib");
            nav("/admin/ref/checklistlib", { state: { refresh: true } });
        } catch (e: any) {
            setErr(extractServerError(e));
        } finally {
            setSaving(false);
        }
    }

    if (loading) return <div className="p-6 text-neutral-500 dark:text-neutral-400">Loading…</div>;
    if (error) return <div className="p-6 text-red-600">{error}</div>;
    if (!data) return null;

    return (
        <div className="p-4 md:p-6">
            <div className="mb-4 flex items-center justify-between">
                <h1 className="text-xl font-semibold dark:text-white">Edit Checklist</h1>
                <div className="flex items-center gap-2">
                    <button className="px-3 py-2 rounded-lg bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-white" onClick={() => nav(-1)}>
                        Cancel
                    </button>
                    <button
                        className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                        disabled={saving}
                        onClick={onSave}
                    >
                        Save Changes
                    </button>
                </div>
            </div>
            {err && <div className="mb-3 text-sm text-red-600">{err}</div>}
            <FormBody data={data} setData={setData as any} />
        </div>
    );
}
