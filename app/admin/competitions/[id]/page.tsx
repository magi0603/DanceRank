import Link from "next/link";
import { notFound } from "next/navigation";
import { Types } from "mongoose";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { connectMongoDB } from "@/lib/mongoose";
import {
  CategoryModel,
  CompetitionModel,
  CompetitorModel,
  JudgeModel,
  RoundModel,
  ScoreModel,
} from "@/models";

type CountRow = {
  _id: unknown;
  count: number;
};

function formatDate(value: Date | null | undefined) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(value);
}

function getRequiredDances(round: { type: string; dances: string[] }) {
  return round.type === "final" ? ["Final"] : round.dances;
}

export default async function CompetitionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    notFound();
  }

  await connectMongoDB();

  const competitionId = new Types.ObjectId(id);
  const competition = await CompetitionModel.findById(competitionId).lean();
  if (!competition) {
    notFound();
  }

  const [judges, categories, rounds, competitorCounts] = await Promise.all([
    JudgeModel.find({ competition: competitionId })
      .sort({ displayOrder: 1 })
      .lean(),
    CategoryModel.find({ competition: competitionId })
      .sort({ discipline: 1, ageGroup: 1, name: 1 })
      .lean(),
    RoundModel.find({ competition: competitionId })
      .sort({ category: 1, order: 1 })
      .lean(),
    CompetitorModel.aggregate<CountRow>([
      { $match: { competition: competitionId } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]),
  ]);
  const scores = await ScoreModel.find({
    round: { $in: rounds.map((round) => round._id) },
  })
    .select({ round: 1, dance: 1, judge: 1 })
    .lean();

  const competitorsByCategory = new Map(
    competitorCounts.map((row) => [String(row._id), row.count]),
  );
  const submittedKeys = new Set(
    scores.map(
      (score) =>
        `${String(score.round)}:${score.dance}:${String(score.judge)}`,
    ),
  );
  const roundsByCategory = new Map<string, typeof rounds>();
  rounds.forEach((round) => {
    const categoryId = String(round.category);
    const list = roundsByCategory.get(categoryId) ?? [];
    list.push(round);
    roundsByCategory.set(categoryId, list);
  });

  const activeRounds = rounds.filter((round) => round.status === "active");
  const completedRounds = rounds.filter((round) => round.status === "completed");
  const finalRounds = rounds.filter((round) => round.type === "final");
  const completedFinalRounds = finalRounds.filter(
    (round) => round.status === "completed",
  );
  const hasCompletedFinals = completedFinalRounds.length > 0;
  const activeJudges = judges.filter((judge) => judge.isActive);
  const categorySummaries = categories.map((category) => {
    const categoryId = String(category._id);
    const categoryRounds = roundsByCategory.get(categoryId) ?? [];
    const activeRound = categoryRounds.find((round) => round.status === "active");
    const firstPendingRound = categoryRounds.find(
      (round, index) =>
        round.status === "pending" &&
        (index === 0 || categoryRounds[index - 1]?.status === "completed"),
    );
    const roundsCompleted =
      categoryRounds.length > 0 &&
      categoryRounds.every((round) => round.status === "completed");
    const currentRound = activeRound ?? firstPendingRound ?? categoryRounds[0];
    const requiredDances = currentRound ? getRequiredDances(currentRound) : [];
    let submitted = 0;
    const missingByDance = requiredDances.map((dance) => {
      const missingJudges = activeJudges
        .filter(
          (judge) =>
            !submittedKeys.has(
              `${String(currentRound?._id)}:${dance}:${String(judge._id)}`,
            ),
        )
        .map((judge) => judge.code);

      submitted += activeJudges.length - missingJudges.length;
      return { dance, judges: missingJudges };
    });
    const required = requiredDances.length * activeJudges.length;
    const isReady = required > 0 && submitted >= required;
    const missing = missingByDance.filter((item) => item.judges.length > 0);
    const roundsHref = `/admin/competitions/${id}/rounds`;

    let nextAction = "Open round control";
    let actionHref = roundsHref;
    let actionVariant: "default" | "outline" = "outline";
    let detail = "Use round control to manage this category.";
    let showAction = true;

    if (roundsCompleted || category.status === "completed") {
      nextAction = "Competition Completed";
      actionHref = roundsHref;
      actionVariant = "outline";
      detail = "All rounds are completed.";
      showAction = false;
    } else if (activeRound && isReady) {
      nextAction = `Complete ${activeRound.name}`;
      actionVariant = "default";
      detail = "All judge submissions are in.";
    } else if (activeRound) {
      nextAction = "Open Round Control";
      detail =
        missing.length > 0
          ? `${submitted}/${required} submissions in. Waiting for ${missing
              .flatMap((item) => item.judges)
              .filter((value, index, values) => values.indexOf(value) === index)
              .join(", ")}.`
          : `${submitted}/${required} submissions in.`;
    } else if (firstPendingRound) {
      nextAction = `Activate ${firstPendingRound.name}`;
      actionVariant = "default";
      detail = "Ready for the next round.";
    } else if (categoryRounds.length === 0) {
      nextAction = "No Rounds";
      detail = "No rounds are configured for this category.";
    }

    return {
      category,
      categoryId,
      categoryRounds,
      currentRound,
      activeRound,
      roundsCompleted,
      required,
      submitted,
      isReady,
      missing,
      nextAction,
      actionHref,
      actionVariant,
      detail,
      showAction,
    };
  });
  const primarySummary =
    categorySummaries.find((summary) => summary.activeRound) ??
    categorySummaries.find(
      (summary) => !summary.roundsCompleted && summary.currentRound,
    ) ??
    categorySummaries[0];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,oklch(0.98_0.05_160),transparent_60%),radial-gradient(circle_at_bottom,oklch(0.97_0.06_95),transparent_55%)] px-4 pb-12 pt-8 text-foreground sm:px-6 lg:px-10">
      <header className="mx-auto flex w-full max-w-6xl flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Competition Control
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              {competition.name}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {formatDate(competition.date)} ·{" "}
              {competition.location || "No location"}
            </p>
            {competition.organizer ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {competition.organizer}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/admin/competitions">All Competitions</Link>
            </Button>
            <Button asChild>
              <Link href="/admin/competitions/new">New Competition</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto mt-8 flex w-full max-w-6xl flex-col gap-6">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card className="bg-white/90 backdrop-blur-sm">
            <CardContent className="px-6">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Status
              </p>
              <p className="mt-2 text-2xl font-semibold capitalize">
                {competition.status}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-white/90 backdrop-blur-sm">
            <CardContent className="px-6">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Judges
              </p>
              <p className="mt-2 text-2xl font-semibold">{judges.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-white/90 backdrop-blur-sm">
            <CardContent className="px-6">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Categories
              </p>
              <p className="mt-2 text-2xl font-semibold">{categories.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-white/90 backdrop-blur-sm">
            <CardContent className="px-6">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Active
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {activeRounds.length}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-white/90 backdrop-blur-sm">
            <CardContent className="px-6">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Completed
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {completedRounds.length}
              </p>
            </CardContent>
          </Card>
        </section>

        {primarySummary ? (
          <Card className="bg-white/90 backdrop-blur-sm">
            <CardContent className="px-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Next Action
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold">
                    {primarySummary.nextAction}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {primarySummary.category.name}
                    {primarySummary.currentRound
                      ? ` · ${primarySummary.currentRound.name}`
                      : ""}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {primarySummary.detail}
                  </p>
                </div>
                {primarySummary.showAction ? (
                  <Button asChild variant={primarySummary.actionVariant}>
                    <Link href={primarySummary.actionHref}>
                      {primarySummary.nextAction}
                    </Link>
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <Card className="bg-white/90 backdrop-blur-sm">
            <CardContent className="px-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                <div>
                  <h2 className="text-lg font-semibold">Categories & Rounds</h2>
                  <p className="text-sm text-muted-foreground">
                    Generated structure for this competition.
                  </p>
                </div>
                <Button asChild variant="outline">
                  <Link href={`/admin/competitions/${id}/rounds`}>
                    Open Round Control
                  </Link>
                </Button>
              </div>

              <div className="mt-5 flex flex-col gap-4">
                {categorySummaries.map((summary) => {
                  const { category, categoryId, categoryRounds } = summary;
                  return (
                    <div
                      key={categoryId}
                      className="rounded-lg border border-border bg-white px-4 py-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold">{category.name}</h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {category.discipline} · {category.ageGroup} ·{" "}
                            {competitorsByCategory.get(categoryId) ?? 0}{" "}
                            competitors
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {category.dances.join(", ")}
                          </p>
                        </div>
                        <div className="flex flex-col items-start gap-2 sm:items-end">
                          <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            {summary.roundsCompleted
                              ? "Completed"
                              : summary.activeRound
                                ? "In Progress"
                                : "Waiting"}
                          </span>
                          {summary.showAction ? (
                            <Button asChild variant={summary.actionVariant}>
                              <Link href={summary.actionHref}>
                                {summary.nextAction}
                              </Link>
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-4 rounded-md border border-border bg-muted/30 px-3 py-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">
                            {summary.currentRound
                              ? summary.currentRound.name
                              : "No round"}
                          </span>
                          <span className="text-muted-foreground">
                            {summary.required > 0
                              ? `${summary.submitted}/${summary.required} submissions`
                              : summary.detail}
                          </span>
                        </div>
                        {summary.missing.length > 0 ? (
                          <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                            {summary.missing.slice(0, 3).map((item) => (
                              <p key={item.dance}>
                                {item.dance}: waiting for{" "}
                                {item.judges.join(", ")}
                              </p>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {categoryRounds.map((round) => (
                          <div
                            key={String(round._id)}
                            className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
                          >
                            <span className="font-medium">{round.name}</span>
                            <span className="rounded-full bg-muted px-2 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                              {round.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {categories.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-white px-4 py-6 text-sm text-muted-foreground">
                    No categories have been created for this competition.
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-6">
            <Card className="bg-white/90 backdrop-blur-sm">
              <CardContent className="px-6">
                <div className="border-b border-border pb-4">
                  <h2 className="text-lg font-semibold">Judge Links</h2>
                  <p className="text-sm text-muted-foreground">
                    Current judge entry points.
                  </p>
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  {judges.map((judge) => (
                    <Link
                      key={String(judge._id)}
                      href={`/judge/competition/${id}/${judge.code.toLowerCase()}/categories`}
                      className="flex items-center justify-between rounded-md border border-border bg-white px-3 py-2 text-sm transition hover:bg-muted"
                    >
                      <span className="font-medium">{judge.name}</span>
                      <span className="text-muted-foreground">{judge.code}</span>
                    </Link>
                  ))}
                  {judges.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No judges yet.
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/90 backdrop-blur-sm">
              <CardContent className="px-6">
                <div className="border-b border-border pb-4">
                  <h2 className="text-lg font-semibold">Results</h2>
                  <p className="text-sm text-muted-foreground">
                    {hasCompletedFinals
                      ? "Final placements are ready."
                      : "Final placements after the final round is completed."}
                  </p>
                </div>
                <div className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground">
                  <p>
                    {hasCompletedFinals
                      ? `${completedFinalRounds.length} final round${
                          completedFinalRounds.length === 1 ? "" : "s"
                        } completed. Review placements and judge rankings.`
                      : "Complete the final round from round control to calculate placements automatically."}
                  </p>
                  <Button asChild variant="outline">
                    <Link href={`/admin/competitions/${id}/results`}>
                      {hasCompletedFinals ? "Open Results" : "View Results"}
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}
