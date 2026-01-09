// src/views/admin/assignments/consultants/consultantsAssignments.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../../api/client";

// ---------- Types ----------
type ProjectLite = { projectId: string; title: string };
type MembershipLite = {
  id?: string | null;
  role?: string | null;
  project?: { projectId?: string; title?: string } | null;
  company?: { companyId?: string; name?: string; code?: string } | null;
  validFrom?: string | null;
  validTo?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
};
type UserLite = {
  userId: string;
  code?: string | null;
  firstName: string;
  middleName?: string | null;
  lastName?: string;
  countryCode?: string | null;
  phone?: string | null;
  email?: string | null;
  status?: string | null;
  state?: string | null;
  district?: string | null;
  projectCount?: number | null;
};

type BrowseRow = UserLite & {
  projects?: { projectId: string; title: string }[];
};

// ---------- Local date helpers (match ClientsAssignments: no UTC conversions) ----------
function formatLocalYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function todayLocalISO() {
  return formatLocalYMD(new Date());
}
function fmtLocalDateTime(v: any) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v ?? "") : d.toLocaleString();
}
function fmtLocalDateOnly(v: any) {
  if (!v) return "";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : formatLocalYMD(d);
}

// ---------- Small utils ----------
const fullName = (u: Partial<UserLite>) =>
  [u.firstName, u.middleName, u.lastName].filter(Boolean).join(" ").trim();

const phonePretty = (u: Partial<UserLite>) => {
  const cc = String(u.countryCode ?? "91")
    .trim()
    .replace(/^\+/, "")
    .replace(/[^\d]/g, "");
  const ph = String(u.phone ?? "")
    .trim()
    .replace(/[^\d]/g, "");
  if (!ph) return "";
  return `+${cc}${ph}`;
};

