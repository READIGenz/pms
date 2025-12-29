// pms-frontend/src/views/admin/ref/MaterialForm.tsx
// UI/theme updated to match ActivityCreate.tsx exactly (NO logic/API changes).
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../../../api/client";

// ---- Error helpers ----
function extractServerError(e: any): string {
  const data = e?.response?.data;
  const prismaCode = data?.code || data?.meta?.code || e?.code;
  if (prismaCode === "P2002") {
    const target = data?.meta?.target || data?.target || "Unique field";
    return `Duplicate value: ${
      Array.isArray(target) ? target.join(", ") : target
    } must be unique.`;
  }
  if (Array.isArray(data?.message) && data?.message.length) {
    return data.message.join(", ");
  }
  if (typeof data?.message === "string" && data.message) return data.message;
  if (typeof data?.error === "string" && data.error) return data.error;
  if (typeof data?.detail === "string" && data.detail) return data.detail;
  if (typeof data === "string" && data) return data;
  if (typeof e?.message === "string" && e.message) return e.message;
  return "Request failed (400). Please check the field values and try again.";
}

/* ========================= Types ========================= */
export type RefMaterial = {
  id: string;
  code?: string | null;
  name: string;
  discipline?:
    | "Civil"
    | "Architecture"
    | "MEP.ELE"
    | "MEP.PHE"
    | "MEP.HVC"
    | "Finishes"
    | null;
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

const DISCIPLINES = [
  "Civil",
  "Architecture",
  "MEP.ELE",
  "MEP.PHE",
  "MEP.HVC",
  "Finishes",
] as const;
const CATEGORIES = [
  "Concrete",
  "Rebar & Steel",
  "Masonry Block",
  "Aggregates",
  "Formwork",
  "Waterproofing",
] as const;
const STATUSES = ["Active", "Draft", "Inactive", "Archived"] as const;

/* ========================= Helpers (styled like ActivityCreate.tsx) ========================= */
const labelCls =
  "mb-1 block text-[11px] font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400";

const inputCls =
  "h-9 w-full rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[13px] text-slate-800 placeholder:text-slate-400 shadow-sm " +
  "focus:outline-none focus:border-transparent focus:ring-2 focus:ring-[#00379C]/25 disabled:opacity-60 " +
  "dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:focus:ring-[#FCC020]/25 ";

const selectCls =
  "h-9 w-full rounded-full border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 shadow-sm " +
  "focus:outline-none focus:border-transparent focus:ring-2 focus:ring-[#00379C]/25 disabled:opacity-60 " +
  "dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:focus:ring-[#FCC020]/25 ";

const textareaCls =
  "w-full min-h-[84px] resize-y rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm " +
  "focus:outline-none focus:border-transparent focus:ring-2 focus:ring-[#00379C]/25 disabled:opacity-60 " +
  "dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:focus:ring-[#FCC020]/25 ";

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className={labelCls}>
        {label} {required ? <span className="text-red-500">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputCls + (props.className || "")} />;
}
function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...props} className={textareaCls + (props.className || "")} />
  );
}
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={selectCls + (props.className || "")} />;
}

function toCSV(a?: string[] | null) {
  return a && a.length ? a.join(", ") : "";
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
      setData({
        status: "Active",
        version: 1,
        versionLabel: "1.0.0",
        standards: [],
        keyProps: [],
      });
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
    return () => {
      cancelled = true;
    };
  }, [id]);

  return { data, setData, loading, error } as const;
}

