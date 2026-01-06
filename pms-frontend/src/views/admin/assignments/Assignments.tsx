// src/views/admin/assignments/Assignments.tsx
import { lazy, Suspense, useEffect } from "react";
import { Navigate, useParams, useNavigate } from "react-router-dom";

// Lazy pages (one per role)
const ClientsAssignments = lazy(() => import("./clients/clientsAssignments"));
const ContractorsAssignments = lazy(
  () => import("./contractors/contractorsAssignments")
);
const ConsultantsAssignments = lazy(
  () => import("./consultants/consultantsAssignments")
);
const PmcAssignments = lazy(() => import("./pmc/pmcAssignments"));
const SuppliersAssignments = lazy(
  () => import("./suppliers/suppliersAssignments")
);
const IhpmtAssignments = lazy(() => import("./ihpmt/ihpmtAssignments"));

// Role tabs (keeps the URL param in sync)
const ROLES = [
  { slug: "clients", label: "Client" },
  { slug: "contractors", label: "Contractor" },
  { slug: "consultants", label: "Consultant" },
  { slug: "pmc", label: "PMC" },
  { slug: "suppliers", label: "Supplier" },
  { slug: "ih-pmt", label: "IH-PMT" },
] as const;

function RoleTabs({ active }: { active: string }) {
  const nav = useNavigate();

  const tabBase =
    "h-8 px-3 rounded-full text-[12px] font-semibold transition " +
    "border shadow-sm active:scale-[0.98] " +
    "focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-neutral-950";

  const tabInactive =
    "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 " +
    "dark:bg-neutral-950 dark:text-slate-200 dark:border-white/10 dark:hover:bg-white/5 " +
    "focus:ring-[#00379C]/25";

  const tabActive =
    "bg-[#FCC020] text-slate-900 border-transparent hover:brightness-105 " +
    "focus:ring-[#FCC020]/40";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        className={[
          "inline-flex flex-wrap gap-1.5 rounded-2xl",
          "bg-white border border-slate-200 shadow-sm p-1.5",
          "dark:bg-neutral-950 dark:border-white/10",
        ].join(" ")}
      >
        {ROLES.map((r) => {
          const isActive = active === r.slug;
          return (
            <button
              key={r.slug}
              onClick={() => nav(`/admin/assignments/${r.slug}`)}
              className={[tabBase, isActive ? tabActive : tabInactive].join(" ")}
              title={`Go to ${r.label} assignments`}
              type="button"
            >
              {r.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function AssignmentsRouter() {
  const { role } = useParams<{ role?: string }>();
  const slug = (role || "").toLowerCase();

  // ✅ This MUST be inside component
  useEffect(() => {
    document.title = "Trinity PMS — Assignments";
    (window as any).__ADMIN_SUBTITLE__ =
      "Manage role-based project and company assignments.";
    return () => {
      (window as any).__ADMIN_SUBTITLE__ = "";
    };
  }, []);

  // Unknown role -> redirect to clients
  const valid = ROLES.some((r) => r.slug === slug);
  if (!valid) return <Navigate to="/admin/assignments/clients" replace />;

  return (
    <div className="w-full">
      <div className="mx-auto max-w-6xl">
        {/* Tabs + content */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-white/10 dark:bg-neutral-950">
          {/* Tabs bar */}
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200 bg-[#00379C]/[0.03] dark:border-white/10 dark:bg-white/[0.03]">
            <RoleTabs active={slug} />
          </div>

          {/* Content area */}
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <Suspense
              fallback={
                <div className="py-6 text-sm text-slate-600 dark:text-slate-300">
                  Loading assignments…
                </div>
              }
            >
              {slug === "clients" && <ClientsAssignments />}
              {slug === "contractors" && <ContractorsAssignments />}
              {slug === "consultants" && <ConsultantsAssignments />}
              {slug === "pmc" && <PmcAssignments />}
              {slug === "suppliers" && <SuppliersAssignments />}
              {slug === "ih-pmt" && <IhpmtAssignments />}
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
