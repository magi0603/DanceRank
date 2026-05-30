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
  RankingModel,
  RoundModel,
  ScoreModel,
} from "@/models";

type ResultRow = {
  competitorId: string;
  competitorNumber: number | string;
  placement: number | null;
  totalRank: number;
  firstPlaces: number;
  judgeRanks: Record<string, number>;
};

type PopulatedCompetitorRef = {
  _id?: unknown;
  number?: unknown;
};

function sortRows(a: ResultRow, b: ResultRow) {
  if (a.placement && b.placement && a.placement !== b.placement) {
    return a.placement - b.placement;
  }
  if (a.placement && !b.placement) return -1;
  if (!a.placement && b.placement) return 1;
  if (a.totalRank !== b.totalRank) return a.totalRank - b.totalRank;
  if (a.firstPlaces !== b.firstPlaces) return b.firstPlaces - a.firstPlaces;
  return Number(a.competitorNumber) - Number(b.competitorNumber);
}

export default async function CompetitionResultsPage({
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

  const [categories, judges] = await Promise.all([
    CategoryModel.find({ competition: competitionId })
      .sort({ discipline: 1, ageGroup: 1, name: 1 })
      .lean(),
    JudgeModel.find({ competition: competitionId, isActive: true })
      .sort({ displayOrder: 1 })
      .lean(),
  ]);

  const categoryIds = categories.map((category) => category._id);
  const finalRounds = await RoundModel.find({
    category: { $in: categoryIds },
    type: "final",
  }).lean();
  const finalRoundIds = finalRounds.map((round) => round._id);

  const [scores, savedRankings] = await Promise.all([
    ScoreModel.find({
      type: "ranking",
      round: { $in: finalRoundIds },
    })
      .populate({ path: "competitor", model: CompetitorModel, select: "number" })
      .populate({ path: "judge", model: JudgeModel, select: "code" })
      .lean(),
    RankingModel.find({ round: { $in: finalRoundIds } })
      .populate({ path: "competitor", model: CompetitorModel, select: "number" })
      .lean(),
  ]);

  const finalRoundByCategory = new Map(
    finalRounds.map((round) => [String(round.category), round]),
  );
  const categoryByRound = new Map(
    finalRounds.map((round) => [String(round._id), String(round.category)]),
  );
  const rowsByCategory = new Map<string, ResultRow[]>();
  const rowByCategoryAndCompetitor = new Map<string, ResultRow>();

  scores.forEach((score) => {
    const categoryId = categoryByRound.get(String(score.round));
    if (!categoryId) return;
    const competitorId =
      typeof score.competitor === "object" && score.competitor
        ? String(score.competitor._id)
        : String(score.competitor);
    const competitorNumber =
      typeof score.competitor === "object" &&
      score.competitor &&
      "number" in score.competitor
        ? Number(score.competitor.number)
        : "—";
    const judgeCode =
      typeof score.judge === "object" && score.judge && "code" in score.judge
        ? String(score.judge.code)
        : "—";
    const rank = typeof score.rank === "number" ? score.rank : 0;
    const key = `${categoryId}:${competitorId}`;
    const row =
      rowByCategoryAndCompetitor.get(key) ??
      {
        competitorId,
        competitorNumber,
        placement: null,
        totalRank: 0,
        firstPlaces: 0,
        judgeRanks: {},
      };

    row.totalRank += rank;
    if (rank === 1) row.firstPlaces += 1;
    row.judgeRanks[judgeCode] = rank;

    if (!rowByCategoryAndCompetitor.has(key)) {
      rowByCategoryAndCompetitor.set(key, row);
      const list = rowsByCategory.get(categoryId) ?? [];
      list.push(row);
      rowsByCategory.set(categoryId, list);
    }
  });

  savedRankings.forEach((ranking) => {
    const categoryId = categoryByRound.get(String(ranking.round));
    if (!categoryId) return;
    const competitorRef = ranking.competitor as PopulatedCompetitorRef | null;
    const competitorId =
      typeof competitorRef === "object" && competitorRef?._id
        ? String(competitorRef._id)
        : String(ranking.competitor);
    const key = `${categoryId}:${competitorId}`;
    const existing = rowByCategoryAndCompetitor.get(key);

    if (existing) {
      existing.placement = ranking.placement;
      existing.totalRank = ranking.totalPoints;
      existing.firstPlaces = ranking.marks;
      return;
    }

    const row: ResultRow = {
      competitorId,
      competitorNumber:
        typeof competitorRef === "object" && competitorRef?.number
          ? Number(competitorRef.number)
          : "—",
      placement: ranking.placement,
      totalRank: ranking.totalPoints,
      firstPlaces: ranking.marks,
      judgeRanks: {},
    };
    const list = rowsByCategory.get(categoryId) ?? [];
    list.push(row);
    rowsByCategory.set(categoryId, list);
    rowByCategoryAndCompetitor.set(key, row);
  });

  const judgeCodes = judges.map((judge) => judge.code);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_oklch(0.98_0.05_160),_transparent_60%),radial-gradient(circle_at_bottom,_oklch(0.97_0.06_95),_transparent_55%)] px-4 pb-12 pt-8 text-foreground sm:px-6 lg:px-10">
      <header className="mx-auto flex w-full max-w-6xl flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Competition Results
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              {competition.name}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Final placements and judge ranking matrix.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/admin/competitions/${id}`}>Competition</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/admin/competitions/${id}/rounds`}>Rounds</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto mt-8 flex w-full max-w-6xl flex-col gap-6">
        {categories.map((category) => {
          const categoryId = String(category._id);
          const finalRound = finalRoundByCategory.get(categoryId);
          const rows = [...(rowsByCategory.get(categoryId) ?? [])].sort(sortRows);
          const finalistCount =
            finalRound?.competitors.length ?? rows.length;
          const submittedJudges = new Set(
            rows.flatMap((row) => Object.keys(row.judgeRanks)),
          );

          return (
            <Card key={categoryId} className="bg-white/90 backdrop-blur-sm">
              <CardContent className="px-6">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                  <div>
                    <h2 className="text-lg font-semibold">{category.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {category.discipline} · {category.ageGroup}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {finalistCount} finalists
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {submittedJudges.size}/{judgeCodes.length} judges
                    </span>
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-4">Place</th>
                        <th className="py-2 pr-4">Competitor</th>
                        <th className="py-2 pr-4">Total</th>
                        <th className="py-2 pr-4">Firsts</th>
                        {judgeCodes.map((judgeCode) => (
                          <th key={judgeCode} className="py-2 pr-4">
                            {judgeCode}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.map((row, index) => (
                        <tr key={row.competitorId}>
                          <td className="py-3 pr-4 font-semibold">
                            {row.placement ?? index + 1}
                          </td>
                          <td className="py-3 pr-4">#{row.competitorNumber}</td>
                          <td className="py-3 pr-4">{row.totalRank}</td>
                          <td className="py-3 pr-4">{row.firstPlaces}</td>
                          {judgeCodes.map((judgeCode) => (
                            <td key={judgeCode} className="py-3 pr-4">
                              {row.judgeRanks[judgeCode] ?? "—"}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {rows.length === 0 ? (
                        <tr>
                          <td
                            className="py-6 text-center text-muted-foreground"
                            colSpan={4 + judgeCodes.length}
                          >
                            No final rankings submitted yet.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </main>
    </div>
  );
}
