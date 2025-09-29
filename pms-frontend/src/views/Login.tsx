// pms-frontend/src/views/Login.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

type Step = 'enter' | 'otp' | 'choose-role';

type RoleOption = {
  id: string;
  role: 'Admin' | 'Client' | 'IH-PMT' | 'IH_PMT' | 'Contractor' | 'Consultant' | 'PMC' | 'Supplier';
  scopeType: 'Global' | 'Company' | 'Project';
  scopeId: string | null;
  label: string;
  company?: { id: string; name: string; role: string };
  project?: { id: string; title: string; code?: string | null };
};

type ExistsResponse = {
  ok: boolean;
  exists: boolean;
  user?: { name?: string; status?: 'Active' | 'Inactive' };
};

type VerifyResponse =
  | {
      ok: true;
      token?: string; // may be omitted when chooseRole=true (identity-only flow)
      user: any;
      jwt?: any;
      chooseRole: false;
      roles: RoleOption[];
    }
  | {
      ok: true;
      user: any;
      jwt?: any;
      chooseRole: true;
      roles: RoleOption[];
      token?: string; // if backend includes a base token, we’ll keep it
    }
  | { ok: false; error: string };

type AssumeRoleResponse =
  | {
      ok: true;
      token: string;
      user: any;
      jwt: any;
      role: RoleOption;
    }
  | {
      ok: false;
      error?: string;
    };

// ---- Helpers ----
function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    return JSON.parse(atob(b64 + pad));
  } catch {
    return null;
  }
}

const SAVED_LOGINS_KEY = 'savedLogins';

