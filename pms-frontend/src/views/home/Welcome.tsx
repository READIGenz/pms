// pms-frontend/src/views/home/Welcome.tsx

import { useMemo, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

/* ---------------- helpers ---------------- */
const normalizeRole = (raw?: string) => {
  const norm = (raw || "")
    .toString()
    .trim()
    .replace(/[_\s-]+/g, "")
    .toLowerCase();
  switch (norm) {
    case "admin":
      return "Admin";
    case "client":
      return "Client";
    case "ihpmt":
      return "IH-PMT";
    case "contractor":
      return "Contractor";
    case "consultant":
      return "Consultant";
    case "pmc":
      return "PMC";
    case "supplier":
      return "Supplier";
    default:
      return raw || "";
  }
};

const isServiceProviderRole = (role?: string) => {
  const r = normalizeRole(role);
  return ["Contractor", "Consultant", "Supplier", "PMC", "IH-PMT"].includes(r);
};

export default function Welcome() {
  const { user, claims } = useAuth();
  const navigate = useNavigate();

  const firstName =
    user?.firstName ?? claims?.firstName ?? user?.name ?? claims?.name ?? "there";
  const lastName = user?.lastName ?? claims?.lastName ?? "";
  const email = user?.email ?? claims?.email ?? "";
  const photo = user?.profilePhoto ?? (claims as any)?.profilePhoto ?? "";

  // Try multiple fields for phone number
  const mobile =
    (user as any)?.mobile ??
    (user as any)?.phone ??
    (claims as any)?.mobile ??
    (claims as any)?.phone ??
    "";

  // Try multiple fields for role
  const rawRole =
    (user as any)?.role ??
    (claims as any)?.role ??
    (claims as any)?.userRole ??
    (claims as any)?.roleName ??
    "";
  const role = normalizeRole(rawRole);
  const showServiceProviderLine = isServiceProviderRole(role);

  const displayName = useMemo(() => {
    const fn = (firstName || "").toString().trim();
    const ln = (lastName || "").toString().trim();
    return (fn + (ln ? ` ${ln}` : "")).trim() || "there";
  }, [firstName, lastName]);

  const initials = useMemo(() => {
    const [a = "", b = ""] = displayName.split(" ");
    return ((a[0] || "") + (b[0] || "")).toUpperCase() || "U";
  }, [displayName]);

  // --- Welcome toast state ---
  const [showWelcomeToast, setShowWelcomeToast] = useState(false);

  useEffect(() => {
    setShowWelcomeToast(true);
    const timer = setTimeout(() => setShowWelcomeToast(false), 3500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <section className="relative overflow-hidden bg-white dark:bg-neutral-950 rounded-2xl shadow-sm border border-slate-200/80 dark:border-white/10 p-5 sm:p-6 lg:p-8">
        {/* Top 1px brand gradient bar */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-[#00379C] via-[#23A192] to-[#FCC020]" />

        {/* Subtle background wash */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full blur-3xl opacity-[0.10] dark:opacity-[0.08]"
          style={{
            background:
              "radial-gradient(circle at 30% 30%, #00379C 0%, transparent 60%), radial-gradient(circle at 70% 70%, #23A192 0%, transparent 60%), radial-gradient(circle at 50% 50%, #FCC020 0%, transparent 65%)",
          }}
        />

        <div className="relative mx-auto max-w-3xl flex flex-col md:flex-row items-center md:items-start gap-6 md:gap-8">
          {/* Avatar */}
          <div className="flex-shrink-0">
            {photo ? (
              <img
                src={photo}
                alt={displayName}
                referrerPolicy="no-referrer"
                className="rounded-full object-cover ring-2 ring-[#00379C]/15 dark:ring-[#FCC020]/20 w-[clamp(64px,12vw,96px)] h-[clamp(64px,12vw,96px)]"
              />
            ) : (
              <div className="grid place-items-center rounded-full text-white ring-2 ring-[#00379C]/15 dark:ring-[#FCC020]/20 font-semibold w-[clamp(64px,12vw,96px)] h-[clamp(64px,12vw,96px)] bg-gradient-to-br from-[#00379C] via-[#23A192] to-[#FCC020]">
                {initials}
              </div>
            )}
          </div>

          {/* Text + CTA */}
          <div className="w-full text-center md:text-left space-y-2 md:space-y-3">
            <div>
              <h1 className="mt-1 text-2xl md:text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
                Welcome, {displayName}!
              </h1>
            </div>

            {(email || mobile) && (
              <div className="space-y-1">
                {email && (
                  <p className="text-sm text-slate-600 dark:text-neutral-400 break-words">
                    {email}
                  </p>
                )}
                {mobile && (
                  <p className="text-sm text-slate-600 dark:text-neutral-400 break-words">
                    {mobile}
                  </p>
                )}
              </div>
            )}

            {showServiceProviderLine && (
              <div className="pt-1">
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-neutral-900/60 dark:border-white/10 dark:text-neutral-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#23A192]" />
                  Logged in as {role}
                </span>
              </div>
            )}

            <p className="text-sm md:text-base text-slate-600 dark:text-neutral-400">
              Your personalized workspace brings together inspections, approvals, and
              project updates in one place.
            </p>

            <div className="pt-4 flex justify-center md:justify-start">
              <button
                onClick={() => navigate("tiles")}
                className="inline-flex justify-center items-center gap-2 w-full sm:w-auto h-10 rounded-full px-6 bg-[#00379C] text-white text-sm font-medium shadow-sm hover:brightness-110 active:scale-[0.99] transition
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00379C]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white
                           dark:focus-visible:ring-[#FCC020]/35 dark:focus-visible:ring-offset-neutral-950"
              >
                Continue to workspace
                <svg width="16" height="16" viewBox="0 0 24 24" className="fill-current">
                  <path d="M13.172 12 8.222 7.05l1.414-1.414L16 12l-6.364 6.364-1.414-1.414z" />
                </svg>
              </button>
            </div>

            {/* Optional quick chips (keeps UI consistent with the rest of the theme) */}
            <div className="pt-3 flex flex-wrap justify-center md:justify-start gap-2">
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 dark:bg-neutral-950 dark:border-white/10 dark:text-neutral-200">
                Fast approvals
              </span>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 dark:bg-neutral-950 dark:border-white/10 dark:text-neutral-200">
                Centralized updates
              </span>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 dark:bg-neutral-950 dark:border-white/10 dark:text-neutral-200">
                One dashboard
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Auto-dismiss welcome toast */}
      {showWelcomeToast && (
        <div className="fixed inset-x-0 top-4 z-40 flex justify-center px-4">
          <div className="inline-flex items-center gap-3 rounded-full bg-white/95 dark:bg-neutral-950/95 border border-slate-200/80 dark:border-white/10 shadow-lg px-4 py-2 text-sm text-slate-800 dark:text-neutral-100">
            <div className="h-8 w-8 rounded-full grid place-items-center bg-gradient-to-br from-[#00379C] via-[#23A192] to-[#FCC020]">
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 2C9 6 7 8.5 7 11a5 5 0 1 0 10 0c0-2.5-2-5-5-9z"
                  className="fill-white/95"
                />
              </svg>
            </div>
            <span className="font-medium">Welcome to Trinity PMS</span>
          </div>
        </div>
      )}
    </>
  );
}
