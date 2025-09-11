import { Navigate, useLocation } from 'react-router-dom';

function decodeJwtPayload(token: string): any | null {
  try {
    const [, b64] = token.split('.');
    if (!b64) return null;
    const fixed = b64.replace(/-/g, '+').replace(/_/g, '/');
    const pad = fixed.length % 4 ? '='.repeat(4 - (fixed.length % 4)) : '';
    return JSON.parse(atob(fixed + pad));
  } catch {
    return null;
  }
}

export default function RequireAdmin({ children }: { children: JSX.Element }) {
  const loc = useLocation();
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');

  if (!token) {
    console.log('[RequireAdmin] No token → /login');
    return <Navigate to="/login" replace />;
  }

  const payload = decodeJwtPayload(token);
  const user = userStr ? JSON.parse(userStr) : null;
  const isAdmin = !!(payload && payload.isSuperAdmin) || !!user?.isSuperAdmin;

  console.log('[RequireAdmin] path=', loc.pathname, 'payload=', payload, 'user=', user, 'isAdmin=', isAdmin);

  if (!isAdmin) {
    console.log('[RequireAdmin] Not admin → /landing');
    return <Navigate to="/landing" replace />;
  }
  return children;
}
