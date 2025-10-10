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
    items?: any[] | null;          // will carry rich item fields in FE
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
                items: [],
            } as Partial<RefChecklist>);
            return;
        }
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const res = await api.get(`/admin/ref/checklists/${id}?includeItems=1`);
                if (!cancelled) {
                    const r = res.data;
                    setData({
                        ...r,
                        versionLabel: (r as any).versionLabel ?? (r.version != null ? String(r.version) : "1.0.0"),
                        tags: Array.isArray(r?.tags) ? [...r.tags] : [],
                        items: Array.isArray(r?.items) ? r.items : [],
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

/* ========================= Items Editor (rich fields + preview) ========================= */
type UiItem = {
    text?: string;                                            // Title
    requirement?: "Mandatory" | "Optional" | null;            // Requirement
    itemCode?: string | null;                                 // Item Code
    critical?: boolean | null;                                // Critical (Yes/No)
    aiEnabled?: boolean | null;                               // AI (Yes/No)
    aiConfidence?: number | null;                             // 0..1
    units?: string | null;                                    // mm, N/mm2, etc
    tolerance?: "<=" | "+-" | "=" | null;                     // tolerance selector
    base?: number | null;                                     // base value
    plus?: number | null;                                     // + tolerance
    minus?: number | null;                                    // - tolerance
    tags?: string[] | null;                                   // ['visual','measurement','evidence','document']
};

// preview string builder
function previewString(tol?: string | null, base?: number | null, plus?: number | null, minus?: number | null) {
    if (base == null || isNaN(base)) return "—";
    const b = Number(base);
    if (tol === "<=") return `≤ ${b.toFixed(3)}`;
    if (tol === "=") return `= ${b.toFixed(3)}`;
    const lo = (b - Number(minus || 0)).toFixed(3);
    const hi = (b + Number(plus || 0)).toFixed(3);
    return `${lo} to ${hi}`;
}
const tolSymbol = (t?: string | null) =>
    t === "<=" ? "≤" : t === "+-" ? "±" : t === "=" ? "=" : "—";
const TAG_OPTIONS = ["visual", "measurement", "evidence", "document"] as const;

function ItemsEditor({
    items,
    onChange,
}: {
    items: UiItem[];
    onChange: (next: UiItem[]) => void;
}) {
    // Single "new item" draft and toggle
    const [showForm, setShowForm] = useState(false);
    const emptyDraft: UiItem = {
        text: "",
        requirement: "Mandatory",
        itemCode: "",
        critical: false,
        aiEnabled: false,
        aiConfidence: null,
        units: "",
        tolerance: "+-",
        base: null,
        plus: null,
        minus: null,
        tags: [],
    };
    const [draft, setDraft] = useState<UiItem>(emptyDraft);
    const [formErr, setFormErr] = useState<string | null>(null);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);

    const patchDraft = (partial: Partial<UiItem>) => setDraft({ ...draft, ...partial });

    const toggleTagDraft = (tag: string) => {
        const set = new Set(draft.tags || []);
        if (set.has(tag)) set.delete(tag);
        else set.add(tag);
        patchDraft({ tags: Array.from(set) });
    };

    const onCommit = () => {
        setFormErr(null);
        const title = String(draft.text || "").trim();
        if (!title) {
            setFormErr("Title is required.");
            return;
        }
        const normalized: UiItem = {
            ...draft,
            text: title,
            aiConfidence:
                draft.aiConfidence == null || (draft.aiConfidence as any) === "" ? null : Number(draft.aiConfidence),
            base: draft.base == null || (draft.base as any) === "" ? null : Number(draft.base),
            plus: draft.plus == null || (draft.plus as any) === "" ? null : Number(draft.plus),
            minus: draft.minus == null || (draft.minus as any) === "" ? null : Number(draft.minus),
            tolerance: (draft.tolerance as any) || "+-",
            tags: Array.isArray(draft.tags) ? draft.tags : [],
        };

        if (editingIndex == null) {
            // Add new
            onChange([...(items || []), normalized]);
        } else {
            // Save edit
            const next = [...(items || [])];
            next[editingIndex] = normalized;
            onChange(next);
        }

        setDraft(emptyDraft);
        setEditingIndex(null);
        setShowForm(false);
    };

    const removeRow = (idx: number) => {
        const name = String(items[idx]?.text || `Item ${idx + 1}`);
        const msg =
            `Delete “${name}”? This will remove the item from the list. ` +
            `You can still cancel by not saving the checklist.`;
        if (!window.confirm(msg)) return;

        const next = [...items];
        next.splice(idx, 1);
        onChange(next);
    };

    const editRow = (idx: number) => {
        setDraft({ ...(items[idx] || emptyDraft) });
        setEditingIndex(idx);
        setShowForm(true);
    };

    const duplicateRow = (idx: number) => {
        const clone = { ...(items[idx] || {}) };
        const next = [...items];
        next.splice(idx + 1, 0, clone);
        onChange(next);
    };

    return (
        <div className="grid gap-3">
            {/* Toggle New Item form */}
            {!showForm ? (
                <div>
                    <button type="button" className="px-3 py-2 rounded border dark:border-neutral-700" onClick={() => setShowForm(true)}>
                        + Add Item
                    </button>
                </div>
            ) : (
                <div className="rounded-xl border dark:border-neutral-700 p-3 grid gap-3 bg-white dark:bg-neutral-900">
                    <div className="font-medium text-sm">New Item</div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {/* Title */}
                        <label className="grid gap-1">
                            <span className="text-xs text-neutral-600 dark:text-neutral-300">Title</span>
                            <Input
                                placeholder="e.g., Beam depth measurement"
                                value={draft.text || ""}
                                onChange={(e) => patchDraft({ text: e.target.value })}
                            />
                        </label>

                        {/* Requirement */}
                        <label className="grid gap-1">
                            <span className="text-xs">Requirement</span>
                            <Select
                                value={draft.requirement || "Mandatory"}
                                onChange={(e) => patchDraft({ requirement: e.target.value as any })}
                            >
                                <option value="Mandatory">Mandatory</option>
                                <option value="Optional">Optional</option>
                            </Select>
                        </label>

                        {/* Item Code */}
                        <label className="grid gap-1">
                            <span className="text-xs">Item Code</span>
                            <Input
                                placeholder="e.g., STR-BM-001"
                                value={draft.itemCode || ""}
                                onChange={(e) => patchDraft({ itemCode: e.target.value })}
                            />
                        </label>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {/* Critical */}
                        <label className="grid gap-1">
                            <span className="text-xs">Critical</span>
                            <Select value={draft.critical ? "Yes" : "No"} onChange={(e) => patchDraft({ critical: e.target.value === "Yes" })}>
                                <option>No</option>
                                <option>Yes</option>
                            </Select>
                        </label>

                        {/* AI */}
                        <label className="grid gap-1">
                            <span className="text-xs">AI</span>
                            <Select value={draft.aiEnabled ? "Yes" : "No"} onChange={(e) => patchDraft({ aiEnabled: e.target.value === "Yes" })}>
                                <option>No</option>
                                <option>Yes</option>
                            </Select>
                        </label>

                        {/* AI Confidence */}
                        <label className="grid gap-1">
                            <span className="text-xs">AI Confidence (0–1)</span>
                            <Input
                                type="number"
                                step="0.01"
                                min="0"
                                max="1"
                                value={draft.aiConfidence == null ? "" : String(draft.aiConfidence)}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    patchDraft({ aiConfidence: v === "" ? null : Number(v) });
                                }}
                            />
                        </label>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        {/* Units */}
                        <label className="grid gap-1">
                            <span className="text-xs">Units</span>
                            <Input
                                placeholder="e.g., mm, N/mm2, mm/m"
                                value={draft.units || ""}
                                onChange={(e) => patchDraft({ units: e.target.value })}
                            />
                        </label>

                        {/* Tolerance */}
                        <label className="grid gap-1">
                            <span className="text-xs">Tolerance</span>
                            <Select value={draft.tolerance || "+-"} onChange={(e) => patchDraft({ tolerance: e.target.value as any })}>
                                <option value="<=">Less than Equal (≤)</option>
                                <option value="+-">Range (±)</option>
                                <option value="=">Equal (=)</option>
                            </Select>
                        </label>

                        {/* Base */}
                        <label className="grid gap-1">
                            <span className="text-xs">Base</span>
                            <Input
                                type="number"
                                step="0.001"
                                value={draft.base == null ? "" : String(draft.base)}
                                onChange={(e) => patchDraft({ base: e.target.value === "" ? null : Number(e.target.value) })}
                            />
                        </label>

                        {/* Plus */}
                        <label className="grid gap-1">
                            <span className="text-xs">+ Plus</span>
                            <Input
                                type="number"
                                step="0.001"
                                value={draft.plus == null ? "" : String(draft.plus)}
                                onChange={(e) => patchDraft({ plus: e.target.value === "" ? null : Number(e.target.value) })}
                            />
                        </label>

                        {/* Minus */}
                        <label className="grid gap-1 md:col-start-4">
                            <span className="text-xs">- Minus</span>
                            <Input
                                type="number"
                                step="0.001"
                                value={draft.minus == null ? "" : String(draft.minus)}
                                onChange={(e) => patchDraft({ minus: e.target.value === "" ? null : Number(e.target.value) })}
                            />
                        </label>
                    </div>

                    {/* Preview */}
                    <div className="text-xs text-neutral-600 dark:text-neutral-300">
                        Preview: <span className="font-medium">
                            {previewString(draft.tolerance || "+-", draft.base ?? null, draft.plus ?? null, draft.minus ?? null)}
                        </span>
                        {draft.units ? ` ${draft.units}` : ""}
                    </div>

                    {/* Tag picker */}
                    <div className="grid gap-2">
                        <div className="text-xs text-neutral-600 dark:text-neutral-300">Tags</div>
                        <div className="flex flex-wrap gap-2">
                            {TAG_OPTIONS.map((tag) => {
                                const active = (draft.tags || []).includes(tag);
                                return (
                                    <button
                                        key={tag}
                                        type="button"
                                        className={`px-2 py-1 rounded-full border text-xs ${active ? "bg-blue-600 text-white border-blue-600" : "dark:border-neutral-700"
                                            }`}
                                        onClick={() => toggleTagDraft(tag)}
                                    >
                                        {tag}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {formErr && <div className="text-xs text-rose-600">{formErr}</div>}

                    <div className="flex gap-2 pt-1">
                        <button
                            type="button"
                            className="px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                            onClick={onCommit}
                        >
                            {editingIndex == null ? "Add" : "Save"}
                        </button>
                        <button
                            type="button"
                            className="px-3 py-2 rounded border dark:border-neutral-700"
                            onClick={() => {
                                setDraft(emptyDraft);
                                setEditingIndex(null);
                                setShowForm(false);
                                setFormErr(null);
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Items table */}
            <div className="overflow-auto">
                <table className="w-full min-w-[1000px] text-sm border-collapse">
                    <thead>
                        <tr className="text-left bg-gray-50 dark:bg-neutral-900/50">
                            <th className="px-3 py-2 border-b dark:border-neutral-800">#</th>
                            <th className="px-3 py-2 border-b dark:border-neutral-800">Title &amp; Description</th>
                            <th className="px-3 py-2 border-b dark:border-neutral-800">Requirement</th>
                            <th className="px-3 py-2 border-b dark:border-neutral-800">Critical</th>
                            <th className="px-3 py-2 border-b dark:border-neutral-800">Tags</th>
                            <th className="px-3 py-2 border-b dark:border-neutral-800">Tolerance</th>
                            <th className="px-3 py-2 border-b dark:border-neutral-800">Value</th>
                            <th className="px-3 py-2 border-b dark:border-neutral-800">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(items || []).length ? (
                            items.map((it, i) => {
                                const pv = previewString(it.tolerance || "+-", it.base ?? null, it.plus ?? null, it.minus ?? null);
                                return (
                                    // replace the <tr> content inside items.map(...)
                                    <tr key={i} className="border-t dark:border-neutral-800">
                                        <td className="px-3 py-2">{i + 1}</td>

                                        {/* Title & Description */}
                                        <td className="px-3 py-2">
                                            <div className="font-medium">{it.text || "—"}</div>
                                            {/* Use itemCode as lightweight description if present */}
                                            {it.itemCode ? (
                                                <div className="text-xs text-neutral-500 dark:text-neutral-400">{it.itemCode}</div>
                                            ) : null}
                                        </td>

                                        {/* Requirement */}
                                        <td className="px-3 py-2">{it.requirement || "—"}</td>

                                        {/* Critical */}
                                        <td className="px-3 py-2">{it.critical ? "Yes" : "No"}</td>

                                        {/* Tags */}
                                        <td className="px-3 py-2">{(it.tags && it.tags.length) ? it.tags.join(", ") : "—"}</td>

                                        {/* Tolerance */}
                                        <td className="px-3 py-2">{tolSymbol(it.tolerance)}</td>

                                        {/* Value (preview) */}
                                        <td className="px-3 py-2">
                                            {previewString(it.tolerance || "+-", it.base ?? null, it.plus ?? null, it.minus ?? null)}
                                            {it.units ? ` ${it.units}` : ""}
                                        </td>

                                        {/* Actions */}
                                        <td className="px-3 py-2">
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    className="px-2 py-1 rounded border text-xs dark:border-neutral-700"
                                                    onClick={() => editRow(i)}
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    className="px-2 py-1 rounded border text-xs dark:border-neutral-700"
                                                    onClick={() => duplicateRow(i)}
                                                >
                                                    Duplicate
                                                </button>
                                                <button
                                                    type="button"
                                                    className="px-2 py-1 rounded border text-xs border-rose-300 text-rose-600 dark:border-rose-900"
                                                    onClick={() => removeRow(i)}
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>

                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan={8} className="px-3 py-6 text-center text-neutral-500 dark:text-neutral-400">
                                    No items yet. Click “+ Add Item” to add one.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
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

    const stageOptions = useMemo(() => (data?.discipline ? STAGE_LIBRARY[data.discipline] || [] : []), [data?.discipline]);

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
                        pattern="^\\d+(?:\\.\\d+){0,2}$"
                        title="Use 1 or 1.2 or 1.2.3"
                    />
                </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="AI Default">
                    <Select value={(data.aiDefault ? "on" : "off") as string} onChange={(e) => patch({ aiDefault: e.target.value === "on" })}>
                        <option value="on">On</option>
                        <option value="off">Off</option>
                    </Select>
                </Field>
                <Field label="Tags (comma separated)">
                    <Input value={toCSV(data.tags)} onChange={(e) => patch({ tags: fromCSV(e.target.value) })} placeholder="safety, documentation, structural" />
                </Field>
                {/* spacer */}
                <div />
            </div>

            <div className="grid gap-4 mt-4">
                <Field label="Items">
                    <ItemsEditor items={((data.items as UiItem[]) || [])} onChange={(next) => setData({ ...data, items: next as any })} />
                </Field>
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

            // Create checklist
            const createRes = await api.post("/admin/ref/checklists", payload);
            const newId = createRes?.data?.id;

            // If items exist, send them in a single bulk update call
            if (newId && Array.isArray(data.items) && data.items.length) {
                const items = (data.items as UiItem[]).map((it, seq) => ({
                    seq,
                    text: String(it.text || "").trim(),
                    requirement: it.requirement ?? null,
                    itemCode: it.itemCode ?? null,
                    critical: !!it.critical,
                    aiEnabled: !!it.aiEnabled,
                    aiConfidence: it.aiConfidence == null || it.aiConfidence === ("" as any) ? null : Number(it.aiConfidence),
                    units: it.units ?? null,
                    tolerance: (it.tolerance as any) || "+-",
                    base: it.base == null || (it.base as any) === "" ? null : Number(it.base),
                    plus: it.plus == null || (it.plus as any) === "" ? null : Number(it.plus),
                    minus: it.minus == null || (it.minus as any) === "" ? null : Number(it.minus),
                    tags: Array.isArray(it.tags) ? it.tags : [],
                }));
                await api.patch(`/admin/ref/checklists/${newId}/items`, { items });
            }

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
                    <button className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50" disabled={saving} onClick={onSave}>
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
    // const [itemsSaving, setItemsSaving] = useState(false);
    // const [itemsErr, setItemsErr] = useState<string | null>(null);

    // async function onSaveItems() {
    //     if (!id) return;
    //     setItemsSaving(true);
    //     setItemsErr(null);
    //     try {
    //         const items = ((data?.items || []) as UiItem[]).map((it, seq: number) => ({
    //             seq,
    //             text: String(it?.text || "").trim(),
    //             requirement: it.requirement ?? null,
    //             itemCode: it.itemCode ?? null,
    //             critical: !!it.critical,
    //             aiEnabled: !!it.aiEnabled,
    //             aiConfidence: it.aiConfidence == null || (it.aiConfidence as any) === "" ? null : Number(it.aiConfidence),
    //             units: it.units ?? null,
    //             tolerance: (it.tolerance as any) || "+-",
    //             base: it.base == null || (it.base as any) === "" ? null : Number(it.base),
    //             plus: it.plus == null || (it.plus as any) === "" ? null : Number(it.plus),
    //             minus: it.minus == null || (it.minus as any) === "" ? null : Number(it.minus),
    //             tags: Array.isArray(it.tags) ? it.tags : [],
    //         }));
    //         await api.patch(`/admin/ref/checklists/${id}/items`, { items });
    //         // fetch updated (optional)
    //         const res = await api.get(`/admin/ref/checklists/${id}?includeItems=1`);
    //         setData(res.data);
    //     } catch (e: any) {
    //         setItemsErr(extractServerError(e));
    //     } finally {
    //         setItemsSaving(false);
    //     }
    // }

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

            // 1) Save checklist meta
            await api.patch(`/admin/ref/checklists/${id}`, payload);

            // 2) Save items (if any) in the same action
            if (Array.isArray(data.items)) {
                const items = (data.items as UiItem[]).map((it, seq: number) => ({
                    seq,
                    text: String(it?.text || "").trim(),
                    requirement: it.requirement ?? null,
                    itemCode: it.itemCode ?? null,
                    critical: !!it.critical,
                    aiEnabled: !!it.aiEnabled,
                    aiConfidence:
                        it.aiConfidence == null || (it.aiConfidence as any) === "" ? null : Number(it.aiConfidence),
                    units: it.units ?? null,
                    tolerance: (it.tolerance as any) || "+-",
                    base: it.base == null || (it.base as any) === "" ? null : Number(it.base),
                    plus: it.plus == null || (it.plus as any) === "" ? null : Number(it.plus),
                    minus: it.minus == null || (it.minus as any) === "" ? null : Number(it.minus),
                    tags: Array.isArray(it.tags) ? it.tags : [],
                }));
                await api.patch(`/admin/ref/checklists/${id}/items`, { items });
            }

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
                    <button className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50" disabled={saving} onClick={onSave}>
                        Save Changes
                    </button>

                </div>
            </div>
            {err && <div className="mb-3 text-sm text-red-600">{err}</div>}
            <FormBody data={data} setData={setData as any} />
        </div>
    );
}
