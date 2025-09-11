import { Navigate, Outlet, useLocation } from 'react-router-dom';

export default function RequireAuth() {
  const token = localStorage.getItem('token');
  const loc = useLocation();

  if (!token) {
    console.log('[RequireAuth] No token → /login from', loc.pathname);
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
