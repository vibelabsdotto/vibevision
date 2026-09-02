import { pbAuthCookieName } from "@/app/lib/crypto";

/**
 * Logout endpoint. Called as form POST from the layout header.
 * Clears the auth cookie and redirects back to /login.
 */
export async function POST(request: Request) {
  const response = new Response(null, { status: 303, headers: { Location: "/login" } });
  response.headers.append("Set-Cookie", `${pbAuthCookieName()}=; Path=/; Max-Age=0; SameSite=Lax`);
  return response;
}