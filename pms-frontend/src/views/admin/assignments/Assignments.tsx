// src/views/admin/assignments/Assignments.tsx
import { lazy, Suspense } from "react";
import { Navigate, useParams, useNavigate } from "react-router-dom";

// Lazy pages (one per role)
const ClientsAssignments     = lazy(() => import("./clients/clientsAssignments"));
const ContractorsAssignments = lazy(() => import("./contractors/contractorsAssignments"));
const ConsultantsAssignments = lazy(() => import("./consultants/consultantsAssignments"));
const PmcAssignments         = lazy(() => import("./pmc/pmcAssignments"));
const SuppliersAssignments   = lazy(() => import("./suppliers/suppliersAssignments"));
const IhpmtAssignments       = lazy(() => import("./ihpmt/ihpmtAssignments"));

// Role tabs (keeps the URL param in sync)
const ROLES = [
  { slug: "clients",      label: "Client" },
  { slug: "contractors",  label: "Contractor" },
  { slug: "consultants",  label: "Consultant" },
  { slug: "pmc",          label: "PMC" },
  { slug: "suppliers",    label: "Supplier" },
  { slug: "ih-pmt",       label: "IH-PMT" },
] as const;

function RoleTabs({ active }: { active: string }) {
  const nav = useNavigate();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex flex-wrap gap-1 rounded-full bg-slate-50/80 dark:bg-neutral-900/70 border border-slate-200/70 dark:border-neutral-800 px-1 py-1">
        {ROLES.map((r) => {
          const isActive = active === r.slug;
          return (
            <button
              key={r.slug}
              onClick={() => nav(`/admin/assignments/${r.slug}`)}
              className={
                "px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors " +
                (isActive
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-neutral-800")
              }
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

  // Unknown role -> redirect to clients
  const valid = ROLES.some((r) => r.slug === slug);
  if (!valid) return <Navigate to="/admin/assignments/clients" replace />;

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-yellow-50 dark:from-neutral-900 dark:to-neutral-950 px-4 sm:px-6 lg:px-10 py-8 rounded-2xl">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold dark:text-white">Assignments</h1>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Manage role-based project and company assignments.
            </p>
          </div>
        </div>

        {/* Card: Tabs + content */}
        <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border border-slate-200/80 dark:border-neutral-800 overflow-hidden">
          {/* Tabs bar */}
          <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-slate-200 dark:border-neutral-800">
            <RoleTabs active={slug} />
          </div>

          {/* Content area */}
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <Suspense
              fallback={
                <div className="py-6 text-sm text-gray-600 dark:text-gray-300">
                  Loading assignments…
                </div>
              }
            >
              {slug === "clients"      && <ClientsAssignments />}
              {slug === "contractors"  && <ContractorsAssignments />}
              {slug === "consultants"  && <ConsultantsAssignments />}
              {slug === "pmc"          && <PmcAssignments />}
              {slug === "suppliers"    && <SuppliersAssignments />}
              {slug === "ih-pmt"       && <IhpmtAssignments />}
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
