// pms-frontend/src/views/admin/projects/ProjectCreate.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../api/client";

/* ---------- Reference-data types ---------- */
type StateOpt    = { stateId: string; name: string; code: string };
type DistrictOpt = { districtId: string; name: string; stateId: string };
type CompanyOpt  = { companyId: string; name: string };
type TagOpt      = { tagCode: string; label: string };

/* ---------- Enums (from prisma schema) ---------- */
const projectStatuses = ["Draft","Active","OnHold","Completed","Archived"] as const;
const stages          = ["Planning","Design","Procurement","Execution","Handover","Closed"] as const;
const projectTypes    = ["Residential","Commercial","Industrial","Institutional","MixedUse","Infrastructure","Other"] as const;
const structureTypes  = ["LowRise","HighRise","Villa","RowHouse","InteriorFitout","ShellCore","Other"] as const;
const constructionTypes = ["New","Renovation","Retrofit","Repair","Fitout","Other"] as const;
const contractTypes   = ["LumpSum","ItemRate","Turnkey","EPC","PMC","LabourOnly","Other"] as const;
const healthOptions   = ["Green","Amber","Red","Unknown"] as const;
const currencies      = ["INR","USD","EUR","GBP","AED","SAR","SGD","AUD","Other"] as const;
const areaUnits       = ["SQFT","SQM","SQYD","Acre","Hectare"] as const;

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
  const [startDate, setStartDate] = useState<string>("");               // yyyy-mm-dd
  const [plannedCompletionDate, setPlannedCompletionDate] = useState<string>(""); // yyyy-mm-dd
  const [currency, setCurrency] = useState<string>("INR");
  const [contractValue, setContractValue] = useState<string>("");       // send as string (Decimal)

  // ---------- Attributes ----------
  const [areaUnit, setAreaUnit] = useState<string>("");
  const [plotArea, setPlotArea] = useState<string>("");                 // Decimal string
  const [builtUpArea, setBuiltUpArea] = useState<string>("");           // Decimal string
  const [floors, setFloors] = useState<string>("");                     // Int as string

  // ---------- Tags ----------
  const [allTags, setAllTags] = useState<TagOpt[]>([]);
  const [selectedTagCodes, setSelectedTagCodes] = useState<string[]>([]);

  // ---------- Notes ----------
  const [description, setDescription] = useState("");

  // ---------- Refs ----------
  const [states, setStates] = useState<StateOpt[]>([]);
  const [districts, setDistricts] = useState<DistrictOpt[]>([]);
  const [companies, setCompanies] = useState<CompanyOpt[]>([]);

  // ---------- UI ----------
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
            try       { const { data } = await api.get("/admin/ref/project-tags"); return data; }
            catch { try { const { data } = await api.get("/admin/project-tags"); return data; }
                    catch { return []; } }
          })(),
        ]);

        setStates(Array.isArray(s) ? s : s?.states || []);
        setCompanies(Array.isArray(c) ? c : c?.companies || []);

        const tagList = Array.isArray(tg) ? tg : tg?.tags || [];
        // Normalize to {tagCode, label}
        const norm = tagList.map((t: any) => ({
          tagCode: t.tagCode ?? t.code ?? t.value ?? "",
          label:   t.label ?? t.name ?? t.tagCode ?? "",
        })).filter((t: TagOpt) => t.tagCode);
        setAllTags(norm);
      } catch (e: any) {
        setErr(e?.response?.data?.error || "Failed to load reference data.");
      }
    })();
  }, []);

  // Districts by state
  useEffect(() => {
    if (!stateId) {
      setDistricts([]); setDistrictId("");
      return;
    }
    (async () => {
      try {
        const { data } = await api.get("/admin/districts", { params: { stateId } });
        setDistricts(Array.isArray(data) ? data : data?.districts || []);
      } catch (e: any) {
        setErr(e?.response?.data?.error || "Failed to load districts.");
      }
    })();
  }, [stateId]);

  const canSave = useMemo(() => {
    if (!title.trim()) return false;
    if (!status) return false;
    // date rule: plannedCompletion >= startDate (if both present)
    if (startDate && plannedCompletionDate) {
      const s = new Date(startDate + "T00:00:00Z").getTime();
      const p = new Date(plannedCompletionDate + "T00:00:00Z").getTime();
      if (Number.isFinite(s) && Number.isFinite(p) && p < s) return false;
    }
    return true;
  }, [title, status, startDate, plannedCompletionDate]);

  const onPickTags = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const values = Array.from(e.target.selectedOptions).map((o) => o.value);
    setSelectedTagCodes(values);
  };

  const submit = async () => {
    setErr(null);
    if (!canSave) {
      setErr("Please fill required fields. Also ensure 'Planned Completion' is not before 'Start Date'.");
      return;
    }

    // Build payload aligned with backend schema
    const payload: any = {
      title: title.trim(),
      code: code.trim() || undefined,
      status: status || undefined,                  // ProjectStatus
      stage: stage || undefined,                    // ProjectStage
      projectType: projectType || undefined,        // ProjectType
      structureType: structureType || undefined,    // StructureType
      constructionType: constructionType || undefined, // ConstructionType
      contractType: contractType || undefined,      // ContractType
      health: health || undefined,                  // ProjectHealth
      clientCompanyId: clientCompanyId || undefined,

      // Location
      address: address || undefined,
      stateId: stateId || undefined,
      districtId: districtId || undefined,
      cityTown: cityTown || undefined,
      pin: pin.replace(/[^\d]/g, "").slice(0, 6) || undefined,
      latitude: latitude || undefined,              // send as string; backend uses Decimal(9,6)
      longitude: longitude || undefined,

      // Dates & cost
      startDate: startDate || undefined,
      plannedCompletionDate: plannedCompletionDate || undefined,
      currency: currency || undefined,              // CurrencyCode
      contractValue: contractValue || undefined,    // Decimal string

      // Attributes
      areaUnit: areaUnit || undefined,
      plotArea: plotArea || undefined,              // Decimal string
      builtUpArea: builtUpArea || undefined,        // Decimal string
      floors: floors ? Number(floors) : undefined,

      // Notes
      description: description || undefined,
    };

    try {
      setSaving(true);

      // 1) Create project
      const createRes = await api.post("/admin/projects", payload);
      const pid: string | undefined =
        createRes?.data?.project?.projectId ??
        createRes?.data?.projectId ??
        createRes?.data?.id;

      if (!pid) throw new Error(createRes?.data?.error || "Failed to create project");

      // 2) Save tags (if any) — try common endpoints, ignore failure softly
      if (selectedTagCodes.length > 0) {
        try {
          await api.post(`/admin/projects/${pid}/tags`, { tagCodes: selectedTagCodes });
        } catch {
          try { await api.post(`/admin/projects/${pid}/project-tags`, { tagCodes: selectedTagCodes }); }
          catch (e) { console.warn("Saving project tags failed:", e); }
        }
      }

      nav("/admin/projects", { replace: true });
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || "Failed to create project");
    } finally {
      setSaving(false);
    }
  };

  // helpful labels when selected values aren’t preloaded yet
  const stateLabel = useMemo(() => {
    if (!stateId) return "";
    const s = states.find(x => x.stateId === stateId);
    return s ? `${s.name} (${s.code})` : "(unknown state)";
  }, [stateId, states]);

  const districtLabel = useMemo(() => {
    if (!districtId) return "";
    const d = districts.find(x => x.districtId === districtId);
    return d ? d.name : "(unknown district)";
  }, [districtId, districts]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-yellow-50 dark:from-neutral-900 dark:to-neutral-950 px-4 sm:px-6 lg:px-10 py-8">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold dark:text-white">Create Project</h1>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Fill the details below and save. Project Title is mandatory field.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className="px-4 py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
              onClick={() => nav("/admin/projects")}
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
              onClick={submit}
              disabled={!canSave || saving}
            >
              {saving ? "Saving…" : "Create"}
            </button>
          </div>
        </div>

        {err && <div className="mb-3 text-sm text-red-700 dark:text-red-400">{err}</div>}

        {/* ========== Summary ========== */}
        <Section title="Summary">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Text label="Project Title" value={title} setValue={setTitle} required />
            <Text label="Project Code" value={code} setValue={setCode} />

            <Select label="Status" value={status} setValue={setStatus} options={projectStatuses as unknown as string[]} />
            <Select label="Stage" value={stage} setValue={setStage} options={["", ...stages]} />

            <Select label="Project Type" value={projectType} setValue={setProjectType} options={["", ...projectTypes]} />
            <Select label="Structure Type" value={structureType} setValue={setStructureType} options={["", ...structureTypes]} />
            <Select label="Construction Mode" value={constructionType} setValue={setConstructionType} options={["", ...constructionTypes]} />
            <Select label="Contract Type" value={contractType} setValue={setContractType} options={["", ...contractTypes]} />
            <Select label="Project Health" value={health} setValue={setHealth} options={healthOptions as unknown as string[]} />

            <Select
              label="Client / Owner Company"
              value={clientCompanyId}
              setValue={setClientCompanyId}
              options={["", ...companies.map(c => ({ value: c.companyId, label: c.name }))]}
            />
          </div>
        </Section>

        {/* ========== Location ========== */}
        <Section title="Location">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextArea label="Address" value={address} setValue={setAddress} />

            <Select
              label="State / UT"
              value={stateId}
              setValue={(v) => { setStateId(v); setDistrictId(""); }}
              options={[
                "",
                ...states.map(s => ({ value: s.stateId, label: `${s.name} (${s.code})` })),
                ...(stateId && !states.some(s => s.stateId === stateId)
                  ? [{ value: stateId, label: stateLabel }]
                  : []),
              ]}
            />
            <Select
              label="District"
              value={districtId}
              setValue={setDistrictId}
              options={[
                "",
                ...districts.map(d => ({ value: d.districtId, label: d.name })),
                ...(districtId && !districts.some(d => d.districtId === districtId)
                  ? [{ value: districtId, label: districtLabel }]
                  : []),
              ]}
              disabled={!stateId}
            />
            <Text label="City/Town" value={cityTown} setValue={setCityTown} />
            <Text
              label="PIN Code"
              value={pin}
              setValue={(v) => setPin(v.replace(/[^\d]/g, "").slice(0, 6))}
              placeholder="6-digit PIN"
            />
            <Text
              label="Latitude"
              value={latitude}
              setValue={(v) => setLatitude(v.replace(/[^0-9\.\-]/g, "").slice(0, 12))}
              placeholder="e.g., 12.9716"
            />
            <Text
              label="Longitude"
              value={longitude}
              setValue={(v) => setLongitude(v.replace(/[^0-9\.\-]/g, "").slice(0, 13))}
              placeholder="e.g., 77.5946"
            />
          </div>
        </Section>

        {/* ========== Dates & Cost ========== */}
        <Section title="Dates and Cost">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DateInput label="Start Date" value={startDate} setValue={setStartDate} />
            <DateInput
              label="Planned Completion"
              value={plannedCompletionDate}
              setValue={(v) => setPlannedCompletionDate(v)}
              min={startDate || undefined}
            />

            <Select label="Currency" value={currency} setValue={setCurrency} options={currencies as unknown as string[]} />
            <Text
              label="Contract Value"
              value={contractValue}
              setValue={(v) => setContractValue(v.replace(/[^0-9.]/g, ""))}
              placeholder="e.g., 12500000.00"
            />
          </div>
        </Section>

        {/* ========== Attributes ========== */}
        <Section title="Attributes">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select label="Area Units" value={areaUnit} setValue={setAreaUnit} options={["", ...areaUnits]} />
            <Text
              label="Plot Area"
              value={plotArea}
              setValue={(v) => setPlotArea(v.replace(/[^0-9.]/g, ""))}
              placeholder="e.g., 10000.00"
            />
            <Text
              label="Built-up Area"
              value={builtUpArea}
              setValue={(v) => setBuiltUpArea(v.replace(/[^0-9.]/g, ""))}
              placeholder="e.g., 25000.00"
            />
            <Text
              label="Floors"
              value={floors}
              setValue={(v) => setFloors(v.replace(/[^\d]/g, "").slice(0, 3))}
              placeholder="e.g., 12"
            />
          </div>
        </Section>

        {/* ========== Tags ========== */}
        <Section title="Tags">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MultiSelect
              label="Select Tag(s)"
              value={selectedTagCodes}
              onChange={onPickTags}
              options={allTags.map(t => ({ value: t.tagCode, label: t.label || t.tagCode }))}
            />
          </div>
        </Section>

        {/* ========== Notes / Description ========== */}
        <Section title="Notes / Description">
          <div className="grid grid-cols-1 gap-4">
            <TextArea label="Description" value={description} setValue={setDescription} />
          </div>
        </Section>

        {/* Footer actions */}
        <div className="mt-6 flex justify-end gap-2">
          <button
            className="px-4 py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
            onClick={() => nav("/admin/projects")}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
            onClick={submit}
            disabled={!canSave || saving}
          >
            {saving ? "Saving…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------ Small UI helpers ------------------------ */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <div className="text-sm font-semibold mb-2 text-gray-900 dark:text-white">{title}</div>
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border dark:border-neutral-800 p-5">
        {children}
      </div>
    </section>
  );
}

