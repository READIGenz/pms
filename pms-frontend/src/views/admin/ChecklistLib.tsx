export default function ChecklistLib() {
  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold dark:text-white">Checklist Library</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Define activity
        </p>
      </header>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900">
          <h3 className="font-semibold dark:text-white mb-2">Checklist Library</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Build a matrix: <code>role × module</code> → actions (raise/review/approve/close).
          </p>
        </div>
        <div className="rounded-xl border dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900">
          <h3 className="font-semibold dark:text-white mb-2">Checklist Library</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Library
          </p>
        </div>
      </div>
    </div>
  );
}
