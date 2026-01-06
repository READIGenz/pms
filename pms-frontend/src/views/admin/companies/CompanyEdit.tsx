// src/views/admin/companies/CompanyEdit.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
const ROLE_OPTIONS = ["IH_PMT", "Contractor", "Consultant", "PMC", "Supplier"] as const;

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
  companyCode: string; // internal; not shown
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

export default function EditCompany() {
  const nav = useNavigate();
  const { id: companyId } = useParams<{ id: string }>();

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
      (payload.isSuperAdmin || payload.role === "Admin" || payload.userRole === "Admin")
    );
    if (!isAdmin) nav("/landing", { replace: true });
  }, [nav]);

  /* ---- refs ---- */
  const [statesRef, setStatesRef] = useState<StateRef[]>([]);
  const [districtsRef, setDistrictsRef] = useState<DistrictRef[]>([]);
  const [refsErr, setRefsErr] = useState<string | null>(null);

  /* ---- form ---- */
  const [form, setForm] = useState<CompanyForm>({
    companyCode: "",
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

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showNote, setShowNote] = useState(false);

  /* ========================= page title (UI only) ========================= */
  useEffect(() => {
    document.title = "Trinity PMS — Edit Company";
    (window as any).__ADMIN_SUBTITLE__ = "Update company details, then save.";
    return () => {
      (window as any).__ADMIN_SUBTITLE__ = "";
    };
  }, []);

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
          e?.response?.data?.error || e?.message || "Failed to load reference data."
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

  /* ========================= load company ========================= */
  useEffect(() => {
    if (!companyId) return;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const { data } = await api.get(`/admin/companies/${companyId}`);
        const c = Array.isArray(data) ? data[0] : data?.company || data;

        const stateId = c?.stateId || c?.state?.stateId || c?.state?.id || "";
        const districtId = c?.districtId || c?.district?.districtId || c?.district?.id || "";

        setForm({
          companyCode: c?.companyCode ?? "",
          name: c?.name ?? "",
          status: (c?.status ?? "") as CompanyStatus | "",
          website: c?.website ?? "",

          companyRole: (c?.companyRole ?? "") as CompanyRole | "",

          gstin: c?.gstin ?? "",
          pan: c?.pan ?? "",
          cin: c?.cin ?? "",

          primaryContact: c?.primaryContact ?? "",
          contactMobile: c?.contactMobile ?? "",
          contactEmail: c?.contactEmail ?? "",

          address: c?.address ?? "",
          stateId,
          districtId,
          pin: c?.pin ?? "",

          notes: c?.notes ?? "",
        });
      } catch (e: any) {
        const s = e?.response?.status;
        const msg =
          s === 404
            ? "Company not found."
            : e?.response?.data?.error || e?.message || "Failed to load company.";
        setErr(msg);
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId]);

  /* ========================= helpers ========================= */
  const set = <K extends keyof CompanyForm>(key: K, val: CompanyForm[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const normalize = (payload: Record<string, any>) => {
    if (payload.pan) payload.pan = String(payload.pan).toUpperCase().trim();
    if (payload.gstin) payload.gstin = String(payload.gstin).toUpperCase().trim();
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
    if (!p.companyRole) throw new Error("Primary Specialisation (Role) is required.");

    if (p.contactEmail && !/^\S+@\S+\.\S+$/.test(p.contactEmail))
      throw new Error("Contact Email seems invalid.");
    if (p.contactMobile && !/^\d{10}$/.test(p.contactMobile))
      throw new Error("Mobile must be a 10-digit number.");
    if (p.pin && !/^\d{6}$/.test(p.pin)) throw new Error("PIN must be a 6-digit number.");
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

  const fetchAndMaybeRegenerateCode = async (
    role: CompanyRole,
    existingCode: string
  ): Promise<string> => {
    const prefix = ROLE_PREFIX[role];
    const hasPrefix = new RegExp(`^${prefix}-\\d{4}$`, "i").test(existingCode || "");
    if (existingCode && hasPrefix) return existingCode.toUpperCase();

    try {
      const { data } = await api
        .get("/admin/companies", { params: { companyRole: role } })
        .catch(async () => {
          const fallback = await api.get("/admin/companies");
          return { data: fallback.data };
        });

      const list: any[] = Array.isArray(data) ? data : data?.companies || [];
      const roleList = list.filter((c) => String(c?.companyRole ?? "").trim() === role);
      return nextCodeFromList(role, roleList).toUpperCase();
    } catch {
      return `${prefix}-0001`;
    }
  };

  /* ========================= submit (PATCH) ========================= */
  const onSubmit = async () => {
    if (!companyId) return;
    setErr(null);
    setSubmitting(true);
    try {
      const payload: Record<string, any> = {};
      Object.entries(form).forEach(([k, v]) => {
        payload[k] = typeof v === "string" ? v.trim() : v;
      });
      payload.companyRole = toDbRole(payload.companyRole);
      normalize(payload);
      validate(payload);

      if (!payload.stateId) payload.stateId = null;
      if (!payload.districtId) payload.districtId = null;

      await api.patch(`/admin/companies/${companyId}`, payload);
      nav("/admin/companies", { replace: true });
    } catch (e: any) {
      const s = e?.response?.status;
      const msg =
        s === 401
          ? "Unauthorized (401). Please sign in again."
          : e?.response?.data?.error || e?.message || "Failed to update company.";
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

  /* ========================= UI styles (UI only) ========================= */
  const btnSmBase =
    "h-8 px-3 rounded-full text-[11px] font-semibold shadow-sm " +
    "focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-neutral-950 " +
    "active:scale-[0.98] transition";

  const btnOutline =
    btnSmBase +
    " bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 " +
    "dark:bg-neutral-950 dark:text-slate-200 dark:border-white/10 dark:hover:bg-white/5";

  const btnPrimary =
    btnSmBase +
    " bg-[#00379C] text-white hover:brightness-110 focus:ring-[#00379C]/35";

  const infoBtn =
    "inline-flex h-6 w-6 items-center justify-center rounded-full " +
    "border border-slate-200 bg-white text-[11px] font-bold text-slate-700 shadow-sm " +
    "hover:bg-slate-50 dark:border-white/10 dark:bg-neutral-950 dark:text-slate-200 dark:hover:bg-white/5";

  return (
    <div className="w-full">
      <div className="mx-auto max-w-5xl">
        {/* Top row actions (title is handled by AdminHome header) */}
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="text-xs text-slate-600 dark:text-slate-300">
              Edit and save company information.
            </div>

            <button
              type="button"
              onClick={() => setShowNote(true)}
              aria-label="Info"
              title="Info"
              className={infoBtn}
            >
              i
            </button>

            {refsErr && (
              <span className="ml-2 text-xs text-amber-700 dark:text-amber-300">
                {refsErr}
              </span>
            )}
          </div>

          <div className="flex gap-2 justify-end">
            <button className={btnOutline} onClick={() => nav("/admin/companies")} type="button">
              Cancel
            </button>
            <button className={btnPrimary} onClick={onSubmit} disabled={!canSubmit}>
              {submitting ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-sm dark:border-white/10 dark:bg-neutral-950 dark:text-slate-200">
            Loading company…
          </div>
        ) : null}

        {err && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
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
              label="Primary Specialisation (Role) — cannot be changed"
              value={form.companyRole}
              onChange={(() => {}) as any}
              options={ROLE_OPTIONS.map((r) => ({
                value: r,
                label: prettyRole(r),
              }))}
              placeholder="Select role"
              disabled
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
              placeholder="15-character GSTIN"
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
              placeholder={form.stateId ? "Select district" : "Select state first"}
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

        {/* Bottom actions */}
        <div className="mt-6 flex justify-end gap-2">
          <button className={btnOutline} onClick={() => nav("/admin/companies")} type="button">
            Cancel
          </button>
          <button className={btnPrimary} onClick={onSubmit} disabled={!canSubmit}>
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Note modal */}
      {showNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowNote(false)} />

          {/* Dialog */}
          <div className="relative z-10 mx-4 w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-neutral-950">
            <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-white/10">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Note for Admins — Editing a Company
                </h2>
                <div className="mt-1 h-1 w-10 rounded-full bg-[#FCC020]" />
              </div>
              <button
                className="rounded-full h-8 px-3 text-[11px] font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-neutral-950 dark:text-slate-200 dark:hover:bg-white/5"
                onClick={() => setShowNote(false)}
                aria-label="Close"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 p-5 text-sm leading-6 text-slate-800 dark:text-slate-200">
              <div>
                <b>Required to save:</b> Company Name, Status, and Primary Specialisation (Role).
              </div>

              <div>
                <b>Primary Specialisation (Role):</b> is locked on edit to keep company identity consistent
                across the system.
              </div>

              <div>
                <b>Optional but useful:</b> Website, Address, State, District, PIN, Registration IDs (GSTIN, PAN,
                CIN), and a short Note/description.
              </div>

              <div>
                <b>Basic checks we do for you:</b>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  <li>Mobile must be a 10-digit number; Email must look valid.</li>
                  <li>PIN must be 6 digits.</li>
                  <li>GSTIN must be 15 characters (A–Z, 0–9); PAN must be 10 characters (ABCDE1234F).</li>
                  <li>
                    Website is auto-cleaned to start with <code>https://</code> if you miss it.
                  </li>
                  <li>GSTIN/PAN are auto-capitalised; numbers strip symbols.</li>
                </ul>
              </div>

              <div>
                <b>After a successful save:</b> you’ll be taken back to the Companies page.
              </div>

              <div>
                <b>Cancel:</b> takes you back to the Companies list without saving.
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-white/10">
              <button
                className="h-8 px-3 rounded-full text-[11px] font-semibold bg-[#00379C] text-white shadow-sm hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00379C]/35 dark:focus:ring-offset-neutral-950"
                onClick={() => setShowNote(false)}
                type="button"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================= small UI bits ========================= */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-white/10 dark:bg-neutral-950 sm:px-6 sm:py-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs font-extrabold uppercase tracking-wide text-[#00379C] dark:text-white">
          {title}
        </div>
        <div className="h-1 w-10 rounded-full bg-[#FCC020]" />
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
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        className="w-full h-10 rounded-full border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm
          focus:outline-none focus:border-transparent focus:ring-2 focus:ring-[#00379C]/30
          dark:border-white/10 dark:bg-neutral-950 dark:text-white"
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
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <textarea
        className="w-full resize-y rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm
          focus:outline-none focus:border-transparent focus:ring-2 focus:ring-[#00379C]/30
          dark:border-white/10 dark:bg-neutral-950 dark:text-white"
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
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <select
        className="w-full h-10 rounded-full border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm
          focus:outline-none focus:border-transparent focus:ring-2 focus:ring-[#00379C]/30 disabled:opacity-60
          dark:border-white/10 dark:bg-neutral-950 dark:text-white"
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
