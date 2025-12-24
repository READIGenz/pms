// pms-frontend/src/views/admin/projects/ProjectEdit.tsx
import { ChangeEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
const projectStatuses = ["Draft", "Active", "OnHold", "Completed", "Archived"] as const;
const stages = ["Planning", "Design", "Procurement", "Execution", "Handover", "Closed"] as const;
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
const constructionTypes = ["New", "Renovation", "Retrofit", "Repair", "Fitout", "Other"] as const;
const contractTypes = ["LumpSum", "ItemRate", "Turnkey", "EPC", "PMC", "LabourOnly", "Other"] as const;
const healthOptions = ["Green", "Amber", "Red", "Unknown"] as const;
const currencies = ["INR", "USD", "EUR", "GBP", "AED", "SAR", "SGD", "AUD", "Other"] as const;
const areaUnits = ["SQFT", "SQM", "SQYD", "Acre", "Hectare"] as const;

/* ---------- Component ---------- */
export default function ProjectEdit() {
  const nav = useNavigate();
  const { id: projectId } = useParams<{ id: string }>();

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
  const [startDate, setStartDate] = useState<string>("");
  const [plannedCompletionDate, setPlannedCompletionDate] = useState<string>("");
  const [currency, setCurrency] = useState<string>("INR");
  const [contractValue, setContractValue] = useState<string>("");

  // ---------- Attributes ----------
  const [areaUnit, setAreaUnit] = useState<string>("");
  const [plotArea, setPlotArea] = useState<string>("");
  const [builtUpArea, setBuiltUpArea] = useState<string>("");
  const [floors, setFloors] = useState<string>("");

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showNote, setShowNote] = useState(false);

  // Title/subtitle (Admin header)
  useEffect(() => {
    document.title = "Trinity PMS — Edit Project";
    window.__ADMIN_SUBTITLE__ = "Update project details, then save.";
    return () => {
      window.__ADMIN_SUBTITLE__ = "";
    };
  }, []);

  // --- Auth gate simple check ---
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) nav("/login", { replace: true });
  }, [nav]);

  // --- Load reference data (states, companies, tags list) ---
  useEffect(() => {
    (async () => {
      try {
        const [{ data: s }, { data: c }, { data: tg }] = await Promise.all([
          api.get("/admin/states"),
          api.get("/admin/companies-brief"),
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

        setStates(Array.isArray(s) ? s : s?.states || []);
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

  // --- Load project data + its tags ---
  useEffect(() => {
    if (!projectId) {
      setErr("Missing project id.");
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const { data } = await api.get(`/admin/projects/${projectId}`);
        const p: any = Array.isArray(data) ? data[0] : data?.project ?? data;
        if (!p) throw new Error("Project not found");

        setTitle(p.title ?? "");
        setCode(p.code ?? "");
        setStatus(p.status ?? "Draft");
        setStage(p.stage ?? "");
        setProjectType(p.projectType ?? "");
        setStructureType(p.structureType ?? "");
        setConstructionType(p.constructionType ?? "");
        setContractType(p.contractType ?? "");
        setHealth(p.health ?? "Unknown");
        setClientCompanyId(p.clientCompanyId ?? p?.clientCompany?.companyId ?? "");

        setAddress(p.address ?? "");
        setStateId(p.stateId ?? p?.state?.stateId ?? "");
        setDistrictId(p.districtId ?? p?.district?.districtId ?? "");
        setCityTown(p.cityTown ?? "");
        setPin((p.pin ?? "").toString());
        setLatitude(p.latitude ?? "");
        setLongitude(p.longitude ?? "");

        const toYmd = (v: any) => {
          if (!v) return "";
          const d = new Date(v);
          if (isNaN(d.getTime())) return typeof v === "string" ? v : "";
          return d.toISOString().slice(0, 10);
        };
        setStartDate(toYmd(p.startDate));
        setPlannedCompletionDate(toYmd(p.plannedCompletionDate));

        setCurrency(p.currency ?? "INR");
        setContractValue(p.contractValue?.toString?.() ?? p.contractValue ?? "");

        setAreaUnit(p.areaUnit ?? "");
        setPlotArea(p.plotArea?.toString?.() ?? p.plotArea ?? "");
        setBuiltUpArea(p.builtUpArea?.toString?.() ?? p.builtUpArea ?? "");
        setFloors((p.floors ?? "")?.toString?.() ?? "");

        setDescription(p.description ?? "");

        try {
          const { data: t1 } = await api.get(`/admin/projects/${projectId}/tags`);
          const current = (Array.isArray(t1) ? t1 : t1?.tags ?? []) as any[];
          setSelectedTagCodes(current.map((t) => t.tagCode ?? t.code ?? t.value).filter(Boolean));
        } catch {
          try {
            const { data: t2 } = await api.get(`/admin/projects/${projectId}/project-tags`);
            const current = (Array.isArray(t2) ? t2 : t2?.tags ?? []) as any[];
            setSelectedTagCodes(current.map((t) => t.tagCode ?? t.code ?? t.value).filter(Boolean));
          } catch {
            /* ignore */
          }
        }
      } catch (e: any) {
        setErr(e?.response?.data?.error || e?.message || "Failed to load project.");
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  // --- Districts by state ---
  useEffect(() => {
    if (!stateId) {
      setDistricts([]);
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
    if (startDate && plannedCompletionDate) {
      const s = new Date(startDate + "T00:00:00Z").getTime();
      const p = new Date(plannedCompletionDate + "T00:00:00Z").getTime();
      if (Number.isFinite(s) && Number.isFinite(p) && p < s) return false;
    }
    return true;
  }, [title, status, startDate, plannedCompletionDate]);

  // derive client company name from selected company id
  const clientCompanyName = useMemo(() => {
    if (!clientCompanyId) return "";
    const c = companies.find((x) => x.companyId === clientCompanyId);
    return c?.name ?? "";
  }, [companies, clientCompanyId]);

  // dynamic hint for Project Code
  const projectCodePlaceholder = useMemo(() => {
    const projPart = (title || "").trim().slice(0, 3).toUpperCase();
    const compPart = (clientCompanyName || "").trim().slice(0, 3).toUpperCase();
    const pinPart = (pin || "").trim();
    if (projPart && compPart && pinPart) return `${projPart}-${compPart}-${pinPart}`;
    return "e.g. PRO-COM-110001";
  }, [title, clientCompanyName, pin]);

  const stateOptions = useMemo(() => {
    const opts = states.map((s) => ({
      value: s.stateId,
      label: `${s.name} (${s.code})`,
    }));
    if (stateId && !opts.some((o) => o.value === stateId)) {
      opts.push({ value: stateId, label: "(unknown state)" });
    }
    return opts;
  }, [states, stateId]);

  const districtOptions = useMemo(() => {
    const opts = districts.map((d) => ({ value: d.districtId, label: d.name }));
    if (districtId && !opts.some((o) => o.value === districtId)) {
      opts.push({ value: districtId, label: "(unknown district)" });
    }
    return opts;
  }, [districts, districtId]);

  const companyOptions = useMemo(() => {
    const opts = companies.map((c) => ({ value: c.companyId, label: c.name }));
    if (clientCompanyId && !opts.some((o) => o.value === clientCompanyId)) {
      opts.push({ value: clientCompanyId, label: "(unknown company)" });
    }
    return opts;
  }, [companies, clientCompanyId]);

  const onPickTags = (e: ChangeEvent<HTMLSelectElement>) => {
    const values = Array.from(e.target.selectedOptions).map((o) => o.value);
    setSelectedTagCodes(values);
  };

  const submit = async () => {
    if (!projectId) return;
    setErr(null);

    if (!canSave) {
      setErr("Please fill required fields. Also ensure 'Planned Completion' is not before 'Start Date'.");
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

      address: address || undefined,
      stateId: stateId || undefined,
      districtId: districtId || undefined,
      cityTown: cityTown || undefined,
      pin: pin.replace(/[^\d]/g, "").slice(0, 6) || undefined,
      latitude: latitude || undefined,
      longitude: longitude || undefined,

      startDate: startDate || undefined,
      plannedCompletionDate: plannedCompletionDate || undefined,
      currency: currency || undefined,
      contractValue: contractValue || undefined,

      areaUnit: areaUnit || undefined,
      plotArea: plotArea || undefined,
      builtUpArea: builtUpArea || undefined,
      floors: floors ? Number(floors) : undefined,

      description: description || undefined,
    };

    try {
      setSaving(true);

      await api.patch(`/admin/projects/${projectId}`, payload);

      try {
        await api.post(`/admin/projects/${projectId}/tags`, { tagCodes: selectedTagCodes });
      } catch {
        try {
          await api.post(`/admin/projects/${projectId}/project-tags`, { tagCodes: selectedTagCodes });
        } catch {
          /* ignore */
        }
      }

      nav("/admin/projects", { replace: true });
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || "Failed to save project");
    } finally {
      setSaving(false);
    }
  };

  /* ========================= CompanyEdit exact button tokens ========================= */
  const btnSmBase =
    "h-8 px-3 rounded-full text-[11px] font-semibold shadow-sm hover:brightness-105 " +
    "focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-neutral-950 " +
    "disabled:opacity-60 disabled:cursor-not-allowed";
  const btnOutline =
    `${btnSmBase} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 ` +
    "dark:border-white/10 dark:bg-neutral-950 dark:text-slate-200 dark:hover:bg-white/5";
  const btnPrimary =
    `${btnSmBase} bg-[#00379C] text-white shadow-sm hover:brightness-110 focus:ring-[#00379C]/35`;
  const infoBtn =
    "ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white " +
    "text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 " +
    "dark:border-white/10 dark:bg-neutral-950 dark:text-slate-200 dark:hover:bg-white/5";

  return (
    <div className="w-full">
      <div className="mx-auto max-w-5xl">
        {/* Top helper row (EXACT pattern as CompanyEdit/UserEdit) */}
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-slate-700 dark:text-slate-200">
            Edit and save project information.
            <button className={infoBtn} onClick={() => setShowNote(true)} type="button">
              i
            </button>
            {projectId ? (
              <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                ID: <span className="font-mono">{projectId}</span>
              </span>
            ) : null}
          </div>

          <div className="flex gap-2">
            <button className={btnOutline} onClick={() => nav("/admin/projects")} type="button">
              Cancel
            </button>
            <button className={btnPrimary} onClick={submit} disabled={!canSave || saving || loading} type="button">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {err && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200">
            {err}
          </div>
        )}

        {loading ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-700 shadow-sm dark:border-white/10 dark:bg-neutral-950 dark:text-slate-200 sm:px-6 sm:py-5">
            Loading project…
          </div>
        ) : (
          <div className="mt-4">
            <Section title="Summary">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input label="Project Title" value={title} onChange={setTitle} required />
                <Input label="Project Code" value={code} onChange={setCode} placeholder={projectCodePlaceholder} />

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
                  options={companyOptions}
                />
              </div>
            </Section>

            <Section title="Location">
              <TextArea label="Address" value={address} onChange={setAddress} rows={3} />

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <SelectStrict
                  label="State / UT"
                  value={stateId}
                  onChange={(v) => {
                    setStateId(v);
                    setDistrictId("");
                  }}
                  placeholder="Select (optional)"
                  options={stateOptions}
                />

                <SelectStrict
                  label="District"
                  value={districtId}
                  onChange={setDistrictId}
                  placeholder={stateId ? "Select (optional)" : "Select state first"}
                  options={districtOptions}
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

            <Section title="Tags">
              <MultiSelect
                label="Select Tag(s)"
                value={selectedTagCodes}
                onChange={onPickTags}
                options={allTags.map((t) => ({ value: t.tagCode, label: t.label || t.tagCode }))}
              />
            </Section>

            <Section title="Notes / Description">
              <TextArea label="Description" value={description} onChange={setDescription} rows={4} />
            </Section>

            {/* Bottom actions (EXACT pattern as CompanyEdit/UserEdit) */}
            <div className="mt-6 flex justify-end gap-2">
              <button className={btnOutline} onClick={() => nav("/admin/projects")} type="button">
                Cancel
              </button>
              <button className={btnPrimary} onClick={submit} disabled={!canSave || saving || loading} type="button">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Note modal (CompanyEdit style) */}
      {showNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowNote(false)} />

          <div className="relative z-10 mx-4 w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-neutral-950">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-white/10">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                Note for Admins — Editing a Project
              </div>
              <button className={btnOutline} onClick={() => setShowNote(false)} type="button">
                Close
              </button>
            </div>

            <div className="space-y-3 p-5 text-sm leading-6 text-slate-800 dark:text-slate-200">
              <div>
                <b>Required to save:</b> Project Title and Status.
              </div>
              <div>
                <b>Dates rule:</b> if you enter both Start Date and Planned Completion, the completion date cannot be before the start date.
              </div>
              <div>
                <b>Optional but helpful:</b> Stage, Project Type, Structure Type, Construction Mode, Contract Type, Project Health,
                Client/Owner Company, Description/Notes, and Tags.
              </div>
              <div>
                <b>Location (optional):</b> Address, State, District, City/Town, PIN, Latitude, Longitude.
                <ul className="mt-1 list-disc space-y-1 pl-5">
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
              <div>
                <b>Cancel:</b> returns to the Projects list without saving.
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-white/10">
              <button className={btnPrimary} onClick={() => setShowNote(false)} type="button">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
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
  required = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
        {required ? <span className="text-rose-600"> *</span> : null}
      </span>
      <input
        className="h-10 w-full rounded-full border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none
          focus:border-transparent focus:ring-2 focus:ring-[#00379C]/30
          disabled:cursor-not-allowed disabled:opacity-60
          dark:border-white/10 dark:bg-neutral-950 dark:text-white dark:focus:ring-[#FCC020]/30"
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
  rows = 4,
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
        className="w-full resize-y rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none
          focus:border-transparent focus:ring-2 focus:ring-[#00379C]/30
          dark:border-white/10 dark:bg-neutral-950 dark:text-white dark:focus:ring-[#FCC020]/30"
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
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <select
        className="h-10 w-full rounded-full border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm outline-none
          focus:border-transparent focus:ring-2 focus:ring-[#00379C]/30
          disabled:cursor-not-allowed disabled:opacity-60
          dark:border-white/10 dark:bg-neutral-950 dark:text-white dark:focus:ring-[#FCC020]/30"
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
        className="h-10 w-full rounded-full border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none
          focus:border-transparent focus:ring-2 focus:ring-[#00379C]/30
          disabled:cursor-not-allowed disabled:opacity-60
          dark:border-white/10 dark:bg-neutral-950 dark:text-white dark:focus:ring-[#FCC020]/30"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
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
        className="w-full min-h-[8rem] rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none
          focus:border-transparent focus:ring-2 focus:ring-[#00379C]/30
          disabled:cursor-not-allowed disabled:opacity-60
          dark:border-white/10 dark:bg-neutral-950 dark:text-white dark:focus:ring-[#FCC020]/30"
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
