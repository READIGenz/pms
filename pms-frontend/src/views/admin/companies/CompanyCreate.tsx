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
  "IH_PMT",
  "Contractor",
  "Consultant",
  "PMC",
  "Supplier",
] as const;

const prettyRole = (r?: string | null) => (r === "IH_PMT" ? "IH-PMT" : r ?? "");
const toDbRole = (r?: string | null) => (r === "IH-PMT" ? "IH_PMT" : r ?? "");

type CompanyStatus = (typeof STATUS_OPTIONS)[number];
type CompanyRole = (typeof ROLE_OPTIONS)[number];

/* Prefix mapping for companyCode */
const ROLE_PREFIX: Record<CompanyRole, string> = {
  IH_PMT: "PMT",
  Contractor: "CON",
  Consultant: "CNS",
  PMC: "PMC",
  Supplier: "SUP",
};

/* ========================= types ========================= */
type StateRef = { stateId: string; name: string; code: string };
type DistrictRef = { districtId: string; name: string; stateId: string };

type CompanyForm = {
  companyCode: string; // kept internal; NOT shown in UI
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

  /* ---- refs ---- */
  const [statesRef, setStatesRef] = useState<StateRef[]>([]);
  const [districtsRef, setDistrictsRef] = useState<DistrictRef[]>([]);
  const [refsErr, setRefsErr] = useState<string | null>(null);

  /* ---- form ---- */
  const [form, setForm] = useState<CompanyForm>({
    companyCode: "", // internal only
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
  const [showNote, setShowNote] = useState(false);

  /* ========================= load reference data ========================= */
  useEffect(() => {
    (async () => {
      setRefsErr(null);
      try {
        const { data: sResp } = await api.get("/admin/states");
        const s: any[] = Array.isArray(sResp) ? sResp : sResp?.states || [];
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
    if (!form.stateId) {
      setDistrictsRef([]);
      setForm((f) => ({ ...f, districtId: "" }));
      return;
    }
    (async () => {
      try {
        const { data } = await api.get("/admin/districts", {
          params: { stateId: form.stateId },
        });
        const dlist = Array.isArray(data) ? data : data?.districts || [];
        setDistrictsRef(dlist);
        if (!dlist.some((d: DistrictRef) => d.districtId === form.districtId)) {
          setForm((f) => ({ ...f, districtId: "" }));
        }
      } catch {
        setDistrictsRef([]);
        setForm((f) => ({ ...f, districtId: "" }));
      }
    })();
  }, [form.stateId]);

  /* ========================= helpers ========================= */
  const set = <K extends keyof CompanyForm>(key: K, val: CompanyForm[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const normalize = (payload: Record<string, any>) => {
    if (payload.pan) payload.pan = String(payload.pan).toUpperCase().trim();
    if (payload.gstin)
      payload.gstin = String(payload.gstin).toUpperCase().trim();
    if (payload.contactMobile)
      payload.contactMobile = String(payload.contactMobile).replace(/\D+/g, "");
    if (payload.pin) payload.pin = String(payload.pin).replace(/\D+/g, "");
    if (payload.website) {
      const w = String(payload.website).trim();
      payload.website = /^https?:\/\//i.test(w) ? w : w ? `https://${w}` : "";
    }
    if (payload.companyCode)
      payload.companyCode = String(payload.companyCode).toUpperCase().trim();
    return payload;
  };

  const validate = (p: Record<string, any>) => {
    if (!p.name) throw new Error("Company Name is required.");
    if (!p.status) throw new Error("Status is required.");
    if (!p.companyRole)
      throw new Error("Primary Specialisation (Role) is required.");
    // companyCode is internal; we won't block the user if it's missing—onSubmit ensures it exists.

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

  const parseSeq = (code: string, prefix: string): number | null => {
    const m = new RegExp(`^${prefix}-(\\d{4})$`, "i").exec(code || "");
    return m ? parseInt(m[1], 10) : null;
  };

  const nextCodeFromList = (role: CompanyRole, list: any[]): string => {
    const prefix = ROLE_PREFIX[role];
    let maxSeq = 0;
    for (const c of list) {
      const code = c?.companyCode ?? c?.company_code ?? "";
      const n = parseSeq(String(code), prefix);
      if (n != null && n > maxSeq) maxSeq = n;
    }
    const next = maxSeq + 1;
    return `${prefix}-${String(next).padStart(4, "0")}`;
  };

  const fetchAndGenerateCode = async (role: CompanyRole): Promise<string> => {
    const prefix = ROLE_PREFIX[role];
    try {
      // If backend supports filter by role, pass it; otherwise fetch all and filter here.
      const { data } = await api
        .get("/admin/companies", { params: { companyRole: role } })
        .catch(async () => {
          const fallback = await api.get("/admin/companies");
          return { data: fallback.data };
        });

      const list: any[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.companies)
        ? data.companies
        : [];
      const roleList = list.filter(
        (c) => String(c?.companyRole ?? "").trim() === role
      );
      return nextCodeFromList(role, roleList);
    } catch {
      // If anything fails, start sequence at 0001 for the role
      return `${prefix}-0001`;
    }
  };

  /* Auto-generate companyCode when role changes (internal only) */
  useEffect(() => {
    (async () => {
      if (!form.companyRole) return;
      const proposed = await fetchAndGenerateCode(
        form.companyRole as CompanyRole
      );
      setForm((f) => ({ ...f, companyCode: proposed.toUpperCase() }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.companyRole]);

  /* ========================= submit ========================= */
  const onSubmit = async () => {
    setErr(null);
    setSubmitting(true);
    try {
      // Ensure companyCode exists even if role just got selected and generation hasn't finished yet
      let code = form.companyCode;
      if (!code && form.companyRole) {
        code = (
          await fetchAndGenerateCode(form.companyRole as CompanyRole)
        ).toUpperCase();
        setForm((f) => ({ ...f, companyCode: code }));
      }

      let attempts = 0;
      while (attempts < 2) {
        const payload: Record<string, any> = {};
        Object.entries({ ...form, companyCode: code }).forEach(([k, v]) => {
          payload[k] = typeof v === "string" ? v.trim() : v;
        });
        payload.companyRole = toDbRole(payload.companyRole);

        normalize(payload);
        validate(payload);

        try {
          await api.post("/admin/companies", payload);
          nav("/admin/companies", { replace: true });
          return;
        } catch (e: any) {
          // Unique collision handling on companyCode -> regenerate once and retry
          const status = e?.response?.status;
          const msg = e?.response?.data?.error || e?.message || "";
          const isUniqueFail =
            status === 409 ||
            (status === 400 &&
              /unique|duplicate|Company_companyCode_key/i.test(msg)) ||
            /unique|duplicate|Company_companyCode_key/i.test(msg);

          if (isUniqueFail && form.companyRole && attempts === 0) {
            attempts += 1;
            code = (
              await fetchAndGenerateCode(form.companyRole as CompanyRole)
            ).toUpperCase();
            setForm((f) => ({ ...f, companyCode: code }));
            continue;
          }
          throw e;
        }
      }
      throw new Error(
        "Could not assign a unique Company Code. Please try again."
      );
    } catch (e: any) {
      const s = e?.response?.status;
      const msg =
        s === 401
          ? "Unauthorized (401). Please sign in again."
          : e?.response?.data?.error ||
            e?.message ||
            "Failed to create company.";
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
    // No UI dependency on companyCode
    return !!(form.name && form.status && form.companyRole) && !submitting;
  }, [form.name, form.status, form.companyRole, submitting]);

  /* ========================= ui ========================= */
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-yellow-50 dark:from-neutral-900 dark:to-neutral-950 px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
              Create Company
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-300 inline-flex items-center gap-2">
              <span>
                Enter company details in the sections below, then save.
              </span>

              {/* Info icon (replaces Note button functionality) */}
              <button
                type="button"
                onClick={() => setShowNote(true)}
                aria-label="Info"
                title="Info"
                className="ml-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
              >
                i
              </button>
            </p>

            {refsErr && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                {refsErr}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
              onClick={() => nav("/admin/companies")}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
              onClick={onSubmit}
              disabled={!canSubmit}
            >
              {submitting ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {err && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {err}
          </div>
        )}

        {/* ============ Summary ============ */}
        <Section title="Summary">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
              placeholder="Select status"
            />
            <SelectStrict
              label="Primary Specialisation (Role)"
              value={form.companyRole}
              onChange={(v) => set("companyRole", v as CompanyRole)}
              options={ROLE_OPTIONS.map((r) => ({
                value: r,
                label: prettyRole(r),
              }))}
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input
              label="GSTIN"
              value={form.gstin}
              onChange={(v) => set("gstin", v.toUpperCase())}
              placeholder="15-digit GSTIN"
            />
            <Input
              label="PAN"
              value={form.pan}
              onChange={(v) => set("pan", v.toUpperCase())}
              placeholder="ABCDE1234F"
            />
            <Input
              label="CIN"
              value={form.cin}
              onChange={(v) => set("cin", v.toUpperCase())}
              placeholder="L12345DL2010PLC123456"
            />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input
              label="Primary Contact"
              value={form.primaryContact}
              onChange={(v) => set("primaryContact", v)}
              placeholder="Full name"
            />
            <Input
              label="Contact Mobile"
              value={form.contactMobile}
              onChange={(v) => set("contactMobile", v.replace(/\D+/g, ""))}
              placeholder="10-digit mobile"
            />
            <Input
              label="Contact Email"
              value={form.contactEmail}
              onChange={(v) => set("contactEmail", v)}
              placeholder="name@company.com"
              type="email"
            />
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
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SelectStrict
              label="State / UT"
              value={form.stateId}
              onChange={(v) => set("stateId", v)}
              options={statesRef.map((s) => ({
                value: s.stateId,
                label: s.name || s.code || s.stateId,
              }))}
              placeholder="Select state"
            />
            <SelectStrict
              label="District"
              value={form.districtId}
              onChange={(v) => set("districtId", v)}
              options={districtsRef.map((d) => ({
                value: d.districtId,
                label: d.name || d.districtId,
              }))}
              placeholder={
                form.stateId ? "Select district" : "Select state first"
              }
              disabled={!form.stateId}
            />
            <Input
              label="PIN"
              value={form.pin}
              onChange={(v) => set("pin", v.replace(/\D+/g, ""))}
              placeholder="6-digit PIN"
            />
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

        {/* ---- Bottom action buttons (no sticky, no box) ---- */}
        <div className="mt-6 flex justify-end gap-2">
          <button
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
            onClick={() => nav("/admin/companies")}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
            onClick={onSubmit}
            disabled={!canSubmit}
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Note modal */}
      {showNote && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowNote(false)}
          />

          {/* Dialog */}
          <div className="relative z-10 mx-4 w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-neutral-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Note for Admins — Creating a New Company
              </h2>
              <button
                className="rounded px-2 py-1 text-sm hover:bg-gray-100 dark:hover:bg-neutral-800"
                onClick={() => setShowNote(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 p-5 text-sm leading-6 text-gray-800 dark:text-gray-100">
              <div>
                <b>Required to save:</b> Company Name, Status, and Primary
                Specialisation (Role).
              </div>

              <div>
                <b>Company Code:</b> generated automatically based on the
                selected Role (e.g., PMT-0001, CON-0001). You don’t have to type
                it; the system picks the next number for that role.
              </div>

              <div>
                <b>Optional but useful:</b> Website, Address, State, District,
                PIN, Registration IDs (GSTIN, PAN, CIN), and a short
                Note/description.
              </div>

              <div>
                <b>Basic checks we do for you:</b>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  <li>
                    Mobile must be a 10-digit number; Email must look like a
                    valid email.
                  </li>
                  <li>PIN must be 6 digits.</li>
                  <li>
                    GSTIN must be 15 characters (A–Z, 0–9); PAN must be 10
                    characters (ABCDE1234F).
                  </li>
                  <li>
                    Website is auto-cleaned to start with <code>https://</code>{" "}
                    if you miss it.
                  </li>
                  <li>
                    GSTIN/PAN are auto-capitalised; numbers strip
                    spaces/symbols.
                  </li>
                </ul>
              </div>

              <div>
                <b>Duplicate company code:</b> If a generated code clashes, the
                system will make a fresh one and try again automatically.
              </div>

              <div>
                <b>After a successful save:</b> you’ll be taken back to the
                Companies page.
              </div>

              <div>
                <b>Cancel:</b> takes you back to the Companies list without
                saving.
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-neutral-800">
              <button
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
                onClick={() => setShowNote(false)}
                type="button"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================= small UI bits ========================= */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6 rounded-2xl border border-slate-200/80 bg-white/95 px-5 py-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:px-6 sm:py-5">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
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
  required = false,
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
      <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        className="w-full rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm focus:outline-none focus:border-transparent focus:ring-2 focus:ring-emerald-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
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
      <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <textarea
        className="w-full resize-y rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm focus:outline-none focus:border-transparent focus:ring-2 focus:ring-emerald-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
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
      <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <select
        className="w-full rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:outline-none focus:border-transparent focus:ring-2 focus:ring-emerald-400 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
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
