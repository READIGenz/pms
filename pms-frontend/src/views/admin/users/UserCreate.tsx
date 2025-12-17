// pms-frontend/src/views/admin/users/UserCreate.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  | "IH-PMT"
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
  const [phone, setPhone] = useState(""); // India mobile (digits only)
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

  // ---------- Admin Privileges (visible to Super Admin only) ----------
  const [makeSuperAdmin, setMakeSuperAdmin] = useState<boolean>(false);
  const [makeGlobalAdmin, setMakeGlobalAdmin] = useState<boolean>(false);

  // ---------- Reference data ----------
  const [states, setStates] = useState<StateOpt[]>([]);
  const [districts, setDistricts] = useState<DistrictOpt[]>([]);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [companies, setCompanies] = useState<CompanyOpt[]>([]);
  const [companyRoleFilter, setCompanyRoleFilter] = useState<string>("");
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

  // ---------- UI ----------
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showNote, setShowNote] = useState(false);

  // --- Auth gate simple check ---
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) nav("/login", { replace: true });
  }, [nav]);

  // --- Load reference data ---
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

  const namePreview = useMemo(
    () => [firstName, middleName, lastName].filter(Boolean).join(" "),
    [firstName, middleName, lastName]
  );

  const phoneClean = phone.replace(/\D/g, "");
  const pinClean = pin.replace(/\D/g, "");

  const canSave = firstName.trim().length > 0 && phoneClean.length >= 10;

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

  const submit = async () => {
    setErr(null);
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

      const createPayload = {
        firstName,
        middleName: middleName || undefined,
        lastName: lastName || undefined,
        email: email || undefined,
        countryCode: "+91",
        phone: phoneClean,
        preferredLanguage: preferredLanguage || undefined,
        userStatus: userStatus || "Active",
        profilePhoto: undefined as string | undefined,
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
          } catch { }

          if (!u) {
            try {
              const res = await api.get("/admin/users/lookup", {
                params: { phone: targetDigits },
              });
              const candidate = res?.data?.user;
              if (
                candidate &&
                normalizeDigits(candidate.phone) === targetDigits
              ) {
                u = candidate;
              }
            } catch { }
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
            } catch { }
          }

          if (u?.userId) {
            const fullName = [u.firstName, u.middleName, u.lastName]
              .filter(Boolean)
              .join(" ");
            const codeLine = u.userCode ? `Code: ${u.userCode}\n` : "";
            const phoneLine = `Phone: +91 ${normalizeDigits(u.phone) || targetDigits
              }`;

            const proceedToEdit = window.confirm(
              "A user with this mobile number already exists.\n\n" +
              `${codeLine}Name: ${fullName || "(no name)"
              }\n${phoneLine}\n\n` +
              "Press OK to open that user's Edit page.\n" +
              "Press Cancel to stay here — the save will be canceled."
            );

            if (proceedToEdit) {
              nav(`/admin/users/${u.userId}/edit`, { replace: true });
            }
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
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-yellow-50 dark:from-neutral-900 dark:to-neutral-950 px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
              Create User
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-300 inline-flex items-center gap-2">
              <span>
                Fill the details below and save. First Name and Mobile number are mandatory fields.
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
              {saving ? "Saving…" : "Create"}
            </button>
          </div>
        </div>

        {err && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {err}
          </div>
        )}

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
            <Text label="Last Name" value={lastName} setValue={setLastName} />
            <Text
              label="Email (optional)"
              type="email"
              value={email}
              setValue={setEmail}
            />

            <div className="grid grid-cols-[5rem,1fr] gap-2 md:col-span-2 lg:col-span-1">
              <Text label="Code" value="+91" setValue={() => { }} disabled />
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

            {/* Profile Photo Upload */}
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
                  onChange={(e) => setProfileFile(e.target.files?.[0] || null)}
                  className="block w-full text-xs text-slate-700 file:mr-3 file:rounded-full file:border file:border-slate-200 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-50 dark:file:border-neutral-700 dark:file:bg-neutral-900 dark:file:text-neutral-100"
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
          <div className="space-y-6">
            {/* Client Projects */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Are you Client for any Project?
                </span>
                <ToggleYN value={isClient} setValue={setIsClient} />
              </div>
            </div>

            {/* Service Partner Companies */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Are you working for any of our Service Partner?
                </span>
                <ToggleYN
                  value={isServiceProvider}
                  setValue={setIsServiceProvider}
                />
              </div>

              {isServiceProvider && (
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
                        ? `Select Company(ies) — ${companyRoleFilter === "IH_PMT"
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
                  />

                  {filteredCompanies.length === 0 && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      No companies match the selected role.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </Section>

        {/* ========== Admin Privileges (Super Admin only) ========== */}
        {canGrantAdmin && (
          <Section title="Admin Privileges (Super Admin only)">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Super Admin
                </span>
                <ToggleYN value={makeSuperAdmin} setValue={setMakeSuperAdmin} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Admin (Global)
                </span>
                <ToggleYN
                  value={makeGlobalAdmin}
                  setValue={setMakeGlobalAdmin}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Super Admin has full platform access, including toggling audit
                logging and assigning roles. Admin (Global) receives a global{" "}
                <code>Admin</code> role via role membership.
              </p>
            </div>
          </Section>
        )}

        {/* Footer actions */}
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
            {saving ? "Saving…" : "Create"}
          </button>
        </div>
      </div>

      {/* NOTE MODAL */}
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
                Note for Admins — Creating a New User
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
                <b>Affiliation is mandatory:</b> Mark the person as Client
                and/or Service Partner. (At least one must be selected.)
              </p>

              <p>
                If you choose <b>Service Partner = Yes</b>, you must also pick
                at least one company from the list.
              </p>

              <p>
                <b>Location fields</b> (State, District, City, PIN, Address) are
                helpful but optional.
              </p>

              <p>
                <b>Photo</b> upload is optional. If it fails, the user can still
                be created.
              </p>

              <div className="space-y-2">
                <p>
                  <b>If the mobile number already belongs to someone:</b>
                </p>
                <ul className="ml-5 list-disc space-y-1">
                  <li>You’ll see a message with that person’s details.</li>
                  <li>
                    <b>OK</b> takes you straight to that person’s <b>Edit</b>{" "}
                    page so you can update them.
                  </li>
                  <li>
                    <b>Cancel</b> keeps you on this page and stops the save (no
                    duplicate will be created).
                  </li>
                  <li>
                    If we can’t clearly find the exact person, you can choose{" "}
                    <b>OK</b> to open the Users list and search, or{" "}
                    <b>Cancel</b> to stay here (save is canceled).
                  </li>
                </ul>
              </div>

              <div className="space-y-2">
                <p>
                  <b>For Super Admins only:</b>
                </p>
                <ul className="ml-5 list-disc space-y-1">
                  <li>
                    You’ll see extra switches for <b>Super Admin</b> and{" "}
                    <b>Admin (Global)</b> access. Turning these on gives broader
                    access; turning them off does not block creating the user.
                  </li>
                </ul>
              </div>

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

/* ------------------------ Small UI helpers ------------------------ */

const roleMatches = (value: string | null | undefined, filter: string) => {
  if (!filter) return true;
  const normalize = (s: string) => s.replace(/[_\s]/g, "-").toLowerCase();
  const filterApi = filter === "IH_PMT" ? "IH-PMT" : filter;
  return normalize(String(value ?? "")) === normalize(filterApi);
};

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

function CheckboxGroup({
  label,
  items,
  selected,
  setSelected,
}: {
  label: string;
  items: { value: string; label: string }[];
  selected: string[];
  setSelected: (vals: string[]) => void;
}) {
  const toggle = (val: string) => {
    setSelected(
      selected.includes(val)
        ? selected.filter((v) => v !== val)
        : [...selected, val]
    );
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

function setRoleWarn(arg0: any) {
  throw new Error("Function not implemented.");
}