function readSavedLogins(): string[] {
  try {
    const raw = localStorage.getItem(SAVED_LOGINS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}
function writeSavedLogins(arr: string[]) {
  try {
    localStorage.setItem(SAVED_LOGINS_KEY, JSON.stringify(arr));
  } catch {}
}
function addSavedLogin(login: string) {
  const v = (login || '').trim();
  if (!v) return;
  const list = readSavedLogins();
  const i = list.findIndex((x) => x.toLowerCase() === v.toLowerCase());
  if (i >= 0) list.splice(i, 1);
  list.unshift(v);
  writeSavedLogins(list.slice(0, 8));
}
function removeSavedLogin(login: string) {
  writeSavedLogins(readSavedLogins().filter((x) => x.toLowerCase() !== (login || '').toLowerCase()));
}
function clearSavedLogins() {
  writeSavedLogins([]);
}

// Map role (handles Admin/Client/IH-PMT/IH_PMT/PMC/…)
function mapRoleToPath(role: string): string {
  const norm = (role || '')
    .toString()
    .trim()
    .replace(/[_\s-]+/g, '') // IH-PMT / IH_PMT → ihpmt
    .toLowerCase();
  switch (norm) {
    case 'admin': return '/adminHome';
    case 'client': return '/clientHome';
    case 'ihpmt': return '/ihpmtHome';
    case 'pmc': return '/pmcHome';
    case 'contractor': return '/contractorHome';
    case 'consultant': return '/consultantHome';
    case 'supplier': return '/supplierHome';
    default: return '/landing';
  }
}

const isClientRole = (role?: string) =>
  (role || '').toString().trim().replace(/[_\s-]+/g, '').toLowerCase() === 'client';

export default function Login() {
  // Prefill username from MRU
  const initialLogin = (() => {
    const saved = readSavedLogins();
    return saved.length ? saved[0] : '';
  })();

  // --- State ---
  const [login, setLogin] = useState(initialLogin);
  const [step, setStep] = useState<Step>('enter');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showOtp, setShowOtp] = useState(false);

  // role selection
  const [pendingUser, setPendingUser] = useState<any | null>(null);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [selectedMembershipId, setSelectedMembershipId] = useState<string | null>(null);

  // ---- NEW: de-duplicate Client role to a single option ----
  const roleOptionsDeduped = useMemo(() => {
    let clientTaken = false;
    return (roleOptions || []).reduce<RoleOption[]>((acc, r) => {
      const isClient = isClientRole(r.role as string);
      if (isClient) {
        if (clientTaken) return acc; // drop duplicates
        clientTaken = true;
        acc.push({ ...r, label: 'Client' }); // normalize label
        return acc;
      }
      acc.push(r);
      return acc;
    }, []);
  }, [roleOptions]);

  // saved usernames UI
  const [savedLogins, setSavedLogins] = useState<string[]>(() => readSavedLogins());
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [showManage, setShowManage] = useState(false);
  const inputWrapRef = useRef<HTMLDivElement | null>(null);
  const listboxId = 'login-suggestions-listbox';
  const [remember, setRemember] = useState(false);

  const nav = useNavigate();

  // --- Effects ---
  useEffect(() => { setActiveIdx(-1); }, [login]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!inputWrapRef.current) return;
      if (!inputWrapRef.current.contains(e.target as Node)) setShowSuggestions(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // --- Derived ---
  const filteredSuggestions = useMemo(() => {
    const q = login.trim().toLowerCase();
    if (!q) return savedLogins;
    return savedLogins.filter((s) => s.toLowerCase().includes(q));
  }, [login, savedLogins]);

  // --- Actions ---
  const forceNavigate = (path: string) => {
    nav(path, { replace: true });
    setTimeout(() => {
      if (location.pathname !== path) location.assign(path);
    }, 150);
  };

  // GET /auth/exists?login=...&verbose=1
  const validateUser = async () => {
    setErr(null);
    const value = login.trim();
    if (!value) {
      setErr('Enter email or phone');
      return;
    }
    try {
      setBusy(true);
      const { data } = await api.get<ExistsResponse>('/auth/exists', { params: { login: value, verbose: 1 } });
      if (!data?.ok || data.exists !== true) {
        setErr('User does not exist. Check if the username is correct!');
        return;
      }
      const status = data.user?.status;
      const name = data.user?.name || 'User';
      if (status === 'Inactive') {
        setErr(`${name} has been de-activated by Admin. Contact Admin for more information!`);
        return;
      }
      setStep('otp'); // proceed
    } catch (e: any) {
      const msg =
        e?.response?.status === 404
          ? 'Username validation endpoint not found (GET /auth/exists).'
          : e?.response?.data?.error || 'Failed to validate username';
      setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  // POST /auth/otp/verify  { login, code }
  const verify = async () => {
    setErr(null);
    try {
      setBusy(true);
      const { data } = await api.post<VerifyResponse>('/auth/otp/verify', { login, code });
      if (!data?.ok) {
        setErr((data as any)?.error || 'Invalid OTP');
        return;
      }

      // Try to capture any token the backend might give us (even in choose-role)
      const bootstrapToken =
        (data as any).token ||
        (data as any).jwt?.token ||
        (data as any).jwtToken ||
        null;

      if (bootstrapToken) {
        localStorage.setItem('token', bootstrapToken);
      }

      localStorage.setItem('user', JSON.stringify((data as any).user || {}));
      if (remember) {
        addSavedLogin(login);
        setSavedLogins(readSavedLogins());
      }

      if ((data as any).chooseRole === true) {
        // Stash a short-lived OTP session for the assume-role step if no token yet
        sessionStorage.setItem(
          'otpSession',
          JSON.stringify({ login, otp: code, token: bootstrapToken })
        );

        setPendingUser((data as any).user);
        setRoleOptions(((data as any).roles || []) as RoleOption[]);
        setSelectedMembershipId(null);
        setStep('choose-role');
        return;
      }

      // Final token path → route
      const token = (data as any).token || bootstrapToken;
      const payload = token ? decodeJwtPayload(token) : null;
      const isAdmin = !!(payload && payload.isSuperAdmin) || !!(data as any).user?.isSuperAdmin;

      if (isAdmin) return forceNavigate('/admin');

      const roleInJwt = payload?.userRole || payload?.role;
      if (roleInJwt) return forceNavigate(mapRoleToPath(String(roleInJwt)));

      return forceNavigate('/landing');
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Failed to verify OTP');
    } finally {
      setBusy(false);
    }
  };

  const assumeRole = async () => {
    if (!selectedMembershipId) {
      setErr('Select a role to continue.');
      return;
    }

    const storedToken = localStorage.getItem('token');
    const otpSessionRaw = sessionStorage.getItem('otpSession');
    const otpSession = otpSessionRaw ? JSON.parse(otpSessionRaw) as { login?: string; otp?: string; token?: string | null } : null;

    // Prefer any available token (localStorage or interim one from otpSession)
    const bearer = storedToken || otpSession?.token || null;

    try {
      setBusy(true);

      // Build payload; include login+otp only when we have no bearer
      const body: any = { membershipId: selectedMembershipId };
      if (!bearer && otpSession?.login && otpSession?.otp) {
        body.login = otpSession.login;
        body.otp = otpSession.otp;
      }

      const { data } = await api.post<AssumeRoleResponse>(
        '/auth/assume-role',
        body,
        bearer ? { headers: { Authorization: `Bearer ${bearer}` } } : undefined
      );

      if (!data || data.ok !== true) {
        const serverMsg = (data && 'error' in data && data.error) || 'Failed to assume role';
        setErr(serverMsg);
        return;
      }

      // Success → persist final token and route
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user || {}));
      sessionStorage.removeItem('otpSession');

      const target = mapRoleToPath(String(data.role.role));
      forceNavigate(target);
    } catch (e: any) {
      const msg = e?.response?.status === 401
        ? 'Unauthorized. Your session may have expired. Please try again.'
        : (e?.response?.data?.error || 'Failed to assume role');
      setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  // Input classes
  const inputBase =
    'border rounded w-full p-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/70 focus:border-emerald-500';

  // Buttons
  const btnPrimary =
    'w-full py-3 rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60 disabled:cursor-not-allowed';
  const btnSecondary = 'w-full py-3 rounded border hover:bg-gray-50 dark:hover:bg-neutral-800';

  const onEnterOtp = (e: React.KeyboardEvent<HTMLInputElement>) =>
    e.key === 'Enter' && code.trim().length >= 6 && verify();

  // commit a suggestion
  const commitSelection = (index: number) => {
    const val = filteredSuggestions[index];
    if (!val) return;
    setLogin(val);
    setShowSuggestions(false);
    setActiveIdx(-1);
  };

  // keyboard for saved suggestions
  const handleLoginKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const open = showSuggestions && filteredSuggestions.length > 0;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) { setShowSuggestions(true); setActiveIdx(0); }
        else { setActiveIdx((p) => (p + 1) % filteredSuggestions.length); }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) { setShowSuggestions(true); setActiveIdx(filteredSuggestions.length - 1); }
        else { setActiveIdx((p) => (p - 1 + filteredSuggestions.length) % filteredSuggestions.length); }
        break;
      case 'Home':
        if (open) { e.preventDefault(); setActiveIdx(0); }
        break;
      case 'End':
        if (open) { e.preventDefault(); setActiveIdx(filteredSuggestions.length - 1); }
        break;
      case 'Enter':
        if (open && activeIdx >= 0) { e.preventDefault(); commitSelection(activeIdx); }
        else { validateUser(); }
        break;
      case 'Escape':
        if (open) { e.preventDefault(); setShowSuggestions(false); setActiveIdx(-1); }
        break;
      default: break;
    }
  };

  // ---- Render ----
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-yellow-50 dark:from-neutral-900 dark:to-neutral-950">
      {/* Header */}
      <header className="w-full px-4 sm:px-6 lg:px-10 py-6">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center justify-between">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <div
                aria-label="Ava Logo"
                className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500 via-lime-400 to-yellow-300 grid place-items-center shadow"
              >
                <svg width="26" height="26" viewBox="0 0 24 24" role="img" aria-hidden="true">
                  <path d="M12 2C9 6 7 8.5 7 11a5 5 0 1 0 10 0c0-2.5-2-5-5-9z" className="fill-white/95" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-bold tracking-tight dark:text-white">Trinity PMS</div>
                <div className="text-sm text-gray-600 dark:text-gray-300">Empowering Projects</div>
              </div>
            </div>

            {/* keep right side minimal */}
            <div className="flex items-center gap-3">{/* reserved */}</div>
          </div>

          {/* Tagline */}
          <div className="mt-6 space-y-2">
            <h1 className="text-2xl sm:text-3xl font-semibold leading-snug dark:text-white">
              Experience Next-Level Project Management
              <br />
              Powered by <span className="text-emerald-600 font-bold">Artificial Intelligence</span>
            </h1>
            <p className="text-base text-gray-700 dark:text-gray-300">
              Uniting <b>Vision</b>, <b>Design</b> and <b>Execution</b>.
            </p>
            <div className="h-1 w-24 rounded-full bg-emerald-500/80" />
          </div>
        </div>
      </header>

      {/* Auth card */}
      <main className="px-4 sm:px-6 lg:px-10 pb-16">
        <div className="mx-auto max-w-md">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border dark:border-neutral-800 p-6 space-y-4">
            <h2 className="text-xl font-semibold dark:text-white">Sign in</h2>

            {step === 'enter' && (
              <>
                {/* Username + suggestions */}
                <div ref={inputWrapRef} className="relative">
                  <input
                    className={inputBase}
                    placeholder="Email or phone"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    onKeyDown={handleLoginKeyDown}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 0)}
                    autoFocus
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={showSuggestions && filteredSuggestions.length > 0}
                    aria-controls={listboxId}
                    aria-autocomplete="list"
                    aria-activedescendant={activeIdx >= 0 ? `${listboxId}-opt-${activeIdx}` : undefined}
                  />

                  {showSuggestions && filteredSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 z-10 mt-1 rounded-md border bg-white dark:bg-neutral-800 dark:text-white shadow">
                      <ul id={listboxId} role="listbox" className="max-h-56 overflow-auto text-sm">
                        {filteredSuggestions.map((s, i) => {
                          const active = i === activeIdx;
                          return (
                            <li
                              key={s + i}
                              id={`${listboxId}-opt-${i}`}
                              role="option"
                              aria-selected={active}
                              onMouseEnter={() => setActiveIdx(i)}
                              onMouseLeave={() => setActiveIdx(-1)}
                            >
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setLogin(s);
                                  setShowSuggestions(false);
                                  setActiveIdx(-1);
                                }}
                                className={
                                  'w-full text-left px-3 py-2 ' +
                                  (active ? 'bg-emerald-50 dark:bg-neutral-700' : 'hover:bg-emerald-50 dark:hover:bg-neutral-700')
                                }
                              >
                                {s}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>

                <button type="button" onClick={validateUser} className={btnPrimary} disabled={busy || !login.trim()}>
                  {busy ? 'Checking…' : 'Send OTP'}
                </button>

                {/* Remember + Manage */}
                <div className="mt-2 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input type="checkbox" className="h-4 w-4" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                    Remember me on this device
                  </label>
                  <button type="button" className="text-sm text-emerald-700 hover:underline" onClick={() => setShowManage(true)}>
                    Manage saved logins
                  </button>
                </div>

                {/* Legal text */}
                <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                  <div>
                    Pre-registered users only. Need Access? Contact admin at{' '}
                    <a className="text-emerald-700 hover:underline" href="mailto:admin@trinity-pms.example">
                      admin@trinity-pms.example
                    </a>
                  </div>
                  <div>
                    By continuing, you agree to our <a className="text-emerald-700 hover:underline" href="/terms">Terms</a> and{' '}
                    <a className="text-emerald-700 hover:underline" href="/privacy">Privacy Policy</a>.
                  </div>
                </div>

                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Dev OTP: <b>000000</b> (users must exist)
                </p>
              </>
            )}

            {step === 'otp' && (
              <>
                <div className="relative">
                  <input
                    type={showOtp ? 'text' : 'password'}
                    inputMode="numeric"
                    pattern="\d*"
                    className={`${inputBase} pr-12 tracking-widest`}
                    placeholder="Enter OTP (000000)"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onKeyDown={onEnterOtp}
                    maxLength={6}
                    autoFocus
                    aria-label="One-time passcode"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOtp((v) => !v)}
                    className="absolute inset-y-0 right-2 my-1 px-2 rounded border text-xs bg-white dark:bg-neutral-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-neutral-700"
                    aria-label={showOtp ? 'Hide OTP' : 'Show OTP'}
                  >
                    {showOtp ? 'Hide' : 'Show'}
                  </button>
                </div>

                <button type="button" onClick={verify} className={btnPrimary} disabled={busy || code.trim().length < 6}>
                  {busy ? 'Verifying…' : 'Verify & Continue'}
                </button>

                <button type="button" onClick={() => setStep('enter')} className={btnSecondary}>
                  Back
                </button>
              </>
            )}

            {step === 'choose-role' && (
              <div className="space-y-3">
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  Welcome{pendingUser?.name ? `, ${pendingUser.name}` : ''}! Please choose how you’d like to continue:
                </div>
                <div className="space-y-2">
                  {roleOptionsDeduped.map((r) => {
                    const roleIsClient = isClientRole(r.role as string);
                    const displayLabel = roleIsClient ? 'Client' : r.label;

                    return (
                      <label
                        key={r.id}
                        className={
                          'flex items-center gap-3 p-3 border rounded cursor-pointer hover:bg-emerald-50 dark:hover:bg-neutral-800 ' +
                          (selectedMembershipId === r.id ? 'border-emerald-500' : 'dark:border-neutral-800')
                        }
                      >
                        <input
                          type="radio"
                          name="roleOption"
                          checked={selectedMembershipId === r.id}
                          onChange={() => setSelectedMembershipId(r.id)}
                        />
                        <div className="flex-1">
                          <div className="font-medium dark:text-white">{displayLabel}</div>

                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            {/* company info for service providers */}
                            {r.scopeType === 'Company' && r.company
                              ? `Company: ${r.company.name} (${r.company.role})`
                              : null}

                            {/* hide project details for Client */}
                            {r.scopeType === 'Project' && r.project && !roleIsClient
                              ? `Project: ${r.project.title}${r.project.code ? ` (${r.project.code})` : ''}`
                              : null}

                            {r.scopeType === 'Global' ? 'Global scope' : null}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <div className="flex gap-3">
                  <button className={btnPrimary} onClick={assumeRole} disabled={busy || !selectedMembershipId}>
                    {busy ? 'Continuing…' : 'Continue'}
                  </button>
                  <button className={btnSecondary} onClick={() => setStep('enter')}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {err && <div className="text-red-600 text-sm">{err}</div>}
          </div>
        </div>
      </main>

      {/* Manage Saved Logins Modal */}
      {showManage && (
        <div className="fixed inset-0 z-30">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowManage(false)} aria-hidden="true" />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-xl bg-white dark:bg-neutral-900 border dark:border-neutral-800 shadow-lg">
              <div className="flex items-center justify-between p-4 border-b dark:border-neutral-800">
                <h3 className="text-lg font-semibold dark:text-white">Saved logins</h3>
                <button className="px-2 py-1 rounded border text-sm hover:bg-gray-50 dark:hover:bg-neutral-800" onClick={() => setShowManage(false)}>
                  Close
                </button>
              </div>
              <div className="p-4 space-y-3">
                {savedLogins.length === 0 ? (
                  <div className="text-sm text-gray-600 dark:text-gray-300">No saved usernames yet.</div>
                ) : (
                  <ul className="divide-y dark:divide-neutral-800">
                    {savedLogins.map((u) => (
                      <li key={u} className="py-2 flex items-center justify-between">
                        <span className="text-sm dark:text-white">{u}</span>
                        <button
                          className="px-2 py-1 rounded border text-sm hover:bg-gray-50 dark:hover:bg-neutral-800"
                          onClick={() => {
                            removeSavedLogin(u);
                            setSavedLogins(readSavedLogins());
                          }}
                          title="Remove this username"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="p-4 border-t dark:border-neutral-800 flex items-center justify-between">
                <div className="text-xs text-gray-600 dark:text-gray-400">Removing does not affect server accounts—only local suggestions.</div>
                <button
                  className="px-3 py-1.5 rounded bg-red-600 text-white text-sm disabled:opacity-60"
                  disabled={savedLogins.length === 0}
                  onClick={() => {
                    clearSavedLogins();
                    setSavedLogins([]);
                  }}
                  title="Clear all saved usernames on this device"
                >
                  Clear all
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* /modal */}
    </div>
  );
}
