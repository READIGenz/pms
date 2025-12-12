// pms-frontend/src/views/admin/users/UserEdit.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../../api/client";

/** Reference-data types */
type StateOpt = { stateId: string; name: string; code: string };
type DistrictOpt = { districtId: string; name: string; stateId: string };
type ProjectOpt = { projectId: string; title: string; code?: string | null };
type CompanyOpt = {
  companyId: string;
  name: string;
  companyRole?:
    | "IH_PMT"
    | "Contractor"
    | "Consultant"
    | "PMC"
    | "Supplier"
    | null;
};

/** Enums from prisma schema */
const preferredLanguages = [
  "en",
  "hi",
  "bn",
  "ta",
  "te",
  "mr",
  "pa",
  "or",
  "gu",
  "kn",
  "ml",
] as const;
const zones = ["NCR", "North", "South", "East", "West", "Central"] as const;
const statuses = ["Active", "Inactive"] as const;

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
  const [selectedProjectIds] = useState<string[]>([]); // intentionally not used in UI
  const [isServiceProvider, setIsServiceProvider] = useState<boolean>(false);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);

  // ---------- Reference data ----------
  const [states, setStates] = useState<StateOpt[]>([]);
  const [districts, setDistricts] = useState<DistrictOpt[]>([]);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [companies, setCompanies] = useState<CompanyOpt[]>([]);
  const [refsErr, setRefsErr] = useState<string | null>(null);
  const [companyRoleFilter, setCompanyRoleFilter] = useState<string>("");

  // Map of service-provider companyId -> list of projectIds the user is assigned on via that company
  const [svcProjByCompany, setSvcProjByCompany] = useState<
    Record<string, string[]>
  >({});

  const filteredCompanies = useMemo(() => {
    const normalize = (s: string) => s.replace(/[_\s]/g, "-").toLowerCase();
    const filter =
      companyRoleFilter === "IH_PMT" ? "IH-PMT" : companyRoleFilter;
    const f = normalize(filter || "");
    return companies.filter((c) => {
      if (!f) return true;
      return normalize(String(c.companyRole ?? "")) === f;
    });
  }, [companies, companyRoleFilter]);

  const clientProjectLabels = useMemo(() => {
    return selectedProjectIds.map((pid) => {
      const p = projects.find((pr) => pr.projectId === pid);
      if (!p) return pid;
      return p.code ? `${p.code} — ${p.title}` : p.title;
    });
  }, [selectedProjectIds, projects]);

  const serviceCompanyLabels = useMemo(() => {
    return selectedCompanyIds.map((cid) => {
      const c = companies.find((co) => co.companyId === cid);
      if (!c) return cid;
      return c.companyRole ? `${c.name} — ${c.companyRole}` : c.name;
    });
  }, [selectedCompanyIds, companies]);

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

  // --- Load reference data (states/projects/companies) using refs controller ---
  const loadRefs = async () => {
    setRefsErr(null);
    const results = await Promise.allSettled([
      api.get("/admin/states"),
      api.get("/admin/projects"),
      api.get("/admin/companies-brief"),
    ]);

    // states
    if (results[0].status === "fulfilled") {
      const s: any = results[0].value.data;
      setStates(Array.isArray(s) ? s : s?.states || []);
    } else {
      const status = (results[0] as any)?.reason?.response?.status;
      setStates([]);
      setRefsErr(
        status === 404
          ? "States API not found (list may be incomplete)."
          : (results[0] as any)?.reason?.response?.data?.error ||
              "Failed to load states."
      );
    }

    // projects
    if (results[1].status === "fulfilled") {
      const p: any = results[1].value.data;
      setProjects(Array.isArray(p) ? p : p?.projects || []);
    } else {
      if (!refsErr) {
        setRefsErr(
          (results[1] as any)?.reason?.response?.data?.error ||
            "Failed to load projects."
        );
      }
    }

    // companies
    if (results[2].status === "fulfilled") {
      const c: any = results[2].value.data;
      setCompanies(Array.isArray(c) ? c : c?.companies || []);
    } else {
      if (!refsErr) {
        setRefsErr(
          (results[2] as any)?.reason?.response?.data?.error ||
            "Failed to load companies."
        );
      }
    }
  };

  useEffect(() => {
    loadRefs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Load user by id (GET /admin/users/:id?includeMemberships=1) ---
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        const { data } = await api.get(`/admin/users/${id}`, {
          params: { includeMemberships: "1" },
        });
        const u = data?.user || data;
        if (!u) throw new Error("User not found");

        // Identity
        setFirstName(u.firstName || "");
        setMiddleName(u.middleName || "");
        setLastName(u.lastName || "");
        setPhone(
          String(u.phone || "")
            .replace(/\D/g, "")
            .slice(0, 10)
        );
        setEmail(u.email || "");
        setPreferredLanguage(u.preferredLanguage || "");
        setUserStatus(u.userStatus || "Active");
        setProfilePhoto(u.profilePhoto || null);

        // Location
        setStateId(u.stateId || "");
        setDistrictId(u.districtId || "");
        setCityTown(u.cityTown || "");
        setPin(
          String(u.pin || "")
            .replace(/\D/g, "")
            .slice(0, 6)
        );
        setOperatingZone(u.operatingZone || "");
        setAddress(u.address || "");

        // Affiliations & flags
        setIsClient(!!u.isClient);
        setIsServiceProvider(!!u.isServiceProvider);

        const memberships: any[] = Array.isArray(u.userRoleMemberships)
          ? u.userRoleMemberships
          : [];

        // Client projects still parsed for the guard alerts
        // (even though selection UI is hidden)
        const clientPids = memberships
          .filter(
            (m) =>
              m.scopeType === "Project" && m.role === "Client" && m.projectId
          )
          .map((m) => m.projectId);
        // we don't show project picker, but we need these for guard checks
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        clientPids;

        setSelectedCompanyIds(
          memberships
            .filter((m) => m.scopeType === "Company" && m.companyId)
            .map((m) => m.companyId)
        );
      } catch (e: any) {
        setErr(
          e?.response?.data?.error || e?.message || "Failed to load user."
        );
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!id || projects.length === 0) return;
    buildSvcAssignmentsMap(id, projects);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, projects]);

  // Districts by state
  useEffect(() => {
    if (!stateId) {
      setDistricts([]);
      setDistrictId("");
      return;
    }
    (async () => {
      try {
        const { data } = await api.get("/admin/districts", {
          params: { stateId },
        });
        const list = Array.isArray(data) ? data : data?.districts || [];
        setDistricts(list);
        if (list.length && districtId) {
          const found = list.some(
            (d: { districtId: string }) => d.districtId === districtId
          );
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

  const canSave = firstName.trim().length > 0 && phoneClean.length >= 10;

  // Fetch assignments per project and build: companyId -> projectIds where this user is assigned
  async function buildSvcAssignmentsMap(
    userId: string,
    projList: ProjectOpt[]
  ) {
    const map: Record<string, string[]> = {};

    for (const p of projList) {
      try {
        const { data } = await api.get(
          `/admin/projects/${p.projectId}/assignments`
        );
        const rows: any[] = Array.isArray(data)
          ? data
          : data?.assignments || [];

        rows
          .filter((r) => String(r.userId) === String(userId))
          .forEach((r) => {
            const cid =
              r.companyId ||
              r.company?.companyId ||
              (Array.isArray(r.companies)
                ? r.companies[0]?.companyId
                : undefined);

            const pid = r.projectId || p.projectId;
            if (!cid || !pid) return;

            if (!map[cid]) map[cid] = [];
            if (!map[cid].includes(pid)) map[cid].push(pid);
          });
      } catch {
        // ignore per-project errors
      }
    }

    setSvcProjByCompany(map);
  }

  const submit = async () => {
    setErr(null);
    if (!canSave || !id) {
      setErr("First Name and a valid Mobile (India) are required.");
      return;
    }

    if (isServiceProvider && selectedCompanyIds.length === 0) {
      window.alert(
        "This user is not linked to any Service Partner company.\n\n" +
          "If they are no longer a service provider, please toggle “Are you working for any of our Service Partner?” to No before saving."
      );
      return;
    }

    try {
      setSaving(true);

      const updatePayload = {
        firstName,
        middleName: middleName || undefined,
        lastName: lastName || undefined,
        email: email || undefined,
        countryCode: "+91",
        phone: phoneClean,
        preferredLanguage: preferredLanguage || undefined,
        userStatus: userStatus || "Active",
        stateId: stateId || undefined,
        districtId: districtId || undefined,
        cityTown: cityTown || undefined,
        pin: pinClean || undefined,
        operatingZone: operatingZone || undefined,
        address: address || undefined,
        isClient,
        isServiceProvider,
      };

      await api.patch(`/admin/users/${id}`, updatePayload);

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

      try {
        await api.post(`/admin/users/${id}/affiliations`, {
          isClient,
          isServiceProvider,
          companyIds: isServiceProvider ? selectedCompanyIds : [],
        });
      } catch (e: any) {
        console.warn("Affiliations save failed:", e?.response?.data || e);
      }

      nav("/admin/users", { replace: true });
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || "Failed to update user");
    } finally {
      setSaving(false);
    }
  };

  const onToggleClient = (next: boolean) => {
    if (!next && selectedProjectIds.length > 0) {
      const list = clientProjectLabels.length
        ? `\n\nAssigned as Client on:\n• ${clientProjectLabels.join("\n• ")}`
        : "";
      window.alert(
        "This user is assigned as Client to one or more projects." +
          list +
          "\n\nPlease remove those assignments first, then change this setting."
      );
      return;
    }
    setIsClient(next);
  };

  const onToggleServiceProvider = (next: boolean) => {
    if (!next && selectedCompanyIds.length > 0) {
      const list = serviceCompanyLabels.length
        ? `\n\nLinked to Service Partner companies:\n• ${serviceCompanyLabels.join(
            "\n• "
          )}`
        : "";
      window.alert(
        "This user is linked to one or more Service Partner companies." +
          list +
          "\n\nPlease remove those assignments first, then change this setting."
      );
      return;
    }
    setIsServiceProvider(next);
  };

  const onBeforeUncheckCompany = (companyId: string) => {
    const c = companies.find((co) => co.companyId === companyId);
    const companyLabel = c
      ? c.companyRole
        ? `${c.name} — ${c.companyRole}`
        : c.name
      : companyId;

    const pids = svcProjByCompany[companyId] || [];
    if (pids.length === 0) return;

    const projectLabels = pids.map((pid) => {
      const p = projects.find((pr) => pr.projectId === pid);
      return p ? (p.code ? `${p.code} — ${p.title}` : p.title) : pid;
    });

    window.alert(
      "This user is linked to a Service Partner company." +
        `\n\n• ${companyLabel}` +
        `\n\nAssigned on project(s) with this company:\n• ${projectLabels.join(
          "\n• "
        )}` +
        "\n\nPlease remove those assignments first, then change this setting."
    );
    return false;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-yellow-50 dark:from-neutral-900 dark:to-neutral-950 px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        {/* Header (Create-like) */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
              Edit User
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-300 inline-flex items-center gap-2">
              <span>
                Update the details below and save changes.
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
              onClick={() => nav("/admin/users")}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
              onClick={submit}
              disabled={!canSave || saving}
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
          <div className="text-sm text-gray-700 dark:text-gray-300">
            Loading…
          </div>
        ) : (
          <>
            {/* ========== Identity Block ========== */}
            <Section title="Identity">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Text
                  label="First Name"
                  value={firstName}
                  setValue={setFirstName}
                  required
                />
                <Text
                  label="Middle Name"
                  value={middleName}
                  setValue={setMiddleName}
                />
                <Text
                  label="Last Name"
                  value={lastName}
                  setValue={setLastName}
                />
                <Text
                  label="Email (optional)"
                  type="email"
                  value={email}
                  setValue={setEmail}
                />

                <div className="grid grid-cols-[5rem,1fr] gap-2 md:col-span-2 lg:col-span-1">
                  <Text label="Code" value="+91" setValue={() => {}} disabled />
                  <Text
                    label="Mobile (India)"
                    value={phone}
                    setValue={(v) =>
                      setPhone(v.replace(/[^\d]/g, "").slice(0, 10))
                    }
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

                {/* Profile Photo: preview + change (Create-like styling) */}
                <div className="md:col-span-2">
                  <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Profile Photo
                  </span>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="h-16 w-16 rounded-full overflow-hidden border border-slate-200 bg-slate-100 dark:border-neutral-700 dark:bg-neutral-800">
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
                        <div className="grid h-full w-full place-items-center text-[10px] text-slate-500">
                          No photo
                        </div>
                      )}
                    </div>

                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) =>
                        setProfileFile(e.target.files?.[0] || null)
                      }
                      className="block w-full text-xs text-slate-700 file:mr-3 file:rounded-full file:border file:border-slate-200 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-50 dark:file:border-neutral-700 dark:file:bg-neutral-900 dark:file:text-neutral-100"
                    />

                    {profileFile && (
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        {profileFile.name} (
                        {Math.round(profileFile.size / 1024)} KB)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 text-xs text-gray-600 dark:text-gray-400">
                Name preview:{" "}
                <b className="text-slate-900 dark:text-white">
                  {namePreview || "(empty)"}
                </b>
              </div>
            </Section>

            {/* ========== Location Block ========== */}
            <Section title="Location">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Select
                  label="State / UT"
                  value={stateId}
                  setValue={(v) => {
                    setStateId(v);
                    setDistrictId("");
                  }}
                  options={[
                    "",
                    ...states.map((s) => ({
                      value: s.stateId,
                      label: `${s.name} (${s.code})`,
                    })),
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
                <Select
                  label="Operating Zone"
                  value={operatingZone}
                  setValue={setOperatingZone}
                  options={["", ...zones]}
                />
                <TextArea
                  label="Address"
                  value={address}
                  setValue={setAddress}
                />
              </div>
            </Section>

            {/* ========== Affiliations Block ========== */}
            <Section title="Affiliations">
              <div className="space-y-6">
                {/* Client */}
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Are you Client for any Project?
                    </span>
                    <ToggleYN value={isClient} setValue={onToggleClient} />
                  </div>
                  {/* Project selection intentionally hidden (same as your edit intent) */}
                </div>

                {/* Service Partner Companies */}
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Are you working for any of our Service Partner?
                    </span>
                    <ToggleYN
                      value={isServiceProvider}
                      setValue={onToggleServiceProvider}
                    />
                  </div>

                  {isServiceProvider ? (
                    <div className="mt-3 space-y-3">
                      <div className="max-w-xs">
                        <Select
                          label="Filter by Role"
                          value={companyRoleFilter}
                          setValue={setCompanyRoleFilter}
                          options={[
                            "",
                            { value: "IH_PMT", label: "IH-PMT" },
                            { value: "Contractor", label: "Contractor" },
                            { value: "Consultant", label: "Consultant" },
                            { value: "PMC", label: "PMC" },
                            { value: "Supplier", label: "Supplier" },
                          ]}
                        />
                      </div>

                      <CheckboxGroup
                        label={
                          companyRoleFilter
                            ? `Select Company(ies) — ${
                                companyRoleFilter === "IH_PMT"
                                  ? "IH-PMT"
                                  : companyRoleFilter
                              }`
                            : "Select Company(ies)"
                        }
                        items={filteredCompanies.map((c) => ({
                          value: c.companyId,
                          label: c.companyRole ? `${c.name}` : c.name,
                        }))}
                        selected={selectedCompanyIds}
                        setSelected={setSelectedCompanyIds}
                        onBeforeUncheck={onBeforeUncheckCompany}
                      />

                      {filteredCompanies.length === 0 && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          No companies match the selected role.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Not a service provider.
                    </div>
                  )}
                </div>
              </div>
            </Section>

            {/* Footer actions (Create-like) */}
            <div className="mt-6 flex justify-end gap-2">
              <button
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
                onClick={() => nav("/admin/users")}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                onClick={submit}
                disabled={!canSave || saving}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* NOTE MODAL (Edit version) */}
      {showNote && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="note-modal-title"
        >
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-neutral-800">
              <h2
                id="note-modal-title"
                className="text-base font-semibold text-slate-900 dark:text-white"
              >
                Note for Admins — Editing a User
              </h2>
              <button
                onClick={() => setShowNote(false)}
                className="rounded px-2 py-1 text-sm hover:bg-gray-100 dark:hover:bg-neutral-800"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 px-5 py-4 text-sm leading-6 text-gray-800 dark:text-gray-100">
              <p>
                <b>Required to save:</b> First Name and a 10-digit Indian mobile
                number.
              </p>

              <p>
                <b>Service Partner rule:</b> If <b>Service Partner = Yes</b>, at
                least one company must remain selected.
              </p>

              <p>
                <b>Guardrails you added:</b> If the user is already mapped to
                projects via a Service Partner company, removing that company is
                blocked until those assignments are removed.
              </p>

              <p>
                <b>Location & photo</b> are optional. Photo updates won’t block
                saving if the main profile patch succeeds.
              </p>

              <p>
                <b>After a successful save:</b> you’ll be taken back to the
                Users page.
              </p>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-neutral-800">
              <button
                onClick={() => setShowNote(false)}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
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

/* ------------------------ Create-like UI helpers ------------------------ */

function Section({ title, children }: { title: string; children: ReactNode }) {
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

function CheckboxGroup({
  label,
  items,
  selected,
  setSelected,
  onBeforeUncheck,
}: {
  label: string;
  items: { value: string; label: string }[];
  selected: string[];
  setSelected: (vals: string[]) => void;
  onBeforeUncheck?: (value: string) => boolean | void;
}) {
  const toggle = (val: string) => {
    const isChecked = selected.includes(val);
    if (isChecked) {
      if (onBeforeUncheck && onBeforeUncheck(val) === false) return;
      setSelected(selected.filter((v) => v !== val));
    } else {
      setSelected([...selected, val]);
    }
  };

  return (
    <fieldset className="rounded-2xl border border-slate-200 bg-white/95 p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
        {label}
      </legend>
      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
        {items.map((it) => (
          <label
            key={it.value}
            className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-100"
          >
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              checked={selected.includes(it.value)}
              onChange={() => toggle(it.value)}
            />
            <span>{it.label}</span>
          </label>
        ))}
      </div>
      {items.length === 0 && (
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          No options available.
        </div>
      )}
    </fieldset>
  );
}

function ToggleYN({
  value,
  setValue,
}: {
  value: boolean;
  setValue: (v: boolean) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-full border border-slate-200 bg-white text-xs shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <button
        type="button"
        onClick={() => setValue(true)}
        className={
          "px-4 py-1.5 text-xs font-medium transition-colors " +
          (value
            ? "bg-emerald-600 text-white"
            : "bg-transparent text-slate-700 dark:text-neutral-100")
        }
      >
        Yes
      </button>
      <button
        type="button"
        onClick={() => setValue(false)}
        className={
          "px-4 py-1.5 text-xs font-medium transition-colors " +
          (!value
            ? "bg-emerald-600 text-white"
            : "bg-transparent text-slate-700 dark:text-neutral-100")
        }
      >
        No
      </button>
    </div>
  );
}
