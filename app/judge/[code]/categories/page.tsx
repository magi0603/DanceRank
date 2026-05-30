"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Category = {
  id: string;
  name: string;
  discipline: string;
  ageGroup: string;
  status?: "draft" | "active" | "completed";
  slug: string;
  activeRoundId?: string | null;
  activeRoundName?: string | null;
  activeRoundType?: string | null;
  judgeProgress?: {
    required: number;
    submitted: number;
    allSubmitted: boolean;
  };
};

export default function CategorySelectPage() {
  const params = useParams();
  const codeParam =
    typeof params?.code === "string"
      ? params.code
      : Array.isArray(params?.code)
        ? params.code[0]
        : "judge";
  const judgeCode = codeParam.toUpperCase();
  const competitionId =
    typeof params?.competitionId === "string"
      ? params.competitionId
      : Array.isArray(params?.competitionId)
        ? params.competitionId[0]
        : "";
  const judgeBasePath = competitionId
    ? `/judge/competition/${competitionId}/${codeParam}`
    : `/judge/${codeParam}`;

  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [judgeExists, setJudgeExists] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadJudgeState() {
      try {
        const query = new URLSearchParams({ judgeCode });
        if (competitionId) query.set("competitionId", competitionId);

        const [lookupRes, sessionRes] = await Promise.all([
          fetch(`/api/judge/lookup?${query.toString()}`, {
            cache: "no-store",
          }),
          fetch("/api/judge/session", {
            cache: "no-store",
          }),
        ]);
        const lookupData = (await lookupRes.json()) as {
          exists?: boolean;
        };
        const sessionData = (await sessionRes.json()) as {
          judge?: { code?: string; competitionId?: string | null } | null;
        };
        if (!isMounted) return;
        setJudgeExists(Boolean(lookupData.exists));
        setIsAuthenticated(
          Boolean(lookupData.exists) &&
            Boolean(sessionData.judge?.code) &&
            String(sessionData.judge?.code).toUpperCase() === judgeCode &&
            String(sessionData.judge?.competitionId ?? "") === competitionId,
        );
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadJudgeState();
    return () => {
      isMounted = false;
    };
  }, [competitionId, judgeCode]);

  useEffect(() => {
    let isMounted = true;
    async function loadCategories() {
      if (!isAuthenticated || !judgeExists) {
        if (isMounted) {
          setCategories([]);
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      try {
        const query = competitionId
          ? new URLSearchParams({
              competitionId,
              includeCompleted: "true",
              judgeCode: codeParam,
            })
          : new URLSearchParams({
              includeCompleted: "true",
              judgeCode: codeParam,
            });
        const res = await fetch(`/api/categories?${query.toString()}`);
        const data = (await res.json()) as { categories?: Category[] };
        if (isMounted && Array.isArray(data.categories)) {
          setCategories(data.categories);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    void loadCategories();
    return () => {
      isMounted = false;
    };
  }, [codeParam, competitionId, isAuthenticated, judgeExists]);

  async function handleSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError(null);
    setIsAuthenticating(true);

    try {
      const res = await fetch("/api/judge/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          judgeCode: codeParam,
          competitionId: competitionId || undefined,
          pin,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Sign in failed.");
      }
      setIsAuthenticated(true);
      setPin("");
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Sign in failed.",
      );
    } finally {
      setIsAuthenticating(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,_oklch(0.98_0.05_160),_transparent_60%),radial-gradient(circle_at_bottom,_oklch(0.97_0.06_95),_transparent_55%)] px-4 pb-12 pt-8 text-foreground sm:px-6 lg:px-10">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Judge {judgeCode}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Select Category
          </h1>
        </div>
        <div className="hidden items-center gap-3 text-sm text-muted-foreground sm:flex">
          <span className="rounded-full bg-white/80 px-3 py-1">
            Open your division
          </span>
          <span className="rounded-full bg-white/80 px-3 py-1">
            Submit once per dance
          </span>
        </div>
      </header>

      <main className="mx-auto mt-10 flex w-full max-w-6xl flex-1 flex-col">
        <p className="text-base leading-relaxed text-muted-foreground sm:max-w-3xl">
          Open an active category when the chairperson starts a round.
        </p>

        {!competitionId ? (
          <Card className="mt-8 bg-white/90 backdrop-blur-sm">
            <CardContent className="px-6">
              <p className="text-sm font-semibold">Invalid judge link</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Use the competition-specific judge link provided by the admin.
              </p>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <Card className="mt-8 bg-white/90 backdrop-blur-sm">
            <CardContent className="px-6">
              <p className="text-sm font-semibold">Loading categories</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Please wait while the active competition data loads.
              </p>
            </CardContent>
          </Card>
        ) : judgeExists === false ? (
          <Card className="mt-8 bg-white/90 backdrop-blur-sm">
            <CardContent className="px-6">
              <p className="text-sm font-semibold">Invalid judge link</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Judge {judgeCode} does not exist for this competition.
              </p>
            </CardContent>
          </Card>
        ) : !isAuthenticated ? (
          <Card className="mt-8 bg-white/90 backdrop-blur-sm">
            <CardContent className="px-6">
              <p className="text-sm font-semibold">Judge sign in</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Enter your judge PIN to open competition categories.
              </p>
              <form className="mt-5 flex flex-col gap-4" onSubmit={handleSignIn}>
                <label className="flex flex-col gap-2 text-sm font-medium">
                  Judge PIN
                  <input
                    type="password"
                    value={pin}
                    onChange={(event) => setPin(event.target.value)}
                    autoComplete="current-password"
                    className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
                {authError ? (
                  <p className="text-sm text-red-600">{authError}</p>
                ) : null}
                <Button
                  type="submit"
                  className="w-fit"
                  disabled={isAuthenticating || pin.trim().length === 0}
                >
                  {isAuthenticating ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : categories.length === 0 ? (
          <Card className="mt-8 bg-white/90 backdrop-blur-sm">
            <CardContent className="px-6">
              <p className="text-sm font-semibold">No categories open</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Please wait for the admin to activate a round.
              </p>
            </CardContent>
          </Card>
        ) : (
        <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => {
            const isCompleted = category.status === "completed";
            const hasActiveRound = Boolean(category.activeRoundId);
            const isSubmitted = Boolean(category.judgeProgress?.allSubmitted);
            const canOpen = hasActiveRound && !isSubmitted && !isCompleted;
            const href =
              category.activeRoundType === "final"
                ? `${judgeBasePath}/final/${category.slug}`
                : `${judgeBasePath}/flow/${category.slug}`;
            const actionText = isCompleted
              ? "Category Complete"
              : !hasActiveRound
                ? "Waiting for Round"
                : isSubmitted
                  ? "Round Submitted"
                  : category.activeRoundType === "final"
                    ? "Open Final Ranking"
                    : "Open Judging";

            return (
              <Card
                key={category.slug}
                className="bg-white/90 backdrop-blur-sm transition-shadow hover:shadow-md"
              >
                <CardContent className="px-6">
                  <div className="flex h-full w-full flex-col gap-3 py-2 text-left text-foreground">
                    <span className="text-xl font-semibold">
                      {category.name}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {category.discipline} · {category.ageGroup}
                    </span>
                    <div className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
                      <span>
                        {category.activeRoundName ?? "No round open"}
                      </span>
                      {category.judgeProgress?.required ? (
                        <span>
                          Submitted {category.judgeProgress.submitted}/
                          {category.judgeProgress.required}
                        </span>
                      ) : null}
                    </div>
                    {canOpen ? (
                      <Button asChild variant="outline" className="mt-4 w-fit">
                        <Link href={href} aria-label={`Open ${category.name}`}>
                          {actionText}
                        </Link>
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-4 w-fit"
                        disabled
                      >
                        {actionText}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>
        )}
      </main>
    </div>
  );
}
