"use client";

import { Suspense } from "react";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/admin/competitions";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Login failed.");
      }
      router.replace(
        nextPath.startsWith("/") ? nextPath : "/admin/competitions",
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,oklch(0.98_0.05_160),transparent_60%),radial-gradient(circle_at_bottom,oklch(0.97_0.06_95),transparent_55%)] px-4 py-10 text-foreground">
      <Card className="w-full max-w-md bg-white/90 backdrop-blur-sm">
        <CardContent className="px-6">
          <div className="border-b border-border pb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Admin Access
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Sign in
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter the admin password to manage competitions.
            </p>
          </div>

          <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-2 text-sm font-medium">
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                autoComplete="current-password"
                autoFocus
              />
            </label>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <Button type="submit" disabled={isSubmitting || password.length === 0}>
              {isSubmitting ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,oklch(0.98_0.05_160),transparent_60%),radial-gradient(circle_at_bottom,oklch(0.97_0.06_95),transparent_55%)] px-4 py-10 text-foreground">
          <Card className="w-full max-w-md bg-white/90 backdrop-blur-sm">
            <CardContent className="px-6">
              <p className="text-sm font-semibold">Loading sign in</p>
            </CardContent>
          </Card>
        </div>
      }
    >
      <AdminLoginForm />
    </Suspense>
  );
}
