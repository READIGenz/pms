// src/views/admin/audit/Audit.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";

// --- helpers ---
function decodeJwtPayload(token: string): any | null {
  try {
    const [_, b64] = token.split(".");
    if (!b64) return null;
    const norm = b64.replace(/-/g, "+").replace(/_/g, "/");
    const pad = norm.length % 4 ? "=".repeat(4 - (norm.length % 4)) : "";
    return JSON.parse(atob(norm + pad));
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
        e?.response?.data?.error ||
        e?.message ||
        "Failed to load audit config."
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
    // Prefer enriched field; fallback to snapshots or UUID
    const name =
      firstTruthy(
        r.targetName,              // <— enriched
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
    const title = firstTruthy(r.projectTitle, r.after?.projectTitle, r.before?.projectTitle) || null;
    const code = firstTruthy(r.projectCode, r.after?.projectCode, r.before?.projectCode) || null;
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
    const label = firstTruthy(r.companyName, r.after?.companyName, r.before?.companyName) || null;
    const id = r.companyId || r.after?.companyId || r.before?.companyId || "";
    if (label) return <span title={id || undefined}>{label}</span>;
    return (
      <span className="font-mono text-xs" title={id || undefined}>
        {id ? shortId(id) : "—"}
      </span>
    );
  };

  return (
    <div className="min-h-[70vh]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
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

        {/* Toggle */}
        <div className="flex items-center gap-3">
          <label className="text-sm dark:text-white">
            Audit logging enabled
          </label>
          <button
            onClick={toggleEnabled}
            disabled={cfgLoading || !cfg}
            className={`relative inline-flex h-6 w-11 items-center rounded-full border dark:border-neutral-800 transition
              ${cfg?.enabled ? "bg-emerald-600" : "bg-gray-300 dark:bg-neutral-700"}`}
            title="Enable/Disable audit logging"
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition
                ${cfg?.enabled ? "translate-x-5" : "translate-x-1"}`}
            />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center mb-3">
        <input
          className="border rounded px-3 py-2 w-56 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
          placeholder="Search (name/ip/ua/UUID)…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <input
          className="border rounded px-3 py-2 w-40 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
          placeholder="Target User UUID"
          value={targetUserId}
          onChange={(e) => {
            setTargetUserId(e.target.value.trim());
            setPage(1);
          }}
        />
        <select
          className="border rounded px-2 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
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

        <select
          className="border rounded px-2 py-2 dark:bg-neutral-900 dark:text-white dark:border-neutral-800"
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
          onClick={() => loadLogs()}
          className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white"
          disabled={loading}
          title="Reload"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border dark:border-neutral-800 overflow-hidden">
        {err && (
          <div className="p-4 text-red-700 dark:text-red-400 text-sm border-b dark:border-neutral-800">
            {err}
          </div>
        )}

        <div className="overflow-auto" style={{ maxHeight: "65vh" }}>
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-neutral-800 sticky top-0 z-10">
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
                    className="px-3 py-3 text-gray-600 dark:text-gray-300"
                    colSpan={7}
                  >
                    No logs.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    className="odd:bg-gray-50/40 dark:odd:bg-neutral-900/60"
                  >
                    <Td title={fmtDate(r.createdAt)}>{fmtDate(r.createdAt)}</Td>
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
                          className="px-2 py-1 rounded border text-xs hover:bg-gray-50 dark:hover:bg-neutral-800"
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
        <div className="flex items-center justify-between px-3 py-2 text-sm border-t dark:border-neutral-800">
          <div className="text-gray-600 dark:text-gray-300">
            Page <b>{page}</b> of <b>{totalPages}</b> · Showing <b>{rows.length}</b> of{" "}
            <b>{total}</b>
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
            <Btn onClick={() => setPage(totalPages)} disabled={page >= totalPages}>
              Last »
            </Btn>
          </div>
        </div>
      </div>

      {/* Diff modal */}
      {selected && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpenId(null)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-4xl rounded-2xl bg-white dark:bg-neutral-900 border dark:border-neutral-800 shadow-xl overflow-hidden">
              <div className="px-4 py-3 border-b dark:border-neutral-800">
                <h3 className="text-lg font-semibold dark:text-white">Change details</h3>
                <div className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
                  {fmtDate(selected.createdAt)} {/* IST, same as Time column */}
                </div>
                <div className="mt-2 flex justify-end">
                  <button
                    className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50 dark:hover:bg-neutral-800"
                    onClick={() => setOpenId(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                <JsonPane title="Before" value={selected.before} />
                <JsonPane title="After" value={selected.after} />
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function Th({ children }: { children: any }) {
  return (
    <th className="text-left font-semibold px-3 py-2 border-b dark:border-neutral-700 whitespace-nowrap">
      {children}
    </th>
  );
}
function Td({ children, title }: { children: any; title?: string }) {
  return (
    <td
      className="px-3 py-2 border-b dark:border-neutral-800 whitespace-nowrap"
      title={title}
    >
      {children}
    </td>
  );
}
function Btn(props: any) {
  return (
    <button
      className="px-3 py-1 rounded border dark:border-neutral-800 disabled:opacity-50"
      {...props}
    />
  );
}
function JsonPane({ title, value }: { title: string; value: any }) {
  const pretty = value ? JSON.stringify(mapValidDatesOnly(value), null, 2) : "—";
  return (
    <div className="p-3">
      <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
        {title}
      </div>
      <pre className="text-xs bg-gray-50 dark:bg-neutral-950 border dark:border-neutral-800 rounded p-3 overflow-auto max-h=[60vh]">
        {pretty}
      </pre>
    </div>
  );
}

