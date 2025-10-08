// pms-frontend/src/views/admin/ref/MaterialForm.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../../../api/client";

// ---- Error helpers ----
function extractServerError(e: any): string {
  // Axios-style payload
  const data = e?.response?.data;

  // 1) Prisma known errors (very common)
  //    If your backend forwards `code`, this turns P2002 (unique) into a friendly line.
  const prismaCode = data?.code || data?.meta?.code || e?.code;
  if (prismaCode === 'P2002') {
    // Prisma P2002 typically includes `meta.target` like ['RefMaterial_code_key']
    const target = data?.meta?.target || data?.target || 'Unique field';
    return `Duplicate value: ${Array.isArray(target) ? target.join(', ') : target} must be unique.`;
  }

  // 2) Nest ValidationPipe: message can be string[] or string
  //    e.g. { statusCode: 400, message: ["name must be a string", ...], error: "Bad Request" }
  if (Array.isArray(data?.message) && data?.message.length) {
    return data.message.join(', ');
  }
  if (typeof data?.message === 'string' && data.message) {
    return data.message;
  }

  // 3) Common server shapes
  if (typeof data?.error === 'string' && data.error) {
    return data.error;
  }
  if (typeof data?.detail === 'string' && data.detail) {
    return data.detail;
  }
  if (typeof data === 'string' && data) {
    return data;
  }

  // 4) Axios top-level message / fallback
  if (typeof e?.message === 'string' && e.message) {
    return e.message;
  }
  return 'Request failed (400). Please check the field values and try again.';
}

/* ========================= Types ========================= */
export type RefMaterial = {
  id: string;
  code?: string | null;
  name: string;
  discipline?: "Civil" | "Architecture" | "MEP.ELE" | "MEP.PHE" | "MEP.HVC" | "Finishes" | null;
  category?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  standards?: string[] | null;
  fireRating?: string | null;
  keyProps?: string[] | null;
  properties?: any | null;
  version?: number | null;
  // NEW semver fields
  versionLabel?: string | null;
  versionMajor?: number | null;
  versionMinor?: number | null;
  versionPatch?: number | null;
  
  notes?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

const DISCIPLINES = ["Civil", "Architecture", "MEP.ELE", "MEP.PHE", "MEP.HVC", "Finishes"] as const;
const CATEGORIES = ["Concrete", "Rebar & Steel", "Masonry Block", "Aggregates", "Formwork", "Waterproofing"] as const;
const STATUSES = ["Active", "Draft", "Inactive", "Archived"] as const;

/* ========================= Helpers ========================= */
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
      className={"w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white " + (props.className || "")}
    />
  );
}
function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={"w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white " + (props.className || "")}
    />
  );
}
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={"w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white " + (props.className || "")}
    />
  );
}