function Text({
  label, value, setValue, type="text", required=false, placeholder, disabled=false
}: { label:string; value:string; setValue:(v:string)=>void; type?:string; required?:boolean; placeholder?:string; disabled?:boolean }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-gray-700 dark:text-gray-300">
        {label}{required && <span className="text-red-600"> *</span>}
      </span>
      <input
        className="border rounded px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
        value={value} onChange={e=>setValue(e.target.value)}
        type={type} placeholder={placeholder} disabled={disabled}
      />
    </label>
  );
}

function TextArea({
  label, value, setValue
}: { label:string; value:string; setValue:(v:string)=>void }) {
  return (
    <label className="flex flex-col gap-1 md:col-span-2">
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
      <textarea
        className="border rounded px-3 py-2 min-h-[84px] dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
        value={value} onChange={e=>setValue(e.target.value)}
      />
    </label>
  );
}

function Select({
  label, value, setValue, options, disabled=false
}: {
  label:string; value:string; setValue:(v:string)=>void; options: (string | { value: string; label: string })[]; disabled?:boolean
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
      <select
        className="border rounded px-2 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
        value={value} disabled={disabled}
        onChange={(e)=>setValue(e.target.value)}
      >
        {options.map((o, i) => {
          const v = typeof o === "string" ? o : o.value;
          const l = typeof o === "string" ? (o || "—") : o.label;
          return <option key={v || `empty-${i}`} value={v}>{l || "—"}</option>;
        })}
      </select>
    </label>
  );
}

function MultiSelect({
  label, value, onChange, options, disabled=false
}: {
  label: string;
  value: string[];
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
      <select
        multiple
        className="border rounded px-2 py-2 min-h-[8rem] dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
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
      <span className="text-xs text-gray-600 dark:text-gray-400">
        Hold Ctrl/Cmd to select multiple.
      </span>
    </label>
  );
}

function DateInput({
  label, value, setValue, min, max
}: { label:string; value:string; setValue:(v:string)=>void; min?:string; max?:string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
      <input
        type="date"
        className="border rounded px-3 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
        value={value}
        min={min}
        max={max}
        onChange={(e)=>setValue(e.target.value)}
      />
    </label>
  );
}