function FormBody({
  data,
  setData,
}: {
  data: Partial<RefMaterial>;
  setData: (p: Partial<RefMaterial>) => void;
}) {
  function patch(p: Partial<RefMaterial>) {
    setData({ ...data, ...p });
  }

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Name" required>
          <Input
            value={data.name || ""}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="e.g., Ordinary Portland Cement (OPC 43)"
          />
        </Field>
        <Field label="Code">
          <Input
            value={data.code || ""}
            onChange={(e) => patch({ code: e.target.value })}
            placeholder="SKU / Catalog Code"
          />
        </Field>
        <Field label="Status" required>
          <Select
            value={data.status || "Active"}
            onChange={(e) => patch({ status: e.target.value })}
          >
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
            value={data.discipline || ""}
            onChange={(e) =>
              patch({ discipline: (e.target.value || undefined) as any })
            }
          >
            <option value="">—</option>
            {DISCIPLINES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category">
          <Select
            value={data.category || ""}
            onChange={(e) => patch({ category: e.target.value || undefined })}
          >
            <option value="">—</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Version (e.g., 1, 1.2, 1.2.3)">
          <Input
            type="text"
            value={
              (data as any).versionLabel ??
              (data.version != null ? String(data.version) : "")
            }
            onChange={(e) =>
              patch({ ...(data as any), versionLabel: e.target.value })
            }
            placeholder="1.2.3"
            pattern="^\\d+(?:\\.\\d+){0,2}$"
            title="Use 1 or 1.2 or 1.2.3"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Manufacturer">
          <Input
            value={data.manufacturer || ""}
            onChange={(e) => patch({ manufacturer: e.target.value })}
            placeholder="e.g., UltraTech"
          />
        </Field>
        <Field label="Model">
          <Input
            value={data.model || ""}
            onChange={(e) => patch({ model: e.target.value })}
            placeholder="e.g., OPC 43"
          />
        </Field>
        <Field label="Fire Rating">
          <Input
            value={data.fireRating || ""}
            onChange={(e) => patch({ fireRating: e.target.value })}
            placeholder="e.g., 2 hr / Class A"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Standards (comma separated)">
          <Input
            value={toCSV(data.standards)}
            onChange={(e) => patch({ standards: fromCSV(e.target.value) })}
            placeholder="IS 456, ASTM C150"
          />
        </Field>
        <Field label="Key Properties (comma separated)">
          <Input
            value={toCSV(data.keyProps)}
            onChange={(e) => patch({ keyProps: fromCSV(e.target.value) })}
            placeholder="Grade 43, Type I"
          />
        </Field>
      </div>

      <Field label="Notes">
        <Textarea
          rows={4}
          value={data.notes || ""}
          onChange={(e) => patch({ notes: e.target.value })}
          placeholder="Any extra details…"
        />
      </Field>
    </div>
  );
}

/* ========================= Shared Section (match ActivityCreate) ========================= */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-white/10 dark:bg-neutral-950 sm:px-6 sm:py-5">
        <div className="mb-4 flex items-center gap-3">
          <span className="inline-block h-5 w-1 rounded-full bg-[#FCC020]" />
          <div className="text-[11px] font-extrabold uppercase tracking-widest text-[#00379C] dark:text-[#FCC020]">
            {title}
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}

