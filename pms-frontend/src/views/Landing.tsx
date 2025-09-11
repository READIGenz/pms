/**
 * views/Landing.tsx
 * -----------------
 * Shows three navigation tiles per the requirements.
 */
import { useNavigate } from 'react-router-dom';

export default function Landing(){
  const nav = useNavigate();
  return (
    <div className="min-h-screen p-6">
      <h1 className="text-2xl font-semibold mb-4">Welcome</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button onClick={()=>nav('/projects')} className="p-6 rounded-xl border hover:shadow text-left">
          <div className="text-lg font-medium">My Projects</div>
          <div className="text-sm text-gray-500">View and manage your projects</div>
        </button>
        <div className="p-6 rounded-xl border text-left">
          <div className="text-lg font-medium">Notifications</div>
          <div className="text-sm text-gray-500">Coming soon</div>
        </div>
        <div className="p-6 rounded-xl border text-left">
          <div className="text-lg font-medium">Payments</div>
          <div className="text-sm text-gray-500">Coming soon</div>
        </div>
      </div>
    </div>
  );
}
