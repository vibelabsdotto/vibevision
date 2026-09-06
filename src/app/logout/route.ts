import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiUrl } from "@/app/lib/env";

/**
 * Logout endpoint. Called as form POST from the sidebar.
 * Signs out against the API (clears the server session) and redirects to /login.
 */
export async function POST() {
  const jar = await cookies();
  try {
    await fetch(`${apiUrl()}/api/auth/sign-out`, {
      method: "POST",
      headers: { cookie: jar.toString() },
      cache: "no-store"
    });
  } catch {
    // API down — still clear local cookies below.
  }
  redirect("/login");
}
