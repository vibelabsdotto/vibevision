"use client";

import { useState } from "react";

import { createTokenAction } from "./actions";

export function TokenForm() {
  const [name, setName] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setToken(null);
    try {
      // Creation runs as a Server Action (session cookie forwarded
      // server-to-server) — the browser never calls /v1/* cross-site.
      const data = await createTokenAction(name);
      setToken(data.token);
      setName("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Creation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 max-w-md">
      <form className="flex gap-3" onSubmit={onSubmit}>
        <input
          className="min-h-11 flex-1 rounded-[12px] border border-border bg-surface-2 px-4 text-sm"
          name="name"
          onChange={(event) => setName(event.target.value)}
          placeholder="Token label (e.g. max-cli)"
          value={name}
        />
        <button
          className="min-h-11 rounded-[12px] bg-ink px-5 text-sm font-medium text-white dark:bg-white dark:text-black"
          disabled={loading}
          type="submit"
        >
          {loading ? "…" : "Create"}
        </button>
      </form>
      {error ? <p className="mt-3 rounded-[12px] bg-error/10 px-4 py-3 text-sm text-error">{error}</p> : null}
      {token ? (
        <div className="mt-3 rounded-[12px] border border-teal/40 bg-teal/10 px-4 py-3">
          <p className="text-sm font-medium">Copy now — shown once:</p>
          <p className="mt-1 break-all font-mono text-xs">{token}</p>
          <p className="mt-2 text-xs text-ink-2">
            Store it with <code className="font-mono">vibevision auth login --token {token}</code>
          </p>
        </div>
      ) : null}
    </div>
  );
}
