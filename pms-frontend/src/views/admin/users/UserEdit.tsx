// pms-frontend/src/views/admin/users/UserEdit.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../../api/client";

/** Reference-data types */
type StateOpt = { stateId: string; name: string; code: string };
type DistrictOpt = { districtId: string; name: string; stateId: string };
type ProjectOpt = { projectId: string; title: string; code?: string | null };
type CompanyOpt = {
  companyId: string;
  name: string;
  companyRole?: "Ava_PMT" | "Contractor" | "Consultant" | "PMC" | "Supplier" | null;
};

/** Enums from prisma schema */
const preferredLanguages = ["en","hi","bn","ta","te","mr","pa","or","gu","kn","ml"] as const;
const zones = ["NCR","North","South","East","West","Central"] as const;
const statuses = ["Active","Inactive"] as const;

/** Small helpers (photo preview) */
function resolvePhotoUrl(path?: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = (api.defaults.baseURL || "").replace(/\/+$/, "");
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

export default function UserEdit() {
  const nav = useNavigate();
  const { id } = useParams<{ id: string }>();
  const fileRef = useRef<HTMLInputElement | null>(null);

  // ---------- Identity ----------
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState(""); // India mobile (digits only)
  const [email, setEmail] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState<string>("");
  const [userStatus, setUserStatus] = useState<string>("Active");
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null); // current server path

  // ---------- Location ----------
  const [stateId, setStateId] = useState<string>("");
  const [districtId, setDistrictId] = useState<string>("");
  const [cityTown, setCityTown] = useState("");
  const [pin, setPin] = useState("");
  const [operatingZone, setOperatingZone] = useState<string>("");
  const [address, setAddress] = useState("");

  // ---------- Affiliations ----------
  const [isClient, setIsClient] = useState<boolean>(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [isServiceProvider, setIsServiceProvider] = useState<boolean>(false);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);

  // ---------- Reference data ----------
  const [states, setStates] = useState<StateOpt[]>([]);
  const [districts, setDistricts] = useState<DistrictOpt[]>([]);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [companies, setCompanies] = useState<CompanyOpt[]>([]);
  const [refsErr, setRefsErr] = useState<string | null>(null);

  // ---------- UI ----------
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // --- Auth gate simple check ---
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) nav("/login", { replace: true });
  }, [nav]);

  // --- Load reference data (states/projects/companies) using refs controller ---
  const loadRefs = async () => {
    setRefsErr(null);
    const results = await Promise.allSettled([
      api.get("/admin/states"),
      api.get("/admin/projects", { params: { status: "Active" } }),
      api.get("/admin/companies-brief"),
    ]);

    // states
    if (results[0].status === "fulfilled") {
      const s: any = results[0].value.data;
      setStates(Array.isArray(s) ? s : (s?.states || []));
    } else {
      const status = (results[0] as any)?.reason?.response?.status;
      setStates([]);
      setRefsErr(
        status === 404
          ? "States API not found (list may be incomplete)."
          : ((results[0] as any)?.reason?.response?.data?.error || "Failed to load states.")
      );
    }

    // projects
    if (results[1].status === "fulfilled") {
      const p: any = results[1].value.data;
      setProjects(Array.isArray(p) ? p : (p?.projects || []));
    } else {
      if (!refsErr) {
        setRefsErr((results[1] as any)?.reason?.response?.data?.error || "Failed to load projects.");
      }
    }

    // companies
    if (results[2].status === "fulfilled") {
      const c: any = results[2].value.data;
      setCompanies(Array.isArray(c) ? c : (c?.companies || []));
    } else {
      if (!refsErr) {
        setRefsErr((results[2] as any)?.reason?.response?.data?.error || "Failed to load companies.");
      }
    }
  };

  useEffect(() => {
    loadRefs();
  }, []);

  // --- Load user by id (GET /admin/users/:id?includeMemberships=1) ---
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        const { data } = await api.get(`/admin/users/${id}`, { params: { includeMemberships: "1" } });
        const u = data?.user || data; // accept both shapes
        if (!u) throw new Error("User not found");

        // Identity
        setFirstName(u.firstName || "");
        setMiddleName(u.middleName || "");
        setLastName(u.lastName || "");
        setPhone(String(u.phone || "").replace(/\D/g, "").slice(0, 10));
        setEmail(u.email || "");
        setPreferredLanguage(u.preferredLanguage || "");
        setUserStatus(u.userStatus || "Active");
        setProfilePhoto(u.profilePhoto || null);

        // Location
        setStateId(u.stateId || "");
        setDistrictId(u.districtId || "");
        setCityTown(u.cityTown || "");
        setPin(String(u.pin || "").replace(/\D/g, "").slice(0, 6));
        setOperatingZone(u.operatingZone || "");
        setAddress(u.address || "");

        // Affiliations & flags
        setIsClient(!!u.isClient);
        setIsServiceProvider(!!u.isServiceProvider);

        const memberships: any[] = Array.isArray(u.userRoleMemberships) ? u.userRoleMemberships : [];
        setSelectedProjectIds(
          memberships
            .filter((m) => m.scopeType === "Project" && m.projectId)
            .map((m) => m.projectId)
        );
        setSelectedCompanyIds(
          memberships
            .filter((m) => m.scopeType === "Company" && m.companyId)
            .map((m) => m.companyId)
        );
      } catch (e: any) {
        setErr(e?.response?.data?.error || e?.message || "Failed to load user.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Districts by state (from refs controller) — runs whenever stateId is set/changes
  useEffect(() => {
    if (!stateId) {
      setDistricts([]);
      setDistrictId("");
      return;
    }
    (async () => {
      try {
        const { data } = await api.get("/admin/districts", { params: { stateId } });
        const list = Array.isArray(data) ? data : (data?.districts || []);
        setDistricts(list);
        // if current selected district doesn't belong to this state, clear it
        if (list.length && districtId) {
          const found = list.some((d: { districtId: string; }) => d.districtId === districtId);
          if (!found) setDistrictId("");
        }
      } catch (e: any) {
        setDistricts([]);
        setRefsErr(e?.response?.data?.error || "Failed to load districts.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateId]);

  const namePreview = useMemo(
    () => [firstName, middleName, lastName].filter(Boolean).join(" "),
    [firstName, middleName, lastName]
  );

  const phoneClean = phone.replace(/\D/g, "");
  const pinClean = pin.replace(/\D/g, "");

  const canSave =
    firstName.trim().length > 0 &&
    phoneClean.length >= 10;

  const onPickCompanies = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const values = Array.from(e.target.selectedOptions).map((o) => o.value);
    setSelectedCompanyIds(values);
  };

  const onPickProjects = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const values = Array.from(e.target.selectedOptions).map((o) => o.value);
    setSelectedProjectIds(values);
  };

  const submit = async () => {
    setErr(null);
    if (!canSave || !id) {
      setErr("First Name and a valid Mobile (India) are required.");
      return;
    }

    try {
      setSaving(true);

      // 1) Update scalar fields
      const updatePayload = {
        firstName,
        middleName: middleName || undefined,
        lastName: lastName || undefined,
        email: email || undefined,
        countryCode: "+91",
        phone: phoneClean,
        preferredLanguage: preferredLanguage || undefined,
        userStatus: userStatus || "Active",
        // location:
        stateId: stateId || undefined,
        districtId: districtId || undefined,
        cityTown: cityTown || undefined,
        pin: pinClean || undefined,
        operatingZone: operatingZone || undefined,
        address: address || undefined,
        // flags (top-level)
        isClient,
        isServiceProvider,
      };

      await api.patch(`/admin/users/${id}`, updatePayload);

      // 2) Optional: upload a new profile photo
      if (profileFile) {
        const fd = new FormData();
        fd.append("file", profileFile);
        const { data: up } = await api.post(`/admin/users/${id}/photo`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        if (up?.user?.profilePhoto) {
          setProfilePhoto(up.user.profilePhoto);
        }
      }

      // 3) Save affiliations (projects/companies)
      await api.post(`/admin/users/${id}/affiliations`, {
        isClient,
        projectIds: isClient ? selectedProjectIds : [],
        isServiceProvider,
        companyIds: isServiceProvider ? selectedCompanyIds : [],
      });

      nav("/admin/users", { replace: true });
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || "Failed to update user");
    } finally {
      setSaving(false);
    }
  };

  // Useful labels for the selects (in case selected value isn't in the list yet)
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
            <h1 className="text-2xl font-semibold dark:text-white">Edit User</h1>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Update the blocks below and save changes.
            </p>
            {refsErr && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{refsErr}</p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              className="px-4 py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
              onClick={() => nav("/admin/users")}
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
              onClick={submit}
              disabled={!canSave || saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {err && <div className="mb-3 text-sm text-red-700 dark:text-red-400">{err}</div>}

        {loading ? (
          <div className="text-sm text-gray-700 dark:text-gray-300">Loading…</div>
        ) : (
          <>
            {/* ========== Identity Block ========== */}
            <Section title="Identity">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Text label="First Name" value={firstName} setValue={setFirstName} required />
                <Text label="Middle Name" value={middleName} setValue={setMiddleName} />
                <Text label="Last Name" value={lastName} setValue={setLastName} />
                <Text label="Email (optional)" type="email" value={email} setValue={setEmail} />

                <div className="grid grid-cols-[5rem,1fr] gap-2">
                  <Text label="Code" value="+91" setValue={() => {}} disabled />
                  <Text
                    label="Mobile (India)"
                    value={phone}
                    setValue={(v) => setPhone(v.replace(/[^\d]/g, "").slice(0, 10))}
                    required
                    placeholder="10-digit mobile"
                  />
                </div>

                <Select
                  label="Preferred Language"
                  value={preferredLanguage}
                  setValue={setPreferredLanguage}
                  options={["", ...preferredLanguages]}
                />
                <Select
                  label="Status"
                  value={userStatus}
                  setValue={setUserStatus}
                  options={statuses as unknown as string[]}
                />

                {/* Profile Photo: preview + change */}
                <div className="md:col-span-2">
                  <span className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Profile Photo</span>
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 rounded-full overflow-hidden border dark:border-neutral-800 bg-gray-100 dark:bg-neutral-800">
                      {profileFile ? (
                        <img
                          src={URL.createObjectURL(profileFile)}
                          alt="Preview"
                          className="h-full w-full object-cover"
                        />
                      ) : profilePhoto ? (
                        <img
                          src={resolvePhotoUrl(profilePhoto) || ""}
                          alt="Current"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full grid place-items-center text-xs text-gray-500">No photo</div>
                      )}
                    </div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => setProfileFile(e.target.files?.[0] || null)}
                      className="block w-full text-sm file:mr-3 file:py-2 file:px-3 file:rounded file:border file:bg-white dark:file:bg-neutral-900 file:text-sm file:border-gray-300 dark:file:border-neutral-800"
                    />
                    {profileFile && (
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        {profileFile.name} ({Math.round(profileFile.size / 1024)} KB)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 text-xs text-gray-600 dark:text-gray-400">
                Name preview: <b className="dark:text-white">{namePreview || "(empty)"}</b>
              </div>
            </Section>

            {/* ========== Location Block ========== */}
            <Section title="Location">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select
                  label="State / UT"
                  value={stateId}
                  setValue={(v) => { setStateId(v); setDistrictId(""); }}
                  options={[
                    "",
                    ...states.map(s => ({ value: s.stateId, label: `${s.name} (${s.code})` })),
                    // If current stateId not in states (e.g. refs failed but user has a value), show a fallback option
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
                <Select
                  label="Operating Zone"
                  value={operatingZone}
                  setValue={setOperatingZone}
                  options={["", ...zones]}
                />
                <TextArea label="Address" value={address} setValue={setAddress} />
              </div>
            </Section>

            {/* ========== Affiliations Block ========== */}
            <Section title="Affiliations">
              <div className="space-y-5">
                {/* Client Projects */}
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 dark:text-gray-300">Are you Client for any Project?</span>
                    <ToggleYN value={isClient} setValue={setIsClient} />
                  </div>
                  <div className="mt-2">
                    <MultiSelect
                      label="Select Project(s)"
                      disabled={!isClient}
                      value={selectedProjectIds}
                      onChange={onPickProjects}
                      options={projects.map(p => ({ value: p.projectId, label: p.code ? `${p.title} (${p.code})` : p.title }))}
                    />
                  </div>
                </div>

                {/* Service Partner Companies */}
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Are you working for any of our Service Partner?
                    </span>
                    <ToggleYN value={isServiceProvider} setValue={setIsServiceProvider} />
                  </div>
                  <div className="mt-2">
                    <MultiSelect
                      label="Select Company(ies)"
                      disabled={!isServiceProvider}
                      value={selectedCompanyIds}
                      onChange={onPickCompanies}
                      options={companies.map(c => ({
                        value: c.companyId,
                        label: c.companyRole ? `${c.name} — ${c.companyRole}` : c.name,
                      }))}
                    />
                  </div>
                </div>
              </div>
            </Section>

            {/* Footer actions */}
            <div className="mt-6 flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
                onClick={() => nav("/admin/users")}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
                onClick={submit}
                disabled={!canSave || saving}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        )}
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

function ToggleYN({ value, setValue }: { value: boolean; setValue: (v: boolean) => void }) {
  return (
    <div className="inline-flex rounded-lg border dark:border-neutral-800 overflow-hidden">
      <button
        type="button"
        onClick={() => setValue(true)}
        className={
          "px-3 py-1 text-sm " +
          (value ? "bg-emerald-600 text-white" : "bg-white dark:bg-neutral-900")
        }
      >
        Yes
      </button>
      <button
        type="button"
        onClick={() => setValue(false)}
        className={
          "px-3 py-1 text-sm " +
          (!value ? "bg-emerald-600 text-white" : "bg-white dark:bg-neutral-900")
        }
      >
        No
      </button>
    </div>
  );
}
