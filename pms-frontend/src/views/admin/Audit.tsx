// src/views/admin/audit/Audit.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";

// --- helpers ---
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
  new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // en-CA => 2025-10-14

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

// --- types from backend (align with your Prisma model) ---
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

  // NEW: optional enriched labels returned by API
  targetName?: string | null;
  projectTitle?: string | null;
  projectCode?: string | null;
  companyName?: string | null;
};

type AuditConfig = {
  enabled: boolean;
};

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

  // --- render helpers for new columns ---
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
      firstTruthy(
        r.projectTitle,
        r.after?.projectTitle,
        r.before?.projectTitle
      ) || null;
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

  return (
    <div className="min-h-[70vh] px-4 py-8 sm:px-6 lg:px-10 bg-gradient-to-b from-emerald-50 via-emerald-50 to-amber-50 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold dark:text-white">Audit</h1>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              System-wide audit logs. Only SuperAdmins can view and manage.
            </p>
            {cfgErr && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                {cfgErr}
              </p>
            )}
          </div>

          {/* Toggle + Refresh */}
          <div className="flex flex-wrap items-center gap-4 justify-start sm:justify-end">
            <button
              onClick={refresh}
              type="button"
              className="h-9 rounded-full border border-slate-200 bg-white px-4 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
              disabled={loading || cfgLoading}
              title="Reload config and logs"
            >
              {loading || cfgLoading ? "Loading…" : "Refresh"}
            </button>

            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-100">
                Audit logging enabled
              </span>
              <button
                onClick={toggleEnabled}
                disabled={cfgLoading || !cfg}
                className={`relative inline-flex h-6 w-11 items-center rounded-full border transition ${
                  cfg?.enabled
                    ? "border-emerald-700 bg-emerald-600"
                    : "border-slate-300 bg-slate-300 dark:border-neutral-700 dark:bg-neutral-700"
                }`}
                title="Enable/Disable audit logging"
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                    cfg?.enabled ? "translate-x-5" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <Section title="Find">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            {/* LEFT: Search, Target, Action, Clear */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.3fr)_auto]">
              <Input
                label="Search"
                value={q}
                onChange={(v) => {
                  setQ(v);
                  setPage(1);
                }}
                placeholder="name, ip, UA, UUID…"
              />

              <Input
                label="Target User UUID"
                value={targetUserId}
                onChange={(v) => {
                  setTargetUserId(v.trim());
                  setPage(1);
                }}
                placeholder="Exact UUID"
              />

              {/* Action – slightly narrower via grid fraction, no wrapper */}
              <SelectStrict
                label="Action"
                value={action}
                onChange={(v) => {
                  setAction(v);
                  setPage(1);
                }}
                options={[
                  { value: "", label: "All" },
                  { value: "AssignAdded", label: "AssignAdded" },
                  { value: "AssignRemoved", label: "AssignRemoved" },
                  { value: "AssignReplaced", label: "AssignReplaced" },
                ]}
              />

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="h-9 px-4 rounded-full border border-slate-200 bg-white text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* RIGHT: 20 / page */}
            <div className="flex items-end justify-end">
              <select
                className="h-9 w-full sm:w-auto max-w-[140px] rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
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
            </div>
          </div>
        </Section>

        {/* Table + Errors */}
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          {err && (
            <div className="border-b border-slate-200 px-4 py-3 text-sm text-red-700 dark:border-neutral-800 dark:text-red-400">
              {err}
            </div>
          )}

          <div className="thin-scrollbar max-h-[65vh] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur dark:bg-neutral-800/95">
                <tr>
                  <Th>Time</Th>
                  <Th>Actor</Th>
                  <Th>Action</Th>
                  <Th>Target</Th>
                  <Th>Project</Th>
                  <Th>Company</Th>
                  <Th>Diff</Th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      className="px-4 py-4 text-center text-gray-600 dark:text-gray-300"
                      colSpan={7}
                    >
                      No logs.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t border-slate-100/80 odd:bg-slate-50/40 dark:border-neutral-800 dark:odd:bg-neutral-900/60"
                    >
                      <Td title={fmtDate(r.createdAt)}>
                        {fmtDate(r.createdAt)}
                      </Td>
                      <Td title={r.actorUserId || undefined}>
                        {r.actorName || "—"}
                      </Td>
                      <Td>{r.action}</Td>
                      <Td>{renderTargetName(r)}</Td>
                      <Td>{renderProject(r)}</Td>
                      <Td>{renderCompany(r)}</Td>
                      <Td>
                        {r.before || r.after ? (
                          <button
                            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
                            onClick={() => setOpenId(r.id)}
                          >
                            View
                          </button>
                        ) : (
                          "—"
                        )}
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-sm dark:border-neutral-800">
            <div className="text-gray-600 dark:text-gray-300">
              Page <b>{page}</b> of <b>{totalPages}</b> · Showing{" "}
              <b>{rows.length}</b> of <b>{total}</b>
            </div>
            <div className="flex items-center gap-1">
              <Btn onClick={() => setPage(1)} disabled={page <= 1}>
                « First
              </Btn>
              <Btn
                onClick={() => setPage((p: number) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                ‹ Prev
              </Btn>
              <Btn
                onClick={() =>
                  setPage((p: number) => Math.min(totalPages, p + 1))
                }
                disabled={page >= totalPages}
              >
                Next ›
              </Btn>
              <Btn
                onClick={() => setPage(totalPages)}
                disabled={page >= totalPages}
              >
                Last »
              </Btn>
            </div>
          </div>
        </div>
      </div>

      {/* Diff modal */}
      {selected && (
        <div className="fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpenId(null)}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
              <div className="border-b border-slate-200 px-4 py-3 dark:border-neutral-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold dark:text-white">
                      Change details
                    </h3>
                    <div className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">
                      {fmtDate(selected.createdAt)}
                    </div>
                  </div>
                  <button
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
                    onClick={() => setOpenId(null)}
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
          .thin-scrollbar::-webkit-scrollbar {
            height: 6px;
            width: 6px;
          }
          .thin-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }
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

/* ========== Small UI bits (aligned with other admin screens) ========== */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
        {title}
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <input
        className="h-9 w-full sm:w-auto max-w-[220px] rounded-full border border-slate-200 bg-white px-3 text-xs text-slate-800 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
      />
    </label>
  );
}

function SelectStrict({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <select
        className="h-9 w-full sm:w-auto max-w-[220px] rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value ?? "__all"} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:border-neutral-700 dark:text-slate-200">
      {children}
    </th>
  );
}

function Td({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <td
      className="whitespace-nowrap border-b border-slate-100 px-3 py-2 text-sm text-slate-800 dark:border-neutral-800 dark:text-slate-100"
      title={title}
    >
      {children}
    </td>
  );
}

function Btn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      className={`h-8 rounded-full border border-slate-200 bg-white px-3 text-xs text-slate-700 shadow-sm disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 ${className}`}
      {...rest}
    />
  );
}

function JsonPane({ title, value }: { title: string; value: any }) {
  const pretty = value
    ? JSON.stringify(mapValidDatesOnly(value), null, 2)
    : "—";
  return (
    <div className="p-3">
      <div className="mb-1 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title}
      </div>
      <pre className="max-h-[60vh] overflow-auto rounded border bg-gray-50 p-3 text-xs text-slate-800 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100">
        {pretty}
      </pre>
    </div>
  );
}
