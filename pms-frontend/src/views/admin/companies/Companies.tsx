// pms-frontend/src/views/admin/companies/Companies.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../../api/client";

declare global {
  interface Window {
    __ADMIN_SUBTITLE__?: string;
  }
}

type DisplayRow = {
  action: string;
  companyCode: string;
  name: string;
  primarySpecialisation: string;
  district: string;
  state: string;
  status: string;
  updated: string;
  _id: string;
};

type RawCompany = any;

type StateRef = { stateId: string; name: string; code: string };
type DistrictRef = { districtId: string; name: string; stateId: string };

type ColKey = keyof DisplayRow;

const COLS: { key: ColKey; label: string }[] = [
  { key: "action", label: "Action" },
  { key: "companyCode", label: "Company Code" },
  { key: "name", label: "Company Name" },
  { key: "primarySpecialisation", label: "Primary Specialisation" },
  { key: "district", label: "District" },
  { key: "state", label: "State" },
  { key: "status", label: "Status" },
  { key: "updated", label: "Updated" },
];

const isIsoLike = (v: any) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v);

const fmtDate = (v: any) =>
  isIsoLike(v) ? new Date(v).toLocaleString() : v ?? "";

function formatCell(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "✓" : "✗";
  if (isIsoLike(v)) return new Date(v).toLocaleString();
  return String(v);
}

// --- UI helper: status pill color (match Users table) ---
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

function pickFirst(c: any, keys: string[]) {
  for (const k of keys) {
    const v = c?.[k];
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && !v.trim()) continue;
    return v;
  }
  return undefined;
}

function asName(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    return (
      v?.name ??
      v?.title ??
      v?.label ??
      v?.code ??
      (typeof v?.value === "string" ? v.value : "") ??
      ""
    );
  }
  return String(v);
}

function humanizeKey(k: string) {
  const s = String(k)
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : k;
}

function prettyValue(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return String(v);
  if (typeof v === "string")
    return isIsoLike(v) ? new Date(v).toLocaleString() : v;
  if (Array.isArray(v)) {
    if (v.length === 0) return "";
    const names = v
      .map((x) => {
        if (x === null || x === undefined) return "";
        if (typeof x === "string") return x;
        if (typeof x === "number" || typeof x === "boolean") return String(x);
        if (typeof x === "object") return x?.name ?? x?.title ?? x?.code ?? "";
        return "";
      })
      .filter(Boolean);

    if (names.length > 0) {
      const head = names.slice(0, 5).join(", ");
      return names.length > 5 ? `${head} +${names.length - 5} more` : head;
    }
    return `${v.length} item(s)`;
  }
  if (typeof v === "object") {
    const n = v?.name ?? v?.title ?? v?.label ?? v?.code;
    if (typeof n === "string" && n.trim()) return n;
    if (typeof v?.value === "string" && v.value.trim()) return v.value;
    // fallback (short)
    try {
      const s = JSON.stringify(v);
      return s.length > 180 ? s.slice(0, 180) + "…" : s;
    } catch {
      return String(v);
    }
  }
  return String(v);
}

