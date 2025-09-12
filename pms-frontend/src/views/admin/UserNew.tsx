import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import ConfirmModal from '../../components/ConfirmModal';

const ROLES = [
  'Admin','Customer','PMC','Architect','Designer','Contractor',
  'Legal/Liasoning','Ava-PMT','Engineer (Contractor)',
  'DC (Contractor)','DC (PMC)','Inspector (PMC)','HOD (PMC)',
] as const;

type DialOption = { code: string; dial: string; label: string; flag: string };
const DIALS: DialOption[] = [
  { code: 'IN', dial: '+91',  label: 'India',                 flag: '🇮🇳' },
  { code: 'US', dial: '+1',   label: 'United States',         flag: '🇺🇸' },
  { code: 'AE', dial: '+971', label: 'United Arab Emirates',  flag: '🇦🇪' },
  { code: 'SG', dial: '+65',  label: 'Singapore',             flag: '🇸🇬' },
  { code: 'GB', dial: '+44',  label: 'United Kingdom',        flag: '🇬🇧' },
  { code: 'AU', dial: '+61',  label: 'Australia',             flag: '🇦🇺' },
];

export default function AdminUserNew(){
  const nav = useNavigate();

  const [form, setForm] = useState({
    code: '',                 // auto-filled from role
    role: ROLES[0],
    name: '',
    city: '',
    email: '',
    dial: DIALS[0].dial,      // e.g. "+91"
    phoneLocal: '',           // 10 digits (no leading 0)
    isSuperAdmin: false,
    status: 'Active' as 'Active'|'Inactive',
  });

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string|null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // E.164 preview (for display only)
  const phonePreview = useMemo(() => {
    const digits = form.phoneLocal.replace(/\D/g, '');
    return digits ? `${form.dial}${digits}` : '';
  }, [form.dial, form.phoneLocal]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm(s => ({ ...s, [k]: v }));

  const sanitizeLocal = (v: string) => v.replace(/\D/g, '').slice(0, 10);

  function validateLocalPhone(local: string): string | null {
    const d = local.replace(/\D/g, '');
    if (!d) return null; // optional field
    if (d.length !== 10) return 'Phone must be exactly 10 digits.';
    if (d.startsWith('0')) return 'Phone must not start with 0.';
    if (/^(\d)\1{9}$/.test(d)) return 'Phone number seems invalid (repeated digits).';
    return null;
  }

  // Auto-generate user code when role changes (and on first render)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(endpoints.admin.usersNextCode, { params: { role: form.role } });
        if (!cancelled && data?.ok && data.code) setForm(s => ({ ...s, code: data.code }));
      } catch {
        // if not ready, backend will still generate on submit
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.role]);

  const submit = async () => {
    setErr(null);

    if (!form.name.trim()) { setErr('Name is required'); return; }

    const hasEmail = !!form.email.trim();
    const hasPhone = !!form.phoneLocal.trim();

    if (!hasEmail && !hasPhone) {
      setErr('Provide either Email or Phone.'); return;
    }

    if (hasPhone) {
      const pe = validateLocalPhone(form.phoneLocal);
      if (pe) { setErr(pe); return; }
    }

    try {
      setBusy(true);

      // Save split fields: countryCode (digits only) and phone (10-digit local)
      const payload = {
        code: form.code,
        role: form.role,
        name: form.name.trim(),
        city: form.city.trim() || undefined,
        email: form.email.trim() || undefined,
        countryCode: form.dial.replace('+', ''), // e.g. "91"
        phone: form.phoneLocal || undefined,     // e.g. "9876543210"
        isSuperAdmin: form.isSuperAdmin,
        status: form.status,
      };

      const { data } = await api.post(endpoints.admin.users, payload);
      if (data?.ok || data?.userId) {
        setConfirmOpen(true);
      } else {
        setErr(data?.error || 'Failed to create user');
      }
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Failed to create user');
    } finally {
      setBusy(false);
    }
  };

  const input = 'border rounded w-full p-3';
  const select = 'border rounded w-full p-3 bg-white';
  const phoneError = validateLocalPhone(form.phoneLocal);

  return (
    <div className="min-h-screen p-6 bg-gray-50">
      <div className="max-w-3xl mx-auto bg-white border rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Create New User</h2>
          <button className="border rounded px-3 py-1" onClick={()=>nav(-1)}>Back</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Role & Auto Code */}
          <div>
            <label className="text-sm">Role</label>
            <select className={select} value={form.role} onChange={e=>set('role', e.target.value as typeof form.role)}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm">Auto Code</label>
            <input className={input} value={form.code} readOnly title="Auto-generated from role" />
          </div>

          {/* Basic details */}
          <div>
            <label className="text-sm">Name</label>
            <input className={input} value={form.name} onChange={e=>set('name', e.target.value)} />
          </div>
          <div>
            <label className="text-sm">City</label>
            <input className={input} value={form.city} onChange={e=>set('city', e.target.value)} />
          </div>

          {/* Email */}
          <div>
            <label className="text-sm">Email</label>
            <input
              className={input}
              type="email"
              value={form.email}
              onChange={e=>set('email', e.target.value)}
              placeholder="name@example.com"
            />
          </div>

          {/* Phone (Country code + local 10-digit) */}
          <div className="sm:col-span-2">
            <label className="text-sm">Phone</label>
            <div className="flex gap-2">
              <select
                className="border rounded px-3 py-3 bg-white min-w-[9rem]"
                value={form.dial}
                onChange={e=>set('dial', e.target.value)}
                title="Country code"
              >
                {DIALS.map(d => (
                  <option key={d.code} value={d.dial}>
                    {d.flag} {d.label} ({d.dial})
                  </option>
                ))}
              </select>
              <input
                className={`border rounded w-full p-3 ${phoneError ? 'border-red-400' : ''}`}
                inputMode="numeric"
                pattern="\d*"
                value={form.phoneLocal}
                onChange={e=>set('phoneLocal', sanitizeLocal(e.target.value))}
                placeholder="10 digit phone (e.g., 9876543210)"
                title="Exactly 10 digits, not starting with 0"
                maxLength={10}
              />
            </div>
            <div className="mt-1 text-xs">
              {phoneError
                ? <span className="text-red-600">{phoneError}</span>
                : form.phoneLocal
                  ? <span className="text-gray-600">Will save as countryCode=<b>{form.dial.replace('+','')}</b> & phone=<b>{form.phoneLocal}</b> ({phonePreview})</span>
                  : <span className="text-gray-500">Enter a 10-digit phone number (not starting with 0), or leave blank and use email.</span>
              }
            </div>
          </div>

          {/* Super admin */}
          <div className="sm:col-span-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isSuperAdmin} onChange={e=>set('isSuperAdmin', e.target.checked)} />
              Super Admin (full access)
            </label>
          </div>
<div>
  <label className="text-sm">Status</label>
  <select
    className="border rounded w-full p-3 bg-white"
    value={form.status}
    onChange={e => setForm(s => ({ ...s, status: e.target.value as 'Active'|'Inactive' }))}
  >
    <option value="Active">Active</option>
    <option value="Inactive">Inactive</option>
  </select>
</div>


        </div>

        {err && <div className="text-red-600 text-sm">{err}</div>}

        <button
          disabled={busy}
          onClick={submit}
          className="px-4 py-2 rounded bg-emerald-600 text-white disabled:opacity-60"
        >
          {busy ? 'Submitting…' : 'Submit'}
        </button>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="User created"
        description={`User ${form.name} (${form.code}) was created successfully.`}
        onConfirm={() => nav('/admin', { replace: true })}
        onOpenChange={setConfirmOpen}
      />
    </div>
  );
}
