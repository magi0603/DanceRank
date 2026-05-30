"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type FlowResponse = {
  ok: boolean;
  category?: { id: string; name: string; dances: string[] };
  competitors?: { id: string; number: number }[];
  activeRoundId?: string | null;
  activeRoundType?: string | null;
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

export default function QualificationJudgingPage() {
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
  const judgeBasePath = competitionId
    ? `/judge/competition/${competitionId}/${codeParam}`
    : `/judge/${codeParam}`;

  const [flow, setFlow] = useState<FlowResponse | null>(null);
  const [selectionsByHeat, setSelectionsByHeat] = useState<
    Record<number, Set<string>>
  >({});
  const [roundIndex, setRoundIndex] = useState(0);
  const [activeHeat, setActiveHeat] = useState(0);
  const [danceIndex, setDanceIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );
  const router = useRouter();

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
        if (data.activeRoundType === "final") {
          router.replace(`${judgeBasePath}/final/${categoryParam}`);
          return;
        }
        setFlow(data);
        const activeIndex =
          data.activeRoundId && data.rounds
            ? Math.max(
                0,
                data.rounds.findIndex((round) => round.id === data.activeRoundId),
              )
            : 0;
        setRoundIndex(activeIndex === -1 ? 0 : activeIndex);
        setActiveHeat(0);
        const activeRound = data.rounds?.[activeIndex === -1 ? 0 : activeIndex];
        const submitted = new Set(
          activeRound ? data.submittedDancesByRound?.[activeRound.id] ?? [] : [],
        );
        const firstOpenDanceIndex =
          activeRound?.dances.findIndex((dance) => !submitted.has(dance)) ?? 0;
        setDanceIndex(firstOpenDanceIndex >= 0 ? firstOpenDanceIndex : 0);
        setSelectionsByHeat({});
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    void loadFlow();
    return () => {
      isMounted = false;
    };
  }, [categoryParam, codeParam, competitionId, judgeBasePath, router]);

  const rounds = useMemo(() => flow?.rounds ?? [], [flow]);
  const round = rounds[roundIndex];
  const heats = useMemo(() => round?.heats ?? [], [round]);
  const competitors = useMemo(() => flow?.competitors ?? [], [flow]);
  const competitorMap = useMemo(() => {
    const map = new Map<string, number>();
    competitors.forEach((competitor) => {
      map.set(competitor.id, competitor.number);
    });
    return map;
  }, [competitors]);

  const danceList = round?.dances ?? flow?.category?.dances ?? [];
  const currentDance = danceList[danceIndex] ?? "";
  const isActiveRound = round?.status === "active";
  const submittedDances = useMemo(
    () => new Set(round ? flow?.submittedDancesByRound?.[round.id] ?? [] : []),
    [flow?.submittedDancesByRound, round],
  );
  const isCurrentDanceSubmitted =
    currentDance.length > 0 && submittedDances.has(currentDance);
  const hasNoActiveRound = !isLoading && !flow?.activeRoundId;
  const hasSubmittedAllDances =
    isActiveRound &&
    danceList.length > 0 &&
    danceList.every((dance) => submittedDances.has(dance));
  const isLastDance = danceIndex >= danceList.length - 1;
  const selectionLimit = useMemo(() => {
    const count = heats[activeHeat]?.competitors.length ?? 0;
    return Math.floor(count / 2);
  }, [activeHeat, heats]);

  const selectedCount = selectionsByHeat[activeHeat]?.size ?? 0;
  const limitReached = selectedCount >= selectionLimit;
  const canSubmitDance =
    heats.length > 0 &&
    heats.every((heat, index) => {
      const limit = Math.floor(heat.competitors.length / 2);
      const count = selectionsByHeat[index]?.size ?? 0;
      return count === limit;
    });

  function toggleCompetitor(competitorId: string) {
    setSelectionsByHeat((prev) => {
      const current = new Set(prev[activeHeat] ?? []);
      if (current.has(competitorId)) {
        current.delete(competitorId);
      } else if (current.size < selectionLimit) {
        current.add(competitorId);
      }
      return { ...prev, [activeHeat]: current };
    });
  }

  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  function goToHeat(index: number) {
    setActiveHeat(index);
  }

  function handlePrev() {
    if (activeHeat > 0) {
      goToHeat(activeHeat - 1);
    }
  }

  function handleNext() {
    if (activeHeat < heats.length - 1) {
      goToHeat(activeHeat + 1);
    }
  }

  async function handleSubmitDance() {
    if (!isActiveRound || isCurrentDanceSubmitted) return;
    const didSubmit = await submitSelections();
    if (!didSubmit) return;

    const remainingDanceIndex = danceList.findIndex(
      (dance, index) =>
        index > danceIndex && dance !== currentDance && !submittedDances.has(dance),
    );
    if (remainingDanceIndex >= 0) {
      setSelectionsByHeat({});
      setActiveHeat(0);
      setDanceIndex(remainingDanceIndex);
      return;
    }

    setSelectionsByHeat({});
    setActiveHeat(0);
  }

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  function onTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    setTouchStartX(event.touches[0]?.clientX ?? null);
  }

  function onTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    if (touchStartX === null) return;
    const endX = event.changedTouches[0]?.clientX ?? touchStartX;
    const delta = endX - touchStartX;
    if (Math.abs(delta) > 40) {
      if (delta > 0) {
        handlePrev();
      } else {
        handleNext();
      }
    }
    setTouchStartX(null);
  }

  async function submitSelections() {
    if (!flow?.category?.id || !round?.id || !canSubmitDance) return false;
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);
    try {
      const selections = Object.values(selectionsByHeat).flatMap((set) =>
        Array.from(set),
      );
      const res = await fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          judgeCode: codeParam,
          competitionId: competitionId || undefined,
          categoryId: flow.category.id,
          roundId: round.id,
          dance: currentDance,
          type: "selection",
          heatNumber: activeHeat + 1,
          selections,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Submission failed.");
      }
      setFlow((prev) => {
        if (!prev || !round?.id) return prev;
        const existing = prev.submittedDancesByRound?.[round.id] ?? [];
        return {
          ...prev,
          submittedDancesByRound: {
            ...prev.submittedDancesByRound,
            [round.id]: Array.from(new Set([...existing, currentDance])),
          },
        };
      });
      setSubmitSuccess(true);
      setToast({ type: "success", text: "Scores saved." });
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Submission failed. Try again.";
      setSubmitError(message);
      setToast({ type: "error", text: message });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,_oklch(0.98_0.05_160),_transparent_60%),radial-gradient(circle_at_bottom,_oklch(0.97_0.06_95),_transparent_55%)] px-4 pb-12 pt-8 text-foreground sm:px-6 lg:px-10">
      {isSubmitting ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-white/60 backdrop-blur-sm">
          <div className="rounded-xl border border-border bg-white px-6 py-4 text-sm font-semibold shadow-sm">
            Saving scores...
          </div>
        </div>
      ) : null}
      {toast ? (
        <div className="absolute right-4 top-4 z-50">
          <div
            className={`rounded-lg border px-4 py-2 text-sm font-medium shadow-sm ${toast.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-red-200 bg-red-50 text-red-700"
              }`}
          >
            {toast.text}
          </div>
        </div>
      ) : null}
      <header className="mx-auto flex w-full max-w-3xl flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Judge {codeParam.toUpperCase()}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Qualification Round
        </h1>
        {!isLoading ? (
          <p className="text-sm text-muted-foreground">
            Category: {flow?.category?.name ?? categoryParam.replace(/-/g, " ")}
          </p>
        ) : null}
        {!isLoading ? (
          <p className="text-sm text-muted-foreground">
            Round: {isActiveRound ? round?.name : "No round open"}
          </p>
        ) : null}
        {!isLoading && !isActiveRound ? (
          <p className="text-sm font-medium text-amber-600">
            No round is open yet. Please wait for the chairperson.
          </p>
        ) : null}
        {!isLoading && isActiveRound && !hasSubmittedAllDances && currentDance ? (
          <p className="text-sm font-medium text-foreground">
            Dance: {currentDance}
          </p>
        ) : null}
      </header>

      <main className="mx-auto mt-8 flex w-full max-w-3xl flex-1 flex-col gap-4">
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
              <p className="text-sm font-semibold">Loading round</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Please wait while your judging data loads.
              </p>
            </CardContent>
          </Card>
        ) : hasNoActiveRound ? (
          <Card className="bg-white/90 backdrop-blur-sm">
            <CardContent className="px-6">
              <p className="text-sm font-semibold">No round open</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Please wait for the chairperson to start the next round.
              </p>
            </CardContent>
          </Card>
        ) : !isActiveRound ? (
          <Card className="bg-white/90 backdrop-blur-sm">
            <CardContent className="px-6">
              <p className="text-sm font-semibold">Round closed</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Competitors are hidden until the admin activates this round.
              </p>
            </CardContent>
          </Card>
        ) : hasSubmittedAllDances ? (
          <Card className="bg-white/90 backdrop-blur-sm">
            <CardContent className="px-6">
              <p className="text-sm font-semibold">Round submitted</p>
              <p className="mt-2 text-sm text-muted-foreground">
                You submitted all dances for this round. Please wait for the admin
                to complete the round.
              </p>
            </CardContent>
          </Card>
        ) : isCurrentDanceSubmitted ? (
          <Card className="bg-white/90 backdrop-blur-sm">
            <CardContent className="px-6">
              <p className="text-sm font-semibold">Dance submitted</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Your scores for {currentDance} are already submitted.
              </p>
              <div className="mt-5 flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const nextDanceIndexAfterCurrent = danceList.findIndex(
                      (dance, index) =>
                        index > danceIndex && !submittedDances.has(dance),
                    );
                    const nextDanceIndex =
                      nextDanceIndexAfterCurrent >= 0
                        ? nextDanceIndexAfterCurrent
                        : danceList.findIndex(
                            (dance) => !submittedDances.has(dance),
                          );
                    if (nextDanceIndex >= 0) {
                      setDanceIndex(nextDanceIndex);
                      setActiveHeat(0);
                      setSelectionsByHeat({});
                    }
                  }}
                >
                  Next Open Dance
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
        <Card className="bg-white/90 backdrop-blur-sm">
          <CardContent className="px-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Select {selectionLimit} competitors
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedCount} of {selectionLimit} selected
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Heat {heats.length === 0 ? 0 : activeHeat + 1} of{" "}
                  {heats.length}
                </span>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {limitReached ? "Limit Reached" : "Selecting"}
                </span>
              </div>
            </div>

            <div
              className="mt-4 flex flex-col gap-3"
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
            >
              {(heats[activeHeat]?.competitors ?? []).map((competitorId) => {
                const isSelected = selectionsByHeat[activeHeat]?.has(
                  competitorId,
                );
                const isDisabled = limitReached && !isSelected;
                const number = competitorMap.get(competitorId) ?? "—";

                return (
                  <div
                    key={competitorId}
                    className="flex items-center justify-between rounded-lg border border-border bg-white px-4 py-3 shadow-xs"
                  >
                    <div className="text-lg font-semibold tracking-tight">
                      #{number}
                    </div>
                    <Button
                      type="button"
                      variant={isSelected ? "default" : "outline"}
                      className={
                        isSelected
                          ? "bg-emerald-500 text-white hover:bg-emerald-500"
                          : ""
                      }
                      disabled={isDisabled}
                      onClick={() => toggleCompetitor(competitorId)}
                    >
                      {isSelected ? "Selected" : "Select"}
                    </Button>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-muted-foreground">
                {submitError ? (
                  <span className="text-red-600">Submission failed. Try again.</span>
                ) : submitSuccess ? (
                  <span className="text-emerald-600">Scores saved.</span>
                ) : (
                  <span>Complete all heats to submit this dance.</span>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={activeHeat === 0}
                onClick={handlePrev}
              >
                Previous Heat
              </Button>
              <Button
                type="button"
                variant="default"
                disabled={
                  !isActiveRound ||
                  isCurrentDanceSubmitted ||
                  !canSubmitDance ||
                  isSubmitting
                }
                onClick={handleSubmitDance}
              >
                {isSubmitting
                  ? "Submitting..."
                  : isLastDance
                    ? "Submit Final Dance"
                    : "Submit & Next Dance"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={activeHeat === heats.length - 1}
                onClick={handleNext}
              >
                Next Heat
              </Button>
            </div>
          </CardContent>
        </Card>
        )}
      </main>
    </div>
  );
}
