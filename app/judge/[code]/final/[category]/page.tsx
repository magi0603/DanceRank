"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type FlowResponse = {
  ok: boolean;
  category?: { id: string; name: string; dances: string[]; maxFinalists?: number };
  competitors?: { id: string; number: number }[];
  submittedDancesByRound?: Record<string, string[]>;
  rounds?: {
    id: string;
    name: string;
    order: number;
    type: string;
    status?: string;
    dances: string[];
    heats: { number: number; competitors: string[] }[];
  }[];
};

export default function FinalRankingPage() {
  const params = useParams();
  const codeParam =
    typeof params?.code === "string"
      ? params.code
      : Array.isArray(params?.code)
        ? params.code[0]
        : "judge";
  const categoryParam =
    typeof params?.category === "string"
      ? params.category
      : Array.isArray(params?.category)
        ? params.category[0]
        : "category";
  const competitionId =
    typeof params?.competitionId === "string"
      ? params.competitionId
      : Array.isArray(params?.competitionId)
        ? params.competitionId[0]
        : "";

  const [flow, setFlow] = useState<FlowResponse | null>(null);
  const [finalists, setFinalists] = useState<{ id: string; number: number }[]>(
    [],
  );
  const [positions, setPositions] = useState<number[]>([]);
  const [assignments, setAssignments] = useState<Record<string, number | null>>(
    {},
  );
  const [showConfirm, setShowConfirm] = useState(false);
  const [signature, setSignature] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );

  useEffect(() => {
    let isMounted = true;
    async function loadFlow() {
      setIsLoading(true);
      const query = new URLSearchParams({ category: categoryParam });
      if (competitionId) query.set("competitionId", competitionId);
      query.set("judgeCode", codeParam);
      try {
        const res = await fetch(`/api/flow?${query.toString()}`);
        const data = (await res.json()) as FlowResponse;
        if (!isMounted) return;
        setFlow(data);
        const competitors = data.competitors ?? [];
        const competitorById = new Map(
          competitors.map((competitor) => [competitor.id, competitor]),
        );
        const maxFinalists = data.category?.maxFinalists ?? 6;
        const finalRound =
          data.rounds?.find((round) => round.type === "final") ??
          data.rounds?.[data.rounds.length - 1];
        const finalCompetitorIds =
          finalRound?.heats.flatMap((heat) => heat.competitors) ?? [];
        const finalList =
          finalCompetitorIds.length > 0
            ? finalCompetitorIds
                .map((competitorId) => competitorById.get(competitorId))
                .filter((competitor): competitor is { id: string; number: number } =>
                  Boolean(competitor),
                )
            : competitors.slice(0, maxFinalists);
        setFinalists(finalList);
        setPositions(Array.from({ length: finalList.length }, (_, i) => i + 1));
        setAssignments(
          Object.fromEntries(finalList.map((item) => [item.id, null])),
        );
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    void loadFlow();
    return () => {
      isMounted = false;
    };
  }, [categoryParam, codeParam, competitionId]);

  const usedPositions = useMemo(() => {
    const used = new Set<number>();
    Object.values(assignments).forEach((value) => {
      if (typeof value === "number") {
        used.add(value);
      }
    });
    return used;
  }, [assignments]);

  const totalAssigned = useMemo(() => {
    return Object.values(assignments).filter(
      (value) => typeof value === "number",
    ).length;
  }, [assignments]);
  const allAssigned = finalists.length > 0 && totalAssigned === finalists.length;
  const finalRound =
    flow?.rounds?.find((round) => round.type === "final") ??
    flow?.rounds?.[flow.rounds.length - 1];
  const isFinalActive = finalRound?.status === "active";
  const isFinalSubmitted =
    finalRound && flow?.submittedDancesByRound?.[finalRound.id]?.includes("Final");

  function handleSelect(competitor: string, position: number) {
    setAssignments((prev) => {
      const current = prev[competitor];
      if (current === position) {
        return { ...prev, [competitor]: null };
      }

      const updated: Record<string, number | null> = { ...prev };
      for (const [key, value] of Object.entries(updated)) {
        if (value === position) {
          updated[key] = null;
        }
      }
      updated[competitor] = position;
      return updated;
    });
  }

  async function submitRankings() {
    if (!flow?.category?.id || finalists.length === 0) return;
    const rankings = Object.entries(assignments)
      .filter(([, rank]) => typeof rank === "number")
      .map(([competitorId, rank]) => ({ competitorId, rank: rank as number }));

    if (rankings.length === 0) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          judgeCode: codeParam,
          competitionId: competitionId || undefined,
          categoryId: flow.category.id,
          roundId: finalRound?.id,
          dance: "Final",
          type: "ranking",
          rankings,
          signature: signature || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Submission failed.");
      }
      setFlow((prev) => {
        if (!prev || !finalRound?.id) return prev;
        const existing = prev.submittedDancesByRound?.[finalRound.id] ?? [];
        return {
          ...prev,
          submittedDancesByRound: {
            ...prev.submittedDancesByRound,
            [finalRound.id]: Array.from(new Set([...existing, "Final"])),
          },
        };
      });
      setShowConfirm(false);
      setToast({ type: "success", text: "Final rankings saved." });
    } catch (error) {
      setToast({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Submission failed. Try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <div className="relative flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,_oklch(0.98_0.05_160),_transparent_60%),radial-gradient(circle_at_bottom,_oklch(0.97_0.06_95),_transparent_55%)] px-4 pb-12 pt-8 text-foreground sm:px-6 lg:px-10">
      {isSubmitting ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-white/60 backdrop-blur-sm">
          <div className="rounded-xl border border-border bg-white px-6 py-4 text-sm font-semibold shadow-sm">
            Saving rankings...
          </div>
        </div>
      ) : null}
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
      <header className="mx-auto flex w-full max-w-5xl flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Judge {codeParam.toUpperCase()}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Final Ranking
        </h1>
        <p className="text-sm text-muted-foreground">
          Category: {flow?.category?.name ?? categoryParam.replace(/-/g, " ")}
        </p>
        {!isLoading && !isFinalActive ? (
          <p className="text-sm font-medium text-amber-600">
            Final is not active. Please wait for the admin to open it.
          </p>
        ) : null}
      </header>

      <main className="mx-auto mt-8 flex w-full max-w-5xl flex-1 flex-col gap-4">
        {!competitionId ? (
          <Card className="bg-white/90 backdrop-blur-sm">
            <CardContent className="px-6">
              <p className="text-sm font-semibold">Invalid judge link</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Use the competition-specific judge link provided by the admin.
              </p>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <Card className="bg-white/90 backdrop-blur-sm">
            <CardContent className="px-6">
              <p className="text-sm font-semibold">Loading final</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Please wait while your final round data loads.
              </p>
            </CardContent>
          </Card>
        ) : !isFinalActive ? (
          <Card className="bg-white/90 backdrop-blur-sm">
            <CardContent className="px-6">
              <p className="text-sm font-semibold">Final closed</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Finalists are hidden until the admin activates the final round.
              </p>
            </CardContent>
          </Card>
        ) : isFinalSubmitted ? (
          <Card className="bg-white/90 backdrop-blur-sm">
            <CardContent className="px-6">
              <p className="text-sm font-semibold">Final submitted</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Your final rankings are already submitted. Please wait for the
                admin to complete the final round.
              </p>
            </CardContent>
          </Card>
        ) : (
        <Card className="bg-white/90 backdrop-blur-sm">
          <CardContent className="px-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Assign each finalist a unique placement.
                </p>
                <p className="text-xs text-muted-foreground">
                  Each position can only be used once.
                </p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {usedPositions.size}/{positions.length} filled
              </span>
            </div>

            <div className="mt-5 flex flex-col gap-3">
              {finalists.map((competitor) => (
                <div
                  key={competitor.id}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-white px-4 py-3 shadow-xs sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="text-lg font-semibold tracking-tight">
                    #{competitor.number}
                  </div>
                  <div className="grid grid-cols-6 gap-2">
                    {positions.map((position) => {
                      const selected = assignments[competitor.id] === position;
                      const isDisabled =
                        !selected && usedPositions.has(position);

                      return (
                        <button
                          key={position}
                          type="button"
                          className={`flex h-10 w-10 items-center justify-center rounded-md border text-sm font-semibold transition ${
                            selected
                              ? "border-emerald-500 bg-emerald-500 text-white"
                              : "border-border bg-white text-foreground hover:border-emerald-200 hover:bg-emerald-50"
                          } ${isDisabled ? "cursor-not-allowed opacity-40" : ""}`}
                          disabled={isDisabled}
                          onClick={() => handleSelect(competitor.id, position)}
                        >
                          {position}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={!isFinalActive || Boolean(isFinalSubmitted) || !allAssigned}
                onClick={() => setShowConfirm(true)}
              >
                Submit Scores
              </Button>
            </div>
          </CardContent>
        </Card>
        )}
      </main>

      {showConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold">
              Are you sure you want to submit your scores?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This action will finalize your rankings for this category.
            </p>

            <div className="mt-4">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Signature (optional)
              </label>
              {!allAssigned ? (
                <p className="mt-2 text-xs text-red-600">
                  Assign a unique position to every finalist before submitting.
                </p>
              ) : null}
              <input
                type="text"
                value={signature}
                onChange={(event) => setSignature(event.target.value)}
                placeholder="Type your name"
                className="mt-2 w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={submitRankings}
                disabled={
                  isSubmitting ||
                  !isFinalActive ||
                  Boolean(isFinalSubmitted) ||
                  !allAssigned
                }
              >
                {isSubmitting ? "Submitting..." : "Confirm"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
