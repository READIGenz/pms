// pms-frontend/src/views/admin/projects/ProjectEdit.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../../api/client";

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
  const [plannedCompletionDate, setPlannedCompletionDate] =
    useState<string>("");
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
        setClientCompanyId(
          p.clientCompanyId ?? p?.clientCompany?.companyId ?? ""
        );

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
        setContractValue(
          p.contractValue?.toString?.() ?? p.contractValue ?? ""
        );

        setAreaUnit(p.areaUnit ?? "");
        setPlotArea(p.plotArea?.toString?.() ?? p.plotArea ?? "");
        setBuiltUpArea(p.builtUpArea?.toString?.() ?? p.builtUpArea ?? "");
        setFloors((p.floors ?? "")?.toString?.() ?? "");

        setDescription(p.description ?? "");

        try {
          const { data: t1 } = await api.get(
            `/admin/projects/${projectId}/tags`
          );
          const current = (Array.isArray(t1) ? t1 : t1?.tags ?? []) as any[];
          setSelectedTagCodes(
            current.map((t) => t.tagCode ?? t.code ?? t.value).filter(Boolean)
          );
        } catch {
          try {
            const { data: t2 } = await api.get(
              `/admin/projects/${projectId}/project-tags`
            );
            const current = (Array.isArray(t2) ? t2 : t2?.tags ?? []) as any[];
            setSelectedTagCodes(
              current.map((t) => t.tagCode ?? t.code ?? t.value).filter(Boolean)
            );
          } catch {
            /* ignore */
          }
        }
      } catch (e: any) {
        setErr(
          e?.response?.data?.error || e?.message || "Failed to load project."
        );
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
        const { data } = await api.get("/admin/districts", {
          params: { stateId },
        });
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

    if (projPart && compPart && pinPart)
      return `${projPart}-${compPart}-${pinPart}`;
    return "e.g. PRO-COM-110001 (3 letters project - 3 letters company - PIN)";
  }, [title, clientCompanyName, pin]);

  const onPickTags = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const values = Array.from(e.target.selectedOptions).map((o) => o.value);
    setSelectedTagCodes(values);
  };

  const submit = async () => {
    if (!projectId) return;
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
        await api.post(`/admin/projects/${projectId}/tags`, {
          tagCodes: selectedTagCodes,
        });
      } catch {
        try {
          await api.post(`/admin/projects/${projectId}/project-tags`, {
            tagCodes: selectedTagCodes,
          });
        } catch {
          /* ignore */
        }
      }

      nav("/admin/projects", { replace: true });
    } catch (e: any) {
      setErr(
        e?.response?.data?.error || e?.message || "Failed to save project"
      );
    } finally {
      setSaving(false);
    }
  };

  const stateLabel = useMemo(() => {
    if (!stateId) return "";
    const s = states.find((x) => x.stateId === stateId);
    return s ? `${s.name} (${s.code})` : "(unknown state)";
  }, [stateId, states]);

  const districtLabel = useMemo(() => {
    if (!districtId) return "";
    const d = districts.find((x) => x.districtId === districtId);
    return d ? d.name : "(unknown district)";
  }, [districtId, districts]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-yellow-50 dark:from-neutral-900 dark:to-neutral-950 px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        {/* Header (Create-like) */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
              Edit Project
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-300 inline-flex items-center gap-2">
              <span>
                Update the details below and save.
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
            {projectId && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Project ID: <span className="font-mono">{projectId}</span>
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
              onClick={() => nav("/admin/projects")}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
              onClick={submit}
              disabled={!canSave || saving || loading}
              type="button"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {err && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {err}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-slate-200/80 bg-white/95 px-5 py-4 text-sm text-slate-700 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200">
            Loading project…
          </div>
        ) : (
          <>
            {/* ========== Summary ========== */}
            <Section title="Summary">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Text
                  label="Project Title"
                  value={title}
                  setValue={setTitle}
                  required
                />
                <Text
                  label="Project Code"
                  value={code}
                  setValue={setCode}
                  placeholder={projectCodePlaceholder}
                />

                <Select
                  label="Status"
                  value={status}
                  setValue={setStatus}
                  options={projectStatuses as unknown as string[]}
                />
                <Select
                  label="Stage"
                  value={stage}
                  setValue={setStage}
                  options={["", ...stages]}
                />

                <Select
                  label="Project Type"
                  value={projectType}
                  setValue={setProjectType}
                  options={["", ...projectTypes]}
                />
                <Select
                  label="Structure Type"
                  value={structureType}
                  setValue={setStructureType}
                  options={["", ...structureTypes]}
                />
                <Select
                  label="Construction Mode"
                  value={constructionType}
                  setValue={setConstructionType}
                  options={["", ...constructionTypes]}
                />
                <Select
                  label="Contract Type"
                  value={contractType}
                  setValue={setContractType}
                  options={["", ...contractTypes]}
                />
                <Select
                  label="Project Health"
                  value={health}
                  setValue={setHealth}
                  options={healthOptions as unknown as string[]}
                />

                <Select
                  label="Client / Owner Company"
                  value={clientCompanyId}
                  setValue={setClientCompanyId}
                  options={[
                    "",
                    ...companies.map((c) => ({
                      value: c.companyId,
                      label: c.name,
                    })),
                  ]}
                />
              </div>
            </Section>

            {/* ========== Location ========== */}
            <Section title="Location">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <TextArea
                  label="Address"
                  value={address}
                  setValue={setAddress}
                />

                <Select
                  label="State / UT"
                  value={stateId}
                  setValue={(v) => {
                    setStateId(v);
                    // Create clears district on state change
                    setDistrictId("");
                  }}
                  options={[
                    "",
                    ...states.map((s) => ({
                      value: s.stateId,
                      label: `${s.name} (${s.code})`,
                    })),
                    ...(stateId && !states.some((s) => s.stateId === stateId)
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
                    ...districts.map((d) => ({
                      value: d.districtId,
                      label: d.name,
                    })),
                    ...(districtId &&
                    !districts.some((d) => d.districtId === districtId)
                      ? [{ value: districtId, label: districtLabel }]
                      : []),
                  ]}
                  disabled={!stateId}
                />
                <Text
                  label="City/Town"
                  value={cityTown}
                  setValue={setCityTown}
                />
                <Text
                  label="PIN Code"
                  value={pin}
                  setValue={(v) => setPin(v.replace(/[^\d]/g, "").slice(0, 6))}
                  placeholder="6-digit PIN"
                />
                <Text
                  label="Latitude"
                  value={latitude}
                  setValue={(v) =>
                    setLatitude(v.replace(/[^0-9.\-]/g, "").slice(0, 12))
                  }
                  placeholder="e.g., 12.9716"
                />
                <Text
                  label="Longitude"
                  value={longitude}
                  setValue={(v) =>
                    setLongitude(v.replace(/[^0-9.\-]/g, "").slice(0, 13))
                  }
                  placeholder="e.g., 77.5946"
                />
              </div>
            </Section>

            {/* ========== Dates & Cost ========== */}
            <Section title="Dates and Cost">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <DateInput
                  label="Start Date"
                  value={startDate}
                  setValue={setStartDate}
                />
                <DateInput
                  label="Planned Completion"
                  value={plannedCompletionDate}
                  setValue={setPlannedCompletionDate}
                  min={startDate || undefined}
                />

                <Select
                  label="Currency"
                  value={currency}
                  setValue={setCurrency}
                  options={currencies as unknown as string[]}
                />
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
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Select
                  label="Area Units"
                  value={areaUnit}
                  setValue={setAreaUnit}
                  options={["", ...areaUnits]}
                />
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
                  setValue={(v) =>
                    setFloors(v.replace(/[^\d]/g, "").slice(0, 3))
                  }
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
                  setValue={setDescription}
                />
              </div>
            </Section>

            {/* Footer actions (Create-like) */}
            <div className="mt-6 flex justify-end gap-2">
              <button
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
                onClick={() => nav("/admin/projects")}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                onClick={submit}
                disabled={!canSave || saving}
                type="button"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* NOTE MODAL (Create-like styling) */}
      {showNote && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          role="dialog"
          aria-modal="true"
        >
          <div className="mx-4 w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-neutral-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Note for Admins — Editing a Project
              </h2>
              <button
                className="rounded px-2 py-1 text-sm hover:bg-gray-100 dark:hover:bg-neutral-800"
                onClick={() => setShowNote(false)}
                aria-label="Close"
                type="button"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 p-5 text-sm leading-6 text-gray-800 dark:text-gray-100">
              <div>
                <b>Required to save:</b> Project Title and Status.
              </div>

              <div>
                <b>Dates rule:</b> if you enter both Start Date and Planned
                Completion, the completion date cannot be before the start date.
              </div>

              <div>
                <b>Optional but helpful:</b> Stage, Project Type, Structure
                Type, Construction Mode, Contract Type, Project Health,
                Client/Owner Company, Description/Notes, and Tags.
              </div>

              <div>
                <b>Location (optional):</b> Address, State, District, City/Town,
                PIN, Latitude, Longitude.
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  <li>PIN should be a 6-digit number.</li>
                  <li>
                    Latitude/Longitude accept only numbers, decimal points, and
                    minus signs.
                  </li>
                </ul>
              </div>

              <div>
                <b>Currency &amp; Contract Value (optional):</b> Currency
                defaults to INR; Contract Value accepts numbers and decimals.
              </div>

              <div>
                <b>Tags (optional):</b> You can select multiple tags.
              </div>

              <div>
                <b>After a successful save:</b> you’ll be taken back to the
                Projects page.
              </div>

              <div>
                <b>Cancel:</b> returns to the Projects list without saving.
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

/* ------------------------ Small UI helpers (match Create) ------------------------ */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <div className="rounded-2xl border border-slate-200/80 bg-white/95 px-5 py-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:px-6 sm:py-5">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
          {title}
        </div>
        {children}
      </div>
    </section>
  );
}

function Text({
  label,
  value,
  setValue,
  type = "text",
  required = false,
  placeholder,
  disabled = false,
}: {
  label: string;
  value: string;
  setValue: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <input
        className="h-9 w-full rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[13px] text-slate-800 placeholder:text-slate-400 shadow-sm focus:outline-none focus:border-transparent focus:ring-2 focus:ring-emerald-400 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        type={type}
        placeholder={placeholder}
        disabled={disabled}
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  setValue,
}: {
  label: string;
  value: string;
  setValue: (v: string) => void;
}) {
  return (
    <label className="block md:col-span-2">
      <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <textarea
        className="w-full min-h-[84px] resize-y rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm focus:outline-none focus:border-transparent focus:ring-2 focus:ring-emerald-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </label>
  );
}

function Select({
  label,
  value,
  setValue,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  setValue: (v: string) => void;
  options: (string | { value: string; label: string })[];
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <select
        className="h-9 w-full rounded-full border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 shadow-sm focus:outline-none focus:border-transparent focus:ring-2 focus:ring-emerald-400 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
      >
        {options.map((o, i) => {
          const v = typeof o === "string" ? o : o.value;
          const l = typeof o === "string" ? o || "—" : o.label;
          return (
            <option key={v || `empty-${i}`} value={v}>
              {l || "—"}
            </option>
          );
        })}
      </select>
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
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <select
        multiple
        className="w-full min-h-[8rem] rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:border-transparent focus:ring-2 focus:ring-emerald-400 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
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
  label,
  value,
  setValue,
  min,
  max,
}: {
  label: string;
  value: string;
  setValue: (v: string) => void;
  min?: string;
  max?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <input
        type="date"
        className="h-9 w-full rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[13px] text-slate-800 shadow-sm focus:outline-none focus:border-transparent focus:ring-2 focus:ring-emerald-400 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
        value={value}
        min={min}
        max={max}
        onChange={(e) => setValue(e.target.value)}
      />
    </label>
  );
}
