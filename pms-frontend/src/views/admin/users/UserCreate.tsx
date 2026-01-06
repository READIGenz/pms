// pms-frontend/src/views/admin/users/UserCreate.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../api/client";

declare global {
  interface Window {
    __ADMIN_SUBTITLE__?: string;
  }
}

/** Reference-data types */
type StateOpt = { stateId: string; name: string; code: string };
type DistrictOpt = { districtId: string; name: string; stateId: string };
type ProjectOpt = { projectId: string; title: string; code?: string | null };
type CompanyOpt = {
  companyId: string;
  name: string;
  companyRole?:
    | "IH_PMT"
    | "IH-PMT"
    | "Contractor"
    | "Consultant"
    | "PMC"
    | "Supplier"
    | null;
};

/** Enums */
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
const companyRoles = [
  "IH_PMT",
  "Contractor",
  "Consultant",
  "PMC",
  "Supplier",
] as const;

export default function UserCreate() {
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement | null>(null);

  // -------- Page title/subtitle for AdminHome header bar --------
  useEffect(() => {
    document.title = "Trinity PMS — Create User";
    window.__ADMIN_SUBTITLE__ =
      "Create a user profile, set location, affiliations, and optional admin privileges.";
    return () => {
      window.__ADMIN_SUBTITLE__ = "";
    };
  }, []);

  // -------- Auth gate --------
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) nav("/login", { replace: true });
  }, [nav]);

  // ---------- CURRENT USER (who is creating) ----------
  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  })();
  const canGrantAdmin = !!currentUser?.isSuperAdmin;

  // ---------- Identity ----------
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState(""); // digits only
  const [email, setEmail] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState<string>("");
  const [userStatus, setUserStatus] = useState<string>("Active");
  const [profileFile, setProfileFile] = useState<File | null>(null);

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

  // ---------- Admin privileges ----------
  const [makeSuperAdmin, setMakeSuperAdmin] = useState<boolean>(false);
  const [makeGlobalAdmin, setMakeGlobalAdmin] = useState<boolean>(false);

  // ---------- Reference data ----------
  const [states, setStates] = useState<StateOpt[]>([]);
  const [districts, setDistricts] = useState<DistrictOpt[]>([]);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [companies, setCompanies] = useState<CompanyOpt[]>([]);
  const [companyRoleFilter, setCompanyRoleFilter] = useState<string>("");

  // ---------- UI state ----------
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [roleWarn, setRoleWarn] = useState<string | null>(null);
  const [showNote, setShowNote] = useState(false);

  // ---- derived helpers ----
  const phoneClean = phone.replace(/\D/g, "");
  const pinClean = pin.replace(/\D/g, "");
  const canSave = firstName.trim().length > 0 && phoneClean.length >= 10;

  const namePreview = useMemo(
    () => [firstName, middleName, lastName].filter(Boolean).join(" "),
    [firstName, middleName, lastName]
  );

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

  const normalizeDigits = (v: any) => String(v ?? "").replace(/\D/g, "");
  const pickUserByPhone = (list: any[], desiredDigits: string) => {
    if (!Array.isArray(list)) return null;
    const exact = list.find((u) => normalizeDigits(u?.phone) === desiredDigits);
    if (exact) return exact;

    const exactWithCCode = list.find((u) => {
      const cc = normalizeDigits(u?.countryCode);
      const ph = normalizeDigits(u?.phone);
      return (cc === "91" || cc === "+91" || cc === "") && ph === desiredDigits;
    });
    return exactWithCCode || null;
  };

  // -------- Load reference data --------
  useEffect(() => {
    (async () => {
      try {
        const [{ data: s }, { data: p }, { data: c }] = await Promise.all([
          api.get("/admin/states"),
          api.get("/admin/projects"),
          api.get("/admin/companies-brief"),
        ]);
        setStates(Array.isArray(s) ? s : s?.states || []);
        setProjects(Array.isArray(p) ? p : p?.projects || []);
        setCompanies(Array.isArray(c) ? c : c?.companies || []);
      } catch (e: any) {
        setErr(e?.response?.data?.error || "Failed to load reference data.");
      }
    })();
  }, []);

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
        setDistricts(Array.isArray(data) ? data : data?.districts || []);
      } catch (e: any) {
        setErr(e?.response?.data?.error || "Failed to load districts.");
      }
    })();
  }, [stateId]);

  const toggleInList = (id: string, list: string[], setList: any) => {
    setList((prev: string[]) => {
      const has = prev.includes(id);
      return has ? prev.filter((x) => x !== id) : [...prev, id];
    });
  };

  const submit = async () => {
    setErr(null);
    setRoleWarn(null);

    if (!canSave) {
      setErr("First Name and a valid Mobile (India) are required.");
      return;
    }

    if (!isClient && !isServiceProvider) {
      window.alert(
        "Affiliation required.\n\n" +
          "Please mark the user as a Client and/or a Service Partner before creating."
      );
      return;
    }

    if (isServiceProvider && selectedCompanyIds.length === 0) {
      window.alert(
        "This user is not linked to any Service Partner company.\n\n" +
          "If they are NOT a service provider, please toggle “Are you working for any of our Service Partner?” to No before saving."
      );
      return;
    }

    try {
      setSaving(true);

      const createPayload: any = {
        firstName,
        middleName: middleName || undefined,
        lastName: lastName || undefined,
        email: email || undefined,
        countryCode: "91", // keep DB clean; UI shows +91
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
        ...(canGrantAdmin && makeSuperAdmin
          ? { isSuperAdmin: true as const }
          : {}),
      };

      const createRes = await api.post("/admin/users", createPayload);
      if (!createRes?.data?.ok || !createRes?.data?.user?.userId) {
        throw new Error(createRes?.data?.error || "Failed to create user");
      }
      const userId: string = createRes.data.user.userId;

      if (profileFile) {
        const fd = new FormData();
        fd.append("file", profileFile);
        try {
          await api.post(`/admin/users/${userId}/photo`, fd, {
            headers: { "Content-Type": "multipart/form-data" },
          });
        } catch (e: any) {
          console.warn("Profile photo upload failed:", e?.response?.data || e);
        }
      }

      try {
        await api.post(`/admin/users/${userId}/affiliations`, {
          isClient,
          projectIds: isClient ? selectedProjectIds : [],
          isServiceProvider,
          companyIds: isServiceProvider ? selectedCompanyIds : [],
        });
      } catch (e: any) {
        console.warn("Affiliations save failed:", e?.response?.data || e);
      }

      if (canGrantAdmin && makeGlobalAdmin) {
        try {
          await api.post(`/admin/users/${userId}/roles`, {
            role: "Admin",
            scopeType: "Global",
            isDefault: true,
            canApprove: true,
          });
        } catch (e: any) {
          setRoleWarn(
            e?.response?.data?.error ||
              "User created, but failed to grant Global Admin role."
          );
        }
      }

      nav("/admin/users", { replace: true });
    } catch (e: any) {
      const httpStatus = e?.response?.status;
      const serverMsg = e?.response?.data?.error || e?.message || "";

      const looksLikeDuplicate =
        httpStatus === 500 ||
        httpStatus === 409 ||
        /duplicate|exists/i.test(serverMsg);

      if (looksLikeDuplicate) {
        try {
          const targetDigits = phoneClean;
          let u: any | null = null;

          try {
            const res = await api.get("/admin/users", {
              params: { phone: targetDigits },
            });
            const list = Array.isArray(res?.data)
              ? res.data
              : res?.data?.users || [];
            u = pickUserByPhone(list, targetDigits);
          } catch {}

          if (!u) {
            try {
              const res = await api.get("/admin/users/lookup", {
                params: { phone: targetDigits },
              });
              const candidate = res?.data?.user;
              if (
                candidate &&
                normalizeDigits(candidate.phone) === targetDigits
              )
                u = candidate;
            } catch {}
          }

          if (!u) {
            try {
              const res = await api.get("/admin/users", {
                params: { search: targetDigits },
              });
              const list = Array.isArray(res?.data)
                ? res.data
                : res?.data?.users || [];
              u = pickUserByPhone(list, targetDigits);
            } catch {}
          }

          if (u?.userId) {
            const fullName = [u.firstName, u.middleName, u.lastName]
              .filter(Boolean)
              .join(" ");
            const codeLine = u.userCode ? `Code: ${u.userCode}\n` : "";
            const phoneLine = `Phone: +91 ${
              normalizeDigits(u.phone) || targetDigits
            }`;

            const proceedToEdit = window.confirm(
              "A user with this mobile number already exists.\n\n" +
                `${codeLine}Name: ${
                  fullName || "(no name)"
                }\n${phoneLine}\n\n` +
                "Press OK to open that user's Edit page.\n" +
                "Press Cancel to stay here — the save will be canceled."
            );

            if (proceedToEdit)
              nav(`/admin/users/${u.userId}/edit`, { replace: true });
            return;
          }

          const openList = window.confirm(
            "A user with this mobile number already exists, but we couldn't fetch an exact match automatically.\n\n" +
              `Phone: +91 ${targetDigits}\n\n` +
              "Press OK to open the Users list, or Cancel to stay here (save canceled)."
          );
          if (openList) nav("/admin/users");
          return;
        } finally {
          setSaving(false);
        }
      }

      setErr(serverMsg || "Failed to create user");
    } finally {
      setSaving(false);
    }
  };

  /* ========================= UI tokens (CompanyEdit exact style) ========================= */
  const btnBase =
    "h-8 px-3 rounded-full text-[11px] font-semibold shadow-sm " +
    "focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-neutral-950 " +
    "disabled:opacity-60 disabled:pointer-events-none";
  const btnLight =
    "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 " +
    "dark:border-white/10 dark:bg-neutral-950 dark:text-slate-200 dark:hover:bg-white/5";
  const btnPrimary =
    "bg-[#00379C] text-white hover:brightness-110 focus:ring-[#00379C]/35 border border-transparent";
  const btnGold =
    "bg-[#FCC020] text-slate-900 hover:brightness-105 focus:ring-[#FCC020]/40 border border-transparent";

  return (
    <div className="w-full">
      <div className="mx-auto max-w-5xl">
        {/* Top helper row (exact pattern like CompanyEdit) */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
              First Name and Mobile number are mandatory fields.
              <button
                type="button"
                onClick={() => setShowNote(true)}
                title="Info"
                className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-[11px] font-extrabold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-neutral-950 dark:text-slate-200 dark:hover:bg-white/5"
              >
                i
              </button>
            </div>
            {namePreview ? (
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Preview:{" "}
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {namePreview}
                </span>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              className={`${btnBase} ${btnLight}`}
              onClick={() => nav("/admin/users")}
              title="Back to list"
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${btnBase} ${btnPrimary}`}
              onClick={submit}
              disabled={!canSave || saving}
              title="Create user"
            >
              {saving ? "Saving…" : "Create"}
            </button>
          </div>
        </div>

        {/* Alerts */}
        {err ? (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-800/40 dark:bg-rose-950/30 dark:text-rose-200">
            {err}
          </div>
        ) : null}

        {roleWarn ? (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/25 dark:text-amber-200">
            {roleWarn}
          </div>
        ) : null}

        {/* Sections (exact CompanyEdit style) */}
        <Section title="Identity">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="First Name"
              required
              value={firstName}
              onChange={setFirstName}
            />
            <Input
              label="Middle Name"
              value={middleName}
              onChange={setMiddleName}
            />

            <Input label="Last Name" value={lastName} onChange={setLastName} />
            <Input
              label="Email (Optional)"
              value={email}
              onChange={setEmail}
              placeholder="name@company.com"
              type="email"
            />

            <Input label="Code" value="+91" onChange={() => {}} disabled />
            <Input
              label="Mobile (India)"
              required
              value={phone}
              onChange={(v) => setPhone(v.replace(/\D/g, "").slice(0, 10))}
              placeholder="10 digit mobile"
              type="tel"
            />

            <SelectStrict
              label="Preferred Language"
              value={preferredLanguage}
              onChange={setPreferredLanguage}
              placeholder="Select (optional)"
              options={preferredLanguages.map((x) => ({ value: x, label: x }))}
            />

            <SelectStrict
              label="Status"
              value={userStatus}
              onChange={setUserStatus}
              options={statuses.map((x) => ({ value: x, label: x }))}
            />

            <div className="md:col-span-2">
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
                  ) : (
                    <div className="grid h-full w-full place-items-center text-[10px] text-slate-500 dark:text-slate-400">
                      No photo
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) =>
                      setProfileFile(e.target.files?.[0] || null)
                    }
                    className="block w-fit shrink-0 text-xs text-slate-700
          file:h-8 file:rounded-full file:border file:border-slate-200 file:bg-white file:px-3
          file:text-[11px] file:font-semibold file:text-slate-700 file:shadow-sm hover:file:bg-slate-50
          dark:text-slate-200 dark:file:border-white/10 dark:file:bg-neutral-950 dark:file:text-slate-200 dark:hover:file:bg-white/5"
                  />

                  {profileFile && (
                    <div className="text-xs text-slate-600 dark:text-slate-400">
                      {profileFile.name} ({Math.round(profileFile.size / 1024)}{" "}
                      KB)
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Location">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SelectStrict
              label="State / UT"
              value={stateId}
              onChange={(v) => {
                setStateId(v);
                setDistrictId("");
              }}
              placeholder="Select (optional)"
              options={states.map((s) => ({ value: s.stateId, label: s.name }))}
            />

            <SelectStrict
              label="District"
              value={districtId}
              onChange={setDistrictId}
              placeholder="Select (optional)"
              options={districts.map((d) => ({
                value: d.districtId,
                label: d.name,
              }))}
              disabled={!stateId}
            />

            <Input label="City/Town" value={cityTown} onChange={setCityTown} />

            <Input
              label="PIN Code"
              value={pin}
              onChange={(v) => setPin(v.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit PIN"
            />

            <SelectStrict
              label="Operating Zone"
              value={operatingZone}
              onChange={setOperatingZone}
              placeholder="Select (optional)"
              options={zones.map((z) => ({ value: z, label: z }))}
            />

            <div className="md:col-span-2">
              <TextArea
                label="Address"
                value={address}
                onChange={setAddress}
                placeholder="Optional"
                rows={3}
              />
            </div>
          </div>
        </Section>

        <Section title="Affiliations">
          <div className="space-y-6">
            {/* Client */}
            <div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-slate-700 dark:text-slate-200">
                  Are you Client for any Project?
                </div>
                <ToggleYN
                  value={isClient}
                  onChange={(v) => {
                    setIsClient(v);
                    if (!v) setSelectedProjectIds([]);
                  }}
                />
              </div>

              {isClient ? (
                <div className="mt-3">
                  <div className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                    Select project(s) (optional).
                  </div>

                  <ListBox>
                    {projects.length === 0 ? (
                      <div className="p-3 text-sm text-slate-600 dark:text-slate-300">
                        No projects found.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-200 dark:divide-white/10">
                        {projects.map((p) => {
                          const checked = selectedProjectIds.includes(
                            p.projectId
                          );
                          return (
                            <label
                              key={p.projectId}
                              className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-[#00379C]/[0.03] dark:hover:bg-white/[0.03]"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  toggleInList(
                                    p.projectId,
                                    selectedProjectIds,
                                    setSelectedProjectIds
                                  )
                                }
                              />
                              <span className="text-slate-900 dark:text-white">
                                {p.title}
                              </span>
                              {p.code ? (
                                <span className="ml-auto text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                  {p.code}
                                </span>
                              ) : null}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </ListBox>
                </div>
              ) : (
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Not a client.
                </div>
              )}
            </div>

            {/* Service Partner */}
            <div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-slate-700 dark:text-slate-200">
                  Are you working for any of our Service Partner?
                </div>
                <ToggleYN
                  value={isServiceProvider}
                  onChange={(v) => {
                    setIsServiceProvider(v);
                    if (!v) setSelectedCompanyIds([]);
                  }}
                />
              </div>

              {isServiceProvider ? (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <SelectStrict
                      label="Filter by Role"
                      value={companyRoleFilter}
                      onChange={setCompanyRoleFilter}
                      placeholder="All roles"
                      options={companyRoles.map((r) => ({
                        value: r,
                        label: r === "IH_PMT" ? "IH-PMT" : r,
                      }))}
                    />
                    <div className="flex items-end">
                      <button
                        type="button"
                        className={`${btnBase} ${btnLight}`}
                        onClick={() => setCompanyRoleFilter("")}
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <ListBox>
                    {filteredCompanies.length === 0 ? (
                      <div className="p-3 text-sm text-slate-600 dark:text-slate-300">
                        No companies found.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-200 dark:divide-white/10">
                        {filteredCompanies.map((c) => {
                          const checked = selectedCompanyIds.includes(
                            c.companyId
                          );
                          return (
                            <label
                              key={c.companyId}
                              className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-[#00379C]/[0.03] dark:hover:bg-white/[0.03]"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  toggleInList(
                                    c.companyId,
                                    selectedCompanyIds,
                                    setSelectedCompanyIds
                                  )
                                }
                              />
                              <span className="text-slate-900 dark:text-white">
                                {c.name}
                              </span>
                              {c.companyRole ? (
                                <span className="ml-auto text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                  {String(c.companyRole).replace(
                                    "IH_PMT",
                                    "IH-PMT"
                                  )}
                                </span>
                              ) : null}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </ListBox>

                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Tip: If Service Partner is YES, select at least 1 company.
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Not a service provider.
                </div>
              )}
            </div>
          </div>
        </Section>

        {canGrantAdmin ? (
          <Section title="Admin Privileges">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      Make Super Admin
                    </div>
                    <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      Grants SuperAdmin flag to this user.
                    </div>
                    <div className="mt-2 h-1 w-10 rounded-full bg-[#FCC020]" />
                  </div>
                  <ToggleYN
                    value={makeSuperAdmin}
                    onChange={setMakeSuperAdmin}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      Make Global Admin
                    </div>
                    <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      Adds a Global Admin role membership after creation.
                    </div>
                    <div className="mt-2 h-1 w-10 rounded-full bg-[#FCC020]" />
                  </div>
                  <ToggleYN
                    value={makeGlobalAdmin}
                    onChange={setMakeGlobalAdmin}
                  />
                </div>
              </div>
            </div>
          </Section>
        ) : null}

        {/* Footer actions (exact CompanyEdit pattern) */}
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-white/10">
          <button
            type="button"
            className={`${btnBase} ${btnLight}`}
            onClick={() => nav("/admin/users")}
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

      {/* Note modal */}
      {showNote ? (
        <Modal
          title="Notes"
          onClose={() => setShowNote(false)}
          btnBase={btnBase}
          btnLight={btnLight}
          btnGold={btnGold}
        >
          <div className="space-y-3 text-sm leading-6 text-slate-800 dark:text-slate-200">
            <div>
              <b>Required to create:</b> First Name and a 10-digit Indian mobile
              number.
            </div>
            <div>
              <b>Affiliation rule:</b> User must be marked as <b>Client</b>{" "}
              and/or <b>Service Partner</b>.
            </div>
            <div>
              <b>Service Partner rule:</b> If <b>Service Partner = Yes</b>, at
              least one company must be selected.
            </div>
            <div>
              <b>Profile photo</b> is optional (uploads after user creation).
            </div>
            {canGrantAdmin ? (
              <div>
                <b>SuperAdmin only:</b> can grant SuperAdmin flag and/or Global
                Admin role.
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

/* ========================= small UI bits (CompanyEdit exact style) ========================= */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
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
        {required ? " *" : ""}
      </span>
      <input
        className="w-full h-10 rounded-full border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm
          focus:outline-none focus:border-transparent focus:ring-2 focus:ring-[#00379C]/30 disabled:opacity-60
          dark:border-white/10 dark:bg-neutral-950 dark:text-white"
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

function ToggleYN({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const base =
    "h-8 px-4 rounded-full text-[11px] font-semibold transition " +
    "focus:outline-none focus:ring-2 focus:ring-[#00379C]/25";

  const active = "bg-[#00379C] text-white";
  const idle =
    "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5";

  return (
    <div className="inline-flex rounded-full border border-slate-200 bg-white p-[2px] shadow-sm dark:border-white/10 dark:bg-neutral-950">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`${base} ${value ? active : idle}`}
      >
        YES
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`${base} ${!value ? active : idle}`}
      >
        NO
      </button>
    </div>
  );
}

function ListBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-h-64 overflow-auto rounded-2xl border border-slate-200 dark:border-white/10">
      {children}
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
  btnBase,
  btnLight,
  btnGold,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  btnBase: string;
  btnLight: string;
  btnGold: string;
}) {
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-neutral-950 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-white/10">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {title}
              </h2>
              <div className="mt-1 h-1 w-10 rounded-full bg-[#FCC020]" />
            </div>
            <button
              className={`${btnBase} ${btnLight}`}
              onClick={onClose}
              type="button"
              aria-label="Close"
            >
              Close
            </button>
          </div>

          <div className="p-5">{children}</div>

          <div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-white/10">
            <button
              className={`${btnBase} ${btnGold}`}
              onClick={onClose}
              type="button"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
