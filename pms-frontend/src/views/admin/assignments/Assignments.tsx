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
    <div className="mb-4 flex flex-wrap gap-2">
      {ROLES.map(r => (
        <button
          key={r.slug}
          onClick={() => nav(`/admin/assignments/${r.slug}`)}
          className={
            "px-3 py-1.5 rounded-2xl border dark:border-neutral-800 " +
            (active === r.slug ? "bg-emerald-600 text-white" : "hover:bg-gray-50 dark:hover:bg-neutral-800")
          }
          title={`Go to ${r.label} assignments`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

export default function AssignmentsRouter() {
  const { role } = useParams<{ role?: string }>();
  const slug = (role || "").toLowerCase();

  // Unknown role -> redirect to clients
  const valid = ROLES.some(r => r.slug === slug);
  if (!valid) return <Navigate to="/admin/assignments/clients" replace />;

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-8">
      <div className="mx-auto max-w-6xl">
        <RoleTabs active={slug} />
        <Suspense fallback={<div className="text-sm text-gray-600 dark:text-gray-300">Loading…</div>}>
          {slug === "clients"      && <ClientsAssignments />}
          {slug === "contractors"  && <ContractorsAssignments />}
          {slug === "consultants"  && <ConsultantsAssignments />}
          {slug === "pmc"          && <PmcAssignments />}
          {slug === "suppliers"    && <SuppliersAssignments />}
          {slug === "ih-pmt"       && <IhpmtAssignments />}
        </Suspense>
      </div>
    </div>
  );
}