function toCSV(a?: string[] | null) {
  return (a && a.length) ? a.join(", ") : "";
}
function fromCSV(s: string): string[] {
  return s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/* ========================= Core Form ========================= */
function useMaterial(id?: string) {
  const [data, setData] = useState<Partial<RefMaterial> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setData({ status: "Active", version: 1, versionLabel: "1.0.0", standards: [], keyProps: [] });
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get(`/admin/ref/materials/${id}`);
        if (!cancelled) setData(res.data);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  return { data, setData, loading, error } as const;
}

function FormBody({ data, setData }: { data: Partial<RefMaterial>; setData: (p: Partial<RefMaterial>) => void }) {
  function patch(p: Partial<RefMaterial>) { setData({ ...data, ...p }); }

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Name" required>
          <Input value={data.name || ""} onChange={(e) => patch({ name: e.target.value })} placeholder="e.g., Ordinary Portland Cement (OPC 43)" />
        </Field>
        <Field label="Code">
          <Input value={data.code || ""} onChange={(e) => patch({ code: e.target.value })} placeholder="SKU / Catalog Code" />
        </Field>
        <Field label="Status" required>
          <Select value={data.status || "Active"} onChange={(e) => patch({ status: e.target.value })}>
            {STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Discipline">
          <Select value={data.discipline || ""} onChange={(e) => patch({ discipline: (e.target.value || undefined) as any })}>
            <option value="">—</option>
            {DISCIPLINES.map((d) => (<option key={d} value={d}>{d}</option>))}
          </Select>
        </Field>
        <Field label="Category">
          <Select value={data.category || ""} onChange={(e) => patch({ category: e.target.value || undefined })}>
            <option value="">—</option>
            {CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
          </Select>
        </Field>
        <Field label="Version (e.g., 1, 1.2, 1.2.3)">
          <Input
            type="text"
            value={(data as any).versionLabel ?? (data.version != null ? String(data.version) : "")}
            onChange={(e) => patch({ ...(data as any), versionLabel: e.target.value })}
            placeholder="1.2.3"
            pattern="^\d+(?:\.\d+){0,2}$"   // HTML regex, but in JSX you must escape backslashes:
            // pattern="^\\d+(?:\\.\\d+){0,2}$"
            title="Use 1 or 1.2 or 1.2.3"
          />
        </Field>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Manufacturer">
          <Input value={data.manufacturer || ""} onChange={(e) => patch({ manufacturer: e.target.value })} placeholder="e.g., UltraTech" />
        </Field>
        <Field label="Model">
          <Input value={data.model || ""} onChange={(e) => patch({ model: e.target.value })} placeholder="e.g., OPC 43" />
        </Field>
        <Field label="Fire Rating">
          <Input value={data.fireRating || ""} onChange={(e) => patch({ fireRating: e.target.value })} placeholder="e.g., 2 hr / Class A" />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Standards (comma separated)">
          <Input value={toCSV(data.standards)} onChange={(e) => patch({ standards: fromCSV(e.target.value) })} placeholder="IS 456, ASTM C150" />
        </Field>
        <Field label="Key Properties (comma separated)">
          <Input value={toCSV(data.keyProps)} onChange={(e) => patch({ keyProps: fromCSV(e.target.value) })} placeholder="Grade 43, Type I" />
        </Field>
      </div>

      <Field label="Notes">
        <Textarea rows={4} value={data.notes || ""} onChange={(e) => patch({ notes: e.target.value })} placeholder="Any extra details…" />
      </Field>
    </div>
  );
}

/* ========================= Create Page ========================= */
export function MaterialNewPage() {
  const nav = useNavigate();
  const { data, setData } = useMaterial(undefined);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSave() {
    if (!data?.name) { setErr("Name is required"); return; }
    setSaving(true);
    try {
      const payload = {
        code: data.code || null,
        name: data.name,
        discipline: data.discipline || null,
        category: data.category || null,
        manufacturer: data.manufacturer || null,
        model: data.model || null,
        standards: data.standards || [],
        fireRating: data.fireRating || null,
        keyProps: data.keyProps || [],
        //version: Number(data.version ?? 1),
        versionLabel: (data as any).versionLabel ?? (data.version != null ? String(data.version) : null),
        notes: data.notes || null,
        status: data.status || "Active",
      };
      const problems: string[] = [];
      if (!payload.name?.trim()) problems.push('Name is required.');
      if (payload.code && payload.code.length > 120) problems.push('Code must be ≤ 120 characters.');
      if (payload.name && payload.name.length > 240) problems.push('Name must be ≤ 240 characters.');
      //if (!Number.isFinite(payload.version) || Number(payload.version) < 1) problems.push('Version must be a positive number.');

      const vlabel = payload.versionLabel?.trim();
      if (vlabel && !/^\d+(\.\d+){0,2}$/.test(vlabel)) {
        problems.push('Version must be 1, 1.2, or 1.2.3.');
      }

      if (problems.length) {
        setErr(problems.join(' '));
        setSaving(false);
        return;

      }

      await api.post("/admin/ref/materials", payload);
      nav("/admin/ref/materiallib");
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
        <h1 className="text-xl font-semibold dark:text-white">New Material</h1>
        <div className="flex items-center gap-2">
          <button className="px-3 py-2 rounded-lg bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-white" onClick={() => nav(-1)}>Cancel</button>
          <button className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50" disabled={saving} onClick={onSave}>Save</button>
        </div>
      </div>
      {err && <div className="mb-3 text-sm text-red-600">{err}</div>}
      <FormBody data={data} setData={setData as any} />
    </div>
  );
}

/* ========================= Edit Page ========================= */
export function MaterialEditPage() {
  const nav = useNavigate();
  const { id } = useParams();
  const { data, setData, loading, error } = useMaterial(id);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSave() {
    if (!data?.name) { setErr("Name is required"); return; }
    setSaving(true);
    try {
      const payload = {
        code: data.code || null,
        name: data.name,
        discipline: data.discipline || null,
        category: data.category || null,
        manufacturer: data.manufacturer || null,
        model: data.model || null,
        standards: data.standards || [],
        fireRating: data.fireRating || null,
        keyProps: data.keyProps || [],
        //version: Number(data.version ?? 1),
        versionLabel: (data as any).versionLabel ?? (data.version != null ? String(data.version) : null),
        notes: data.notes || null,
        status: data.status || "Active",
      };
      const problems: string[] = [];
      if (!payload.name?.trim()) problems.push('Name is required.');
      if (payload.code && payload.code.length > 120) problems.push('Code must be ≤ 120 characters.');
      if (payload.name && payload.name.length > 240) problems.push('Name must be ≤ 240 characters.');

      const vlabel = payload.versionLabel?.trim();
      if (vlabel && !/^\d+(?:\.\d+){0,2}$/.test(vlabel)) {
        problems.push('Version must be 1, 1.2, or 1.2.3.');
      }
      if (problems.length) {
        setErr(problems.join(' '));
        setSaving(false);
        return;
      }

      await api.patch(`/admin/ref/materials/${id}`, payload);
      nav("/admin/ref/materiallib");
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
        <h1 className="text-xl font-semibold dark:text-white">Edit Material</h1>
        <div className="flex items-center gap-2">
          <button className="px-3 py-2 rounded-lg bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-white" onClick={() => nav(-1)}>Cancel</button>
          <button className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50" disabled={saving} onClick={onSave}>Save Changes</button>
        </div>
      </div>
      {err && <div className="mb-3 text-sm text-red-600">{err}</div>}
      <FormBody data={data} setData={setData as any} />
    </div>
  );
}


