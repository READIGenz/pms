// pms-frontend/src/hooks/useAuth.ts
import { useMemo } from 'react';

type Claims = {
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  profilePhoto?: string;
  isSuperAdmin?: boolean;
  userRole?: string;
  role?: string;
  [k: string]: any;
};

function decodeJwtPayload(token?: string | null): Claims | null {
  if (!token) return null;
  try {
    const [, b64] = token.split('.');
    if (!b64) return null;
    const norm = b64.replace(/-/g, '+').replace(/_/g, '/');
    const pad = norm.length % 4 ? '='.repeat(4 - (norm.length % 4)) : '';
    return JSON.parse(atob(norm + pad));
  } catch { return null; }
}

export function useAuth() {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;

  const user = useMemo(() => {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('user') : null;
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  }, []);

  const claims = useMemo(() => decodeJwtPayload(token), [token]);

  return { token, user, claims };
}
