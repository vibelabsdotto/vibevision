import { revalidatePath } from "next/cache";

import { SectionHeader, surfaceClasses } from "@/app/components/ui";
import { serverApiFetch } from "@/app/lib/api";
import { requireAuth } from "@/app/lib/auth";
import { sessionCookie } from "@/app/lib/server-auth";
import { TokenForm } from "./token-form";

type TokenRow = {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
};

async function listTokens(): Promise<TokenRow[]> {
  const data = await serverApiFetch<{ tokens: TokenRow[] }>("/v1/tokens", await sessionCookie());
  return data.tokens;
}

export async function revokeTokenAction(formData: FormData) {
  "use server";
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing token id");
  await serverApiFetch(`/v1/tokens/${id}`, await sessionCookie(), { method: "DELETE" });
  revalidatePath("/settings/tokens");
}

export default async function TokensPage() {
  await requireAuth();
  const tokens = await listTokens();

  return (
    <div className="space-y-6">
      <section className={`${surfaceClasses} p-5 sm:p-7`}>
        <SectionHeader
          eyebrow="CLI access without passwords."
          title="API tokens"
        />
        <p className="mt-4 max-w-3xl text-sm leading-6 text-ink-2 sm:text-base">
          Tokens authenticate the <code className="rounded bg-surface-2 px-1 font-mono text-xs">vibevision</code> CLI
          and agents. A token is shown once at creation — copy it with{" "}
          <code className="rounded bg-surface-2 px-1 font-mono text-xs">vibevision auth login --token &lt;vv_…&gt;</code>.
        </p>
        <TokenForm />
      </section>

      <section className={`${surfaceClasses} p-5 sm:p-7`}>
        <SectionHeader eyebrow={`${tokens.length} token${tokens.length === 1 ? "" : "s"}.`} title="Active tokens" />
        <div className="mt-6 space-y-3">
          {tokens.map((token) => (
            <div
              className="flex items-center justify-between gap-4 rounded-[16px] border border-border bg-surface-2/50 p-4"
              key={token.id}
            >
              <div>
                <p className="font-medium">{token.name}</p>
                <p className="mt-1 font-mono text-xs text-ink-3">
                  {token.prefix}… · last used {token.last_used_at ?? "never"}
                </p>
              </div>
              <form action={revokeTokenAction}>
                <input name="id" type="hidden" value={token.id} />
                <button
                  className="min-h-11 rounded-[12px] border border-error/30 px-4 text-sm text-error transition hover:bg-error/10"
                  type="submit"
                >
                  Revoke
                </button>
              </form>
            </div>
          ))}
          {!tokens.length ? <p className="text-sm text-ink-3">No tokens yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
