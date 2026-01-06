// src/views/admin/audit/Audit.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";

/* ---------- helpers (keep logic same) ---------- */
function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
    return JSON.parse(atob(b64 + pad));
  } catch {
    return null;
  }
}

const isIsoLike = (v: any) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v);

const fmtDate = (v: any) =>
  isIsoLike(v)
    ? new Date(v).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
    : v ?? "";

// Format to YYYY-MM-DD in IST
const toISTDateOnly = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

// Recursively convert only validFrom / validTo to IST date-only
function mapValidDatesOnly(value: any): any {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(mapValidDatesOnly);
  if (typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) {
      if ((k === "validFrom" || k === "validTo") && isIsoLike(v)) {
        out[k] = toISTDateOnly(v as string);
      } else {
        out[k] = mapValidDatesOnly(v);
      }
    }
    return out;
  }
  return value;
}

const shortId = (v?: string | null) =>
  v && v.length > 12 ? `${v.slice(0, 8)}…${v.slice(-4)}` : v || "—";

const firstTruthy = (...vals: any[]) => vals.find((x) => !!x);

/* ---------- types (keep same) ---------- */
type AuditRow = {
  id: string;
  createdAt: string;
  action: string;
  actorUserId: string | null;
  actorName: string | null;
  targetUserId: string | null;
  ip: string | null;
  userAgent: string | null;
  before: any | null;
  after: any | null;
  role?: string | null;
  scopeType?: string | null;
  companyId?: string | null;
  projectId?: string | null;

  // optional enriched labels returned by API
  targetName?: string | null;
  projectTitle?: string | null;
  projectCode?: string | null;
  companyName?: string | null;
};

type AuditConfig = {
  enabled: boolean;
};

const cols = ["Time", "Actor", "Action", "Target", "Project", "Company", "Diff"] as const;

