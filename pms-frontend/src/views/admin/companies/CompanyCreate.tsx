// pms-frontend/src/views/admin/companies/CompanyCreate.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../api/client";

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

/* ========================= Prisma-like enums =========================
   Keep these aligned with your Prisma schema (CompanyStatus/CompanyRole). */
const STATUS_OPTIONS = ["Active", "Inactive"] as const;
const ROLE_OPTIONS = [
  "IH-PMT",
  "Contractor",
  "Consultant",
  "PMC",
  "Supplier"
  
] as const;

type CompanyStatus = typeof STATUS_OPTIONS[number];
type CompanyRole = typeof ROLE_OPTIONS[number];

/* ========================= types ========================= */
type StateRef = { stateId: string; name: string; code: string };
type DistrictRef = { districtId: string; name: string; stateId: string };

type CompanyForm = {
  name: string;
  status: CompanyStatus | "";
  website: string;
  companyRole: CompanyRole | "";

  gstin: string;
  pan: string;
  cin: string;

  primaryContact: string;
  contactMobile: string;
  contactEmail: string;

  address: string;
  stateId: string;
  districtId: string;
  pin: string;

  notes: string;
};

export default function CompanyCreate() {
  const nav = useNavigate();

  /* ---- Admin gate ---- */
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { nav("/login", { replace: true }); return; }
    const payload = decodeJwtPayload(token);
    const isAdmin = !!(payload && (payload.isSuperAdmin || payload.role === "Admin" || payload.userRole === "Admin"));
    if (!isAdmin) nav("/landing", { replace: true });
  }, [nav]);

  /* ---- refs ---- */
  const [statesRef, setStatesRef] = useState<StateRef[]>([]);
  const [districtsRef, setDistrictsRef] = useState<DistrictRef[]>([]);
  const [refsErr, setRefsErr] = useState<string | null>(null);

  /* ---- form ---- */
  const [form, setForm] = useState<CompanyForm>({
    name: "",
    status: "",
    website: "",

    companyRole: "",

    gstin: "",
    pan: "",
    cin: "",

    primaryContact: "",
    contactMobile: "",
    contactEmail: "",

    address: "",
    stateId: "",
    districtId: "",
    pin: "",

    notes: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /* ========================= load reference data ========================= */
  useEffect(() => {
    (async () => {
      setRefsErr(null);
      try {
        const { data: sResp } = await api.get("/admin/states");
        const s: any[] = Array.isArray(sResp) ? sResp : (sResp?.states || []);
        setStatesRef(s);
      } catch (e: any) {
        setStatesRef([]);
        setRefsErr(
          e?.response?.data?.error ||
          e?.message ||
          "Failed to load reference data."
        );
      }
    })();
  }, []);

  useEffect(() => {
    if (!form.stateId) { setDistrictsRef([]); setForm(f => ({ ...f, districtId: "" })); return; }
    (async () => {
      try {
        const { data } = await api.get("/admin/districts", { params: { stateId: form.stateId } });
        const dlist = Array.isArray(data) ? data : (data?.districts || []);
        setDistrictsRef(dlist);
        if (!dlist.some((d: DistrictRef) => d.districtId === form.districtId)) {
          setForm(f => ({ ...f, districtId: "" }));
        }
      } catch {
        setDistrictsRef([]);
        setForm(f => ({ ...f, districtId: "" }));
      }
    })();
  }, [form.stateId]);

  /* ========================= handlers ========================= */
  const set = <K extends keyof CompanyForm>(key: K, val: CompanyForm[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const normalize = (payload: Record<string, any>) => {
    // PAN/GSTIN uppercase; PIN & mobile digits only; website ensure scheme.
    if (payload.pan) payload.pan = String(payload.pan).toUpperCase().trim();
    if (payload.gstin) payload.gstin = String(payload.gstin).toUpperCase().trim();
    if (payload.contactMobile) payload.contactMobile = String(payload.contactMobile).replace(/\D+/g, "");
    if (payload.pin) payload.pin = String(payload.pin).replace(/\D+/g, "");
    if (payload.website) {
      const w = String(payload.website).trim();
      payload.website = /^https?:\/\//i.test(w) ? w : (w ? `https://${w}` : "");
    }
    return payload;
  };

  const validate = (p: Record<string, any>) => {
    if (!p.name) throw new Error("Company Name is required.");
    if (!p.status) throw new Error("Status is required.");
    if (!p.companyRole) throw new Error("Primary Specialisation (Role) is required.");

    if (p.contactEmail && !/^\S+@\S+\.\S+$/.test(p.contactEmail))
      throw new Error("Contact Email seems invalid.");
    if (p.contactMobile && !/^\d{10}$/.test(p.contactMobile))
      throw new Error("Mobile must be a 10-digit number.");
    if (p.pin && !/^\d{6}$/.test(p.pin))
      throw new Error("PIN must be a 6-digit number.");
    if (p.gstin && !/^[0-9A-Z]{15}$/.test(p.gstin))
      throw new Error("GSTIN must be 15 characters (A–Z, 0–9).");
    if (p.pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(p.pan))
      throw new Error("PAN must be 10 characters (ABCDE1234F).");
  };

  const onSubmit = async () => {
    setErr(null);
    setSubmitting(true);
    try {
      // Build payload exactly as Prisma model fields (backend expects these keys)
      const payload: Record<string, any> = {};
      Object.entries(form).forEach(([k, v]) => {
        payload[k] = typeof v === "string" ? v.trim() : v;
      });

      normalize(payload);
      validate(payload);

      await api.post("/admin/companies", payload);
      nav("/admin/companies", { replace: true });
    } catch (e: any) {
      const s = e?.response?.status;
      const msg =
        s === 401
          ? "Unauthorized (401). Please sign in again."
          : e?.response?.data?.error || e?.message || "Failed to create company.";
      setErr(msg);
      if (s === 401) {
        localStorage.removeItem("token");
        setTimeout(() => nav("/login", { replace: true }), 250);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = useMemo(() => {
    return !!(form.name && form.status && form.companyRole) && !submitting;
  }, [form.name, form.status, form.companyRole, submitting]);

  /* ========================= ui ========================= */
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-yellow-50 dark:from-neutral-900 dark:to-neutral-950 px-4 sm:px-6 lg:px-10 py-8">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold dark:text-white">Create Company</h1>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Enter company details in the sections below, then save.
            </p>
            {refsErr && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{refsErr}</p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              className="px-4 py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
              onClick={() => nav("/admin/companies")}
              type="button"
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
              onClick={onSubmit}
              disabled={!canSubmit}
            >
              {submitting ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {err && (
          <div className="mb-4 p-3 rounded-lg text-sm text-red-700 bg-red-50 dark:bg-red-950/30 dark:text-red-300 border border-red-200 dark:border-red-900">
            {err}
          </div>
        )}

        {/* ============ Summary ============ */}
        <Section title="Summary">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Company Name"
              value={form.name}
              onChange={(v) => set("name", v)}
              placeholder="e.g., Acme Infra Pvt Ltd"
              required
            />
            <SelectStrict
              label="Status"
              value={form.status}
              onChange={(v) => set("status", v as CompanyStatus)}
              options={STATUS_OPTIONS.map(s => ({ value: s, label: s }))}
              placeholder="Select status"
            />
            <SelectStrict
              label="Primary Specialisation (Role)"
              value={form.companyRole}
              onChange={(v) => set("companyRole", v as CompanyRole)}
              options={ROLE_OPTIONS.map(r => ({ value: r, label: r }))}
              placeholder="Select role"
            />
            <Input
              label="Website"
              value={form.website}
              onChange={(v) => set("website", v)}
              placeholder="https://example.com"
              type="url"
            />
          </div>
        </Section>

        {/* ============ Registration & Contact ============ */}
        <Section title="Registration and Contact">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="GSTIN" value={form.gstin} onChange={(v) => set("gstin", v.toUpperCase())} placeholder="15-digit GSTIN" />
            <Input label="PAN" value={form.pan} onChange={(v) => set("pan", v.toUpperCase())} placeholder="ABCDE1234F" />
            <Input label="CIN" value={form.cin} onChange={(v) => set("cin", v.toUpperCase())} placeholder="L12345DL2010PLC123456" />
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Primary Contact" value={form.primaryContact} onChange={(v) => set("primaryContact", v)} placeholder="Full name" />
            <Input label="Contact Mobile" value={form.contactMobile} onChange={(v) => set("contactMobile", v.replace(/\D+/g, ""))} placeholder="10-digit mobile" />
            <Input label="Contact Email" value={form.contactEmail} onChange={(v) => set("contactEmail", v)} placeholder="name@company.com" type="email" />
          </div>
        </Section>

        {/* ============ Location ============ */}
        <Section title="Location">
          <div className="grid grid-cols-1 gap-4">
            <Input
              label="Address"
              value={form.address}
              onChange={(v) => set("address", v)}
              placeholder="Flat / Building, Street, Area"
            />
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SelectStrict
              label="State / UT"
              value={form.stateId}
              onChange={(v) => set("stateId", v)}
              options={statesRef.map((s) => ({ value: s.stateId, label: s.name || s.code || s.stateId }))}
              placeholder="Select state"
            />
            <SelectStrict
              label="District"
              value={form.districtId}
              onChange={(v) => set("districtId", v)}
              options={districtsRef.map((d) => ({ value: d.districtId, label: d.name || d.districtId }))}
              placeholder={form.stateId ? "Select district" : "Select state first"}
              disabled={!form.stateId}
            />
            <Input label="PIN" value={form.pin} onChange={(v) => set("pin", v.replace(/\D+/g, ""))} placeholder="6-digit PIN" />
          </div>
        </Section>

        {/* ============ Notes & Description ============ */}
        <Section title="Notes and Description">
          <TextArea
            label="Notes"
            value={form.notes}
            onChange={(v) => set("notes", v)}
            placeholder="Any internal notes or a brief description…"
            rows={4}
          />
        </Section>
      </div>
    </div>
  );
}

/* ========================= small UI bits ========================= */
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
  label, value, onChange, placeholder, type = "text", required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
        {label}{required ? " *" : ""}
      </span>
      <input
        className="w-full px-3 py-2 rounded-md border dark:border-neutral-800 dark:bg-neutral-900 dark:text-white focus:outline-none focus:ring"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        required={required}
      />
    </label>
  );
}

function TextArea({
  label, value, onChange, placeholder, rows = 3,
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
      <span className="block text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
        {label}
      </span>
      <select
        className="w-full px-3 py-2 rounded-md border dark:border-neutral-800 dark:bg-neutral-900 dark:text-white focus:outline-none focus:ring disabled:opacity-60"
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
