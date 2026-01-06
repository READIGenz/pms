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
  company?: { companyId?: string; name?: string } | null;
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

// ---------- Helpers ----------
const fullName = (u: Partial<UserLite>) =>
  [u.firstName, u.middleName, u.lastName].filter(Boolean).join(" ");

const phonePretty = (u: Partial<UserLite>) => {
  const cc = (u.countryCode || "91").replace(/[^\d]/g, "");
  const ph = (u.phone || "").replace(/[^\d]/g, "");
  if (!ph) return "—";
  return `+${cc}${ph}`;
};

const isoToYmd = (iso?: string | null) => {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return "";
  }
};

// ---------- UI atoms (match ClientsAssignments) ----------
function TileHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-start gap-3">
        <div className="mt-1 h-6 w-1.5 rounded-full bg-[#FCC020]" />
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-900 dark:text-neutral-100">
            {title}
          </div>
          {subtitle ? (
            <div className="mt-1 text-sm text-slate-600 dark:text-neutral-300">
              {subtitle}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const TILE_SHELL =
  "bg-white dark:bg-neutral-900 rounded-2xl shadow-sm " +
  "border border-[#c9ded3] dark:border-[#2b3c35] p-4 mb-4";

const SOFT_SELECT =
  "h-9 w-full rounded-full border border-[#c9ded3] dark:border-[#2b3c35] " +
  "bg-[#f7fbf9] dark:bg-neutral-900/80 px-3 pr-8 text-xs sm:text-sm " +
  "text-slate-800 dark:text-neutral-100 shadow-sm " +
  "focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:border-emerald-400/70 appearance-none";

const SOFT_INPUT =
  "h-9 w-full rounded-full border border-[#c9ded3] dark:border-[#2b3c35] " +
  "bg-white dark:bg-neutral-900/80 px-3 text-xs sm:text-sm " +
  "text-slate-800 dark:text-neutral-100 placeholder:text-gray-400 shadow-sm " +
  "focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:border-emerald-400/70";

const SOFT_DATE =
  "mt-1 h-9 w-full rounded-full border border-[#c9ded3] dark:border-[#2b3c35] " +
  "bg-[#f7fbf9] dark:bg-neutral-900/80 px-3 text-xs sm:text-sm " +
  "text-slate-800 dark:text-neutral-100 shadow-sm " +
  "focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:border-emerald-400/70";

const PILL_BTN =
  "h-9 px-4 rounded-full border border-slate-200/80 dark:border-neutral-800 " +
  "bg-white dark:bg-neutral-900 text-xs sm:text-sm text-slate-700 dark:text-neutral-100 shadow-sm " +
  "hover:bg-slate-50 dark:hover:bg-neutral-800";

const PILL_BTN_PRIMARY =
  "h-9 px-4 rounded-full bg-emerald-600 text-white text-xs sm:text-sm font-medium shadow-sm " +
  "hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-60";

// ---------- Component ----------
export default function ConsultantsAssignments() {
  const nav = useNavigate();

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
  const [pendingEditAlert, setPendingEditAlert] = useState(false);

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
        const pr = (r.projects || []).map((p) => p.title.toLowerCase()).join(" ");
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
    const per = 8;
    const totalPages = Math.max(1, Math.ceil(assignedList.length / per));
    const page = Math.min(aPage, totalPages);
    const start = (page - 1) * per;
    return {
      page,
      totalPages,
      rows: assignedList.slice(start, start + per),
    };
  }, [assignedList, aPage]);

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
    // load projects list
    (async () => {
      setLoadingProjects(true);
      try {
        const { data } = await api.get<ProjectLite[]>("/admin/projects");
        setProjects(Array.isArray(data) ? data : []);
      } catch {
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
        const { data } = await api.get<BrowseRow[]>(
          `/admin/users`,
          {
            params: { role: "Consultant" },
          }
        );
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
    setEditValidFrom(isoToYmd(m.validFrom));
    setEditValidTo(isoToYmd(m.validTo));
    setPendingEditAlert(false);
    setEditOpen(true);
  };

  const closeModals = () => {
    setViewOpen(false);
    setEditOpen(false);
    setSelectedMembership(null);
    setPendingEditAlert(false);
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
    <div className="mx-auto max-w-6xl">
      {/* Header (keep consistent with Client page expectation) */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
          Assignments
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Projects · Roles &amp; Options · <b>Browse Consultants</b> · Assignments
        </p>
        <div className="mt-3 h-1 w-12 rounded bg-[#FCC020]" />
      </div>

      {/* Tile: Projects */}
      <section className={TILE_SHELL} aria-label="Tile: Projects">
        <TileHeader
          title="Projects"
          subtitle="Choose the project to assign consultants to."
        />

        <div className="max-w-xl">
          <div className="text-[11px] font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1">
            Project
          </div>
          <div className="relative">
            <select
              className={SOFT_SELECT}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={loadingProjects}
            >
              <option value="">
                {loadingProjects ? "Loading projects..." : "Select a project..."}
              </option>
              {projects.map((p) => (
                <option key={p.projectId} value={p.projectId}>
                  {p.title}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
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

      {/* Tile: Roles & Options */}
      <section className={TILE_SHELL} aria-label="Tile: Roles & Options">
        <TileHeader
          title="Roles & Options"
          subtitle="Pick from moved consultants and set validity."
        />

        <div className="flex flex-col gap-4">
          {/* moved list summary */}
          <div className="rounded-2xl border border-slate-200/80 dark:border-neutral-800 bg-white/60 dark:bg-neutral-950/20 p-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-white">
                  Moved Consultants
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  Selected to be assigned to{" "}
                  <span className="font-medium">{projectTitle || "—"}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 text-xs font-medium dark:bg-emerald-900/20 dark:text-emerald-200 dark:border-emerald-800/40">
                  {pickedCount} selected
                </span>

                <button
                  className={PILL_BTN}
                  onClick={() => setPicked(new Set())}
                  disabled={pickedCount === 0}
                >
                  Clear
                </button>

                <button
                  className={PILL_BTN_PRIMARY}
                  onClick={onAssign}
                  disabled={!projectId || pickedCount === 0}
                  title={!projectId ? "Select a project first" : undefined}
                >
                  Assign
                </button>
              </div>
            </div>

            {pickedCount > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {Array.from(picked)
                  .slice(0, 10)
                  .map((id) => {
                    const u = browseRows.find((x) => x.userId === id);
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-1 text-xs text-slate-700 dark:text-neutral-100"
                      >
                        <span className="font-medium">
                          {u ? fullName(u) : id}
                        </span>
                        <button
                          className="text-slate-500 hover:text-slate-900 dark:hover:text-white"
                          onClick={() => togglePick(id)}
                          title="Remove from selection"
                        >
                          ✕
                        </button>
                      </span>
                    );
                  })}

                {pickedCount > 10 ? (
                  <span className="text-xs text-slate-600 dark:text-slate-300">
                    +{pickedCount - 10} more
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* Tile: Browse Consultants */}
      <section
        className={TILE_SHELL}
        aria-label="Tile: Browse Consultants"
        data-tile-name="Browse Consultants"
      >
        <TileHeader
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
            <div className="mb-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {/* Search */}
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1 block">
                    Search
                  </label>
                  <input
                    className={SOFT_INPUT}
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setBPage(1);
                    }}
                    placeholder="Code, name, project, phone, email..."
                  />
                </div>

                {/* Status */}
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1 block">
                    Status
                  </label>
                  <div className="relative">
                    <select
                      className={SOFT_SELECT}
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
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                      ▼
                    </span>
                  </div>
                </div>

                {/* State */}
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1 block">
                    State
                  </label>
                  <div className="relative">
                    <select
                      className={SOFT_SELECT}
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
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                      ▼
                    </span>
                  </div>
                </div>

                {/* District */}
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1 block">
                    District
                  </label>
                  <div className="relative">
                    <select
                      className={SOFT_SELECT}
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
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                      ▼
                    </span>
                  </div>
                </div>
              </div>

              {/* Line 2 */}
              <div className="mt-3 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                {/* Sort by */}
                <div className="flex items-end gap-2">
                  <div>
                    <label className="text-[11px] font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1 block">
                      Sort by
                    </label>
                    <div className="relative w-full md:w-[190px]">
                      <select
                        className={SOFT_SELECT}
                        value={sortField}
                        onChange={(e) => {
                          setSortField(e.target.value as any);
                          setBPage(1);
                        }}
                      >
                        <option value="name">Name</option>
                        <option value="code">Code</option>
                        <option value="projects">Projects</option>
                        <option value="mobile">Mobile</option>
                        <option value="email">Email</option>
                        <option value="state">State</option>
                        <option value="district">District</option>
                      </select>
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                        ▼
                      </span>
                    </div>
                  </div>

                  <button
                    className="h-9 w-9 rounded-full border border-[#c9ded3] dark:border-[#2b3c35] bg-white dark:bg-neutral-900/80 hover:bg-slate-50 dark:hover:bg-neutral-800 shadow-sm"
                    onClick={() => {
                      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                      setBPage(1);
                    }}
                    title={sortDir === "asc" ? "Ascending" : "Descending"}
                  >
                    <span className="text-xs text-slate-700 dark:text-neutral-100">
                      {sortDir === "asc" ? "▲" : "▼"}
                    </span>
                  </button>

                  <button className={PILL_BTN} onClick={clearFilters}>
                    Clear
                  </button>
                </div>

                {/* Rows per page */}
                <div className="md:justify-self-end md:w-[170px]">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1 block text-left md:text-right">
                    Rows per page
                  </label>
                  <div className="relative">
                    <select
                      className={SOFT_SELECT}
                      value={rowsPerPage}
                      onChange={(e) => {
                        setRowsPerPage(parseInt(e.target.value, 10));
                        setBPage(1);
                      }}
                    >
                      {[5, 10, 15, 20, 25].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                      ▼
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Table shell */}
            <div className="border border-[#c9ded3] dark:border-[#2b3c35] rounded-2xl overflow-hidden bg-white dark:bg-neutral-900">
              {browseErr ? (
                <div className="p-3 text-sm text-red-700 dark:text-red-400 border-b border-[#c9ded3] dark:border-[#2b3c35]">
                  {browseErr}
                </div>
              ) : null}

              <div className="overflow-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-[#f7fbf9] dark:bg-neutral-900/60">
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
                      ].map((h) => {
                        const sortable =
                          h.key !== "action" &&
                          ["code", "name", "projects", "mobile", "email", "state", "district"].includes(
                            h.key
                          );
                        const isActive = sortable && sortField === (h.key as any);
                        return (
                          <th
                            key={h.key}
                            className={
                              "px-3 py-2 border-b border-[#c9ded3] dark:border-[#2b3c35] text-left font-semibold text-gray-700 dark:text-neutral-100 whitespace-nowrap select-none " +
                              (sortable ? "cursor-pointer hover:text-slate-900 dark:hover:text-white" : "")
                            }
                            onClick={() => {
                              if (!sortable) return;
                              const key = h.key as any;
                              if (sortField === key) {
                                setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                              } else {
                                setSortField(key);
                                setSortDir("asc");
                              }
                              setBPage(1);
                            }}
                            title={sortable ? `Sort by ${h.label}` : undefined}
                          >
                            <div className="flex items-center gap-1">
                              <span>{h.label}</span>
                              {isActive ? (
                                <span className="text-[11px] text-slate-500">
                                  {sortDir === "asc" ? "▲" : "▼"}
                                </span>
                              ) : null}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>

                  <tbody>
                    {loadingBrowse ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-3 py-6 text-center text-sm text-slate-600 dark:text-slate-300"
                        >
                          Loading consultants...
                        </td>
                      </tr>
                    ) : browsePaged.rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-3 py-6 text-center text-sm text-slate-600 dark:text-slate-300"
                        >
                          No consultants found.
                        </td>
                      </tr>
                    ) : (
                      browsePaged.rows.map((u) => {
                        const isPicked = picked.has(u.userId);
                        return (
                          <tr
                            key={u.userId}
                            className="odd:bg-[#f7fbf9]/70
                        dark:odd:bg-neutral-900/40"
                          >
                            <td className="px-3 py-2 border-b border-[#c9ded3] dark:border-[#2b3c35] whitespace-nowrap">
                              <button
                                className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-[#c9ded3] dark:border-[#2b3c35] bg-white dark:bg-neutral-900/80 hover:bg-slate-50 dark:hover:bg-neutral-800 shadow-sm"
                                onClick={() => moveOne(u.userId)}
                                title={isPicked ? "Remove from selection" : "Move to selection"}
                              >
                                <span className="text-slate-700 dark:text-neutral-100">
                                  {isPicked ? "✓" : "↑"}
                                </span>
                              </button>
                            </td>
                            <td className="px-3 py-2 border-b border-[#c9ded3] dark:border-[#2b3c35] whitespace-nowrap">
                              {u.code || "—"}
                            </td>
                            <td className="px-3 py-2 border-b border-[#c9ded3] dark:border-[#2b3c35]">
                              <div className="font-medium text-slate-900 dark:text-white">
                                {fullName(u) || "—"}
                              </div>
                            </td>
                            <td className="px-3 py-2 border-b border-[#c9ded3] dark:border-[#2b3c35] whitespace-nowrap">
                              {u.projectCount ?? 0}
                            </td>
                            <td className="px-3 py-2 border-b border-[#c9ded3] dark:border-[#2b3c35] whitespace-nowrap">
                              {phonePretty(u)}
                            </td>
                            <td className="px-3 py-2 border-b border-[#c9ded3] dark:border-[#2b3c35] whitespace-nowrap">
                              {u.email || "—"}
                            </td>
                            <td className="px-3 py-2 border-b border-[#c9ded3] dark:border-[#2b3c35] whitespace-nowrap">
                              {u.state || "—"}
                            </td>
                            <td className="px-3 py-2 border-b border-[#c9ded3] dark:border-[#2b3c35] whitespace-nowrap">
                              {u.district || "—"}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* pagination */}
              <div className="flex items-center justify-between p-3">
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  Page {browsePaged.page} of {browsePaged.totalPages} · Showing{" "}
                  {browsePaged.rows.length} of {browseFiltered.length} consultants
                </div>

                <div className="flex items-center gap-2">
                  <button
                    className="h-8 px-3 rounded-full border border-[#c9ded3] dark:border-[#2b3c35] bg-white dark:bg-neutral-900/80 text-xs text-slate-700 dark:text-neutral-100 shadow-sm hover:bg-slate-50 dark:hover:bg-neutral-800 disabled:opacity-50"
                    disabled={browsePaged.page <= 1}
                    onClick={() => setBPage(1)}
                  >
                    « First
                  </button>
                  <button
                    className="h-8 px-3 rounded-full border border-[#c9ded3] dark:border-[#2b3c35] bg-white dark:bg-neutral-900/80 text-xs text-slate-700 dark:text-neutral-100 shadow-sm hover:bg-slate-50 dark:hover:bg-neutral-800 disabled:opacity-50"
                    disabled={browsePaged.page <= 1}
                    onClick={() => setBPage((p) => Math.max(1, p - 1))}
                  >
                    ‹ Prev
                  </button>
                  <button
                    className="h-8 px-3 rounded-full border border-[#c9ded3] dark:border-[#2b3c35] bg-white dark:bg-neutral-900/80 text-xs text-slate-700 dark:text-neutral-100 shadow-sm hover:bg-slate-50 dark:hover:bg-neutral-800 disabled:opacity-50"
                    disabled={browsePaged.page >= browsePaged.totalPages}
                    onClick={() =>
                      setBPage((p) => Math.min(browsePaged.totalPages, p + 1))
                    }
                  >
                    Next ›
                  </button>
                  <button
                    className="h-8 px-3 rounded-full border border-[#c9ded3] dark:border-[#2b3c35] bg-white dark:bg-neutral-900/80 text-xs text-slate-700 dark:text-neutral-100 shadow-sm hover:bg-slate-50 dark:hover:bg-neutral-800 disabled:opacity-50"
                    disabled={browsePaged.page >= browsePaged.totalPages}
                    onClick={() => setBPage(browsePaged.totalPages)}
                  >
                    Last »
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Tile: Consultant Assignments */}
      <section
        className={TILE_SHELL}
        aria-label="Tile: Consultant Assignments"
        data-tile-name="Consultant Assignments"
      >
        <TileHeader
          title="Consultant Assignments"
          subtitle="Current assignments for the selected project."
        />

        {!projectId ? (
          <div className="text-sm text-slate-600 dark:text-slate-300">
            Select a project to view assigned consultants.
          </div>
        ) : assignedErr ? (
          <div className="text-sm text-red-700 dark:text-red-400">{assignedErr}</div>
        ) : loadingAssigned ? (
          <div className="text-sm text-slate-600 dark:text-slate-300">
            Loading assigned consultants...
          </div>
        ) : assignedList.length === 0 ? (
          <div className="text-sm text-slate-600 dark:text-slate-300">
            No consultants assigned yet.
          </div>
        ) : (
          <>
            <div className="overflow-auto rounded-2xl border border-slate-200/80 dark:border-neutral-800">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-neutral-800">
                  <tr>
                    {[
                      { key: "action", label: "Action" },
                      { key: "code", label: "Code" },
                      { key: "name", label: "Name" },
                      { key: "company", label: "Company" },
                      { key: "validity", label: "Validity" },
                      { key: "updated", label: "Updated" },
                    ].map((h) => (
                      <th
                        key={h.key}
                        className="px-3 py-2 border-b border-slate-200 dark:border-neutral-700 text-left font-semibold text-gray-700 dark:text-neutral-100 whitespace-nowrap"
                      >
                        {h.label}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {assignedPaged.rows.map((m, idx) => {
                    const u = m.company ? null : null;
                    const nm = m.company?.name || "—";
                    const code = (m.company as any)?.code || "—";
                    const person = m.project?.title || projectTitle || "—";

                    return (
                      <tr
                        key={m.id || idx}
                        className="odd:bg-gray-50/50 dark:odd:bg-neutral-900/60"
                      >
                        <td className="px-3 py-2 border-b border-slate-200 dark:border-neutral-800 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <button
                              className={PILL_BTN}
                              onClick={() => openView(m)}
                            >
                              View
                            </button>
                            <button
                              className={PILL_BTN}
                              onClick={() => openEdit(m)}
                            >
                              Edit
                            </button>
                          </div>
                        </td>

                        <td className="px-3 py-2 border-b border-slate-200 dark:border-neutral-800 whitespace-nowrap">
                          {code}
                        </td>

                        <td className="px-3 py-2 border-b border-slate-200 dark:border-neutral-800">
                          <div className="font-medium text-slate-900 dark:text-white">
                            {person}
                          </div>
                        </td>

                        <td className="px-3 py-2 border-b border-slate-200 dark:border-neutral-800 whitespace-nowrap">
                          {nm}
                        </td>

                        <td className="px-3 py-2 border-b border-slate-200 dark:border-neutral-800 whitespace-nowrap">
                          <div className="text-xs text-slate-600 dark:text-slate-300">
                            From:{" "}
                            <span className="font-medium text-slate-900 dark:text-white">
                              {isoToYmd(m.validFrom) || "—"}
                            </span>
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-300">
                            To:{" "}
                            <span className="font-medium text-slate-900 dark:text-white">
                              {isoToYmd(m.validTo) || "—"}
                            </span>
                          </div>
                        </td>

                        <td className="px-3 py-2 border-b border-slate-200 dark:border-neutral-800 whitespace-nowrap">
                          <div className="text-xs text-slate-600 dark:text-slate-300">
                            {isoToYmd(m.updatedAt || m.createdAt) || "—"}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* assigned pagination */}
            <div className="flex items-center justify-between mt-3">
              <div className="text-xs text-slate-600 dark:text-slate-300">
                Page {assignedPaged.page} of {assignedPaged.totalPages} · Showing{" "}
                {assignedPaged.rows.length} of {assignedList.length} consultants
              </div>

              <div className="flex items-center gap-2">
                <button
                  className="h-8 px-3 rounded-full border border-[#c9ded3] dark:border-[#2b3c35] bg-white dark:bg-neutral-900/80 text-xs text-slate-700 dark:text-neutral-100 shadow-sm hover:bg-slate-50 dark:hover:bg-neutral-800 disabled:opacity-50"
                  disabled={assignedPaged.page <= 1}
                  onClick={() => setAPage(1)}
                >
                  « First
                </button>
                <button
                  className="h-8 px-3 rounded-full border border-[#c9ded3] dark:border-[#2b3c35] bg-white dark:bg-neutral-900/80 text-xs text-slate-700 dark:text-neutral-100 shadow-sm hover:bg-slate-50 dark:hover:bg-neutral-800 disabled:opacity-50"
                  disabled={assignedPaged.page <= 1}
                  onClick={() => setAPage((p) => Math.max(1, p - 1))}
                >
                  ‹ Prev
                </button>
                <button
                  className="h-8 px-3 rounded-full border border-[#c9ded3] dark:border-[#2b3c35] bg-white dark:bg-neutral-900/80 text-xs text-slate-700 dark:text-neutral-100 shadow-sm hover:bg-slate-50 dark:hover:bg-neutral-800 disabled:opacity-50"
                  disabled={assignedPaged.page >= assignedPaged.totalPages}
                  onClick={() =>
                    setAPage((p) => Math.min(assignedPaged.totalPages, p + 1))
                  }
                >
                  Next ›
                </button>
                <button
                  className="h-8 px-3 rounded-full border border-[#c9ded3] dark:border-[#2b3c35] bg-white dark:bg-neutral-900/80 text-xs text-slate-700 dark:text-neutral-100 shadow-sm hover:bg-slate-50 dark:hover:bg-neutral-800 disabled:opacity-50"
                  disabled={assignedPaged.page >= assignedPaged.totalPages}
                  onClick={() => setAPage(assignedPaged.totalPages)}
                >
                  Last »
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* View Modal */}
      {viewOpen && selectedMembership ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 shadow-lg p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-slate-900 dark:text-white">
                  View Assignment
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  Project:{" "}
                  <span className="font-medium">{projectTitle || "—"}</span>
                </div>
              </div>
              <button
                className="h-9 w-9 rounded-full border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:bg-slate-50 dark:hover:bg-neutral-800"
                onClick={closeModals}
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-slate-200/80 dark:border-neutral-800 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Validity
                </div>
                <div className="mt-1 text-sm text-slate-800 dark:text-neutral-100">
                  From:{" "}
                  <span className="font-medium">
                    {isoToYmd(selectedMembership.validFrom) || "—"}
                  </span>
                </div>
                <div className="text-sm text-slate-800 dark:text-neutral-100">
                  To:{" "}
                  <span className="font-medium">
                    {isoToYmd(selectedMembership.validTo) || "—"}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button className={PILL_BTN} onClick={closeModals}>
                Close
              </button>
              <button
                className={PILL_BTN}
                onClick={() => {
                  setViewOpen(false);
                  openEdit(selectedMembership);
                }}
              >
                Edit
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Edit Modal */}
      {editOpen && selectedMembership ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 shadow-lg p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-slate-900 dark:text-white">
                  Edit Assignment
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  Update assignment validity for{" "}
                  <span className="font-medium">{projectTitle || "—"}</span>
                </div>
              </div>
              <button
                className="h-9 w-9 rounded-full border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:bg-slate-50 dark:hover:bg-neutral-800"
                onClick={closeModals}
              >
                ✕
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400">
                  Valid from
                </div>
                <input
                  type="date"
                  className={SOFT_DATE}
                  value={editValidFrom}
                  onChange={(e) => setEditValidFrom(e.target.value)}
                />
              </div>
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400">
                  Valid to
                </div>
                <input
                  type="date"
                  className={SOFT_DATE}
                  value={editValidTo}
                  onChange={(e) => setEditValidTo(e.target.value)}
                />
              </div>
            </div>

            {pendingEditAlert ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-200">
                <div className="font-semibold">Remove assignment?</div>
                <div className="mt-1">
                  This will permanently remove this Consultant assignment from the
                  project.
                </div>

                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    className={PILL_BTN}
                    onClick={() => setPendingEditAlert(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="h-9 px-4 rounded-full bg-red-600 text-white text-xs sm:text-sm font-medium shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500/40"
                    onClick={onHardDeleteFromEdit}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex items-center justify-between gap-2">
              <button
                className="h-9 px-4 rounded-full border border-red-200 bg-white text-red-700 text-xs sm:text-sm shadow-sm hover:bg-red-50 dark:border-red-800/40 dark:bg-neutral-900 dark:text-red-200 dark:hover:bg-red-900/20"
                onClick={() => setPendingEditAlert(true)}
              >
                Remove Assignment
              </button>

              <div className="flex items-center gap-2">
                <button className={PILL_BTN} onClick={closeModals}>
                  Cancel
                </button>
                <button className={PILL_BTN_PRIMARY} onClick={onUpdateValidity}>
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Back */}
      <div className="mt-6">
        <button
          className={PILL_BTN}
          onClick={() => nav("/admin/assignments")}
        >
          ← Back to Assignments
        </button>
      </div>
    </div>
  );
}
