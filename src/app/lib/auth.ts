import { cookies } from "next/headers";

import { pbAuthCookieName } from "@/app/lib/crypto";
import { clearPbAuth, pb, setPbAuth } from "@/app/lib/pb";

export type AuthState = {
  token: string;
  user: { id: string; email: string } | null;
};

/**
 * Reads the PocketBase auth cookie, validates it against PocketBase (authRefresh)
 * and installs the session on the shared PB client used by all core functions.
 */
export async function getAuth(): Promise<AuthState> {
  const cookieStore = await cookies();
  const token = cookieStore.get(pbAuthCookieName())?.value ?? "";

  if (!token) {
    clearPbAuth();
    return { token: "", user: null };
  }

  try {
    // install the token BEFORE refreshing — authRefresh uses the authStore token
    setPbAuth(token, { id: "", email: "" });
    const refresh = await pb.collection("users").authRefresh();
    const record = refresh.record as unknown as { id: string; email: string };
    if (refresh.token) {
      setPbAuth(refresh.token, { id: record.id, email: record.email });
    }
    return { token: refresh.token || token, user: { id: record.id, email: record.email } };
  } catch {
    clearPbAuth();
    return { token: "", user: null };
  }
}

export async function requireAuth(): Promise<AuthState> {
  const auth = await getAuth();
  if (!auth.user) {
    const { redirect } = await import("next/navigation");
    redirect("/login");
  }
  return auth;
}