export default function Permissions() {
  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold dark:text-white">Permissions</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Define role templates and per-project overrides.
        </p>
      </header>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900">
          <h3 className="font-semibold dark:text-white mb-2">Role Templates</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Build a matrix: <code>role × module</code> → actions (raise/review/approve/close).
          </p>
        </div>
        <div className="rounded-xl border dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900">
          <h3 className="font-semibold dark:text-white mb-2">Project Overrides</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Override the template for a project/role and reset to template as needed.
          </p>
        </div>
      </div>
    </div>
  );
}
