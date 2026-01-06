import { useEffect, useState } from "react";
import { api } from "../../api/client";

declare global {
  interface Window {
    __ADMIN_SUBTITLE__?: string;
  }
}

type Kpis = {
  users: { total: number; active: number };
  companies: { total: number; active: number };
  projects: { total: number; active: number };
  projectsByStatus?: Array<{ status: string; count: number }>;
  usersByStatus?: Array<{ status: string; count: number }>;
  companiesByStatus?: Array<{ status: string; count: number }>;
};

export default function Dashboard() {
  const [data, setData] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Trinity PMS — Admin Dashboard";
    window.__ADMIN_SUBTITLE__ =
      "Snapshot of users, companies, and projects in Trinity PMS.";
    return () => {
      window.__ADMIN_SUBTITLE__ = "";
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await api.get("/admin/dashboard/kpis");
        if (!ignore) setData(res.data ?? res.data);
      } catch (e: any) {
        if (!ignore) setErr(e?.message || "Failed to load KPIs");
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  const colorForStatus = (status: string) => {
    const s = (status || "").toLowerCase();

    if (["active", "approved", "submitted", "open", "in progress"].some((k) => s.includes(k))) {
      return {
        bg: "bg-[#23A192]/10 dark:bg-[#23A192]/15",
        text: "text-[#1b7f72] dark:text-[#7be6d6]",
        border: "border-[#23A192]/30 dark:border-[#23A192]/35",
        dot: "bg-[#23A192]",
      };
    }
    if (["onhold", "on hold", "hold", "pending", "returned", "review"].some((k) => s.includes(k))) {
      return {
        bg: "bg-[#FCC020]/15 dark:bg-[#FCC020]/15",
        text: "text-[#8a6400] dark:text-[#ffd56a]",
        border: "border-[#FCC020]/40 dark:border-[#FCC020]/35",
        dot: "bg-[#FCC020]",
      };
    }
    if (["completed", "closed", "done"].some((k) => s.includes(k))) {
      return {
        bg: "bg-[#00379C]/10 dark:bg-[#00379C]/20",
        text: "text-[#00379C] dark:text-[#8fb0ff]",
        border: "border-[#00379C]/25 dark:border-[#00379C]/35",
        dot: "bg-[#00379C]",
      };
    }
    if (["rejected", "inactive", "archived", "cancel"].some((k) => s.includes(k))) {
      return {
        bg: "bg-rose-50 dark:bg-rose-950/30",
        text: "text-rose-700 dark:text-rose-300",
        border: "border-rose-200 dark:border-rose-800/40",
        dot: "bg-rose-500",
      };
    }
    return {
      bg: "bg-slate-50 dark:bg-white/5",
      text: "text-slate-700 dark:text-slate-200",
      border: "border-slate-200 dark:border-white/10",
      dot: "bg-slate-400",
    };
  };

  const StatChip = ({ status, count }: { status: string; count: number }) => {
    const c = colorForStatus(status);
    return (
      <span
        className={[
          "inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[12px]",
          c.bg,
          c.text,
          c.border,
        ].join(" ")}
      >
        <span className={["w-2 h-2 rounded-full", c.dot].join(" ")} />
        <span className="whitespace-nowrap">
          {status}: <b>{count}</b>
        </span>
      </span>
    );
  };

  // Smaller tile (less “huge”)
  const Tile = ({
    label,
    primary,
    secondary,
    tone,
    iconPath,
  }: {
    label: string;
    primary: string | number;
    secondary?: string;
    tone: "teal" | "gold" | "navy";
    iconPath: string;
  }) => {
    const toneStyles =
      tone === "teal"
        ? {
            border: "border-[#23A192]/15 dark:border-[#23A192]/20",
            iconBg: "bg-[#23A192]/10 dark:bg-[#23A192]/15",
            iconFg: "text-[#23A192] dark:text-[#7be6d6]",
            pill:
              "bg-[#23A192]/10 text-[#1b7f72] border-[#23A192]/25 dark:bg-[#23A192]/15 dark:text-[#7be6d6] dark:border-[#23A192]/30",
            bar: "bg-[#23A192]/[0.08] dark:bg-[#23A192]/15",
          }
        : tone === "gold"
        ? {
            border: "border-[#FCC020]/18 dark:border-[#FCC020]/20",
            iconBg: "bg-[#FCC020]/15 dark:bg-[#FCC020]/15",
            iconFg: "text-[#8a6400] dark:text-[#ffd56a]",
            pill:
              "bg-[#FCC020]/15 text-[#8a6400] border-[#FCC020]/35 dark:bg-[#FCC020]/15 dark:text-[#ffd56a] dark:border-[#FCC020]/25",
            bar: "bg-[#FCC020]/[0.10] dark:bg-[#FCC020]/15",
          }
        : {
            border: "border-[#00379C]/15 dark:border-[#00379C]/25",
            iconBg: "bg-[#00379C]/10 dark:bg-[#00379C]/20",
            iconFg: "text-[#00379C] dark:text-[#8fb0ff]",
            pill:
              "bg-[#00379C]/10 text-[#00379C] border-[#00379C]/25 dark:bg-[#00379C]/20 dark:text-[#8fb0ff] dark:border-[#00379C]/30",
            bar: "bg-[#00379C]/[0.08] dark:bg-[#00379C]/20",
          };

    return (
      <div
        className={[
          "rounded-3xl border bg-white shadow-sm p-4 sm:p-5",
          "hover:shadow-md transition",
          toneStyles.border,
          "dark:bg-neutral-950",
        ].join(" ")}
      >
        <div className="flex items-center gap-3">
          <div
            className={[
              "h-10 w-10 rounded-2xl grid place-items-center border border-white/60 shadow-sm",
              toneStyles.iconBg,
              "dark:border-white/10",
            ].join(" ")}
            aria-hidden
          >
            <svg width="20" height="20" viewBox="0 0 24 24" className={toneStyles.iconFg}>
              <path d={iconPath} className="fill-current" />
            </svg>
          </div>

          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-slate-600 dark:text-slate-300">
              {label}
            </div>
            <div className="text-2xl font-extrabold leading-tight text-slate-900 dark:text-white">
              {primary}
            </div>
          </div>
        </div>

        {secondary ? (
          <div className="mt-3">
            <span
              className={[
                "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
                toneStyles.pill,
              ].join(" ")}
            >
              {secondary}
            </span>
          </div>
        ) : null}

        <div className={["mt-4 h-2 w-full rounded-full", toneStyles.bar].join(" ")} />
      </div>
    );
  };

  const Section = ({
    title,
    items,
  }: {
    title: string;
    items: Array<{ status: string; count: number }>;
  }) => (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:bg-neutral-950 dark:border-white/10">
      {/* Removed the right-side green dot here */}
      <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10">
        <div className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200">
          {title}
        </div>
      </div>

      <div className="p-5">
        <div className="flex flex-wrap gap-2">
          {items.map((it) => (
            <StatChip key={it.status} status={it.status} count={it.count} />
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 dark:bg-neutral-950 dark:border-white/10 dark:text-slate-200">
          Loading KPIs…
        </div>
      ) : err ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/30 dark:border-rose-800/40 dark:text-rose-300">
          {err}
        </div>
      ) : !data ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 dark:bg-neutral-950 dark:border-white/10 dark:text-slate-200">
          No data.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <Tile
              label="Users"
              primary={data.users.total}
              secondary={`Active: ${data.users.active}`}
              tone="teal"
              iconPath="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5z"
            />
            <Tile
              label="Companies"
              primary={data.companies.total}
              secondary={`Active: ${data.companies.active}`}
              tone="gold"
              iconPath="M3 9l9-7 9 7v11a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"
            />
            <Tile
              label="Projects"
              primary={data.projects.total}
              secondary={`Active: ${data.projects.active}`}
              tone="navy"
              iconPath="M4 4h16v4H4zM4 10h16v4H4zM4 16h16v4H4z"
            />
          </div>

          <div className="space-y-5">
            {!!data.projectsByStatus?.length && (
              <Section title="Projects by Status" items={data.projectsByStatus} />
            )}
            {!!data.usersByStatus?.length && (
              <Section title="Users by Status" items={data.usersByStatus} />
            )}
            {!!data.companiesByStatus?.length && (
              <Section title="Companies by Status" items={data.companiesByStatus} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
