import { auth, signOut } from "@/auth";

export default async function AuthHeader() {
  const session = await auth();

  if (!session?.user) return null;

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <div className="text-sm font-medium text-slate-900">
          Duodeal Dashboard
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-600">{session.user.email}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/signin" });
            }}
          >
            <button
              type="submit"
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
