import { getSession, type ServerUser } from "@/app/lib/server-auth";

export type AuthState = {
  user: ServerUser | null;
};

/**
 * Reads the Better-Auth session (via the API) for Server Components.
 * No token handling here — the session cookie goes straight to the API.
 */
export async function getAuth(): Promise<AuthState> {
  const session = await getSession();
  return { user: session?.user ?? null };
}

export async function requireAuth(): Promise<AuthState> {
  const auth = await getAuth();
  if (!auth.user) {
    const { redirect } = await import("next/navigation");
    redirect("/login");
  }
  return auth;
}
