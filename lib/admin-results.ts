import "server-only";

import { connectMongoDB } from "@/lib/mongoose";
import {
  CategoryModel,
  CompetitorModel,
  JudgeModel,
  RankingModel,
  RoundModel,
  ScoreModel,
} from "@/models";

type AggregatedRow = {
  competitorId: string;
  competitorNumber: number | string;
  totalRank: number;
  firstPlaces: number;
  judgeRanks: Record<string, number>;
};

type PopulatedRoundRef = {
  category?: unknown;
};

type PopulatedCompetitorRef = {
  _id?: unknown;
  number?: unknown;
};

export type AdminResultsCategory = {
  id: string;
  name: string;
  rows: AggregatedRow[];
  judges: string[];
};

function orderRows(rows: AggregatedRow[]) {
  return [...rows].sort((a, b) => {
    if (a.totalRank !== b.totalRank) {
      return a.totalRank - b.totalRank;
    }
    if (a.firstPlaces !== b.firstPlaces) {
      return b.firstPlaces - a.firstPlaces;
    }
    return Number(a.competitorNumber) - Number(b.competitorNumber);
  });
}

export async function getAdminResultsCategories() {
  await connectMongoDB();

  const categories = await CategoryModel.find({ status: "completed" })
    .sort({ name: 1 })
    .lean();

  const finalRounds = await RoundModel.find({ type: "final" }).lean();
  const finalRoundIds = finalRounds.map((round) => round._id);

  const [rankingScores, savedRankings] = await Promise.all([
    ScoreModel.find({
      type: "ranking",
      round: { $in: finalRoundIds },
    })
      .populate({ path: "category", model: CategoryModel, select: "name" })
      .populate({ path: "competitor", model: CompetitorModel, select: "number" })
      .populate({ path: "judge", model: JudgeModel, select: "code" })
      .lean(),
    RankingModel.find({
      round: { $in: finalRoundIds },
    })
      .populate({ path: "competitor", model: CompetitorModel, select: "number" })
      .populate({ path: "round", model: RoundModel, select: "category" })
      .lean(),
  ]);

  const resultsByCategory = new Map<string, AggregatedRow[]>();
  const judgeCodesByCategory = new Map<string, string[]>();

  rankingScores.forEach((score) => {
    const categoryId =
      typeof score.category === "object" && score.category
        ? String(score.category._id)
        : String(score.category);
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

    const list = resultsByCategory.get(categoryId) ?? [];
    let row = list.find((item) => item.competitorId === competitorId);
    if (!row) {
      row = {
        competitorId,
        competitorNumber,
        totalRank: 0,
        firstPlaces: 0,
        judgeRanks: {},
      };
      list.push(row);
      resultsByCategory.set(categoryId, list);
    }

    const rank = typeof score.rank === "number" ? score.rank : 0;
    row.totalRank += rank;
    if (rank === 1) row.firstPlaces += 1;
    row.judgeRanks[judgeCode] = rank;

    const judges = judgeCodesByCategory.get(categoryId) ?? [];
    if (!judges.includes(judgeCode)) {
      judges.push(judgeCode);
      judgeCodesByCategory.set(categoryId, judges);
    }
  });

  const savedByCategory = new Map<string, AggregatedRow[]>();
  savedRankings.forEach((ranking) => {
    const roundRef = ranking.round as PopulatedRoundRef | null;
    const competitorRef = ranking.competitor as PopulatedCompetitorRef | null;
    const categoryId =
      typeof roundRef === "object" && roundRef?.category
        ? String(roundRef.category)
        : "";
    if (!categoryId) return;

    const row: AggregatedRow = {
      competitorId:
        typeof competitorRef === "object" && competitorRef?._id
          ? String(competitorRef._id)
          : String(ranking.competitor),
      competitorNumber:
        typeof competitorRef === "object" && competitorRef?.number
          ? Number(competitorRef.number)
          : "—",
      totalRank: ranking.totalPoints,
      firstPlaces: ranking.marks,
      judgeRanks: {},
    };
    const list = savedByCategory.get(categoryId) ?? [];
    list.push(row);
    savedByCategory.set(categoryId, list);
  });

  return categories.map((category) => {
    const categoryId = String(category._id);
    const savedRows = savedByCategory.get(categoryId) ?? [];
    const rows = savedRows.length > 0 ? savedRows : resultsByCategory.get(categoryId) ?? [];

    return {
      id: categoryId,
      name: category.name,
      rows: orderRows(rows),
      judges: judgeCodesByCategory.get(categoryId) ?? [],
    } satisfies AdminResultsCategory;
  });
}