/* ========================= Create Page ========================= */
export function MaterialNewPage() {
  const nav = useNavigate();
  const { data, setData } = useMaterial(undefined);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSave() {
    if (!data?.name) {
      setErr("Name is required");
      return;
    }
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
        versionLabel:
          (data as any).versionLabel ??
          (data.version != null ? String(data.version) : null),
        notes: data.notes || null,
        status: data.status || "Active",
      };

      const problems: string[] = [];
      if (!payload.name?.trim()) problems.push("Name is required.");
      if (payload.code && payload.code.length > 120)
        problems.push("Code must be ≤ 120 characters.");
      if (payload.name && payload.name.length > 240)
        problems.push("Name must be ≤ 240 characters.");

      const vlabel = payload.versionLabel?.trim();
      if (vlabel && !/^\d+(\.\d+){0,2}$/.test(vlabel)) {
        problems.push("Version must be 1, 1.2, or 1.2.3.");
      }

      if (problems.length) {
        setErr(problems.join(" "));
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
    <div className="min-h-screen bg-white-50 dark:bg-neutral-950 px-4 sm:px-6 lg:px-0 pt-0 pb-6">
      <div className="mx-auto max-w-4xl">
        {/* Header (match ActivityCreate) */}
        <div className="mb-5 flex items-start justify-between gap-4 pt-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              New Material
            </h1>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
              {data.code ? `${data.code} • ` : ""}
              {data.name || "New material"}
            </p>
          </div>

          <div className="flex shrink-0 gap-2">
            <button
              className="h-8 rounded-full border border-slate-200 bg-white px-3 text-[12.5px] text-slate-700 shadow-sm hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
              onClick={() => nav(-1)}
              type="button"
            >
              Back
            </button>
            <button
              className="h-8 rounded-full bg-[#00379C] px-3 text-[12.5px] font-semibold text-white shadow-sm hover:brightness-110 disabled:opacity-60"
              disabled={saving}
              onClick={onSave}
              type="button"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {err && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {err}
          </div>
        )}

        <Section title="Basics">
          <FormBody data={data} setData={setData as any} />
        </Section>
      </div>
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
    if (!data?.name) {
      setErr("Name is required");
      return;
    }
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
        versionLabel:
          (data as any).versionLabel ??
          (data.version != null ? String(data.version) : null),
        notes: data.notes || null,
        status: data.status || "Active",
      };

      const problems: string[] = [];
      if (!payload.name?.trim()) problems.push("Name is required.");
      if (payload.code && payload.code.length > 120)
        problems.push("Code must be ≤ 120 characters.");
      if (payload.name && payload.name.length > 240)
        problems.push("Name must be ≤ 240 characters.");

      const vlabel = payload.versionLabel?.trim();
      if (vlabel && !/^\d+(?:\.\d+){0,2}$/.test(vlabel)) {
        problems.push("Version must be 1, 1.2, or 1.2.3.");
      }
      if (problems.length) {
        setErr(problems.join(" "));
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

  if (loading)
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-neutral-950 px-4 sm:px-6 lg:px-10 pt-0 pb-6">
        <div className="mx-auto max-w-4xl pt-4 text-sm text-slate-600 dark:text-slate-300">
          Loading…
        </div>
      </div>
    );

  if (error)
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-neutral-950 px-4 sm:px-6 lg:px-10 pt-0 pb-6">
        <div className="mx-auto max-w-4xl pt-4">
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
          <button
            className="h-8 rounded-full border border-slate-200 bg-white px-3 text-[12.5px] text-slate-700 shadow-sm hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
            onClick={() => nav(-1)}
            type="button"
          >
            Back
          </button>
        </div>
      </div>
    );

  if (!data) return null;

  return (
    <div className="min-h-screen bg-white-50 dark:bg-neutral-950 px-4 sm:px-6 lg:px-0 pt-0 pb-6">
      <div className="mx-auto max-w-4xl">
        {/* Header (match ActivityCreate) */}
        <div className="mb-5 flex items-start justify-between gap-4 pt-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              Edit Material
            </h1>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
              {data.code ? `${data.code} • ` : ""}
              {data.name || "Material"}
            </p>
          </div>

          <div className="flex shrink-0 gap-2">
            <button
              className="h-8 rounded-full border border-slate-200 bg-white px-3 text-[12.5px] text-slate-700 shadow-sm hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
              onClick={() => nav(-1)}
              type="button"
            >
              Back
            </button>
            <button
              className="h-8 rounded-full bg-[#00379C] px-3 text-[12.5px] font-semibold text-white shadow-sm hover:brightness-110 disabled:opacity-60"
              disabled={saving}
              onClick={onSave}
              type="button"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {err && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {err}
          </div>
        )}

        <Section title="Basics">
          <FormBody data={data} setData={setData as any} />
        </Section>

        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Last updated: {data.updatedAt ? fmt(data.updatedAt) : "—"}
        </div>
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
