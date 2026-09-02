import { pbAuthCookieName, setAuthCookie } from "@/app/lib/crypto";
import { pb } from "@/app/lib/pb";

type PbRecord = Record<string, unknown>;

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Login failed";
  const status = typeof (error as { status?: number })?.status === "number" ? (error as { status: number }).status : 500;
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as { email?: string; password?: string };
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = (body.email ?? "").trim();
  const password = body.password ?? "";
  if (!email || !password) {
    return Response.json({ error: "Email and password are required" }, { status: 400 });
  }

  try {
    await pb.collection("users").authWithPassword(email, password);
  } catch (error) {
    return errorResponse(error);
  }

  const token = pb.authStore.token;
  if (!token) {
    return Response.json({ error: "PocketBase did not return an auth token" }, { status: 500 });
  }

  const response = Response.json({
    ok: true,
    user: pb.authStore.record ? { id: pb.authStore.record.id, email: (pb.authStore.record as PbRecord).email } : null
  });
  response.headers.append("Set-Cookie", `${pbAuthCookieName()}=${token}; ${setAuthCookie(token)}`);
  return response;
}

export async function GET() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}