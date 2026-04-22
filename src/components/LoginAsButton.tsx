"use client";

interface Props {
  userId: string;
  disabled?: boolean;
  label?: string;
}

/**
 * Opens the impersonation URL in a new tab via our /api/impersonate endpoint.
 * The actual token is fetched just-in-time server-side so it doesn't sit in
 * the HTML source.
 */
export function LoginAsButton({ userId, disabled, label = "Login as" }: Props) {
  if (disabled) {
    return (
      <button
        disabled
        className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-400"
      >
        {label}
      </button>
    );
  }
  return (
    <a
      href={`/api/impersonate/${encodeURIComponent(userId)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center rounded-md border border-emerald-700 bg-emerald-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-800 transition"
    >
      {label} →
    </a>
  );
}
