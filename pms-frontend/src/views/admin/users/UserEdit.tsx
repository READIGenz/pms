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
  companyRole?: "IH_PMT" | "Contractor" | "Consultant" | "PMC" | "Supplier" | null;
};

/** Enums from prisma schema */
const preferredLanguages = ["en", "hi", "bn", "ta", "te", "mr", "pa", "or", "gu", "kn", "ml"] as const;
const zones = ["NCR", "North", "South", "East", "West", "Central"] as const;
const statuses = ["Active", "Inactive"] as const;

/** Photo helper */
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
  const [countryCode, setCountryCode] = useState("91"); // digits only
  const [phone, setPhone] = useState(""); // digits only
  const [email, setEmail] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState<string>("");
  const [userStatus, setUserStatus] = useState<string>("Active");
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null); // server path

  // ---------- Location ----------
  const [stateId, setStateId] = useState<string>("");
  const [districtId, setDistrictId] = useState<string>("");
  const [cityTown, setCityTown] = useState("");
  const [pin, setPin] = useState("");
  const [operatingZone, setOperatingZone] = useState<string>("");
  const [address, setAddress] = useState("");

  // ---------- Affiliations ----------
  const [isClient, setIsClient] = useState<boolean>(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]); // UI hidden, but guards need it
  const [isServiceProvider, setIsServiceProvider] = useState<boolean>(false);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);

  // ---------- Reference data ----------
  const [states, setStates] = useState<StateOpt[]>([]);
  const [districts, setDistricts] = useState<DistrictOpt[]>([]);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [companies, setCompanies] = useState<CompanyOpt[]>([]);
  const [refsErr, setRefsErr] = useState<string | null>(null);
  const [companyRoleFilter, setCompanyRoleFilter] = useState<string>("");

  // Map of service-provider companyId -> list of projectIds where user is assigned via that company
  const [svcProjByCompany, setSvcProjByCompany] = useState<Record<string, string[]>>({});

  const filteredCompanies = useMemo(() => {
    const normalize = (s: string) => s.replace(/[_\s]/g, "-").toLowerCase();
    const filter = companyRoleFilter === "IH_PMT" ? "IH-PMT" : companyRoleFilter;
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

  /* ========================= page title (UI only) ========================= */
  useEffect(() => {
    document.title = "Trinity PMS — Edit User";
    (window as any).__ADMIN_SUBTITLE__ = "Update user details, then save.";
    return () => {
      (window as any).__ADMIN_SUBTITLE__ = "";
    };
  }, []);

  /* ---- Auth gate simple check ---- */
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) nav("/login", { replace: true });
  }, [nav]);

  /* ---- Load reference data ---- */
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
          : (results[0] as any)?.reason?.response?.data?.error || "Failed to load states."
      );
    }

    // projects
    if (results[1].status === "fulfilled") {
      const p: any = results[1].value.data;
      setProjects(Array.isArray(p) ? p : p?.projects || []);
    } else {
      if (!refsErr) {
        setRefsErr(
          (results[1] as any)?.reason?.response?.data?.error || "Failed to load projects."
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
          (results[2] as any)?.reason?.response?.data?.error || "Failed to load companies."
        );
      }
    }
  };

  useEffect(() => {
    loadRefs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- Load user ---- */
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
        setCountryCode(String(u.countryCode || "91").replace(/\D/g, "") || "91");
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

        // Affiliations
        setIsClient(!!u.isClient);
        setIsServiceProvider(!!u.isServiceProvider);

        const memberships: any[] = Array.isArray(u.userRoleMemberships) ? u.userRoleMemberships : [];

        const clientPids = memberships
          .filter((m) => m.scopeType === "Project" && m.role === "Client" && m.projectId)
          .map((m) => m.projectId);
        setSelectedProjectIds(clientPids);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!id || projects.length === 0) return;
    buildSvcAssignmentsMap(id, projects);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, projects]);

  /* ---- Districts by state ---- */
  useEffect(() => {
    if (!stateId) {
      setDistricts([]);
      setDistrictId("");
      return;
    }
    (async () => {
      try {
        const { data } = await api.get("/admin/districts", { params: { stateId } });
        const list = Array.isArray(data) ? data : data?.districts || [];
        setDistricts(list);
        if (list.length && districtId) {
          const found = list.some((d: { districtId: string }) => d.districtId === districtId);
          if (!found) setDistrictId("");
        }
      } catch (e: any) {
        setDistricts([]);
        setRefsErr(e?.response?.data?.error || "Failed to load districts.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateId]);

  const phoneClean = phone.replace(/\D/g, "").slice(0, 10);
  const pinClean = pin.replace(/\D/g, "").slice(0, 6);
  const canSave = firstName.trim().length > 0 && phoneClean.length === 10;

  async function buildSvcAssignmentsMap(userId: string, projList: ProjectOpt[]) {
    const map: Record<string, string[]> = {};
    for (const p of projList) {
      try {
        const { data } = await api.get(`/admin/projects/${p.projectId}/assignments`);
        const rows: any[] = Array.isArray(data) ? data : data?.assignments || [];
        rows
          .filter((r) => String(r.userId) === String(userId))
          .forEach((r) => {
            const cid =
              r.companyId ||
              r.company?.companyId ||
              (Array.isArray(r.companies) ? r.companies[0]?.companyId : undefined);
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
      setErr("First Name and a valid 10-digit Mobile (India) are required.");
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
        countryCode: String(countryCode || "91").replace(/\D/g, "") || "91",
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
        if (up?.user?.profilePhoto) setProfilePhoto(up.user.profilePhoto);
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
        ? `\n\nLinked to Service Partner companies:\n• ${serviceCompanyLabels.join("\n• ")}`
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
    const companyLabel = c ? (c.companyRole ? `${c.name} — ${c.companyRole}` : c.name) : companyId;

    const pids = svcProjByCompany[companyId] || [];
    if (pids.length === 0) return;

    const projectLabels = pids.map((pid) => {
      const p = projects.find((pr) => pr.projectId === pid);
      return p ? (p.code ? `${p.code} — ${p.title}` : p.title) : pid;
    });

    window.alert(
      "This user is linked to a Service Partner company." +
        `\n\n• ${companyLabel}` +
        `\n\nAssigned on project(s) with this company:\n• ${projectLabels.join("\n• ")}` +
        "\n\nPlease remove those assignments first, then change this setting."
    );
    return false;
  };

  /* ========================= CompanyEdit button tokens ========================= */
  const btnSmBase =
    "h-8 px-3 rounded-full text-[11px] font-semibold shadow-sm hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-neutral-950 disabled:opacity-60 disabled:cursor-not-allowed";
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
        {/* Top helper row (EXACT pattern as CompanyEdit) */}
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-slate-700 dark:text-slate-200">
            Edit and save user information.
            <button className={infoBtn} onClick={() => setShowNote(true)} type="button">
              i
            </button>
          </div>

          <div className="flex gap-2">
            <button className={btnOutline} onClick={() => nav("/admin/users")} type="button">
              Cancel
            </button>
            <button className={btnPrimary} onClick={submit} disabled={!canSave || saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {refsErr && <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">{refsErr}</div>}

        {err && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200">
            {err}
          </div>
        )}

        {loading ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 dark:border-white/10 dark:bg-neutral-950 dark:text-slate-200">
            Loading…
          </div>
        ) : (
          <div className="mt-4">
            {/* ============ Identity ============ */}
            <Section title="Identity">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="First Name"
                  value={firstName}
                  onChange={(v) => setFirstName(v)}
                  placeholder="First name"
                  required
                />
                <Input
                  label="Middle Name"
                  value={middleName}
                  onChange={(v) => setMiddleName(v)}
                  placeholder="Middle name"
                />
                <Input
                  label="Last Name"
                  value={lastName}
                  onChange={(v) => setLastName(v)}
                  placeholder="Last name"
                />
                <Input
                  label="Email (optional)"
                  value={email}
                  onChange={(v) => setEmail(v)}
                  placeholder="name@company.com"
                  type="email"
                />

                {/* Code + Mobile (same sizes/shapes as CompanyEdit inputs) */}
                <div className="sm:col-span-1 flex gap-4">
                  <div className="w-28">
                    <Input label="Code" value={`+${countryCode}`} onChange={() => {}} disabled />
                  </div>
                  <div className="flex-1">
                    <Input
                      label="Mobile (India)"
                      value={phone}
                      onChange={(v) => setPhone(v.replace(/\D+/g, "").slice(0, 10))}
                      placeholder="10-digit mobile"
                      required
                    />
                  </div>
                </div>

                <SelectStrict
                  label="Preferred Language"
                  value={preferredLanguage}
                  onChange={(v) => setPreferredLanguage(v)}
                  options={preferredLanguages.map((x) => ({ value: x, label: x }))}
                  placeholder="—"
                />

                <SelectStrict
                  label="Status"
                  value={userStatus}
                  onChange={(v) => setUserStatus(v)}
                  options={statuses.map((x) => ({ value: x, label: x }))}
                  placeholder="Select status"
                />

                {/* Profile photo (styled to match CompanyEdit theme) */}
                <div className="sm:col-span-2">
                  <div className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Profile Photo
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="h-16 w-16 overflow-hidden rounded-full border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-neutral-900">
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
                        <div className="grid h-full w-full place-items-center text-[10px] text-slate-500 dark:text-slate-400">
                          No photo
                        </div>
                      )}
                    </div>

                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => setProfileFile(e.target.files?.[0] || null)}
                      className="block w-fit shrink-0 text-xs text-slate-700
                        file:h-8 file:rounded-full file:border file:border-slate-200 file:bg-white file:px-3
                        file:text-[11px] file:font-semibold file:text-slate-700 file:shadow-sm hover:file:bg-slate-50
                        dark:text-slate-200 dark:file:border-white/10 dark:file:bg-neutral-950 dark:file:text-slate-200 dark:hover:file:bg-white/5"
                    />

                    {profileFile && (
                      <div className="text-xs text-slate-600 dark:text-slate-400">
                        {profileFile.name} ({Math.round(profileFile.size / 1024)} KB)
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Section>

            {/* ============ Location ============ */}
            <Section title="Location">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SelectStrict
                  label="State / UT"
                  value={stateId}
                  onChange={(v) => {
                    setStateId(v);
                    setDistrictId("");
                  }}
                  options={states.map((s) => ({
                    value: s.stateId,
                    label: `${s.name} (${s.code})`,
                  }))}
                  placeholder="Select state"
                />

                <SelectStrict
                  label="District"
                  value={districtId}
                  onChange={(v) => setDistrictId(v)}
                  options={districts.map((d) => ({ value: d.districtId, label: d.name }))}
                  placeholder={stateId ? "Select district" : "Select state first"}
                  disabled={!stateId}
                />

                <Input
                  label="City/Town"
                  value={cityTown}
                  onChange={(v) => setCityTown(v)}
                  placeholder="City/Town"
                />

                <Input
                  label="PIN Code"
                  value={pin}
                  onChange={(v) => setPin(v.replace(/\D+/g, "").slice(0, 6))}
                  placeholder="6-digit PIN"
                />

                <SelectStrict
                  label="Operating Zone"
                  value={operatingZone}
                  onChange={(v) => setOperatingZone(v)}
                  options={zones.map((z) => ({ value: z, label: z }))}
                  placeholder="—"
                />

                <div className="sm:col-span-2">
                  <TextArea
                    label="Address"
                    value={address}
                    onChange={(v) => setAddress(v)}
                    placeholder="Full address…"
                    rows={4}
                  />
                </div>
              </div>
            </Section>

            {/* ============ Affiliations ============ */}
            <Section title="Affiliations">
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-slate-700 dark:text-slate-200">
                    Are you Client for any Project?
                  </div>
                  <ToggleYN value={isClient} setValue={onToggleClient} />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-slate-700 dark:text-slate-200">
                    Are you working for any of our Service Partner?
                  </div>
                  <ToggleYN value={isServiceProvider} setValue={onToggleServiceProvider} />
                </div>

                {isServiceProvider ? (
                  <div className="space-y-3 pt-1">
                    <div className="max-w-xs">
                      <SelectStrict
                        label="Filter by Role"
                        value={companyRoleFilter}
                        onChange={(v) => setCompanyRoleFilter(v)}
                        options={[
                          { value: "", label: "All roles" },
                          { value: "IH_PMT", label: "IH-PMT" },
                          { value: "Contractor", label: "Contractor" },
                          { value: "Consultant", label: "Consultant" },
                          { value: "PMC", label: "PMC" },
                          { value: "Supplier", label: "Supplier" },
                        ]}
                        placeholder="All roles"
                      />
                    </div>

                    <CheckboxGroup
                      label={
                        companyRoleFilter
                          ? `Select Company(ies) — ${companyRoleFilter === "IH_PMT" ? "IH-PMT" : companyRoleFilter}`
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
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        No companies match the selected role.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 dark:text-slate-400">Not a service provider.</div>
                )}
              </div>
            </Section>

            {/* Bottom actions (EXACT pattern as CompanyEdit) */}
            <div className="mt-6 flex justify-end gap-2">
              <button className={btnOutline} onClick={() => nav("/admin/users")} type="button">
                Cancel
              </button>
              <button className={btnPrimary} onClick={submit} disabled={!canSave || saving}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Note modal (EXACT structure as CompanyEdit) */}
      {showNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowNote(false)} />

          <div className="relative z-10 mx-4 w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-neutral-950">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-white/10">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                Note for Admins — Editing a User
              </div>
              <button className={btnOutline} onClick={() => setShowNote(false)} type="button">
                Close
              </button>
            </div>

            <div className="space-y-3 p-5 text-sm leading-6 text-slate-800 dark:text-slate-200">
              <div>
                <b>Required to save:</b> First Name and a 10-digit Indian mobile number.
              </div>

              <div>
                <b>Service Partner rule:</b> If <b>Service Partner = Yes</b>, at least one company must remain selected.
              </div>

              <div>
                <b>Guardrails:</b> If the user is already mapped to projects via a Service Partner company, removing that company is blocked until those assignments are removed.
              </div>

              <div>
                <b>Location & photo</b> are optional. Photo upload won’t block saving if the main update succeeds.
              </div>

              <div>
                <b>After a successful save:</b> you’ll be taken back to the Users page.
              </div>

              <div>
                <b>Cancel:</b> takes you back to the Users list without saving.
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

/* ========================= same UI bits as CompanyEdit ========================= */
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
  placeholder,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
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

function ToggleYN({ value, setValue }: { value: boolean; setValue: (v: boolean) => void }) {
  const base =
    "h-8 px-3 text-[11px] font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-neutral-950";
  const active = "bg-[#00379C] text-white focus:ring-[#00379C]/35";
  const idle =
    "bg-transparent text-slate-700 hover:bg-slate-50 focus:ring-[#00379C]/20 dark:text-slate-200 dark:hover:bg-white/5";

  return (
    <div className="inline-flex overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-neutral-950">
      <button type="button" className={`${base} ${value ? active : idle}`} onClick={() => setValue(true)}>
        YES
      </button>
      <button type="button" className={`${base} ${!value ? active : idle}`} onClick={() => setValue(false)}>
        NO
      </button>
    </div>
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
    <fieldset className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-neutral-950">
      <legend className="px-1 text-xs font-extrabold uppercase tracking-wide text-[#00379C] dark:text-white">
        {label}
      </legend>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((it) => {
          const checked = selected.includes(it.value);
          return (
            <label key={it.value} className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(it.value)}
                className="h-4 w-4 rounded border-slate-300 text-[#00379C] focus:ring-[#00379C]/30 dark:border-white/10"
              />
              <span>{it.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
