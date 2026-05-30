"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Category = {
  id: string;
  name: string;
  discipline: string;
  ageGroup: string;
  slug: string;
  status: "draft" | "active" | "completed";
};

type Round = {
  id: string;
  name: string;
  order: number;
  type: string;
  status: "pending" | "active" | "completed";
  categoryId: string;
  dances: string[];
  competitorCount: number;
  heats: {
    number: number;
    competitorCount: number;
    competitors: { id: string; number: number | string }[];
  }[];
  submissionProgress: {
    submitted: number;
    required: number;
    isReady: boolean;
    missing: { dance: string; judges: string[] }[];
    byDance: {
      dance: string;
      judges: { code: string; name: string; submitted: boolean }[];
    }[];
  };
};

type RoundUpdateResponse = {
  ok: boolean;
  error?: string;
  qualifierUpdate?: {
    nextRoundName: string;
    qualified: number;
    heats: number;
    qualifiers: {
      id: string;
      number: number | string;
      marks: number;
      order: number;
    }[];
  } | null;
  finalResult?: {
    count: number;
    winner: { competitorNumber: number | string; placement: number } | null;
  } | null;
};

export default function RoundControlPage() {
  const params = useParams();
  const competitionId =
    typeof params?.id === "string"
      ? params.id
      : Array.isArray(params?.id)
        ? params.id[0]
        : "";
  const [categories, setCategories] = useState<Category[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastQualifierUpdate, setLastQualifierUpdate] = useState<
    RoundUpdateResponse["qualifierUpdate"] | null
  >(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    const categoryQuery = new URLSearchParams({ includeCompleted: "true" });
    if (competitionId) categoryQuery.set("competitionId", competitionId);
    const roundQuery = competitionId ? `?competitionId=${competitionId}` : "";
    try {
      const [categoriesRes, roundsRes] = await Promise.all([
        fetch(`/api/categories?${categoryQuery.toString()}`, {
          cache: "no-store",
        }),
        fetch(`/api/admin/rounds${roundQuery}`, {
          cache: "no-store",
        }),
      ]);
      const categoriesJson = (await categoriesRes.json()) as {
        categories?: Category[];
      };
      const roundsJson = (await roundsRes.json()) as { rounds?: Round[] };
      setCategories(categoriesJson.categories ?? []);
      setRounds(roundsJson.rounds ?? []);
    } finally {
      if (silent) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  }, [competitionId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadData({ silent: true });
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [loadData]);

  const roundsByCategory = useMemo(() => {
    const map = new Map<string, Round[]>();
    rounds.forEach((round) => {
      const existing = map.get(round.categoryId) ?? [];
      existing.push(round);
      map.set(round.categoryId, existing);
    });
    return map;
  }, [rounds]);

  async function updateRound(round: Round, status: Round["status"]) {
    if (status === "completed" && round.status !== "active") {
      setToast({
        type: "error",
        text: "Activate the round before completing it.",
      });
      return;
    }

    const res = await fetch("/api/admin/rounds", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roundId: round.id, status }),
    });
    const data = (await res.json()) as RoundUpdateResponse;
    if (!res.ok || !data.ok) {
      setToast({
        type: "error",
        text: data.error ?? "Round could not be updated.",
      });
      return;
    }
    if (data.qualifierUpdate) {
      setLastQualifierUpdate(data.qualifierUpdate);
      setToast({
        type: "success",
        text: `${data.qualifierUpdate.qualified} competitors qualified to ${data.qualifierUpdate.nextRoundName}.`,
      });
    } else if (data.finalResult) {
      setToast({
        type: "success",
        text: data.finalResult.winner
          ? `Final results calculated. Winner: #${data.finalResult.winner.competitorNumber}.`
          : "Final results calculated.",
      });
      setLastQualifierUpdate(null);
    } else if (status === "completed") {
      setToast({ type: "success", text: "Round completed." });
      setLastQualifierUpdate(null);
    } else if (status === "active") {
      setToast({ type: "success", text: "Round activated." });
      setLastQualifierUpdate(null);
    }
    await loadData();
  }

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <div className="relative min-h-screen bg-[radial-gradient(circle_at_top,_oklch(0.98_0.05_160),_transparent_60%),radial-gradient(circle_at_bottom,_oklch(0.97_0.06_95),_transparent_55%)] px-6 pb-12 pt-8 text-foreground">
      {toast ? (
        <div className="absolute right-4 top-4 z-50">
          <div
            className={`rounded-lg border px-4 py-2 text-sm font-medium shadow-sm ${
              toast.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {toast.text}
          </div>
        </div>
      ) : null}
      <header className="mx-auto flex w-full max-w-6xl flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Admin Dashboard
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Round Control
        </h1>
        <p className="text-sm text-muted-foreground">
          Activate and manage rounds per category.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {competitionId ? (
            <Button asChild variant="outline" className="w-fit">
              <Link href={`/admin/competitions/${competitionId}`}>
                Back to Competition
              </Link>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            onClick={() => void loadData({ silent: true })}
            disabled={isRefreshing}
          >
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </header>

      <main className="mx-auto mt-8 flex w-full max-w-6xl flex-col gap-6">
        {lastQualifierUpdate ? (
          <Card className="border-emerald-200 bg-emerald-50">
            <CardContent className="px-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-emerald-800">
                    {lastQualifierUpdate.qualified} competitors qualified to{" "}
                    {lastQualifierUpdate.nextRoundName}
                  </p>
                  <p className="mt-1 text-sm text-emerald-700">
                    Review this list before activating the next round.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLastQualifierUpdate(null)}
                >
                  Dismiss
                </Button>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {lastQualifierUpdate.qualifiers.map((qualifier) => (
                  <div
                    key={qualifier.id}
                    className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm"
                  >
                    <span className="font-semibold">
                      {qualifier.order}. #{qualifier.number}
                    </span>
                    <span className="ml-2 text-muted-foreground">
                      {qualifier.marks} marks
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {categories.map((category) => {
          const categoryRounds = roundsByCategory.get(category.id) ?? [];
          const roundsCompleted =
            categoryRounds.length > 0 &&
            categoryRounds.every((round) => round.status === "completed");
          const categoryCompleted =
            category.status === "completed" || roundsCompleted;
          return (
            <Card key={category.id} className="bg-white/90">
              <CardContent className="px-6">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                  <div>
                    <h2 className="text-lg font-semibold">{category.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {category.discipline} · {category.ageGroup}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {categoryCompleted ? "Completed" : "Active"}
                  </span>
                </div>

                <div className="mt-4 flex flex-col gap-3">
                  {categoryRounds.map((round, index) => {
                    const previousRound = categoryRounds[index - 1];
                    const canActivate =
                      round.status !== "completed" &&
                      (!previousRound || previousRound.status === "completed");
                    const canComplete =
                      round.status === "active" &&
                      round.submissionProgress.isReady;

                    return (
                    <div
                      key={round.id}
                      className="rounded-lg border border-border bg-white px-4 py-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{round.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Status: {round.status}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {round.competitorCount} competitors ·{" "}
                            {round.heats.length} heats
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={!canActivate || round.status === "active"}
                            onClick={() => updateRound(round, "active")}
                          >
                            {round.status === "active" ? "Active" : "Set Active"}
                          </Button>
                          <Button
                            type="button"
                            variant={
                              round.submissionProgress.isReady
                                ? "default"
                                : "outline"
                            }
                            disabled={!canComplete}
                            onClick={() => updateRound(round, "completed")}
                          >
                            {round.status === "completed"
                              ? "Completed"
                              : round.status === "pending"
                                ? "Activate First"
                                : round.submissionProgress.isReady
                              ? "Complete Round"
                              : "Waiting for Submissions"}
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">
                            Submissions{" "}
                            {round.submissionProgress.submitted}/
                            {round.submissionProgress.required}
                          </span>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                              round.submissionProgress.isReady
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-white text-muted-foreground"
                            }`}
                          >
                            {round.submissionProgress.isReady
                              ? "Ready"
                              : "Waiting"}
                          </span>
                        </div>
                        {round.submissionProgress.required === 0 ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Add judges before tracking submission readiness.
                          </p>
                        ) : null}
                        {round.submissionProgress.byDance.length > 0 ? (
                          <div className="mt-3 flex flex-col gap-2">
                            {round.submissionProgress.byDance.map((item) => (
                              <div
                                key={item.dance}
                                className="rounded-md border border-border bg-white px-3 py-2"
                              >
                                <p className="text-xs font-semibold text-foreground">
                                  {item.dance}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {item.judges.map((judge) => (
                                    <span
                                      key={judge.code}
                                      className={`rounded-full border px-2 py-1 text-xs font-medium ${
                                        judge.submitted
                                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                          : "border-border bg-white text-muted-foreground"
                                      }`}
                                      title={judge.name}
                                    >
                                      {judge.code}{" "}
                                      {judge.submitted ? "submitted" : "missing"}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      {round.status === "pending" ? (
                        <div className="mt-3 rounded-md border border-dashed border-border bg-white px-3 py-3 text-xs text-muted-foreground">
                          Competitors will be visible after this round is
                          activated.
                        </div>
                      ) : round.heats.length > 0 ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {round.heats.map((heat) => (
                            <div
                              key={heat.number}
                              className="rounded-md border border-border bg-white px-3 py-2 text-xs text-muted-foreground"
                            >
                              <p className="font-semibold text-foreground">
                                Heat {heat.number} · {heat.competitorCount}{" "}
                                competitors
                              </p>
                              <p className="mt-1">
                                {heat.competitors
                                  .map((competitor) => `#${competitor.number}`)
                                  .join(", ")}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    );
                  })}
                  {categoryRounds.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border bg-white px-4 py-6 text-sm text-muted-foreground">
                      {isLoading
                        ? "Loading rounds..."
                        : "No rounds configured for this category."}
                    </div>
                  ) : null}
                  {categoryCompleted ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      <span>Competition flow completed for this category.</span>
                      <Button asChild type="button" variant="outline">
                        <Link href={competitionId ? `/admin/competitions/${competitionId}/results` : "/admin/results"}>
                          View Results
                        </Link>
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border bg-white px-4 py-3 text-sm text-muted-foreground">
                      Results available after all rounds are completed.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </main>
    </div>
  );
}
