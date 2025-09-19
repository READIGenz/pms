export default function Assignments() {
  // This screen will later compose data from Users, Companies & Projects
  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold dark:text-white">Assignments</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Link users/companies to projects by role; prefer “disable” over delete.
        </p>
      </header>

      <div className="rounded-xl border dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900">
        <div className="text-sm text-gray-600 dark:text-gray-300">
          Placeholder: build your role selector (CLIENT / AVA-PMT / CONTRACTOR / CONSULTANT / PMC / SUPPLIER), project
          select, company select (if applicable) and a grid of current assignments here.
        </div>
      </div>
    </div>
  );
}
