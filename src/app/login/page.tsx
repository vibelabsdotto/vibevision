"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { buttonClasses, inputClasses, surfaceClasses } from "@/app/components/ui";
import { authClient } from "@/app/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    const { error: signInError } = await authClient.signIn.email({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? "")
    });
    if (signInError) {
      setError(signInError.message ?? "Login failed");
      setLoading(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className={`${surfaceClasses} w-full max-w-sm p-6 sm:p-8`}>
        <p className="eyebrow">VibeVision</p>
        <h1 className="mt-2 font-display text-3xl tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm text-ink-2">
          12 Week Year execution OS. Ask your operator for an account.
        </p>
        <form className="mt-6 space-y-4" method="post" onSubmit={onSubmit}>
          <label className="block text-sm text-ink-2">
            Email
            <input
              autoComplete="email"
              className={`${inputClasses} mt-2`}
              name="email"
              placeholder="you@example.com"
              required
              type="email"
            />
          </label>
          <label className="block text-sm text-ink-2">
            Password
            <input
              autoComplete="current-password"
              className={`${inputClasses} mt-2`}
              name="password"
              placeholder="••••••••"
              required
              type="password"
            />
          </label>
          {error ? <p className="rounded-[12px] bg-error/10 px-4 py-3 text-sm text-error">{error}</p> : null}
          <button className={`${buttonClasses} w-full`} disabled={loading} type="submit">
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