export default function Audit() {
  const nav = useNavigate();

  // auth gate (only super admin)
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      nav("/login", { replace: true });
      return;
    }
    const payload = decodeJwtPayload(token);
    if (!payload?.isSuperAdmin) nav("/landing", { replace: true });
  }, [nav]);

  // Set page header in AdminHome bar
  useEffect(() => {
    document.title = "Trinity PMS — Audit";
    (window as any).__ADMIN_SUBTITLE__ =
      "System-wide audit logs. Only SuperAdmins can view and manage.";
    return () => {
      (window as any).__ADMIN_SUBTITLE__ = "";
    };
  }, []);

  const [cfg, setCfg] = useState<AuditConfig | null>(null);
  const [cfgLoading, setCfgLoading] = useState(false);
  const [cfgErr, setCfgErr] = useState<string | null>(null);

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // filters / pagination
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setQDebounced(q), 300);
    return () => clearTimeout(id);
  }, [q]);

  const [action, setAction] = useState<string>("");
  const [targetUserId, setTargetUserId] = useState<string>("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const skip = (page - 1) * pageSize;

  // modal
  const [openId, setOpenId] = useState<string | null>(null);
  const selected = useMemo(
    () => rows.find((r) => r.id === openId) || null,
    [rows, openId]
  );

  // load config
  const loadConfig = async () => {
    setCfgLoading(true);
    setCfgErr(null);
    try {
      const { data } = await api.get("/admin/audit/settings"); // { ok, settings }
      const s = data?.settings || null;
      setCfg({ enabled: !!s?.assignmentsEnabled });
    } catch (e: any) {
      setCfgErr(
        e?.response?.data?.error || e?.message || "Failed to load audit config."
      );
      setCfg(null);
    } finally {
      setCfgLoading(false);
    }
  };

  // toggle config
  const toggleEnabled = async () => {
    if (!cfg) return;
    const next = !cfg.enabled;
    setCfg({ ...cfg, enabled: next });
    try {
      await api.put("/admin/audit/settings", { assignmentsEnabled: next });
      await loadConfig();
    } catch (e: any) {
      // revert on error
      setCfg({ ...cfg, enabled: !next });
      alert(
        e?.response?.data?.error ||
          e?.message ||
          "Failed to update audit config."
      );
    }
  };

  // load logs (server-side paging)
  const loadLogs = async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data } = await api.get("/admin/audit/logs", {
        params: {
          skip: String(skip),
          take: String(pageSize),
          q: qDebounced || undefined,
          action: action || undefined,
          targetUserId: targetUserId || undefined,
        },
      });
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setTotal(Number.isFinite(data?.total) ? data.total : 0);
    } catch (e: any) {
      setErr(
        e?.response?.data?.error || e?.message || "Failed to load audit logs."
      );
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
    // eslint-disable-next-line
  }, []);
  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line
  }, [qDebounced, action, targetUserId, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // render helpers
  const renderTargetName = (r: AuditRow) => {
    const name =
      firstTruthy(
        r.targetName,
        r.after?.userName,
        r.before?.userName,
        r.after?.targetName,
        r.before?.targetName
      ) || null;

    if (name) return <span>{name}</span>;
    const uuid = r.targetUserId || "";
    return (
      <span className="font-mono text-xs" title={uuid}>
        {shortId(uuid)}
      </span>
    );
  };

  const renderProject = (r: AuditRow) => {
    const title =
      firstTruthy(r.projectTitle, r.after?.projectTitle, r.before?.projectTitle) ||
      null;
    const code =
      firstTruthy(r.projectCode, r.after?.projectCode, r.before?.projectCode) ||
      null;
    const label = title ? (code ? `${title} (${code})` : title) : null;

    const id = r.projectId || r.after?.projectId || r.before?.projectId || "";
    if (label) return <span title={id || undefined}>{label}</span>;
    return (
      <span className="font-mono text-xs" title={id || undefined}>
        {id ? shortId(id) : "—"}
      </span>
    );
  };

  const renderCompany = (r: AuditRow) => {
    const label =
      firstTruthy(r.companyName, r.after?.companyName, r.before?.companyName) ||
      null;
    const id = r.companyId || r.after?.companyId || r.before?.companyId || "";
    if (label) return <span title={id || undefined}>{label}</span>;
    return (
      <span className="font-mono text-xs" title={id || undefined}>
        {id ? shortId(id) : "—"}
      </span>
    );
  };

  const clearFilters = () => {
    setQ("");
    setAction("");
    setTargetUserId("");
    setPage(1);
  };

  const refresh = () => {
    loadLogs();
    loadConfig();
  };

  const filtersAreDefault = !q && !action && !targetUserId;

  /* ========================= UI tokens (match Users/Companies) ========================= */
  const pill =
    "h-8 rounded-full border px-3 text-[11px] font-semibold shadow-sm transition " +
    "focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-neutral-950 active:scale-[0.98]";
  const pillLight =
    "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 " +
    "dark:border-white/10 dark:bg-neutral-950 dark:text-slate-200 dark:hover:bg-white/5";
  const pillPrimary =
    "bg-[#00379C] text-white hover:brightness-110 border-transparent focus:ring-[#00379C]/35";
  const pillTeal =
    "bg-[#23A192] text-white hover:brightness-110 border-transparent focus:ring-[#23A192]/35";

  const thClass =
    "text-left font-extrabold text-[11px] uppercase tracking-wide " +
    "text-slate-600 dark:text-slate-200 " +
    "px-3 py-2.5 border-b border-slate-200 dark:border-white/10 whitespace-nowrap select-none";

  const tdClass =
    "px-3 py-2 whitespace-nowrap align-middle text-slate-800 dark:text-slate-100 border-b border-slate-100/80 dark:border-white/5";

  return (
    <div className="w-full">
      <div className="mx-auto max-w-6xl">
        {/* Config warning (kept, just styled) */}
        {cfgErr ? (
          <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-700/40 dark:bg-amber-900/10 dark:text-amber-200">
            {cfgErr}
          </div>
        ) : null}

        {/* Top controls (same pattern as Users page) */}
        <div className="mb-4">
          <div className="flex flex-col gap-3 mt-4">
            {/* Row 1: LEFT (3/5) filters + RIGHT (2/5) actions */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
              {/* LEFT 3/5 */}
              <div className="lg:basis-3/5 lg:pr-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className={
                      "h-8 w-[220px] rounded-full border border-slate-200 bg-white px-4 text-[12px] text-slate-800 placeholder:text-slate-400 shadow-sm " +
                      "focus:outline-none focus:ring-2 focus:ring-[#00379C]/30 focus:border-transparent " +
                      "dark:border-white/10 dark:bg-neutral-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:ring-[#FCC020]/25"
                    }
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Search: name, ip, UA, UUID…"
                    title="Search"
                  />

                  <input
                    className={
                      "h-8 w-[220px] rounded-full border border-slate-200 bg-white px-4 text-[12px] text-slate-800 placeholder:text-slate-400 shadow-sm " +
                      "focus:outline-none focus:ring-2 focus:ring-[#00379C]/30 focus:border-transparent " +
                      "dark:border-white/10 dark:bg-neutral-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:ring-[#FCC020]/25"
                    }
                    value={targetUserId}
                    onChange={(e) => {
                      setTargetUserId(e.target.value.trim());
                      setPage(1);
                    }}
                    placeholder="Target User UUID"
                    title="Target User UUID"
                  />

                  <select
                    className={`${pill} ${pillLight}`}
                    value={action}
                    onChange={(e) => {
                      setAction(e.target.value);
                      setPage(1);
                    }}
                    title="Action"
                  >
                    <option value="">Action: All</option>
                    <option value="AssignAdded">AssignAdded</option>
                    <option value="AssignRemoved">AssignRemoved</option>
                    <option value="AssignReplaced">AssignReplaced</option>
                  </select>

                  <button
                    type="button"
                    onClick={clearFilters}
                    className={`${pill} ${pillLight}`}
                    disabled={filtersAreDefault}
                    title="Clear filters"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* RIGHT 2/5 */}
              <div className="lg:basis-2/5 lg:pl-3">
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 lg:justify-end">
                  <select
                    className={`${pill} ${pillLight}`}
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
                    onClick={refresh}
                    type="button"
                    className={`${pill} ${pillTeal}`}
                    disabled={loading || cfgLoading}
                    title="Reload config and logs"
                  >
                    {loading || cfgLoading ? "Loading…" : "Refresh"}
                  </button>

                  {/* Toggle (styled to match palette) */}
                  <div
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm
                               dark:border-white/10 dark:bg-neutral-950"
                    title="Enable/Disable audit logging"
                  >
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                      Audit
                    </span>

                    <button
                      onClick={toggleEnabled}
                      disabled={cfgLoading || !cfg}
                      className={`relative inline-flex h-5 w-10 items-center rounded-full border transition
                        ${
                          cfg?.enabled
                            ? "border-[#FCC020]/80 bg-[#FCC020]"
                            : "border-slate-300 bg-slate-300 dark:border-white/15 dark:bg-white/15"
                        }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition
                          ${cfg?.enabled ? "translate-x-5" : "translate-x-1"}`}
                      />
                    </button>

                    <span
                      className={`text-[11px] font-semibold ${
                        cfg?.enabled
                          ? "text-slate-900 dark:text-slate-900"
                          : "text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      {cfg?.enabled ? "On" : "Off"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-white/10 dark:bg-neutral-950">
          {err && (
            <div className="p-4 text-sm text-rose-700 dark:text-rose-300 border-b border-slate-200 dark:border-white/10">
              {err}
            </div>
          )}

          <div className="overflow-auto thin-scrollbar" style={{ maxHeight: "65vh" }}>
            {loading ? (
              <div className="p-6 text-sm text-slate-600 dark:text-slate-300">
                Fetching audit logs…
              </div>
            ) : rows.length === 0 ? (
              <div className="p-6 text-sm text-slate-600 dark:text-slate-300">
                No logs.
              </div>
            ) : (
              <table className="min-w-full border-separate border-spacing-0 text-[13px]">
                <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur dark:bg-neutral-950/95">
                  <tr>
                    {cols.map((c) => (
                      <th key={c} className={thClass}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="hover:bg-[#00379C]/[0.03] dark:hover:bg-white/[0.03]"
                    >
                      <td className={tdClass} title={fmtDate(r.createdAt)}>
                        {fmtDate(r.createdAt)}
                      </td>
                      <td className={tdClass} title={r.actorUserId || undefined}>
                        {r.actorName || "—"}
                      </td>
                      <td className={tdClass}>{r.action}</td>
                      <td className={tdClass}>{renderTargetName(r)}</td>
                      <td className={tdClass}>{renderProject(r)}</td>
                      <td className={tdClass}>{renderCompany(r)}</td>
                      <td className={tdClass}>
                        {r.before || r.after ? (
                          <button
                            className={`${pill} ${pillLight} h-7 px-2.5 text-[11px]`}
                            onClick={() => setOpenId(r.id)}
                            type="button"
                          >
                            View
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination footer */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 py-2 text-sm border-t border-slate-200 dark:border-white/10">
            <div className="text-slate-600 dark:text-slate-300">
              Page <b>{page}</b> of <b>{totalPages}</b> · Showing <b>{rows.length}</b> of{" "}
              <b>{total}</b>
            </div>

            <div className="flex flex-wrap items-center gap-1 justify-end">
              <button
                className={`${pill} ${pillLight}`}
                onClick={() => setPage(1)}
                disabled={page <= 1}
                title="First"
              >
                « First
              </button>
              <button
                className={`${pill} ${pillLight}`}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                title="Previous"
              >
                ‹ Prev
              </button>
              <button
                className={`${pill} ${pillLight}`}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                title="Next"
              >
                Next ›
              </button>
              <button
                className={`${pill} ${pillLight}`}
                onClick={() => setPage(totalPages)}
                disabled={page >= totalPages}
                title="Last"
              >
                Last »
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Diff modal (same logic, themed) */}
      {selected && (
        <div className="fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpenId(null)}
            aria-hidden="true"
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-neutral-950">
              <div className="border-b border-slate-200 px-4 py-3 dark:border-white/10">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                      Change details
                    </h3>
                    <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                      {fmtDate(selected.createdAt)}
                    </div>
                    <div className="mt-1 h-1 w-10 rounded-full bg-[#FCC020]" />
                  </div>
                  <button
                    className={`${pill} ${pillLight}`}
                    onClick={() => setOpenId(null)}
                    type="button"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-0 md:grid-cols-2">
                <JsonPane title="Before" value={selected.before} />
                <JsonPane title="After" value={selected.after} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Thin scrollbar styling */}
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

function JsonPane({ title, value }: { title: string; value: any }) {
  const pretty = value ? JSON.stringify(mapValidDatesOnly(value), null, 2) : "—";
  return (
    <div className="p-3">
      <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wide text-slate-600 dark:text-slate-300">
        {title}
      </div>
      <pre className="max-h-[60vh] overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800 dark:border-white/10 dark:bg-neutral-950 dark:text-slate-100">
        {pretty}
      </pre>
    </div>
  );
}
