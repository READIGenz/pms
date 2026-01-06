// pms-frontend/src/views/admin/projects/ProjectCreate.tsx
import { ChangeEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../api/client";

declare global {
  interface Window {
    __ADMIN_SUBTITLE__?: string;
  }
}

/* ---------- Reference-data types ---------- */
type StateOpt = { stateId: string; name: string; code: string };
type DistrictOpt = { districtId: string; name: string; stateId: string };
type CompanyOpt = { companyId: string; name: string };
type TagOpt = { tagCode: string; label: string };

/* ---------- Enums (from prisma schema) ---------- */
const projectStatuses = [
  "Draft",
  "Active",
  "OnHold",
  "Completed",
  "Archived",
] as const;
const stages = [
  "Planning",
  "Design",
  "Procurement",
  "Execution",
  "Handover",
  "Closed",
] as const;
const projectTypes = [
  "Residential",
  "Commercial",
  "Industrial",
  "Institutional",
  "MixedUse",
  "Infrastructure",
  "Other",
] as const;
const structureTypes = [
  "LowRise",
  "HighRise",
  "Villa",
  "RowHouse",
  "InteriorFitout",
  "ShellCore",
  "Other",
] as const;
const constructionTypes = [
  "New",
  "Renovation",
  "Retrofit",
  "Repair",
  "Fitout",
  "Other",
] as const;
const contractTypes = [
  "LumpSum",
  "ItemRate",
  "Turnkey",
  "EPC",
  "PMC",
  "LabourOnly",
  "Other",
] as const;
const healthOptions = ["Green", "Amber", "Red", "Unknown"] as const;
const currencies = [
  "INR",
  "USD",
  "EUR",
  "GBP",
  "AED",
  "SAR",
  "SGD",
  "AUD",
  "Other",
] as const;
const areaUnits = ["SQFT", "SQM", "SQYD", "Acre", "Hectare"] as const;

/* ---------- Component ---------- */
export default function ProjectCreate() {
  const nav = useNavigate();

  // ---------- Summary ----------
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<string>("Draft");
  const [stage, setStage] = useState<string>("");
  const [projectType, setProjectType] = useState<string>("");
  const [structureType, setStructureType] = useState<string>("");
  const [constructionType, setConstructionType] = useState<string>("");
  const [contractType, setContractType] = useState<string>("");
  const [health, setHealth] = useState<string>("Unknown");
  const [clientCompanyId, setClientCompanyId] = useState<string>("");

  // ---------- Location ----------
  const [address, setAddress] = useState("");
  const [stateId, setStateId] = useState<string>("");
  const [districtId, setDistrictId] = useState<string>("");
  const [cityTown, setCityTown] = useState("");
  const [pin, setPin] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  // ---------- Dates and Cost ----------
  const [startDate, setStartDate] = useState<string>(""); // yyyy-mm-dd
  const [plannedCompletionDate, setPlannedCompletionDate] =
    useState<string>(""); // yyyy-mm-dd
  const [currency, setCurrency] = useState<string>("INR");
  const [contractValue, setContractValue] = useState<string>(""); // Decimal string

  // ---------- Attributes ----------
  const [areaUnit, setAreaUnit] = useState<string>("");
  const [plotArea, setPlotArea] = useState<string>(""); // Decimal string
  const [builtUpArea, setBuiltUpArea] = useState<string>(""); // Decimal string
  const [floors, setFloors] = useState<string>(""); // Int as string

  // ---------- Tags ----------
  const [allTags, setAllTags] = useState<TagOpt[]>([]);
  const [selectedTagCodes, setSelectedTagCodes] = useState<string[]>([]);

  // ---------- Notes ----------
  const [description, setDescription] = useState("");

  // ---------- Refs ----------
  const [statesRef, setStatesRef] = useState<StateOpt[]>([]);
  const [districtsRef, setDistrictsRef] = useState<DistrictOpt[]>([]);
  const [companies, setCompanies] = useState<CompanyOpt[]>([]);

  // ---------- UI ----------
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showNote, setShowNote] = useState(false);

  // Page title/subtitle (Admin header)
  useEffect(() => {
    document.title = "Trinity PMS — Create Project";
    window.__ADMIN_SUBTITLE__ = "Fill project details, then save.";
    return () => {
      window.__ADMIN_SUBTITLE__ = "";
    };
  }, []);

  // --- Auth gate simple check ---
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) nav("/login", { replace: true });
  }, [nav]);

  // --- Load reference data ---
  useEffect(() => {
    (async () => {
      try {
        const [{ data: s }, { data: c }, { data: tg }] = await Promise.all([
          api.get("/admin/states"),
          api.get("/admin/companies-brief"),
          // Try a couple of likely endpoints for ref project tags; gracefully degrade to []:
          (async () => {
            try {
              const { data } = await api.get("/admin/ref/project-tags");
              return data;
            } catch {
              try {
                const { data } = await api.get("/admin/project-tags");
                return data;
              } catch {
                return [];
              }
            }
          })(),
        ]);

        setStatesRef(Array.isArray(s) ? s : s?.states || []);
        setCompanies(Array.isArray(c) ? c : c?.companies || []);

        const tagList = Array.isArray(tg) ? tg : tg?.tags || [];
        const norm = tagList
          .map((t: any) => ({
            tagCode: t.tagCode ?? t.code ?? t.value ?? "",
            label: t.label ?? t.name ?? t.tagCode ?? "",
          }))
          .filter((t: TagOpt) => t.tagCode);
        setAllTags(norm);
      } catch (e: any) {
        setErr(e?.response?.data?.error || "Failed to load reference data.");
      }
    })();
  }, []);

  // Districts by state
  useEffect(() => {
    if (!stateId) {
      setDistrictsRef([]);
      setDistrictId("");
      return;
    }
    (async () => {
      try {
        const { data } = await api.get("/admin/districts", {
          params: { stateId },
        });
        setDistrictsRef(Array.isArray(data) ? data : data?.districts || []);
      } catch (e: any) {
        setErr(e?.response?.data?.error || "Failed to load districts.");
      }
    })();
  }, [stateId]);

  const canSave = useMemo(() => {
    if (!title.trim()) return false;
    if (!status) return false;
    if (startDate && plannedCompletionDate) {
      const s = new Date(startDate + "T00:00:00Z").getTime();
      const p = new Date(plannedCompletionDate + "T00:00:00Z").getTime();
      if (Number.isFinite(s) && Number.isFinite(p) && p < s) return false;
    }
    return true;
  }, [title, status, startDate, plannedCompletionDate]);

  const onPickTags = (e: ChangeEvent<HTMLSelectElement>) => {
    const values = Array.from(e.target.selectedOptions).map((o) => o.value);
    setSelectedTagCodes(values);
  };

  // 🔹 derive client company name from selected company id
  const clientCompanyName = useMemo(() => {
    if (!clientCompanyId) return "";
    const c = companies.find((x) => x.companyId === clientCompanyId);
    return c?.name ?? "";
  }, [companies, clientCompanyId]);

  // 🔹 dynamic hint for Project Code
  const projectCodePlaceholder = useMemo(() => {
    const projPart = (title || "").trim().slice(0, 3).toUpperCase();
    const compPart = (clientCompanyName || "").trim().slice(0, 3).toUpperCase();
    const pinPart = (pin || "").trim();

    if (projPart && compPart && pinPart) {
      return `${projPart}-${compPart}-${pinPart}`;
    }
    return "e.g. PRO-COM-110001";
  }, [title, clientCompanyName, pin]);

  const submit = async () => {
    setErr(null);
    if (!canSave) {
      setErr(
        "Please fill required fields. Also ensure 'Planned Completion' is not before 'Start Date'."
      );
      return;
    }

    const payload: any = {
      title: title.trim(),
      code: code.trim() || undefined,
      status: status || undefined,
      stage: stage || undefined,
      projectType: projectType || undefined,
      structureType: structureType || undefined,
      constructionType: constructionType || undefined,
      contractType: contractType || undefined,
      health: health || undefined,
      clientCompanyId: clientCompanyId || undefined,

      // Location
      address: address || undefined,
      stateId: stateId || undefined,
      districtId: districtId || undefined,
      cityTown: cityTown || undefined,
      pin: pin.replace(/[^\d]/g, "").slice(0, 6) || undefined,
      latitude: latitude || undefined,
      longitude: longitude || undefined,

      // Dates & cost
      startDate: startDate || undefined,
      plannedCompletionDate: plannedCompletionDate || undefined,
      currency: currency || undefined,
      contractValue: contractValue || undefined,

      // Attributes
      areaUnit: areaUnit || undefined,
      plotArea: plotArea || undefined,
      builtUpArea: builtUpArea || undefined,
      floors: floors ? Number(floors) : undefined,

      // Notes
      description: description || undefined,
    };

    try {
      setSaving(true);

      const createRes = await api.post("/admin/projects", payload);
      const pid: string | undefined =
        createRes?.data?.project?.projectId ??
        createRes?.data?.projectId ??
        createRes?.data?.id;

      if (!pid)
        throw new Error(createRes?.data?.error || "Failed to create project");

      if (selectedTagCodes.length > 0) {
        try {
          await api.post(`/admin/projects/${pid}/tags`, {
            tagCodes: selectedTagCodes,
          });
        } catch {
          try {
            await api.post(`/admin/projects/${pid}/project-tags`, {
              tagCodes: selectedTagCodes,
            });
          } catch (e) {
            console.warn("Saving project tags failed:", e);
          }
        }
      }

      nav("/admin/projects", { replace: true });
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || "Failed to create project");
    } finally {
      setSaving(false);
    }
  };

  /* ========================= CompanyEdit exact button tokens ========================= */
  const btnBase =
    "h-8 px-3 rounded-full text-[11px] font-semibold shadow-sm " +
    "focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-neutral-950 " +
    "disabled:opacity-60 disabled:pointer-events-none";
  const btnLight =
    "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 " +
    "dark:border-white/10 dark:bg-neutral-950 dark:text-slate-200 dark:hover:bg-white/5";
  const btnPrimary =
    "bg-[#00379C] text-white hover:brightness-110 focus:ring-[#00379C]/35 border border-transparent";

  const infoBtn =
    "ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white " +
    "text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 " +
    "dark:border-white/10 dark:bg-neutral-950 dark:text-slate-200 dark:hover:bg-white/5";

  return (
    <div className="w-full">
      <div className="mx-auto max-w-5xl">
        {/* Top helper row (CompanyEdit style) */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
              Fill the details below and save. Project Title is mandatory.
              <button
                type="button"
                onClick={() => setShowNote(true)}
                aria-label="Info"
                title="Info"
                className={infoBtn}
              >
                i
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              className={`${btnBase} ${btnLight}`}
              onClick={() => nav("/admin/projects")}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${btnBase} ${btnPrimary}`}
              onClick={submit}
              disabled={!canSave || saving}
            >
              {saving ? "Saving…" : "Create"}
            </button>
          </div>
        </div>

        {err ? (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-800/40 dark:bg-rose-950/30 dark:text-rose-200">
            {err}
          </div>
        ) : null}

        {/* ========== Summary ========== */}
        <Section title="Summary">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input label="Project Title" value={title} onChange={setTitle} required />
            <Input
              label="Project Code"
              value={code}
              onChange={setCode}
              placeholder={projectCodePlaceholder}
            />

            <SelectStrict
              label="Status"
              value={status}
              onChange={setStatus}
              options={projectStatuses.map((x) => ({ value: x, label: x }))}
            />
            <SelectStrict
              label="Stage"
              value={stage}
              onChange={setStage}
              placeholder="Select (optional)"
              options={stages.map((x) => ({ value: x, label: x }))}
            />

            <SelectStrict
              label="Project Type"
              value={projectType}
              onChange={setProjectType}
              placeholder="Select (optional)"
              options={projectTypes.map((x) => ({ value: x, label: x }))}
            />
            <SelectStrict
              label="Structure Type"
              value={structureType}
              onChange={setStructureType}
              placeholder="Select (optional)"
              options={structureTypes.map((x) => ({ value: x, label: x }))}
            />
            <SelectStrict
              label="Construction Mode"
              value={constructionType}
              onChange={setConstructionType}
              placeholder="Select (optional)"
              options={constructionTypes.map((x) => ({ value: x, label: x }))}
            />
            <SelectStrict
              label="Contract Type"
              value={contractType}
              onChange={setContractType}
              placeholder="Select (optional)"
              options={contractTypes.map((x) => ({ value: x, label: x }))}
            />
            <SelectStrict
              label="Project Health"
              value={health}
              onChange={setHealth}
              options={healthOptions.map((x) => ({ value: x, label: x }))}
            />

            <SelectStrict
              label="Client / Owner Company"
              value={clientCompanyId}
              onChange={setClientCompanyId}
              placeholder="Select (optional)"
              options={companies.map((c) => ({ value: c.companyId, label: c.name }))}
            />
          </div>
        </Section>

        {/* ========== Location ========== */}
        <Section title="Location">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TextArea
              label="Address"
              value={address}
              onChange={setAddress}
              placeholder="Optional"
              rows={3}
              className="md:col-span-2"
            />

            <SelectStrict
              label="State / UT"
              value={stateId}
              onChange={(v) => {
                setStateId(v);
                setDistrictId("");
              }}
              placeholder="Select (optional)"
              options={statesRef.map((s) => ({
                value: s.stateId,
                label: `${s.name} (${s.code})`,
              }))}
            />
            <SelectStrict
              label="District"
              value={districtId}
              onChange={setDistrictId}
              placeholder={stateId ? "Select (optional)" : "Select state first"}
              options={districtsRef.map((d) => ({ value: d.districtId, label: d.name }))}
              disabled={!stateId}
            />

            <Input label="City/Town" value={cityTown} onChange={setCityTown} />
            <Input
              label="PIN Code"
              value={pin}
              onChange={(v) => setPin(v.replace(/[^\d]/g, "").slice(0, 6))}
              placeholder="6-digit PIN"
            />

            <Input
              label="Latitude"
              value={latitude}
              onChange={(v) => setLatitude(v.replace(/[^0-9.\-]/g, "").slice(0, 12))}
              placeholder="e.g., 12.9716"
            />
            <Input
              label="Longitude"
              value={longitude}
              onChange={(v) => setLongitude(v.replace(/[^0-9.\-]/g, "").slice(0, 13))}
              placeholder="e.g., 77.5946"
            />
          </div>
        </Section>

        {/* ========== Dates & Cost ========== */}
        <Section title="Dates and Cost">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <DateInput label="Start Date" value={startDate} onChange={setStartDate} />
            <DateInput
              label="Planned Completion"
              value={plannedCompletionDate}
              onChange={setPlannedCompletionDate}
              min={startDate || undefined}
            />

            <SelectStrict
              label="Currency"
              value={currency}
              onChange={setCurrency}
              options={currencies.map((x) => ({ value: x, label: x }))}
            />
            <Input
              label="Contract Value"
              value={contractValue}
              onChange={(v) => setContractValue(v.replace(/[^0-9.]/g, ""))}
              placeholder="e.g., 12500000.00"
            />
          </div>
        </Section>

        {/* ========== Attributes ========== */}
        <Section title="Attributes">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SelectStrict
              label="Area Units"
              value={areaUnit}
              onChange={setAreaUnit}
              placeholder="Select (optional)"
              options={areaUnits.map((x) => ({ value: x, label: x }))}
            />
            <Input
              label="Plot Area"
              value={plotArea}
              onChange={(v) => setPlotArea(v.replace(/[^0-9.]/g, ""))}
              placeholder="e.g., 10000.00"
            />
            <Input
              label="Built-up Area"
              value={builtUpArea}
              onChange={(v) => setBuiltUpArea(v.replace(/[^0-9.]/g, ""))}
              placeholder="e.g., 25000.00"
            />
            <Input
              label="Floors"
              value={floors}
              onChange={(v) => setFloors(v.replace(/[^\d]/g, "").slice(0, 3))}
              placeholder="e.g., 12"
            />
          </div>
        </Section>

        {/* ========== Tags ========== */}
        <Section title="Tags">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <MultiSelect
              label="Select Tag(s)"
              value={selectedTagCodes}
              onChange={onPickTags}
              options={allTags.map((t) => ({
                value: t.tagCode,
                label: t.label || t.tagCode,
              }))}
            />
          </div>
        </Section>

        {/* ========== Notes / Description ========== */}
        <Section title="Notes / Description">
          <div className="grid grid-cols-1 gap-4">
            <TextArea
              label="Description"
              value={description}
              onChange={setDescription}
              placeholder="Optional"
              rows={4}
            />
          </div>
        </Section>

        {/* Footer actions (CompanyEdit style) */}
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-white/10">
          <button
            type="button"
            className={`${btnBase} ${btnLight}`}
            onClick={() => nav("/admin/projects")}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`${btnBase} ${btnPrimary}`}
            onClick={submit}
            disabled={!canSave || saving}
          >
            {saving ? "Saving…" : "Create"}
          </button>
        </div>
      </div>

      {/* Note modal (CompanyEdit style) */}
      {showNote ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowNote(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-neutral-950 overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-white/10">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    Note for Admins — Creating a New Project
                  </h2>
                  <div className="mt-1 h-1 w-10 rounded-full bg-[#FCC020]" />
                </div>
                <button
                  type="button"
                  className={`${btnBase} ${btnLight}`}
                  onClick={() => setShowNote(false)}
                >
                  Close
                </button>
              </div>

              <div className="p-5 text-sm leading-6 text-slate-800 dark:text-slate-200 space-y-3">
                <div>
                  <b>Required to save:</b> Project Title and Status.
                </div>
                <div>
                  <b>Dates rule:</b> if you enter both Start Date and Planned Completion,
                  the completion date cannot be before the start date.
                </div>
                <div>
                  <b>Optional but helpful:</b> Stage, Project Type, Structure Type, Construction
                  Mode, Contract Type, Project Health, Client/Owner Company, Description/Notes, and Tags.
                </div>
                <div>
                  <b>Location (optional):</b> Address, State, District, City/Town, PIN, Latitude, Longitude.
                  <ul className="mt-1 list-disc pl-5 space-y-1">
                    <li>PIN should be a 6-digit number.</li>
                    <li>Latitude/Longitude accept only numbers, decimal points, and minus signs.</li>
                  </ul>
                </div>
                <div>
                  <b>Currency &amp; Contract Value (optional):</b> Currency defaults to INR; Contract Value accepts numbers and decimals.
                </div>
                <div>
                  <b>Tags (optional):</b> You can select multiple tags.
                </div>
                <div>
                  <b>After a successful save:</b> you’ll be taken back to the Projects page.
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-white/10">
                <button
                  type="button"
                  className={`${btnBase} ${btnPrimary}`}
                  onClick={() => setShowNote(false)}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ========================= CompanyEdit-style components ========================= */

function Section({ title, children }: { title: string; children: ReactNode }) {
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
  required,
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
        {required ? <span className="text-rose-600"> *</span> : null}
      </span>
      <input
        className="w-full h-10 rounded-full border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm
          focus:outline-none focus:border-transparent focus:ring-2 focus:ring-[#00379C]/30
          disabled:opacity-60 dark:border-white/10 dark:bg-neutral-950 dark:text-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
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
          focus:outline-none focus:border-transparent focus:ring-2 focus:ring-[#00379C]/30
          disabled:opacity-60 dark:border-white/10 dark:bg-neutral-950 dark:text-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
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

function MultiSelect({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string[];
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <select
        multiple
        className="w-full min-h-[8rem] rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm
          focus:outline-none focus:border-transparent focus:ring-2 focus:ring-[#00379C]/30
          disabled:opacity-60 dark:border-white/10 dark:bg-neutral-950 dark:text-white"
        value={value}
        onChange={onChange}
        disabled={disabled}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Hold Ctrl/Cmd to select multiple.
      </div>
    </label>
  );
}

function DateInput({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <input
        type="date"
        className="w-full h-10 rounded-full border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm
          focus:outline-none focus:border-transparent focus:ring-2 focus:ring-[#00379C]/30
          disabled:opacity-60 dark:border-white/10 dark:bg-neutral-950 dark:text-white"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
