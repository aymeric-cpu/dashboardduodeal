import { signIn } from "@/auth";

type SearchParams = Promise<{ callbackUrl?: string; error?: string }>;

export default async function SignInPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { callbackUrl, error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">
          Duodeal Dashboard
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Sign in with your{" "}
          <span className="font-medium text-slate-900">@duodeal.com</span> Google
          account to continue.
        </p>

        {error && (
          <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error === "AccessDenied" || error === "Forbidden"
              ? "Access denied. Only @duodeal.com accounts are allowed."
              : `Sign-in error: ${error}`}
          </div>
        )}

        <form
          action={async () => {
            "use server";
            await signIn("google", {
              redirectTo: callbackUrl || "/",
            });
          }}
          className="mt-8"
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm transition hover:bg-slate-50"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
            >
              <path
                fill="#EA4335"
                d="M12 10.2v3.9h5.5c-.24 1.4-1.67 4.1-5.5 4.1-3.31 0-6-2.74-6-6.1s2.69-6.1 6-6.1c1.88 0 3.14.8 3.86 1.49l2.64-2.55C16.93 3.33 14.7 2.4 12 2.4 6.9 2.4 2.8 6.5 2.8 11.6s4.1 9.2 9.2 9.2c5.31 0 8.83-3.73 8.83-8.98 0-.6-.07-1.06-.15-1.52H12z"
              />
            </svg>
            Sign in with Google
          </button>
        </form>

        <p className="mt-6 text-xs text-slate-500">
          Usage monitoring for Duodeal clients. Restricted to Stage&apos;In team
          members.
        </p>
      </div>
    </main>
  );
}