// ---------- UI: EXACT match ClientsAssignments ----------
/** CompanyEdit-style section header */
const SectionHeader = ({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) => (
  <div className="mb-4">
    <div className="flex items-center gap-3">
      <span className="h-5 w-1.5 rounded-full bg-[#FCC020]" />
      <div className="text-[11px] sm:text-sm font-extrabold tracking-[0.18em] uppercase text-[#00379C] dark:text-[#FCC020]">
        {title}
      </div>
    </div>
    {subtitle ? (
      <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        {subtitle}
      </div>
    ) : null}
  </div>
);

// --- UI helper: status pill color (same as Companies/Users table) ---
function statusBadgeClass(status?: string | null) {
  const s = String(status || "").toLowerCase();
  if (s === "active")
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/25 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-700/60";
  if (s === "inactive" || s === "disabled")
    return "bg-slate-100 text-slate-800 dark:bg-neutral-800/70 dark:text-slate-200 border-slate-200/60 dark:border-white/10";
  if (s === "blocked" || s === "suspended")
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/25 dark:text-amber-300 border-amber-200/60 dark:border-amber-700/60";
  if (s === "deleted")
    return "bg-rose-100 text-rose-800 dark:bg-rose-900/25 dark:text-rose-300 border-rose-200/60 dark:border-rose-700/60";
  return "bg-blue-100 text-blue-800 dark:bg-blue-900/25 dark:text-blue-300 border-blue-200/60 dark:border-blue-700/60";
}

function ValidityBadge({ value }: { value: string }) {
  const v = (value || "").toLowerCase();
  let cls =
    "bg-slate-100 text-slate-700 border-slate-200 dark:bg-white/5 dark:text-slate-200 dark:border-white/10";

  if (v === "valid") {
    cls =
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-200 dark:border-emerald-900/40";
  } else if (v === "yet to start") {
    cls =
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-200 dark:border-amber-900/40";
  } else if (v === "expired") {
    cls =
      "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-200 dark:border-rose-900/40";
  }

  return (
    <span
      className={
        "inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium " +
        cls
      }
    >
      {value || "—"}
    </span>
  );
}

// ===== UI constants (CompanyEdit look) =====
const CARD =
  "bg-white dark:bg-neutral-950 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm p-5";

const PILL_INPUT =
  "h-9 w-full rounded-full border border-slate-200 dark:border-white/10 " +
  "bg-white dark:bg-neutral-950 px-3 text-[13px] text-slate-900 dark:text-slate-100 shadow-sm " +
  "placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00379C]/20 dark:focus:ring-[#FCC020]/20 focus:border-transparent";

const PILL_SELECT =
  "h-9 w-full rounded-full border border-slate-200 dark:border-white/10 " +
  "bg-white dark:bg-neutral-950 px-3 pr-9 text-[13px] text-slate-900 dark:text-slate-100 shadow-sm " +
  "focus:outline-none focus:ring-2 focus:ring-[#00379C]/20 dark:focus:ring-[#FCC020]/20 focus:border-transparent appearance-none";

const PILL_DATE = PILL_INPUT;

const btnSmBase =
  "h-8 px-3 rounded-full text-[11px] font-semibold shadow-sm hover:brightness-105 " +
  "focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-neutral-950 " +
  "disabled:opacity-60 disabled:cursor-not-allowed";
const BTN_SECONDARY =
  `${btnSmBase} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 ` +
  "dark:border-white/10 dark:bg-neutral-950 dark:text-slate-200 dark:hover:bg-white/5";
const BTN_PRIMARY = `${btnSmBase} bg-[#00379C] text-white hover:brightness-110 focus:ring-[#00379C]/35`;

const ICON_BTN =
  "inline-flex items-center justify-center h-8 w-8 rounded-full border border-slate-200 dark:border-white/10 " +
  "bg-white dark:bg-neutral-950 hover:bg-slate-50 dark:hover:bg-white/5";

// Pagination controls (Companies-table style)
const ctl =
  "h-8 rounded-full border px-3 text-[11px] font-semibold shadow-sm transition " +
  "focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-neutral-950 active:scale-[0.98]";
const ctlLight =
  "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 " +
  "dark:border-white/10 dark:bg-neutral-950 dark:text-slate-200 dark:hover:bg-white/5";

// ---------- Validity computation (match Clients page semantics) ----------
function computeValidityLabel(
  validFrom?: string | null,
  validTo?: string | null
) {
  const from = fmtLocalDateOnly(validFrom);
  const to = fmtLocalDateOnly(validTo);
  if (!from && !to) return "—";
  const today = todayLocalISO();
  if (from && today < from) return "Yet to Start";
  if (to && today > to) return "Expired";
  return "Valid";
}

// ---------- Component ----------
export default function ConsultantsAssignments() {
  const nav = useNavigate();

  // --- Auth gate (match ClientsAssignments) ---
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) nav("/login", { replace: true });
  }, [nav]);

  // ----- State -----
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [projectId, setProjectId] = useState<string>("");

  const [loadingAssigned, setLoadingAssigned] = useState(false);
  const [assigned, setAssigned] = useState<MembershipLite[]>([]);
  const [assignedErr, setAssignedErr] = useState<string | null>(null);

  // browse:
  const [loadingBrowse, setLoadingBrowse] = useState(false);
  const [browseErr, setBrowseErr] = useState<string | null>(null);
  const [browseRows, setBrowseRows] = useState<BrowseRow[]>([]);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("All");
  const [state, setState] = useState<string>("All States");
  const [district, setDistrict] = useState<string>("All Districts");
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);

  const [sortField, setSortField] = useState<
    "name" | "code" | "projects" | "mobile" | "email" | "state" | "district"
  >("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // selection:
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // view/edit modal for assigned membership:
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedMembership, setSelectedMembership] =
    useState<MembershipLite | null>(null);

  const [editValidFrom, setEditValidFrom] = useState<string>("");
  const [editValidTo, setEditValidTo] = useState<string>("");

  // delete confirm in edit modal
  const [pendingDeleteConfirm, setPendingDeleteConfirm] = useState(false);

  // pagination
  const [aPage, setAPage] = useState(1);
  const [bPage, setBPage] = useState(1);

  // ----- Derived -----
  const projectTitle = useMemo(() => {
    const p = projects.find((x) => x.projectId === projectId);
    return p?.title || "";
  }, [projects, projectId]);

  const assignedList = useMemo(() => {
    // assigned memberships (already filtered by project)
    return assigned.slice();
  }, [assigned]);

  const browseFiltered = useMemo(() => {
    let rows = browseRows.slice();

    // search
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => {
        const nm = fullName(r).toLowerCase();
        const cd = (r.code || "").toLowerCase();
        const em = (r.email || "").toLowerCase();
        const ph = phonePretty(r).toLowerCase();
        const st = (r.state || "").toLowerCase();
        const ds = (r.district || "").toLowerCase();
        const pr = (r.projects || [])
          .map((p) => p.title.toLowerCase())
          .join(" ");
        return (
          nm.includes(q) ||
          cd.includes(q) ||
          em.includes(q) ||
          ph.includes(q) ||
          st.includes(q) ||
          ds.includes(q) ||
          pr.includes(q)
        );
      });
    }

    // status filter
    if (status !== "All") {
      rows = rows.filter((r) => (r.status || "Active") === status);
    }

    // state filter
    if (state !== "All States") {
      rows = rows.filter((r) => (r.state || "") === state);
    }

    // district filter
    if (district !== "All Districts") {
      rows = rows.filter((r) => (r.district || "") === district);
    }

    // sort
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const aName = fullName(a);
      const bName = fullName(b);
      const aCode = a.code || "";
      const bCode = b.code || "";
      const aProj = a.projectCount || 0;
      const bProj = b.projectCount || 0;
      const aMob = phonePretty(a);
      const bMob = phonePretty(b);
      const aEm = a.email || "";
      const bEm = b.email || "";
      const aSt = a.state || "";
      const bSt = b.state || "";
      const aDs = a.district || "";
      const bDs = b.district || "";

      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = aName.localeCompare(bName);
          break;
        case "code":
          cmp = aCode.localeCompare(bCode);
          break;
        case "projects":
          cmp = aProj - bProj;
          break;
        case "mobile":
          cmp = aMob.localeCompare(bMob);
          break;
        case "email":
          cmp = aEm.localeCompare(bEm);
          break;
        case "state":
          cmp = aSt.localeCompare(bSt);
          break;
        case "district":
          cmp = aDs.localeCompare(bDs);
          break;
      }
      if (cmp === 0) cmp = aName.localeCompare(bName);
      return cmp * dir;
    });

    return rows;
  }, [browseRows, search, status, state, district, sortField, sortDir]);

  const assignedPaged = useMemo(() => {
    // match Clients page: use same rows-per-page selector value (global)
    const per = Math.max(5, rowsPerPage);
    const totalPages = Math.max(1, Math.ceil(assignedList.length / per));
    const page = Math.min(aPage, totalPages);
    const start = (page - 1) * per;
    return {
      page,
      totalPages,
      rows: assignedList.slice(start, start + per),
      per,
    };
  }, [assignedList, aPage, rowsPerPage]);

  const browsePaged = useMemo(() => {
    const per = Math.max(5, rowsPerPage);
    const totalPages = Math.max(1, Math.ceil(browseFiltered.length / per));
    const page = Math.min(bPage, totalPages);
    const start = (page - 1) * per;
    return {
      page,
      totalPages,
      rows: browseFiltered.slice(start, start + per),
      per,
    };
  }, [browseFiltered, bPage, rowsPerPage]);

  const uniqueStates = useMemo(() => {
    const set = new Set<string>();
    browseRows.forEach((r) => {
      if (r.state) set.add(r.state);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [browseRows]);

  const uniqueDistricts = useMemo(() => {
    const set = new Set<string>();
    browseRows.forEach((r) => {
      if (r.district) set.add(r.district);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [browseRows]);

  const pickedCount = picked.size;

  // ----- Effects -----
  useEffect(() => {
    (async () => {
      setLoadingProjects(true);
      try {
        const token = localStorage.getItem("token"); // adjust key if needed

        const res = await api.get<any>("/admin/projects", {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });

        const raw = res.data;

        // Accept multiple possible backend shapes
        const list = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.items)
          ? raw.items
          : Array.isArray(raw?.data)
          ? raw.data
          : Array.isArray(raw?.projects)
          ? raw.projects
          : Array.isArray(raw?.rows)
          ? raw.rows
          : [];

        const normalized = list
          .map((p: any) => ({
            projectId: p.projectId ?? p.id ?? p.project_id,
            title: p.title ?? p.name ?? p.projectTitle ?? p.project_name,
          }))
          .filter((p: any) => p.projectId && p.title);

        setProjects(normalized);

        // (optional) quick debug
        // console.log("projects raw:", raw);
        // console.log("projects normalized:", normalized);
      } catch (e: any) {
        // console.error("Failed to load projects:", e?.response?.status, e?.response?.data);
        setProjects([]);
      } finally {
        setLoadingProjects(false);
      }
    })();
  }, []);

  useEffect(() => {
    // when project changes: clear selection and load assigned + browse
    setPicked(new Set());
    setAPage(1);
    setBPage(1);

    if (!projectId) {
      setAssigned([]);
      setBrowseRows([]);
      setAssignedErr(null);
      setBrowseErr(null);
      return;
    }

    (async () => {
      // assigned consultants for project
      setLoadingAssigned(true);
      setAssignedErr(null);
      try {
        const { data } = await api.get<MembershipLite[]>(
          `/admin/projects/${projectId}/roles`,
          {
            params: { role: "Consultant" },
          }
        );
        setAssigned(Array.isArray(data) ? data : []);
      } catch (e: any) {
        setAssigned([]);
        setAssignedErr(
          e?.response?.data?.message ||
            "Failed to load assigned consultants for the project."
        );
      } finally {
        setLoadingAssigned(false);
      }
    })();

    (async () => {
      // browse consultants (all)
      setLoadingBrowse(true);
      setBrowseErr(null);
      try {
        const { data } = await api.get<BrowseRow[]>(`/admin/users`, {
          params: { role: "Consultant" },
        });
        setBrowseRows(Array.isArray(data) ? data : []);
      } catch (e: any) {
        setBrowseRows([]);
        setBrowseErr(
          e?.response?.data?.message || "Failed to load consultants list."
        );
      } finally {
        setLoadingBrowse(false);
      }
    })();
  }, [projectId]);

  // Keep pages safe if page size changes
  useEffect(() => {
    setAPage(1);
    setBPage(1);
  }, [rowsPerPage]);

  // ----- Actions -----
  const togglePick = (userId: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const moveOne = (userId: string) => {
    if (!projectId) return;
    togglePick(userId);
  };

  const clearFilters = () => {
    setSearch("");
    setStatus("All");
    setState("All States");
    setDistrict("All Districts");
    setRowsPerPage(10);
    setSortField("name");
    setSortDir("asc");
    setBPage(1);
  };

  const openView = (m: MembershipLite) => {
    setSelectedMembership(m);
    setViewOpen(true);
  };

  const openEdit = (m: MembershipLite) => {
    setSelectedMembership(m);
    setEditValidFrom(fmtLocalDateOnly(m.validFrom));
    setEditValidTo(fmtLocalDateOnly(m.validTo));
    setPendingDeleteConfirm(false);
    setEditOpen(true);
  };

  const closeModals = () => {
    setViewOpen(false);
    setEditOpen(false);
    setSelectedMembership(null);
    setPendingDeleteConfirm(false);
  };

  const reloadAssigned = async () => {
    if (!projectId) return;
    setLoadingAssigned(true);
    setAssignedErr(null);
    try {
      const { data } = await api.get<MembershipLite[]>(
        `/admin/projects/${projectId}/roles`,
        { params: { role: "Consultant" } }
      );
      setAssigned(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setAssigned([]);
      setAssignedErr(
        e?.response?.data?.message ||
          "Failed to load assigned consultants for the project."
      );
    } finally {
      setLoadingAssigned(false);
    }
  };

  const onAssign = async () => {
    if (!projectId) return;
    if (picked.size === 0) return;

    const userIds = Array.from(picked);

    try {
      await api.post(`/admin/projects/${projectId}/assign-roles`, {
        role: "Consultant",
        userIds,
      });
      setPicked(new Set());
      await reloadAssigned();
      // keep the UX similar: scroll to assignments section
      const el = document.querySelector(
        '[data-tile-name="Consultant Assignments"]'
      );
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e: any) {
      alert(
        e?.response?.data?.message ||
          "Failed to assign consultants. Please try again."
      );
    }
  };

  const onUpdateValidity = async () => {
    if (!projectId || !selectedMembership?.id) return;

    try {
      await api.post(`/admin/assignments`, {
        id: selectedMembership.id,
        // Keep API behavior unchanged (still sending ISO) but UI stays local
        validFrom: editValidFrom ? new Date(editValidFrom).toISOString() : null,
        validTo: editValidTo ? new Date(editValidTo).toISOString() : null,
      });
      await reloadAssigned();
      setEditOpen(false);
      setSelectedMembership(null);
    } catch (e: any) {
      alert(
        e?.response?.data?.message ||
          "Failed to update validity. Please try again."
      );
    }
  };

  const onHardDeleteFromEdit = async () => {
    if (!selectedMembership?.id) return;

    try {
      await api.delete(`/admin/assignments`, {
        data: { id: selectedMembership.id },
      });
      await reloadAssigned();
      closeModals();
    } catch (e: any) {
      alert(
        e?.response?.data?.message ||
          "Failed to remove assignment. Please try again."
      );
    }
  };

  // ----- Render -----
  return (
    <div className="w-full">
      {/* Page Heading (match ClientsAssignments) */}
      <div className="mb-4">
        <div className="text-xl font-extrabold text-slate-900 dark:text-white">
          Consultant Assignments
        </div>
        <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Assign consultants to projects and manage validity.
        </div>
        <div className="mt-2 h-1 w-10 rounded-full bg-[#FCC020]" />
      </div>

      {/* Section 1 — Projects */}
      <section
        className={CARD + " mb-4"}
        aria-label="Projects"
        data-tile-name="Projects"
      >
        <SectionHeader
          title="Projects"
          subtitle="Choose the project to assign consultants to."
        />

        <div className="max-w-xl">
          <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-1 block">
            Project
          </label>

          <div className="relative">
            <select
              className={PILL_SELECT}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={loadingProjects}
              title="Select project"
            >
              <option value="">
                {loadingProjects ? "Loading projects…" : "Select a project…"}
              </option>
              {projects.map((p) => (
                <option key={p.projectId} value={p.projectId}>
                  {p.title}
                </option>
              ))}
            </select>

            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-slate-500 dark:text-slate-300">
              ▼
            </span>
          </div>

          {projectId ? (
            <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">
              Selected:{" "}
              <span className="font-medium text-slate-900 dark:text-white">
                {projectTitle}
              </span>
            </div>
          ) : null}
        </div>
      </section>

      {/* Section 2 — Roles & Options */}
      <section
        className={CARD + " mb-4"}
        aria-label="Roles & Options"
        data-tile-name="Roles & Options"
      >
        <SectionHeader
          title="Roles & Options"
          subtitle="Pick from moved consultants and set validity."
        />

        <div className="mt-2 space-y-5">
          {/* Moved consultants */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300">
                Moved Consultants
              </div>

              {pickedCount > 0 && (
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {pickedCount} selected
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-auto bg-slate-50/60 dark:bg-white/5">
              {pickedCount === 0 ? (
                <div className="p-3 text-sm text-slate-600 dark:text-slate-300">
                  <b>Move consultants</b> from the list below to assign them for
                  the selected project.
                </div>
              ) : (
                <ul className="divide-y divide-slate-200 dark:divide-white/10">
                  {Array.from(picked)
                    .slice(0, 50)
                    .map((id) => {
                      const u = browseRows.find((x) => x.userId === id);
                      const name = u ? fullName(u) : id;
                      const code = u?.code || "";
                      const email = u?.email || "";
                      const phone = u ? phonePretty(u) : "";
                      const st = u?.status || "Active";

                      return (
                        <li
                          key={id}
                          className="px-3 py-2 flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-rose-600 hover:bg-rose-600/10 active:scale-[0.98] dark:hover:bg-rose-600/15"
                              title="Remove from selection"
                              aria-label="Remove from selection"
                              onClick={() => togglePick(id)}
                            >
                              <span className="text-[14px] leading-none">
                                ✕
                              </span>
                            </button>

                            <div className="flex flex-col">
                              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                                {name || "(No name)"}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                {code}
                                {code ? " · " : ""}
                                {email}
                                {email ? " · " : ""}
                                {phone}
                              </div>
                            </div>
                          </div>

                          {/* Status pill (Companies style) */}
                          <span className="inline-flex items-center rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-neutral-950 px-3 py-1 text-[12px] text-slate-700 dark:text-slate-200 shadow-sm">
                            {st}
                          </span>
                        </li>
                      );
                    })}

                  {pickedCount > 50 ? (
                    <li className="px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400">
                      +{pickedCount - 50} more selected…
                    </li>
                  ) : null}
                </ul>
              )}
            </div>

            {pickedCount > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  className={BTN_SECONDARY}
                  onClick={() => setPicked(new Set())}
                >
                  Clear Selection
                </button>

                <button
                  className={BTN_PRIMARY}
                  onClick={onAssign}
                  disabled={!projectId || pickedCount === 0}
                  title={!projectId ? "Select a project first" : undefined}
                >
                  Assign
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Section 3 — Browse Consultants */}
      <section
        className={CARD + " mb-4"}
        aria-label="Browse Consultants"
        data-tile-name="Browse Consultants"
      >
        <SectionHeader
          title="Browse Consultants"
          subtitle="Search, filter, sort and move consultants into the selection."
        />

        {!projectId ? (
          <div className="text-sm text-slate-600 dark:text-slate-300">
            Select a project first to start assigning.
          </div>
        ) : (
          <>
            {/* Controls */}
            <div className="mb-4 space-y-3">
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
                {/* Search */}
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-1 block">
                    Search
                  </label>
                  <input
                    className={PILL_INPUT}
                    placeholder="Code, name, project, phone, email…"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setBPage(1);
                    }}
                  />
                </div>

                {/* Status */}
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-1 block">
                    Status
                  </label>
                  <div className="relative">
                    <select
                      className={PILL_SELECT}
                      value={status}
                      onChange={(e) => {
                        setStatus(e.target.value);
                        setBPage(1);
                      }}
                    >
                      <option value="All">All</option>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-slate-500 dark:text-slate-300">
                      ▼
                    </span>
                  </div>
                </div>

                {/* State */}
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-1 block">
                    State
                  </label>
                  <div className="relative">
                    <select
                      className={PILL_SELECT}
                      value={state}
                      onChange={(e) => {
                        setState(e.target.value);
                        setBPage(1);
                      }}
                    >
                      <option value="All States">All States</option>
                      {uniqueStates.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-slate-500 dark:text-slate-300">
                      ▼
                    </span>
                  </div>
                </div>

                {/* District */}
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-1 block">
                    District
                  </label>
                  <div className="relative">
                    <select
                      className={PILL_SELECT}
                      value={district}
                      onChange={(e) => {
                        setDistrict(e.target.value);
                        setBPage(1);
                      }}
                    >
                      <option value="All Districts">All Districts</option>
                      {uniqueDistricts.map((ds) => (
                        <option key={ds} value={ds}>
                          {ds}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-slate-500 dark:text-slate-300">
                      ▼
                    </span>
                  </div>
                </div>
              </div>

              {/* Bottom controls */}
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-1 block">
                      Sort By
                    </label>

                    <div className="flex gap-2">
                      <div className="relative">
                        <select
                          className={PILL_SELECT}
                          value={sortField}
                          onChange={(e) => {
                            setSortField(e.target.value as any);
                            setBPage(1);
                          }}
                        >
                          <option value="code">Code</option>
                          <option value="name">Name</option>
                          <option value="projects">Projects</option>
                          <option value="mobile">Mobile</option>
                          <option value="email">Email</option>
                          <option value="state">State</option>
                          <option value="district">District</option>
                        </select>
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-slate-500 dark:text-slate-300">
                          ▼
                        </span>
                      </div>

                      <button
                        className={ICON_BTN}
                        onClick={() => {
                          setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                          setBPage(1);
                        }}
                        title="Toggle sort direction"
                      >
                        <span className="text-[12px]">
                          {sortDir === "asc" ? "▲" : "▼"}
                        </span>
                      </button>
                    </div>
                  </div>

                  <button className={BTN_SECONDARY} onClick={clearFilters}>
                    Clear
                  </button>
                </div>

                <div className="flex items-end gap-2">
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-1 block">
                      Rows per page
                    </label>
                    <div className="relative">
                      <select
                        className={PILL_SELECT}
                        value={rowsPerPage}
                        onChange={(e) => {
                          setRowsPerPage(parseInt(e.target.value, 10));
                          setBPage(1);
                          setAPage(1);
                        }}
                      >
                        {[10, 20, 50, 100].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-slate-500 dark:text-slate-300">
                        ▼
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Table (Companies-exact UI) */}
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-white/10 dark:bg-neutral-950">
              {browseErr && (
                <div className="p-4 text-sm text-rose-700 dark:text-rose-300 border-b border-slate-200 dark:border-white/10">
                  {browseErr}
                </div>
              )}

              <div
                className="overflow-auto thin-scrollbar"
                style={{ maxHeight: "65vh" }}
              >
                {loadingBrowse ? (
                  <div className="p-6 text-sm text-slate-600 dark:text-slate-300">
                    Loading consultants…
                  </div>
                ) : browsePaged.rows.length === 0 ? (
                  <div className="p-6 text-sm text-slate-600 dark:text-slate-300">
                    No consultants match the selected criteria.
                  </div>
                ) : (
                  <table className="min-w-full border-separate border-spacing-0 text-[12px]">
                    <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur dark:bg-neutral-950/95">
                      <tr>
                        {[
                          { key: "action", label: "Action" },
                          { key: "code", label: "Code" },
                          { key: "name", label: "Name" },
                          { key: "projects", label: "Projects" },
                          { key: "mobile", label: "Mobile" },
                          { key: "email", label: "Email" },
                          { key: "state", label: "State" },
                          { key: "district", label: "District" },
                        ].map(({ key, label }) => {
                          const sortable = key !== "action";
                          const active = sortField === (key as any);
                          const dir = active ? sortDir : undefined;

                          return (
                            <th
                              key={key}
                              className={
                                "text-left font-extrabold text-[11px] uppercase tracking-wide " +
                                "text-slate-600 dark:text-slate-200 " +
                                "px-3 py-2 border-b border-slate-200 dark:border-white/10 whitespace-nowrap select-none " +
                                (sortable ? "cursor-pointer" : "")
                              }
                              title={sortable ? `Sort by ${label}` : undefined}
                              onClick={() => {
                                if (!sortable) return;
                                if (sortField !== (key as any)) {
                                  setSortField(key as any);
                                  setSortDir("asc");
                                } else {
                                  setSortDir((d) =>
                                    d === "asc" ? "desc" : "asc"
                                  );
                                }
                                setBPage(1);
                              }}
                              aria-sort={
                                sortable
                                  ? active
                                    ? dir === "asc"
                                      ? "ascending"
                                      : "descending"
                                    : "none"
                                  : undefined
                              }
                            >
                              <span className="inline-flex items-center gap-1">
                                {label}
                                {sortable && (
                                  <span
                                    className="text-[10px] opacity-70"
                                    style={{
                                      color: active ? "#00379C" : undefined,
                                    }}
                                  >
                                    {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
                                  </span>
                                )}
                              </span>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>

                    <tbody>
                      {browsePaged.rows.map((u) => {
                        const isPicked = picked.has(u.userId);
                        const projectsCount = u.projectCount ?? 0;

                        return (
                          <tr
                            key={u.userId}
                            className="border-b border-slate-100/80 dark:border-white/5 hover:bg-[#00379C]/[0.03] dark:hover:bg-white/[0.03]"
                          >
                            {/* Action */}
                            <td className="px-2 py-1 whitespace-nowrap align-middle">
                              <button
                                type="button"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#23A192] hover:bg-[#23A192]/10 active:scale-[0.98] dark:hover:bg-[#23A192]/15"
                                onClick={() => moveOne(u.userId)}
                                title={
                                  isPicked
                                    ? "Remove from selection"
                                    : "Move to selection"
                                }
                                aria-label={
                                  isPicked
                                    ? "Remove from selection"
                                    : "Move to selection"
                                }
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  className="h-4 w-4"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={1.7}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  {isPicked ? (
                                    <>
                                      <path d="M20 6 9 17l-5-5" />
                                    </>
                                  ) : (
                                    <>
                                      <path d="M12 19V5" />
                                      <path d="M6.5 10.5 12 5l5.5 5.5" />
                                    </>
                                  )}
                                </svg>
                              </button>
                            </td>

                            <td className="px-3 py-1 whitespace-nowrap align-middle text-slate-800 dark:text-slate-100">
                              {u.code || "—"}
                            </td>

                            <td className="px-3 py-1 whitespace-nowrap align-middle text-slate-800 dark:text-slate-100">
                              {fullName(u) || "—"}
                            </td>

                            <td className="px-3 py-1 whitespace-nowrap align-middle">
                              {projectsCount}
                            </td>

                            <td className="px-3 py-1 whitespace-nowrap align-middle">
                              {phonePretty(u) || "—"}
                            </td>

                            <td className="px-3 py-1 whitespace-nowrap align-middle">
                              {u.email || "—"}
                            </td>

                            <td className="px-3 py-1 whitespace-nowrap align-middle">
                              {u.state || "—"}
                            </td>

                            <td className="px-3 py-1 whitespace-nowrap align-middle">
                              {u.district || "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Pagination footer (Companies-exact UI) */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 py-2 text-sm border-t border-slate-200 dark:border-white/10">
                <div className="text-slate-600 dark:text-slate-300">
                  Page <b>{browsePaged.page}</b> of{" "}
                  <b>{browsePaged.totalPages}</b> · Showing{" "}
                  <b>{browsePaged.rows.length}</b> of{" "}
                  <b>{browseFiltered.length}</b> consultants
                </div>

                <div className="flex flex-wrap items-center gap-1 justify-end">
                  <button
                    className={`${ctl} ${ctlLight} disabled:opacity-50`}
                    disabled={browsePaged.page <= 1}
                    onClick={() => setBPage(1)}
                    title="First"
                  >
                    « First
                  </button>
                  <button
                    className={`${ctl} ${ctlLight} disabled:opacity-50`}
                    disabled={browsePaged.page <= 1}
                    onClick={() => setBPage((p) => Math.max(1, p - 1))}
                    title="Previous"
                  >
                    ‹ Prev
                  </button>
                  <button
                    className={`${ctl} ${ctlLight} disabled:opacity-50`}
                    disabled={browsePaged.page >= browsePaged.totalPages}
                    onClick={() =>
                      setBPage((p) => Math.min(browsePaged.totalPages, p + 1))
                    }
                    title="Next"
                  >
                    Next ›
                  </button>
                  <button
                    className={`${ctl} ${ctlLight} disabled:opacity-50`}
                    disabled={browsePaged.page >= browsePaged.totalPages}
                    onClick={() => setBPage(browsePaged.totalPages)}
                    title="Last"
                  >
                    Last »
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Section 4 — Consultant Assignments */}
      <section
        className={CARD + " mb-4"}
        aria-label="Consultant Assignments"
        data-tile-name="Consultant Assignments"
      >
        <SectionHeader
          title="Consultant Assignments"
          subtitle="Current assignments for the selected project."
        />

        {!projectId ? (
          <div className="text-sm text-slate-600 dark:text-slate-300">
            Select a project to view assigned consultants.
          </div>
        ) : assignedErr ? (
          <div className="text-sm text-rose-700 dark:text-rose-300">
            {assignedErr}
          </div>
        ) : loadingAssigned ? (
          <div className="text-sm text-slate-600 dark:text-slate-300">
            Loading assigned consultants…
          </div>
        ) : assignedList.length === 0 ? (
          <div className="text-sm text-slate-600 dark:text-slate-300">
            No consultants assigned yet.
          </div>
        ) : (
          <>
            {/* Table (Companies-exact UI) */}
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-white/10 dark:bg-neutral-950">
              <div
                className="overflow-auto thin-scrollbar"
                style={{ maxHeight: "65vh" }}
              >
                <table className="min-w-full border-separate border-spacing-0 text-[12px]">
                  <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur dark:bg-neutral-950/95">
                    <tr>
                      <th
                        className={
                          "text-left font-extrabold text-[11px] uppercase tracking-wide " +
                          "text-slate-600 dark:text-slate-200 " +
                          "px-3 py-2 border-b border-slate-200 dark:border-white/10 whitespace-nowrap select-none"
                        }
                      >
                        Action
                      </th>

                      {[
                        { key: "code", label: "Code" },
                        { key: "name", label: "Name" },
                        { key: "company", label: "Company" },
                        { key: "validFrom", label: "Valid From" },
                        { key: "validTo", label: "Valid To" },
                        { key: "validity", label: "Validity" },
                        { key: "updated", label: "Last Updated" },
                      ].map(({ key, label }) => (
                        <th
                          key={key}
                          className={
                            "text-left font-extrabold text-[11px] uppercase tracking-wide " +
                            "text-slate-600 dark:text-slate-200 " +
                            "px-3 py-2 border-b border-slate-200 dark:border-white/10 whitespace-nowrap select-none"
                          }
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {assignedPaged.rows.map((m, idx) => {
                      const code = (m.company as any)?.code || "—";
                      const name =
                        m.company?.name ||
                        m.project?.title ||
                        projectTitle ||
                        "—";
                      const companyName = m.company?.name || "—";

                      const vf = fmtLocalDateOnly(m.validFrom) || "—";
                      const vt = fmtLocalDateOnly(m.validTo) || "—";
                      const validity = computeValidityLabel(
                        m.validFrom,
                        m.validTo
                      );
                      const updated =
                        fmtLocalDateTime(m.updatedAt || m.createdAt) || "—";

                      return (
                        <tr
                          key={m.id || idx}
                          className="border-b border-slate-100/80 dark:border-white/5 hover:bg-[#00379C]/[0.03] dark:hover:bg-white/[0.03]"
                        >
                          {/* Action icons like ClientsAssignments */}
                          <td className="px-2 py-1 whitespace-nowrap align-middle">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#23A192] hover:bg-[#23A192]/10 active:scale-[0.98] dark:hover:bg-[#23A192]/15"
                                onClick={() => openView(m)}
                                title="View assignment"
                                aria-label="View assignment"
                              >
                                {/* eye */}
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 24 24"
                                  className="h-4 w-4"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.7"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M2.5 12C4 8.5 7.6 6 12 6s8 2.5 9.5 6c-1.5 3.5-5.1 6-9.5 6s-8-2.5-9.5-6z" />
                                  <circle cx="12" cy="12" r="3.25" />
                                </svg>
                              </button>

                              <button
                                type="button"
                                className={
                                  "inline-flex h-7 w-7 items-center justify-center rounded-full " +
                                  "text-[#00379C] hover:bg-[#00379C]/10 active:scale-[0.98] dark:hover:bg-[#00379C]/15 " +
                                  (!m.id ? "opacity-50 cursor-not-allowed" : "")
                                }
                                onClick={() => openEdit(m)}
                                disabled={!m.id}
                                title={
                                  m.id ? "Edit validity dates" : "Missing id"
                                }
                                aria-label="Edit validity dates"
                              >
                                {/* pencil */}
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 24 24"
                                  className="h-4 w-4"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.7"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M4 20h4l10.5-10.5-4-4L4 16v4z" />
                                  <path d="M14.5 5.5l4 4" />
                                </svg>
                              </button>
                            </div>
                          </td>

                          <td className="px-3 py-1 whitespace-nowrap align-middle">
                            {code}
                          </td>

                          <td
                            className="px-3 py-1 whitespace-nowrap align-middle text-slate-800 dark:text-slate-100 max-w-[14rem] overflow-hidden text-ellipsis"
                            title={name}
                          >
                            {name}
                          </td>

                          <td
                            className="px-3 py-1 whitespace-nowrap align-middle"
                            title={companyName}
                          >
                            {companyName}
                          </td>

                          <td className="px-3 py-1 whitespace-nowrap align-middle">
                            {vf}
                          </td>

                          <td className="px-3 py-1 whitespace-nowrap align-middle">
                            {vt}
                          </td>

                          <td className="px-3 py-1 whitespace-nowrap align-middle">
                            <ValidityBadge value={validity || "—"} />
                          </td>

                          <td
                            className="px-3 py-1 whitespace-nowrap align-middle"
                            title={updated}
                          >
                            {updated}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination footer (Companies-exact UI) */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 py-2 text-sm border-t border-slate-200 dark:border-white/10">
                <div className="text-slate-600 dark:text-slate-300">
                  Page <b>{assignedPaged.page}</b> of{" "}
                  <b>{assignedPaged.totalPages}</b> · Showing{" "}
                  <b>{assignedPaged.rows.length}</b> of{" "}
                  <b>{assignedList.length}</b> consultant assignments
                </div>

                <div className="flex flex-wrap items-center gap-1 justify-end">
                  <button
                    className={`${ctl} ${ctlLight} disabled:opacity-50`}
                    disabled={assignedPaged.page <= 1}
                    onClick={() => setAPage(1)}
                    title="First"
                  >
                    « First
                  </button>
                  <button
                    className={`${ctl} ${ctlLight} disabled:opacity-50`}
                    disabled={assignedPaged.page <= 1}
                    onClick={() => setAPage((p) => Math.max(1, p - 1))}
                    title="Previous"
                  >
                    ‹ Prev
                  </button>
                  <button
                    className={`${ctl} ${ctlLight} disabled:opacity-50`}
                    disabled={assignedPaged.page >= assignedPaged.totalPages}
                    onClick={() =>
                      setAPage((p) => Math.min(assignedPaged.totalPages, p + 1))
                    }
                    title="Next"
                  >
                    Next ›
                  </button>
                  <button
                    className={`${ctl} ${ctlLight} disabled:opacity-50`}
                    disabled={assignedPaged.page >= assignedPaged.totalPages}
                    onClick={() => setAPage(assignedPaged.totalPages)}
                    title="Last"
                  >
                    Last »
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      {/* ===== View Modal (read-only) ===== */}
      {viewOpen && selectedMembership && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setViewOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-neutral-950 shadow-lg p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-slate-900 dark:text-white">
                  Consultant Assignment
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  Project: {projectTitle || "—"}
                </div>
              </div>

              <button
                className={BTN_SECONDARY + " h-8 px-3 text-[11px]"}
                onClick={() => setViewOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10">
              <table className="min-w-full text-sm">
                <tbody>
                  {[
                    ["Project", projectTitle || "—"],
                    ["Company", selectedMembership.company?.name || "—"],
                    [
                      "Valid From",
                      fmtLocalDateOnly(selectedMembership.validFrom) || "—",
                    ],
                    [
                      "Valid To",
                      fmtLocalDateOnly(selectedMembership.validTo) || "—",
                    ],
                    [
                      "Validity",
                      computeValidityLabel(
                        selectedMembership.validFrom,
                        selectedMembership.validTo
                      ) || "—",
                    ],
                    [
                      "Last Updated",
                      fmtLocalDateTime(
                        selectedMembership.updatedAt ||
                          selectedMembership.createdAt
                      ) || "—",
                    ],
                  ].map(([k, v]) => (
                    <tr
                      key={k}
                      className="odd:bg-slate-50/60 dark:odd:bg-white/[0.03]"
                    >
                      <td className="px-3 py-2 font-semibold whitespace-nowrap text-slate-700 dark:text-slate-200">
                        {k}
                      </td>
                      <td className="px-3 py-2 text-slate-900 dark:text-slate-100">
                        {v}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                className={BTN_PRIMARY}
                onClick={() => setViewOpen(false)}
              >
                OK
              </button>
              <button
                className={BTN_SECONDARY}
                onClick={() => {
                  setViewOpen(false);
                  openEdit(selectedMembership);
                }}
                disabled={!selectedMembership.id}
                title={!selectedMembership.id ? "Missing id" : "Edit validity"}
              >
                Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Edit Modal (with date updates + hard delete button) ===== */}
      {editOpen && selectedMembership && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setEditOpen(false)}
          />

          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-neutral-950 shadow-lg p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-slate-900 dark:text-white">
                  Edit Validity
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  Project: {projectTitle || "—"}
                </div>
              </div>

              <button
                className={
                  "h-8 px-3 rounded-full text-[11px] font-semibold text-white shadow-sm " +
                  (!selectedMembership?.id
                    ? "bg-rose-600/60 cursor-not-allowed"
                    : "bg-rose-600 hover:bg-rose-700")
                }
                onClick={() => setPendingDeleteConfirm(true)}
                disabled={!selectedMembership?.id}
                title={
                  selectedMembership?.id
                    ? "Permanently remove this assignment"
                    : "Missing id"
                }
              >
                Remove
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Valid From
                </div>
                <input
                  type="date"
                  className={PILL_DATE + " mt-1"}
                  value={editValidFrom}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEditValidFrom(v);
                    if (editValidTo && editValidTo < v) setEditValidTo(v);
                  }}
                />
              </div>

              <div>
                <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Valid To
                </div>
                <input
                  type="date"
                  className={PILL_DATE + " mt-1"}
                  value={editValidTo}
                  min={editValidFrom || undefined}
                  onChange={(e) => setEditValidTo(e.target.value)}
                />
              </div>
            </div>

            {pendingDeleteConfirm ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
                <div className="font-semibold">Remove assignment?</div>
                <div className="mt-1">
                  This will permanently remove this Consultant assignment from
                  the project.
                </div>

                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    className={BTN_SECONDARY}
                    onClick={() => setPendingDeleteConfirm(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className={
                      "h-8 px-3 rounded-full text-[11px] font-semibold text-white shadow-sm " +
                      "bg-rose-600 hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                    }
                    onClick={onHardDeleteFromEdit}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button className={BTN_SECONDARY} onClick={closeModals}>
                Cancel
              </button>

              <button
                className={BTN_PRIMARY}
                title="Update validity dates"
                disabled={!selectedMembership?.id}
                onClick={onUpdateValidity}
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Back
      <div className="mt-2">
        <button
          className={BTN_SECONDARY}
          onClick={() => nav("/admin/assignments")}
        >
          ← Back to Assignments
        </button>
      </div> */}

      <style>
        {`
          .thin-scrollbar::-webkit-scrollbar { height: 6px; width: 6px; }
          .thin-scrollbar::-webkit-scrollbar-track { background: transparent; }
          .thin-scrollbar::-webkit-scrollbar-thumb {
            background-color: rgba(148, 163, 184, 0.7);
            border-radius: 999px;
          }
          .thin-scrollbar::-webkit-scrollbar-thumb:hover {
            background-color: rgba(100, 116, 139, 0.9);
          }
        `}
      </style>
    </div>
  );
}
