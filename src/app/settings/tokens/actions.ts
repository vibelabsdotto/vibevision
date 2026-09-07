"use server";

import { revalidatePath } from "next/cache";

import { serverApiFetch } from "@/app/lib/api";
import { requireAuth } from "@/app/lib/auth";
import { sessionCookie } from "@/app/lib/server-auth";

export type CreatedToken = {
  id: string;
  token: string;
  prefix: string;
};

/**
 * Token creation via Server Action (mirrors revokeTokenAction in page.tsx).
 * The session cookie is forwarded server-to-server, so creation never depends
 * on the browser sending cross-site cookies to the API.
 * Returns the plaintext token exactly once — the caller must display it
 * immediately and never persist it.
 */
export async function createTokenAction(name: string): Promise<CreatedToken> {
  await requireAuth();
  const label = name.trim() || `cli-${new Date().toISOString().slice(0, 10)}`;
  const data = await serverApiFetch<CreatedToken>("/v1/tokens", await sessionCookie(), {
    method: "POST",
    body: { name: label }
  });
  revalidatePath("/settings/tokens");
  return data;
}
