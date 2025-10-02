// src/views/admin/permissions/Permissions.tsx
import { useNavigate } from "react-router-dom";

export default function Permissions() {
  const navigate = useNavigate();

  const goTemplates = () => navigate("/admin/permissions/templates");
  const goOverrides = () => navigate("/admin/permissions/project-overrides");
  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold dark:text-white">Modules and Permissions</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Define role templates and per-project overrides.
        </p>
      </header>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Role Templates card — clickable */}
        <button
          type="button"
          onClick={goTemplates}
          className="text-left rounded-xl border dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900 hover:bg-gray-50 dark:hover:bg-neutral-800 transition focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label="Open Role Templates"
        >
          <h3 className="font-semibold dark:text-white mb-2">Role Templates</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Set a default matrix: <code>role × module</code> → actions (view/raise/review/approve/close).
          </p>
          <div className="mt-3 inline-flex items-center gap-2 text-indigo-600">
            <span>Open</span>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="inline-block">
              <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l5 5a.997.997 0 010 1.414l-5 5a1 1 0 11-1.414-1.414L13.586 10H4a1 1 0 110-2h9.586l-3.293-3.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </div>
        </button>

        {/* Project Overrides card — (placeholder for now) */}
        <button
          type="button"
          onClick={goOverrides}
          className="text-left rounded-xl border dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900 hover:bg-gray-50 dark:hover:bg-neutral-800 transition focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label="Open Project Overrides"
        >
          <h3 className="font-semibold dark:text-white mb-2">Project Overrides</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Override role templates per project; reset to template any time.
          </p>
          <div className="mt-3 inline-flex items-center gap-2 text-indigo-600">
            <span>Open</span>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="inline-block">
              <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l5 5a.997.997 0 010 1.414l-5 5a1 1 0 11-1.414-1.414L13.586 10H4a1 1 0 110-2h9.586l-3.293-3.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </div>
        </button>
      </div>
    </div>
  );
}
