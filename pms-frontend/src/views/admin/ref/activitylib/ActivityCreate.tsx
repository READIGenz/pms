// pms-frontend/src/views/admin/ref/ActivityCreate.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../../api/client";

/* ========================= JWT helper (same pattern as other file) ========================= */
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

/* ========================= Types (shared with ActivityLib) ========================= */
const DISCIPLINES = ["Civil", "MEP", "Finishes"] as const;
type Discipline = typeof DISCIPLINES[number];

const STATUS_OPTIONS = ["Active", "Draft", "Inactive", "Archived"] as const;
type ActivityStatus = typeof STATUS_OPTIONS[number];

export type RefActivity = {
  id: string;
  code: string | null;
  title: string;
  discipline: Discipline;
  stageLabel: string | null;
  phase?: string[];
  element?: string[];
  system: string[];
  nature: string[];
  method: string[];
  version: number;
    versionLabel?: string | null; // NEW
  notes: string | null;
  status: ActivityStatus;
  updatedAt: string; // ISO
  createdAt?: string;
};

/* Stage library (same as in ActivityLib) */
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

/* Tag facets (same as in ActivityLib) */
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
} as const;

/* ========================= Page ========================= */
export default function ActivityCreate() {
  const nav = useNavigate();

  /* ---- Admin gate (same behavior as your other file) ---- */
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

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Initial blank form with sensible defaults/placeholders
  const [form, setForm] = useState<Partial<RefActivity>>({
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
  });

  const canSave = !!(form?.title && form?.discipline);
  const stageOptions = useMemo(
    () => (form?.discipline ? STAGE_LIBRARY[form.discipline] || [] : []),
    [form?.discipline]
  );

  const setField = <K extends keyof RefActivity>(key: K, val: any) =>
    setForm((f) => ({ ...(f || {}), [key]: val }));

  const handleSave = async () => {
    if (!form) return;
    setErr(null);
    setSaving(true);
    try {
      const out: any = {};
const copyFields = [
  "code",
  "title",
  "discipline",
  "stageLabel",
  "phase",
  "element",
  "system",
  "nature",
  "method",
  "notes",
  "status",
] as const;
copyFields.forEach((k) => (out[k] = (form as any)[k]));

["system", "nature", "method", "phase", "element"].forEach((k) => {
  out[k] = Array.isArray(out[k]) ? out[k] : [];
});
["code", "title", "stageLabel", "notes"].forEach((k) => {
  if (out[k] != null) out[k] = String(out[k]).trim();
});

// --- NEW: prefer versionLabel; keep legacy version as fallback if you want ---
const vLabel = (form as any).versionLabel;
out.versionLabel =
  typeof vLabel === "string"
    ? vLabel.trim()
    : (form.version != null ? String(form.version) : null);

// Optional legacy numeric (harmless for backend; can remove if you like)
const vNum = Number((form as any).version);
out.version = Number.isFinite(vNum) ? vNum : 1;

// Normalize empties
if (out.code === "") out.code = null;
if (out.stageLabel === "") out.stageLabel = null;
if (!STATUS_OPTIONS.includes(out.status)) out.status = "Draft";

// Validate semver format for 1 / 1.2 / 1.2.3
const problems: string[] = [];
const v = out.versionLabel?.trim();
if (v && !/^\d+(?:\.\d+){0,2}$/.test(v)) {
  problems.push("Version must be 1, 1.2, or 1.2.3.");
}
if (!out.title) problems.push("Title is required.");
if (!out.discipline) problems.push("Discipline is required.");
if (problems.length) {
  setErr(problems.join(" "));
  setSaving(false);
  return;
}


      await api.post(`/admin/ref/activities`, out);
      nav("/admin/ref/activitylib", { replace: true, state: { refresh: true } });
    } catch (e: any) {
      const s = e?.response?.status;
      const msg =
        s === 401
          ? "Unauthorized (401). Please sign in again."
          : e?.response?.data?.error || e?.message || "Failed to create activity.";
      setErr(msg);
      if (s === 401) {
        localStorage.removeItem("token");
        setTimeout(() => nav("/login", { replace: true }), 250);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-indigo-50 dark:from-neutral-900 dark:to-neutral-950 px-4 sm:px-6 lg:px-10 py-8">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold dark:text-white">
              Create Activity
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {form.code ? `${form.code} • ` : ""}{form.title || "New activity"}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className="px-3 py-2 rounded border text-sm hover:bg-gray-50 dark:border-neutral-800 dark:hover:bg-neutral-800"
              onClick={() => nav("/admin/ref/activitylib")}
              type="button"
            >
              Back
            </button>
            <button
              className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-sm disabled:opacity-60"
              onClick={handleSave}
              type="button"
              disabled={!canSave || !!saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {/* Flash error */}
        {err && (
          <div className="mb-4 p-3 rounded-lg text-sm text-red-700 bg-red-50 dark:bg-red-950/30 dark:text-red-300 border border-red-200 dark:border-red-900">
            {err}
          </div>
        )}

        {/* Form */}
        <div className="space-y-6">
          <Section title="Basics">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Business Code (optional unique)"
                value={form.code ?? ""}
                onChange={(v) => setField("code", v as any)}
                placeholder="e.g., RCC-610"
              />
              <Input
  label="Version (e.g., 1, 1.2, 1.2.3)"
  value={(form.versionLabel ?? (form.version != null ? String(form.version) : "")) as string}
  onChange={(v) => setField("versionLabel", v as any)}
  placeholder="1.2.3"
/>

              <SelectStrict
                label="Status"
                value={(form.status as any) ?? "Draft"}
                onChange={(v) => setField("status", v as ActivityStatus as any)}
                options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
              />
              <div />
              <Input
                label="Title"
                value={form.title ?? ""}
                onChange={(v) => setField("title", v as any)}
                placeholder="Describe the activity clearly"
              />
              <SelectStrict
                label="Discipline"
                value={(form.discipline as any) ?? "Civil"}
                onChange={(v) => setField("discipline", v as Discipline as any)}
                options={DISCIPLINES.map((d) => ({ value: d, label: d }))}
              />
              <SelectStrict
                label="Stage"
                value={form.stageLabel ?? ""}
                onChange={(v) => setField("stageLabel", (v || "") as any)}
                options={["", ...(form.discipline ? stageOptions : [])].map((s) => ({
                  value: s,
                  label: s || "—",
                }))}
                placeholder="— Select Stage —"
              />
            </div>
          </Section>

          <Section title="Facets">
            <TagPicker
              label="Phase"
              all={FACETS.Phase}
              selected={form.phase || []}
              onChange={(next) => setField("phase", next as any)}
            />
            <div className="h-3" />
            <TagPicker
              label="Element"
              all={FACETS.Element}
              selected={form.element || []}
              onChange={(next) => setField("element", next as any)}
            />
            <div className="h-3" />
            <TagPicker
              label="System"
              all={FACETS.System}
              selected={form.system || []}
              onChange={(next) => setField("system", next as any)}
            />
            <div className="h-3" />
            <TagPicker
              label="Nature"
              all={FACETS.Nature}
              selected={form.nature || []}
              onChange={(next) => setField("nature", next as any)}
            />
            <div className="h-3" />
            <TagPicker
              label="Method"
              all={FACETS.Method}
              selected={form.method || []}
              onChange={(next) => setField("method", next as any)}
            />
          </Section>

          <Section title="Notes">
            <TextArea
              label="Notes"
              value={form.notes ?? ""}
              onChange={(v) => setField("notes", v as any)}
              placeholder="Any internal notes or description…"
              rows={4}
            />
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Last updated: —
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

/* ========================= Small UI bits ========================= */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-2">
        {title}
      </div>
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border dark:border-neutral-800 p-4">
        {children}
      </div>
    </section>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
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
        disabled={disabled}
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

function TagPicker({
  label,
  all,
  selected,
  onChange,
}: {
  label: string;
  all: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const norm = (s: string) => s.trim().toLowerCase();
  const selectedSet = new Set(selected.map(norm));
  const toggle = (v: string) => {
    const has = selectedSet.has(norm(v));
    const next = has
      ? selected.filter((x) => norm(x) !== norm(v))
      : [...selected, v];
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
            className={`px-2 py-1 rounded-full border text-xs ${
              selectedSet.has(norm(v))
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
