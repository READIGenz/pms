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
type Discipline = (typeof DISCIPLINES)[number];

const STATUS_OPTIONS = ["Active", "Draft", "Inactive", "Archived"] as const;
type ActivityStatus = (typeof STATUS_OPTIONS)[number];

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

  // Page title + shell subtitle
  // useEffect(() => {
  //   document.title = "Trinity PMS — Create Activity";
  //   (window as any).__ADMIN_SUBTITLE__ = "New activity.";
  //   return () => {
  //     (window as any).__ADMIN_SUBTITLE__ = "";
  //   };
  // }, []);

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
          : form.version != null
          ? String(form.version)
          : null;

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
      nav("/admin/ref/activitylib", {
        replace: true,
        state: { refresh: true },
      });
    } catch (e: any) {
      const s = e?.response?.status;
      const msg =
        s === 401
          ? "Unauthorized (401). Please sign in again."
          : e?.response?.data?.error ||
            e?.message ||
            "Failed to create activity.";
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
    <div className="min-h-screen bg-white-50 dark:bg-neutral-950 px-4 sm:px-6 lg:px-0 pt-0 pb-6">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-4 pt-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              Create Activity
            </h1>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
              {form.code ? `${form.code} • ` : ""}
              {form.title || "New activity"}
            </p>
          </div>

          <div className="flex shrink-0 gap-2">
            <button
              className="h-8 rounded-full border border-slate-200 bg-white px-3 text-[12.5px] text-slate-700 shadow-sm hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
              onClick={() => nav("/admin/ref/activitylib")}
              type="button"
            >
              Back
            </button>

            <button
              className="h-8 rounded-full bg-[#00379C] px-3 text-[12.5px] font-semibold text-white shadow-sm hover:brightness-110 disabled:opacity-60"
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
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {err}
          </div>
        )}

        {/* Form */}
        <div className="space-y-6">
          <Section title="Basics">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Business Code (optional unique)"
                value={form.code ?? ""}
                onChange={(v) => setField("code", v as any)}
                placeholder="e.g., RCC-610"
              />
              <Input
                label="Version (e.g., 1, 1.2, 1.2.3)"
                value={
                  (form.versionLabel ??
                    (form.version != null
                      ? String(form.version)
                      : "")) as string
                }
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
                options={["", ...(form.discipline ? stageOptions : [])].map(
                  (s) => ({
                    value: s,
                    label: s || "—",
                  })
                )}
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
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Last updated: —
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

/* ========================= Small UI bits ========================= */

const labelCls =
  "mb-1 block text-[11px] font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400";

const inputCls =
  "h-9 w-full rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[13px] text-slate-800 placeholder:text-slate-400 shadow-sm focus:outline-none focus:border-transparent focus:ring-2 focus:ring-[#00379C]/25 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:focus:ring-[#FCC020]/25";

const selectCls =
  "h-9 w-full rounded-full border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 shadow-sm focus:outline-none focus:border-transparent focus:ring-2 focus:ring-[#00379C]/25 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:focus:ring-[#FCC020]/25";

const textareaCls =
  "w-full min-h-[84px] resize-y rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm focus:outline-none focus:border-transparent focus:ring-2 focus:ring-[#00379C]/25 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:focus:ring-[#FCC020]/25";

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
      <span className={labelCls}>{label}</span>
      <input
        className={inputCls}
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
      <span className={labelCls}>{label}</span>
      <textarea
        className={textareaCls}
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
      <span className={labelCls}>{label}</span>
      <select
        className={selectCls}
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
      <div className={labelCls}>{label}</div>
      <div className="flex flex-wrap gap-2">
        {all.map((v) => {
          const active = selectedSet.has(norm(v));
          return (
            <button
              key={v}
              type="button"
              onClick={() => toggle(v)}
              className={
                active
                  ? "rounded-full border border-[#23A192]/30 bg-[#23A192]/10 px-3 py-1 text-xs font-semibold text-[#0F6F64] shadow-sm dark:border-[#23A192]/40 dark:bg-[#23A192]/15 dark:text-[#7FE3D6]"
                  : "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
              }
            >
              {v}
            </button>
          );
        })}
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