export default function Companies() {
  const nav = useNavigate();
  const params = useParams<{ id?: string }>();
  const modalCompanyId = params.id || null;

  // --- data state ---
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<DisplayRow[]>([]);
  const [rawById, setRawById] = useState<Record<string, RawCompany>>({});

  // --- refs state ---
  const [statesRef, setStatesRef] = useState<StateRef[]>([]);
  const [districtsRef, setDistrictsRef] = useState<DistrictRef[]>([]);
  const [refsErr, setRefsErr] = useState<string | null>(null);

  // ---- Filters ----
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [specFilter, setSpecFilter] = useState<string>("");
  const [stateFilter, setStateFilter] = useState<string>("");
  const [districtFilter, setDistrictFilter] = useState<string>("");

  // --- debounced search ---
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setQDebounced(q), 250);
    return () => clearTimeout(id);
  }, [q]);

  // --- sort & pagination ---
  const [sortKey, setSortKey] = useState<ColKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // modal detail fetch state (no UI change, just data quality)
  const [modalDetailsLoading, setModalDetailsLoading] = useState(false);
  const [modalDetailsErr, setModalDetailsErr] = useState<string | null>(null);

  // --- Page title/subtitle ---
  useEffect(() => {
    document.title = "Trinity PMS — Companies";
    window.__ADMIN_SUBTITLE__ = "Browse all companies.";
    return () => {
      window.__ADMIN_SUBTITLE__ = "";
    };
  }, []);

  const getStateName = (c: any): string => {
    const direct = asName(c?.state);
    if (direct) return direct;

    const stateId = pickFirst(c, ["stateId", "state_id", "stateRefId"]);
    if (stateId && statesRef.length > 0) {
      const match = statesRef.find((s) => s.stateId === stateId);
      if (match?.name) return match.name;
    }

    const byName = pickFirst(c, ["stateName", "state_name"]);
    return typeof byName === "string" ? byName : "";
  };

  const getDistrictName = (c: any): string => {
    // common shapes
    const direct =
      asName(c?.district) ||
      asName(c?.districtRef) ||
      asName(c?.districtObj) ||
      asName(c?.address?.district);

    if (direct) return direct;

    const dn = pickFirst(c, ["districtName", "district_name"]);
    if (typeof dn === "string" && dn.trim()) return dn;

    const districtId =
      pickFirst(c, ["districtId", "district_id", "districtRefId"]) ||
      c?.district?.districtId ||
      c?.districtRef?.districtId;

    if (districtId && districtsRef.length > 0) {
      const match = districtsRef.find((d) => d.districtId === districtId);
      if (match?.name) return match.name;
    }

    // legacy "city" field (if backend still uses city)
    const city = pickFirst(c, ["city", "town"]);
    return typeof city === "string" ? city : "";
  };

  const getCompanyStatus = (c: any): string => {
    const s1 = pickFirst(c, ["companyStatus", "status"]);
    const sName = asName(s1);
    if (sName) return sName;

    // nested shapes
    const s2 = asName(
      c?.companyStatus?.name ?? c?.companyStatus?.label ?? c?.status?.name
    );
    if (s2) return s2;

    // boolean fallback
    const isActive = pickFirst(c, ["isActive", "active"]);
    if (typeof isActive === "boolean") return isActive ? "Active" : "Inactive";

    return "";
  };

  const buildRow = (c: any): DisplayRow => {
    return {
      action: "",
      companyCode: getCompanyCode(c) || c?.__uiCode || "",
      name: c?.name ?? "",
      primarySpecialisation: c?.companyRole ?? c?.primarySpecialisation ?? "",
      district: getDistrictName(c) ?? "",
      state: getStateName(c) ?? "",
      status: getCompanyStatus(c) ?? "",
      updated: c?.updatedAt ?? "",
      _id: c?.companyId,
    };
  };

  const loadRefs = async (districtsForStateName?: string) => {
    setRefsErr(null);

    // load states first
    const results = await Promise.allSettled([api.get("/admin/states")]);

    let statesList: StateRef[] = [];
    if (results[0].status === "fulfilled") {
      const sdata: any = results[0].value.data;
      statesList = Array.isArray(sdata) ? sdata : sdata?.states || [];
      setStatesRef(statesList);
    } else {
      const status = (results[0] as any)?.reason?.response?.status;
      setStatesRef([]);
      setRefsErr(
        status === 404
          ? "Not Found (showing discovered state names instead)"
          : (results[0] as any)?.reason?.response?.data?.error ||
              "Failed to load reference data."
      );
    }

    // load districts (optionally filtered by chosen state name)
    try {
      let stateId: string | undefined;
      if (districtsForStateName && statesList.length > 0) {
        const match = statesList.find(
          (s) => (s.name || "").trim() === districtsForStateName.trim()
        );
        stateId = match?.stateId;
      }
      const { data: dResp } = await api.get("/admin/districts", {
        params: stateId ? { stateId } : undefined,
      });
      const dlist = Array.isArray(dResp) ? dResp : dResp?.districts || [];
      setDistrictsRef(dlist);
    } catch {
      setDistrictsRef([]);
    }
  };

  const loadCompanies = async () => {
    setErr(null);
    setLoading(true);
    try {
      const { data } = await api.get("/admin/companies");
      const list: any[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.companies)
        ? data.companies
        : [];

      applyUiCodes(list);

      const rawMap: Record<string, RawCompany> = {};
      const normalized: DisplayRow[] = list.map((c) => {
        rawMap[c.companyId] = c;
        return buildRow(c);
      });

      setRawById(rawMap);
      setRows(normalized);
      setPage(1);
    } catch (e: any) {
      const s = e?.response?.status;
      const msg =
        s === 401
          ? "Unauthorized (401). Please sign in again."
          : e?.response?.data?.error ||
            e?.message ||
            "Failed to load companies.";
      setErr(msg);
      if (s === 401) {
        localStorage.removeItem("token");
        setTimeout(() => nav("/login", { replace: true }), 250);
      }
    } finally {
      setLoading(false);
    }
  };

  function getCompanyCode(c: any): string {
    const v =
      c?.code ??
      c?.companyCode ??
      c?.company_code ??
      c?.company?.code ??
      c?.company?.companyCode ??
      "";
    return typeof v === "string" ? v : "";
  }

  function rolePrefixFromCompany(c: any): string {
    const role = String(
      c?.companyRole ?? c?.primarySpecialisation ?? c?.role ?? ""
    ).trim();
    const cleaned = role.replace(/\s+/g, "");
    const pref = cleaned.slice(0, 3).toUpperCase();
    return pref || "COM";
  }

  function parseSerial(code: string, prefix: string): number | null {
    const re = new RegExp(`^${prefix}-?(\\d{1,})$`, "i");
    const m = String(code || "")
      .trim()
      .match(re);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) ? n : null;
  }

  // Adds __uiCode ONLY when backend code is missing
  function applyUiCodes(list: any[]) {
    const counters: Record<string, number> = {};

    // 1) First, seed counters using existing backend codes (if any)
    for (const c of list) {
      const prefix = rolePrefixFromCompany(c);
      const code = getCompanyCode(c);
      if (!code) continue;
      const sn = parseSerial(code, prefix);
      if (sn !== null) counters[prefix] = Math.max(counters[prefix] ?? 0, sn);
    }

    // 2) Then, assign missing codes in stable order
    const stable = [...list].sort((a, b) => {
      const at = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (at !== bt) return at - bt;
      const an = String(a?.name ?? "").localeCompare(String(b?.name ?? ""));
      if (an !== 0) return an;
      return String(a?.companyId ?? "").localeCompare(
        String(b?.companyId ?? "")
      );
    });

    for (const c of stable) {
      if (getCompanyCode(c)) continue; // backend already has it
      const prefix = rolePrefixFromCompany(c);
      counters[prefix] = (counters[prefix] ?? 0) + 1;
      c.__uiCode = `${prefix}-${String(counters[prefix]).padStart(4, "0")}`;
    }
  }

  // initial refs & companies
  useEffect(() => {
    loadRefs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    loadCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // reload districts when stateFilter changes
  useEffect(() => {
    loadRefs(stateFilter || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateFilter]);

  // when refs arrive, rebuild rows so district/state names resolve from ids
  useEffect(() => {
    const ids = Object.keys(rawById);
    if (ids.length === 0) return;
    setRows(ids.map((id) => buildRow(rawById[id])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statesRef, districtsRef]);

  // fetch full details when modal opens (if endpoint exists)
  useEffect(() => {
    if (!modalCompanyId) {
      setModalDetailsErr(null);
      setModalDetailsLoading(false);
      return;
    }

    let alive = true;
    (async () => {
      setModalDetailsErr(null);
      setModalDetailsLoading(true);
      try {
        const { data } = await api.get(`/admin/companies/${modalCompanyId}`);
        const full = data?.company ?? data;
        if (!alive || !full) return;

        setRawById((prev) => ({ ...prev, [modalCompanyId]: full }));
        // update the table row too (same UI, better data)
        setRows((prev) =>
          prev.map((r) => (r._id === modalCompanyId ? buildRow(full) : r))
        );
      } catch (e: any) {
        // non-blocking: keep existing modal data
        const status = e?.response?.status;
        if (status && status !== 404) {
          setModalDetailsErr(
            e?.response?.data?.error || "Failed to load full details."
          );
        } else {
          setModalDetailsErr(null);
        }
      } finally {
        if (alive) setModalDetailsLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalCompanyId]);

  const stateOptions = useMemo(() => {
    const names = statesRef.map((s) => s.name).filter(Boolean);
    if (names.length > 0)
      return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
    const fallback = new Set<string>();
    rows.forEach((r) => {
      if (r.state?.trim()) fallback.add(r.state.trim());
    });
    return Array.from(fallback).sort((a, b) => a.localeCompare(b));
  }, [statesRef, rows]);

  const districtOptions = useMemo(() => {
    // prefer ref list (best coverage)
    const names = new Set<string>();
    if (districtsRef.length > 0) {
      districtsRef.forEach((d) => {
        const n = (d?.name || "").trim();
        if (n) names.add(n);
      });
    } else {
      rows.forEach((r) => {
        const n = (r.district || "").trim();
        if (n) names.add(n);
      });
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [districtsRef, rows]);

  const statusOptions = useMemo(() => {
    const s = new Set<string>();
    // use rows (already normalized) for dropdown
    rows.forEach((r) => {
      const v = (r.status ?? "").toString().trim();
      if (v) s.add(v);
    });

    // If still empty, try to infer from rawById (boolean flags etc.)
    if (s.size === 0) {
      Object.values(rawById).forEach((c: any) => {
        const v = getCompanyStatus(c);
        if (v) s.add(v);
      });
    }

    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [rows, rawById]);

  const specOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => {
      const v = (r.primarySpecialisation ?? "").toString().trim();
      if (v) s.add(v);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredByControls = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== "all") {
        const v = String(r.status ?? "").toLowerCase();
        if (v !== statusFilter.toLowerCase()) return false;
      }
      if (specFilter && r.primarySpecialisation.trim() !== specFilter.trim())
        return false;
      if (stateFilter && r.state.trim() !== stateFilter.trim()) return false;
      if (districtFilter && r.district.trim() !== districtFilter.trim())
        return false;
      return true;
    });
  }, [rows, statusFilter, specFilter, stateFilter, districtFilter]);

  const filtered = useMemo(() => {
    const needle = qDebounced.trim().toLowerCase();
    if (!needle) return filteredByControls;
    return filteredByControls.filter((r) =>
      Object.values(r).some((v) =>
        String(v ?? "")
          .toLowerCase()
          .includes(needle)
      )
    );
  }, [filteredByControls, qDebounced]);

  const cmp = (a: any, b: any) => {
    if (a === b) return 0;
    if (a === null || a === undefined) return -1;
    if (b === null || b === undefined) return 1;
    const aTime =
      typeof a === "string" && isIsoLike(a) ? new Date(a).getTime() : NaN;
    const bTime =
      typeof b === "string" && isIsoLike(b) ? new Date(b).getTime() : NaN;
    if (!Number.isNaN(aTime) && !Number.isNaN(bTime)) return aTime - bTime;
    const an = Number(a);
    const bn = Number(b);
    if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
    return String(a).localeCompare(String(b));
  };

  const sorted = useMemo(() => {
    if (!sortKey || sortKey === "action") return filtered;
    const copy = [...filtered];
    copy.sort((ra, rb) => {
      const delta = cmp((ra as any)[sortKey], (rb as any)[sortKey]);
      return sortDir === "asc" ? delta : -delta;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageSafe = Math.min(Math.max(1, page), totalPages);

  const paged = useMemo(() => {
    const start = (pageSafe - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, pageSafe, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPages]);

  const onView = (id: string) => nav(`/admin/companies/${id}`);
  const onEdit = (id: string) => nav(`/admin/companies/${id}/edit`);

  const exportCsv = () => {
    const cols = COLS.map((h) => h.label);
    const lines = [
      cols.join(","),
      ...sorted.map((r) =>
        COLS.map((h) =>
          JSON.stringify(h.key === "action" ? "" : (r as any)[h.key] ?? "")
        ).join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "companies.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedRaw: RawCompany | null = modalCompanyId
    ? rawById[modalCompanyId] ?? null
    : null;

  // Build categorized details (same UI grid, but grouped & deduped)
  const modalSections = useMemo(() => {
    if (!selectedRaw) return null;
    const c = selectedRaw;

    const code = getCompanyCode(c) || c?.__uiCode || "";
    const companyId = pickFirst(c, ["companyId", "id"]);
    const name = pickFirst(c, ["name", "companyName"]);
    const role = pickFirst(c, ["companyRole", "primarySpecialisation", "role"]);
    const status = getCompanyStatus(c);
    const district = getDistrictName(c);
    const state = getStateName(c);

    const address = pickFirst(c, [
      "address",
      "fullAddress",
      "registeredAddress",
    ]);
    const pin = pickFirst(c, ["pin", "pincode", "postalCode", "zip"]);
    const city = pickFirst(c, ["city", "town"]);

    const contactEmail = pickFirst(c, [
      "contactEmail",
      "email",
      "emailId",
      "emailID",
    ]);
    const contactMobile = pickFirst(c, [
      "contactMobile",
      "mobile",
      "phone",
      "contactPhone",
    ]);
    const primaryContact = pickFirst(c, [
      "primaryContact",
      "contactPerson",
      "pocName",
      "contactName",
    ]);

    const gstin = pickFirst(c, ["gstin", "gst", "gstNumber"]);
    const website = pickFirst(c, ["website", "webSite", "url"]);

    const createdAt = pickFirst(c, ["createdAt", "created"]);
    const updatedAt = pickFirst(c, ["updatedAt", "updated"]);

    const sections: Array<{
      title: string;
      fields: Array<{ label: string; value: any; full?: boolean }>;
    }> = [
      {
        title: "Basic",
        fields: [
          { label: "Company Name", value: name ?? "" },
          { label: "Company Code", value: code ?? "" },
          { label: "Primary Specialisation", value: role ?? "" },
          { label: "Status", value: status ?? "" },
          { label: "Company ID", value: companyId ?? "" },
        ],
      },
      {
        title: "Location",
        fields: [
          { label: "District", value: district ?? "" },
          { label: "State", value: state ?? "" },
          ...(city ? [{ label: "City", value: city }] : []),
          ...(address
            ? [{ label: "Address", value: address, full: true }]
            : []),
          ...(pin ? [{ label: "PIN", value: pin }] : []),
        ],
      },
      {
        title: "Contacts",
        fields: [
          ...(primaryContact
            ? [{ label: "Primary Contact", value: primaryContact }]
            : []),
          ...(contactEmail
            ? [{ label: "Contact Email", value: contactEmail }]
            : []),
          ...(contactMobile
            ? [{ label: "Contact Mobile", value: contactMobile }]
            : []),
        ],
      },
      {
        title: "Business",
        fields: [
          ...(gstin ? [{ label: "GSTIN", value: gstin }] : []),
          ...(website ? [{ label: "Website", value: website }] : []),
        ],
      },
      {
        title: "Dates",
        fields: [
          { label: "Created", value: createdAt ?? "" },
          { label: "Updated", value: updatedAt ?? "" },
        ],
      },
    ];

    // Keys already represented above -> don't duplicate them in "Other"
    const usedKeys = new Set<string>([
      "code",
      "companyCode",
      "company_code",
      "__uiCode",
      "companyId",
      "id",
      "name",
      "companyName",
      "companyRole",
      "primarySpecialisation",
      "role",
      "district",
      "districtId",
      "districtName",
      "city",
      "town",
      "address",
      "fullAddress",
      "registeredAddress",
      "pin",
      "pincode",
      "postalCode",
      "zip",
      "state",
      "stateId",
      "companyStatus",
      "status",
      "isActive",
      "active",
      "contactEmail",
      "email",
      "emailId",
      "emailID",
      "contactMobile",
      "mobile",
      "phone",
      "contactPhone",
      "primaryContact",
      "contactPerson",
      "pocName",
      "contactName",
      "gstin",
      "gst",
      "gstNumber",
      "website",
      "webSite",
      "url",
      "createdAt",
      "created",
      "updatedAt",
      "updated",
    ]);

    const deny = new Set<string>([
      "password",
      "token",
      "accessToken",
      "refreshToken",
      "otp",
      "secret",
      "__v",
    ]);

    const other: Array<{ label: string; value: any; full?: boolean }> = [];
    Object.keys(c || {}).forEach((k) => {
      if (usedKeys.has(k) || deny.has(k)) return;
      const v = c[k];
      if (v === null || v === undefined) return;
      if (typeof v === "string" && !v.trim()) return;

      const isPrimitive =
        typeof v === "string" ||
        typeof v === "number" ||
        typeof v === "boolean";
      const isIso = typeof v === "string" && isIsoLike(v);
      const isArr = Array.isArray(v);
      const isObj =
        typeof v === "object" &&
        !Array.isArray(v) &&
        (v?.name || v?.title || v?.code || v?.label);

      if (!(isPrimitive || isIso || isArr || isObj)) return;

      other.push({ label: humanizeKey(k), value: v });
    });

    other.sort((a, b) => a.label.localeCompare(b.label));
    if (other.length) sections.push({ title: "Other", fields: other });

    // keep only sections that have at least 1 non-empty field
    const cleaned = sections
      .map((s) => ({
        ...s,
        fields: s.fields.filter(
          (f) => String(prettyValue(f.value) ?? "").trim() !== ""
        ),
      }))
      .filter((s) => s.fields.length > 0);

    return cleaned;
  }, [selectedRaw, statesRef, districtsRef]);

  const closeModal = () => nav("/admin/companies", { replace: true });

  const filtersAreDefault =
    statusFilter === "all" && !specFilter && !stateFilter && !districtFilter;

  /* ========================= UI tokens (existing) ========================= */
  const ctl =
    "h-8 rounded-full border px-3 text-[11px] font-semibold shadow-sm transition " +
    "focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-neutral-950 active:scale-[0.98]";
  const ctlLight =
    "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 " +
    "dark:border-white/10 dark:bg-neutral-950 dark:text-slate-200 dark:hover:bg-white/5";
  const btnPrimary =
    "bg-[#00379C] text-white hover:brightness-110 border-transparent focus:ring-[#00379C]/35";
  const btnTeal =
    "bg-[#23A192] text-white hover:brightness-110 border-transparent focus:ring-[#23A192]/35";

  return (
    <div className="w-full">
      <div className="mx-auto max-w-6xl">
        {/* Controls (kept as-is) */}
        <div className="mb-4">
          <div className="flex flex-col gap-3 mt-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
              <div className="lg:basis-3/5 lg:pr-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className={`${ctl} ${ctlLight}`}
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value);
                      setPage(1);
                    }}
                    title="Filter by Status"
                  >
                    <option value="all">Status: All</option>
                    {statusOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>

                  <select
                    className={`${ctl} ${ctlLight}`}
                    value={specFilter}
                    onChange={(e) => {
                      setSpecFilter(e.target.value);
                      setPage(1);
                    }}
                    title="Filter by Specialisation"
                  >
                    <option value="">Contract: All</option>
                    {specOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>

                  <select
                    className={`${ctl} ${ctlLight}`}
                    value={stateFilter}
                    onChange={(e) => {
                      setStateFilter(e.target.value);
                      setPage(1);
                      // when state changes, reset district filter to avoid mismatch
                      setDistrictFilter("");
                    }}
                    title="Filter by State"
                  >
                    <option value="">State: All</option>
                    {stateOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>

                  <select
                    className={`${ctl} ${ctlLight}`}
                    value={districtFilter}
                    onChange={(e) => {
                      setDistrictFilter(e.target.value);
                      setPage(1);
                    }}
                    title="Filter by District"
                  >
                    <option value="">District: All</option>
                    {districtOptions.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    className={`${ctl} ${ctlLight}`}
                    title="Clear all filters"
                    onClick={() => {
                      setStatusFilter("all");
                      setSpecFilter("");
                      setStateFilter("");
                      setDistrictFilter("");
                      setPage(1);
                    }}
                    disabled={filtersAreDefault}
                  >
                    Clear
                  </button>

                  {refsErr ? (
                    <span className="ml-1 text-xs text-amber-700 dark:text-amber-300">
                      {refsErr}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="lg:basis-2/5 lg:pl-3">
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 lg:justify-end">
                  <select
                    className={`${ctl} ${ctlLight}`}
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    title="Rows per page"
                  >
                    {[10, 20, 50, 100].map((n) => (
                      <option key={n} value={n}>
                        {n} / page
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => {
                      loadRefs(stateFilter || undefined);
                      loadCompanies();
                    }}
                    className={`${ctl} ${btnTeal}`}
                    disabled={loading}
                    title="Refresh"
                    type="button"
                  >
                    Refresh
                  </button>

                  <button
                    onClick={() => nav("/admin/companies/new")}
                    className={`${ctl} ${btnPrimary}`}
                    title="Create a new company"
                    type="button"
                  >
                    + New Company
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="w-full sm:w-[360px]">
                <input
                  className={
                    "h-8 w-full rounded-full border border-slate-200 bg-white px-4 text-[12px] text-slate-800 placeholder:text-slate-400 shadow-sm " +
                    "focus:outline-none focus:ring-2 focus:ring-[#00379C]/30 focus:border-transparent " +
                    "dark:border-white/10 dark:bg-neutral-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:ring-[#FCC020]/25"
                  }
                  placeholder="Search..."
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(1);
                  }}
                />
              </div>

              <div className="flex items-center justify-end">
                <button
                  onClick={exportCsv}
                  className={`${ctl} ${ctlLight}`}
                  title="Export filtered result as CSV"
                  type="button"
                >
                  Export CSV
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-white/10 dark:bg-neutral-950">
          {err && (
            <div className="p-4 text-sm text-rose-700 dark:text-rose-300 border-b border-slate-200 dark:border-white/10">
              {err}
            </div>
          )}

          <div
            className="overflow-auto thin-scrollbar"
            style={{ maxHeight: "65vh" }}
          >
            {loading ? (
              <div className="p-6 text-sm text-slate-600 dark:text-slate-300">
                Fetching companies…
              </div>
            ) : rows.length === 0 ? (
              <div className="p-6 text-sm text-slate-600 dark:text-slate-300">
                No companies found.
              </div>
            ) : (
              <table className="min-w-full border-separate border-spacing-0 text-[13px]">
                <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur dark:bg-neutral-950/95">
                  <tr>
                    {COLS.map(({ key, label }) => {
                      const active = sortKey === key;
                      const dir = active ? sortDir : undefined;
                      const sortable = key !== "action";
                      return (
                        <th
                          key={key}
                          className={
                            "text-left font-extrabold text-[11px] uppercase tracking-wide " +
                            "text-slate-600 dark:text-slate-200 " +
                            "px-3 py-2.5 border-b border-slate-200 dark:border-white/10 whitespace-nowrap select-none " +
                            (sortable ? "cursor-pointer" : "")
                          }
                          title={sortable ? `Sort by ${label}` : undefined}
                          onClick={() => {
                            if (!sortable) return;
                            if (sortKey !== key) {
                              setSortKey(key);
                              setSortDir("asc");
                            } else {
                              setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                            }
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
                  {paged.map((row, idx) => (
                    <tr
                      key={row._id ?? idx}
                      className="border-b border-slate-100/80 dark:border-white/5 hover:bg-[#00379C]/[0.03] dark:hover:bg-white/[0.03]"
                    >
                      {COLS.map(({ key }) => {
                        if (key === "action") {
                          return (
                            <td
                              key={`${row._id}-action`}
                              className="px-2 py-1.5 whitespace-nowrap align-middle"
                            >
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#23A192] hover:bg-[#23A192]/10 active:scale-[0.98] dark:hover:bg-[#23A192]/15"
                                  onClick={() => onView(row._id)}
                                  title="View company"
                                  aria-label="View company"
                                >
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
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#00379C] hover:bg-[#00379C]/10 active:scale-[0.98] dark:hover:bg-[#00379C]/15"
                                  onClick={() => onEdit(row._id)}
                                  title="Edit company"
                                  aria-label="Edit company"
                                >
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
                          );
                        }

                        const value = (row as any)[key];

                        if (key === "status") {
                          const v = String(value ?? "").trim();
                          return (
                            <td
                              key={`${row._id}-${key}`}
                              className="px-3 py-1.5 whitespace-nowrap align-middle"
                              title={v}
                            >
                              {v ? (
                                <span
                                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(
                                    v
                                  )}`}
                                >
                                  {v}
                                </span>
                              ) : (
                                ""
                              )}
                            </td>
                          );
                        }

                        const cell = formatCell(value);

                        return (
                          <td
                            key={`${row._id}-${key}`}
                            className={
                              "px-3 py-1.5 whitespace-nowrap align-middle" +
                              (key === "companyCode" || key === "name"
                                ? " text-slate-800 dark:text-slate-100"
                                : "")
                            }
                            title={cell}
                          >
                            {cell}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination footer */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 py-2 text-sm border-t border-slate-200 dark:border-white/10">
            <div className="text-slate-600 dark:text-slate-300">
              Page <b>{pageSafe}</b> of <b>{totalPages}</b> · Showing{" "}
              <b>{paged.length}</b> of <b>{total}</b> records
            </div>

            <div className="flex flex-wrap items-center gap-1 justify-end">
              <button
                className={`${ctl} ${ctlLight} disabled:opacity-50`}
                onClick={() => setPage(1)}
                disabled={pageSafe <= 1}
                title="First"
              >
                « First
              </button>
              <button
                className={`${ctl} ${ctlLight} disabled:opacity-50`}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pageSafe <= 1}
                title="Previous"
              >
                ‹ Prev
              </button>
              <button
                className={`${ctl} ${ctlLight} disabled:opacity-50`}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={pageSafe >= totalPages}
                title="Next"
              >
                Next ›
              </button>
              <button
                className={`${ctl} ${ctlLight} disabled:opacity-50`}
                onClick={() => setPage(totalPages)}
                disabled={pageSafe >= totalPages}
                title="Last"
              >
                Last »
              </button>
            </div>
          </div>
        </div>

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

        {/* -------- View Modal (same UI, more details) -------- */}
        {modalSections && (
          <div className="fixed inset-0 z-40">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={closeModal}
              aria-hidden="true"
            />
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden dark:border-white/10 dark:bg-neutral-950">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/10">
                  <div className="flex flex-col">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                        {asName(selectedRaw?.name) || "Company details"}
                      </h3>

                      {getCompanyCode(selectedRaw) || selectedRaw?.__uiCode ? (
                        <span className="text-xs px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200">
                          {getCompanyCode(selectedRaw) || selectedRaw?.__uiCode}
                        </span>
                      ) : null}

                      {getCompanyStatus(selectedRaw) ? (
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full border ${statusBadgeClass(
                            getCompanyStatus(selectedRaw)
                          )}`}
                        >
                          {getCompanyStatus(selectedRaw)}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 h-1 w-10 rounded-full bg-[#FCC020]" />
                  </div>

                  <button className={`${ctl} ${ctlLight}`} onClick={closeModal}>
                    Close
                  </button>
                </div>

                <div className="px-4 pt-3">
                  {modalDetailsLoading ? (
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Loading details…
                    </div>
                  ) : null}
                  {modalDetailsErr ? (
                    <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                      {modalDetailsErr}
                    </div>
                  ) : null}
                </div>

                <div className="p-4 max-h-[70vh] overflow-auto thin-scrollbar">
                  <div className="space-y-4">
                    {modalSections.map((sec) => (
                      <div
                        key={sec.title}
                        className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4
                 dark:border-white/10 dark:bg-neutral-950"
                      >
                        <div className="mb-3 flex items-center gap-2">
                          <div className="h-1 w-4 rounded-full bg-[#FCC020]" />
                          <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-700 dark:text-slate-200">
                            {sec.title}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                          {sec.fields.map((f, i) => (
                            <div
                              key={`${sec.title}-${f.label}-${i}`}
                              className={f.full ? "sm:col-span-2" : ""}
                            >
                              <Field
                                label={f.label}
                                value={prettyValue(f.value)}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="px-4 py-3 border-t border-slate-200 dark:border-white/10 text-right">
                  <button
                    className={`${ctl} bg-[#FCC020] text-slate-900 hover:brightness-105 border-transparent focus:ring-[#FCC020]/40`}
                    onClick={closeModal}
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex flex-col">
      <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-0.5 font-medium dark:text-white break-words">
        {value || ""}
      </div>
    </div>
  );
}
