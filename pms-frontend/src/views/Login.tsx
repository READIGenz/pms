/**
 * views/Login.tsx
 * ---------------
 * Fresh build with:
 *  - Username validation on "Send OTP" (GET /auth/exists?login=...)
 *      • If exists → show OTP field (we DO NOT send OTP here)
 *      • If not → show: "User does not exist. Check if the username is correct!"
 *  - OTP verify (POST /auth/otp/verify). Dev OTP: 000000
 *  - Super Admin → /admin, others → /landing
 *  - Remember me:
 *      • If checked at successful verify → add username to MRU list in localStorage
 *      • Unchecked does NOT remove prior saved usernames
 *  - Suggestions dropdown on username focus (click to fill), plus “Manage saved logins” modal
 *  - Show/Hide OTP toggle (default hidden)
 *  - Green/yellow header with brand, language and light/dark toggle
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

type Step = 'enter' | 'otp';

// ---------- Local helpers ----------
function decodeJwtPayload(token: string): any | null {
    try {
        const parts = token.split('.');
        if (parts.length < 2) return null;
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
        const json = atob(b64 + pad);
        return JSON.parse(json);
    } catch {
        return null;
    }
}

const SAVED_LOGINS_KEY = 'savedLogins'; // JSON-encoded string[]

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
    } catch { }
}
function addSavedLogin(login: string) {
    const trimmed = (login || '').trim();
    if (!trimmed) return;
    const list = readSavedLogins();
    const idx = list.findIndex((v) => v.toLowerCase() === trimmed.toLowerCase());
    if (idx >= 0) list.splice(idx, 1);
    list.unshift(trimmed);
    writeSavedLogins(list.slice(0, 8)); // keep 8 MRU
}
function removeSavedLogin(login: string) {
    const next = readSavedLogins().filter((v) => v.toLowerCase() !== (login || '').toLowerCase());
    writeSavedLogins(next);
}
function clearSavedLogins() {
    writeSavedLogins([]);
}

export default function Login() {
    // Prefill username with most recent remembered (if any)
    const initialLogin = (() => {
        const saved = readSavedLogins();
        return saved.length ? saved[0] : '';
    })();

    // ---- State ----
    const [login, setLogin] = useState<string>(initialLogin);
    const [step, setStep] = useState<Step>('enter');
    const [code, setCode] = useState('');
    const [err, setErr] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [showOtp, setShowOtp] = useState<boolean>(false);
    // Keyboard navigation for suggestions
    const [activeIdx, setActiveIdx] = useState<number>(-1);
    const listboxId = 'login-suggestions-listbox';

    // Remember me only adds on success; does NOT erase when unchecked
    const [remember, setRemember] = useState<boolean>(false);

    // Suggestions & manage modal
    const [savedLogins, setSavedLogins] = useState<string[]>(() => readSavedLogins());
    const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
    const [showManage, setShowManage] = useState<boolean>(false);
    const inputWrapRef = useRef<HTMLDivElement | null>(null);

    // Cosmetic prefs
    const [lang, setLang] = useState<string>(() => localStorage.getItem('lang') || 'en');
    const [dark, setDark] = useState<boolean>(() => localStorage.getItem('mode') === 'dark');

    const nav = useNavigate();

    // Force navigation helper (logs + hard fallback if router nav doesn’t stick)
    const forceNavigate = (path: string) => {
        console.log('[Login] navigating to', path);
        nav(path, { replace: true });
        setTimeout(() => {
            if (window.location.pathname !== path) {
                console.log('[Login] router navigation didn’t stick → hard redirect to', path);
                window.location.assign(path);
            }
        }, 150);
    };

    // ---- Effects ----
    useEffect(() => { setActiveIdx(-1); }, [login]);

    useEffect(() => {
        document.documentElement.classList.toggle('dark', dark);
        localStorage.setItem('mode', dark ? 'dark' : 'light');
    }, [dark]);

    useEffect(() => {
        localStorage.setItem('lang', lang);
    }, [lang]);

    useEffect(() => {
        const onDocClick = (e: MouseEvent) => {
            if (!inputWrapRef.current) return;
            if (!inputWrapRef.current.contains(e.target as Node)) setShowSuggestions(false);
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);

    // Filter suggestions as user types
    const filteredSuggestions = useMemo(() => {
        const q = login.trim().toLowerCase();
        if (!q) return savedLogins;
        return savedLogins.filter((s) => s.toLowerCase().includes(q));
    }, [login, savedLogins]);

    // ---- Actions ----

    // Validate username without requesting OTP
    const validateUser = async () => {
        setErr(null);
        if (!login.trim()) {
            setErr('Enter email or phone');
            return;
        }
        try {
            setBusy(true);
            // GET /auth/exists?login=... -> { ok: true, exists: boolean }
            const { data } = await api.get('/auth/exists', { params: { login } });
            if (data?.ok && data.exists === true) {
                console.log('[Login.validateUser] user exists → show OTP');
                setStep('otp'); // we do NOT call /auth/otp/request here
            } else {
                setErr('User does not exist. Check if the username is correct!');
            }
        } catch (e: any) {
            const msg =
                e?.response?.status === 404
                    ? 'Username validation endpoint not found (GET /auth/exists).'
                    : (e?.response?.data?.error || 'Failed to validate username');
            setErr(msg);
        } finally {
            setBusy(false);
        }
    };

    // Verify OTP
    const verify = async () => {
        setErr(null);
        try {
            setBusy(true);
            console.log('[Login.verify] verifying OTP for', login);
            // POST /auth/otp/verify { login, code } -> { ok, token, user }
            const { data } = await api.post('/auth/otp/verify', { login, code });
            console.log('[Login.verify] response:', data);

            if (!data?.ok) {
                setErr(data?.error || 'Invalid OTP');
                return;
            }

            // Persist session
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            console.log('[Login.verify] token saved, user:', data.user);

            // Remember only on success and if checked
            if (remember) {
                addSavedLogin(login);
                setSavedLogins(readSavedLogins());
                console.log('[Login.verify] remember=true → saved username');
            }

            // Decide route: JWT payload is source of truth; fallback to user flag
            const payload = decodeJwtPayload(data.token);
            const isAdmin = !!(payload && payload.isSuperAdmin);
            console.log('[Login.verify] payload:', payload, 'user.isSuperAdmin:', data.user?.isSuperAdmin);

            if (isAdmin || data.user?.isSuperAdmin) {
                console.log('[Login.verify] admin detected → /admin');
                forceNavigate('/admin');
                return;
            }
            console.log('[Login.verify] non-admin → /landing');
            forceNavigate('/landing');
            return;
        } catch (e: any) {
            const msg = e?.response?.data?.error || 'Failed to verify OTP';
            console.log('[Login.verify] error:', msg, e);
            setErr(msg);
        } finally {
            setBusy(false);
        }
    };

    // ---- UI helpers ----
    const inputBase =
        'border rounded w-full p-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/70 focus:border-emerald-500';
    const btnPrimary =
        'w-full py-3 rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60 disabled:cursor-not-allowed';
    const btnSecondary = 'w-full py-3 rounded border hover:bg-gray-50';

    // const onEnterLogin = (e: React.KeyboardEvent<HTMLInputElement>) =>
    //     e.key === 'Enter' && validateUser();
    const onEnterOtp = (e: React.KeyboardEvent<HTMLInputElement>) =>
        e.key === 'Enter' && code.trim().length >= 6 && verify();

    // Commit the currently highlighted suggestion
    const commitSelection = (index: number) => {
        const val = filteredSuggestions[index];
        if (!val) return;
        setLogin(val);
        setShowSuggestions(false);
        setActiveIdx(-1);
    };

    // Handle keyboard on the username input
    const handleLoginKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const open = showSuggestions && filteredSuggestions.length > 0;

        switch (e.key) {
            case 'ArrowDown': {
                e.preventDefault();
                if (!open) {
                    setShowSuggestions(true);
                    setActiveIdx(0);
                } else {
                    setActiveIdx((prev) => (prev + 1) % filteredSuggestions.length);
                }
                break;
            }
            case 'ArrowUp': {
                e.preventDefault();
                if (!open) {
                    setShowSuggestions(true);
                    setActiveIdx(filteredSuggestions.length - 1);
                } else {
                    setActiveIdx((prev) => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length);
                }
                break;
            }
            case 'Home': {
                if (open) { e.preventDefault(); setActiveIdx(0); }
                break;
            }
            case 'End': {
                if (open) { e.preventDefault(); setActiveIdx(filteredSuggestions.length - 1); }
                break;
            }
            case 'Enter': {
                if (open && activeIdx >= 0) {
                    e.preventDefault();
                    commitSelection(activeIdx);
                } else {
                    // No menu or nothing highlighted → validate username
                    validateUser();
                }
                break;
            }
            case 'Escape': {
                if (open) {
                    e.preventDefault();
                    setShowSuggestions(false);
                    setActiveIdx(-1);
                }
                break;
            }
            default:
                // allow normal typing / Tab etc.
                break;
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

                        {/* Prefs */}
                        <div className="flex items-center gap-3">
                            <select
                                className="border rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800 dark:text-white"
                                value={lang}
                                onChange={(e) => setLang(e.target.value)}
                                aria-label="Select language"
                            >
                                <option value="en">English</option>
                                <option value="hi">हिन्दी</option>
                                <option value="ta">தமிழ்</option>
                            </select>
                            <button
                                type="button"
                                onClick={() => setDark((v) => !v)}
                                className="px-3 py-2 rounded border text-sm bg-white dark:bg-neutral-800 dark:text-white"
                                title="Toggle Light/Dark"
                            >
                                {dark ? 'Light Mode' : 'Dark Mode'}
                            </button>
                        </div>
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
                                        onKeyDown={handleLoginKeyDown}             // ✅ new key handler
                                        onFocus={() => setShowSuggestions(true)}
                                        onBlur={() => setTimeout(() => setShowSuggestions(false), 0)}
                                        autoFocus
                                        autoComplete="off"
                                        role="combobox"                             // ✅ ARIA
                                        aria-expanded={showSuggestions && filteredSuggestions.length > 0}
                                        aria-controls={listboxId}
                                        aria-autocomplete="list"
                                        aria-activedescendant={
                                            activeIdx >= 0 ? `${listboxId}-opt-${activeIdx}` : undefined
                                        }
                                    />

                                    {showSuggestions && filteredSuggestions.length > 0 && (
                                        <div className="absolute left-0 right-0 z-10 mt-1 rounded-md border bg-white dark:bg-neutral-800 dark:text-white shadow">
                                            <ul
                                                id={listboxId}
                                                role="listbox"                          // ✅ ARIA
                                                className="max-h-56 overflow-auto text-sm"
                                            >
                                                {filteredSuggestions.map((s, i) => {
                                                    const active = i === activeIdx;
                                                    return (
                                                        <li
                                                            key={s + i}
                                                            id={`${listboxId}-opt-${i}`}      // ✅ ARIA
                                                            role="option"
                                                            aria-selected={active}
                                                            onMouseEnter={() => setActiveIdx(i)}       // hover highlights
                                                            onMouseLeave={() => setActiveIdx(-1)}
                                                        >
                                                            <button
                                                                type="button"
                                                                onMouseDown={(e) => e.preventDefault()}   // keep input focus
                                                                onClick={() => commitSelection(i)}        // click selects
                                                                className={
                                                                    'w-full text-left px-3 py-2 ' +
                                                                    (active
                                                                        ? 'bg-emerald-50 dark:bg-neutral-700'
                                                                        : 'hover:bg-emerald-50 dark:hover:bg-neutral-700')
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


                                <button
                                    type="button"
                                    onClick={validateUser}
                                    className={btnPrimary}
                                    disabled={busy || !login.trim()}
                                >
                                    {busy ? 'Checking…' : 'Send OTP'}
                                </button>

                                {/* Remember + Manage */}
                                <div className="mt-2 flex items-center justify-between">
                                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4"
                                            checked={remember}
                                            onChange={(e) => setRemember(e.target.checked)}
                                        />
                                        Remember me on this device
                                    </label>
                                    <button
                                        type="button"
                                        className="text-sm text-emerald-700 hover:underline"
                                        onClick={() => setShowManage(true)}
                                    >
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
                                        By continuing, you agree to our{' '}
                                        <a className="text-emerald-700 hover:underline" href="/terms">
                                            Terms
                                        </a>{' '}
                                        and{' '}
                                        <a className="text-emerald-700 hover:underline" href="/privacy">
                                            Privacy Policy
                                        </a>
                                        .
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

                                <button
                                    type="button"
                                    onClick={verify}
                                    className={btnPrimary}
                                    disabled={busy || code.trim().length < 6}
                                >
                                    {busy ? 'Verifying…' : 'Verify & Continue'}
                                </button>

                                <button type="button" onClick={() => setStep('enter')} className={btnSecondary}>
                                    Back
                                </button>
                            </>
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
                                <button
                                    className="px-2 py-1 rounded border text-sm hover:bg-gray-50 dark:hover:bg-neutral-800"
                                    onClick={() => setShowManage(false)}
                                >
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
                                <div className="text-xs text-gray-600 dark:text-gray-400">
                                    Removing does not affect server accounts—only local suggestions.
                                </div>
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
