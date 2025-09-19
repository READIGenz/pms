export default function PermissionExplorer() {
  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold dark:text-white">Permission Explorer</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Inspect effective permissions for a user on a project (after role + override resolution).
        </p>
      </header>

      <div className="rounded-xl border dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900">
        <div className="text-sm text-gray-600 dark:text-gray-300">
          Placeholder: provide inputs (User • Project) and show computed permissions per Module → Actions.
        </div>
      </div>
    </div>
  );
}
