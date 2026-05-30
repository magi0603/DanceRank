import "server-only";

import { Types } from "mongoose";

import { connectMongoDB } from "@/lib/mongoose";
import {
  CategoryModel,
  CompetitorModel,
  JudgeModel,
  RankingModel,
  RoundModel,
  ScoreModel,
} from "@/models";

export type FinalResultRow = {
  competitorId: string;
  competitorNumber: number | string;
  placement: number;
  totalRank: number;
  firstPlaces: number;
  judgeRanks: Record<string, number>;
};

export async function calculateFinalResults(categoryId: string) {
  if (!Types.ObjectId.isValid(categoryId)) {
    throw new Error("categoryId is invalid.");
  }

  await connectMongoDB();

  const category = await CategoryModel.findById(categoryId).lean();
  if (!category) {
    throw new Error("Category not found.");
  }

  const finalRound = await RoundModel.findOne({
    category: categoryId,
    type: "final",
  }).lean();

  if (!finalRound) {
    throw new Error("Final round not found.");
  }

  const rankingScores = await ScoreModel.find({
    type: "ranking",
    round: finalRound._id,
  })
    .populate({ path: "competitor", model: CompetitorModel, select: "number" })
    .populate({ path: "judge", model: JudgeModel, select: "code" })
    .lean();

  const byCompetitor = new Map<
    string,
    Omit<FinalResultRow, "placement">
  >();

  rankingScores.forEach((score) => {
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

    const row =
      byCompetitor.get(competitorId) ??
      {
        competitorId,
        competitorNumber,
        totalRank: 0,
        firstPlaces: 0,
        judgeRanks: {},
      };

    row.totalRank += rank;
    if (rank === 1) row.firstPlaces += 1;
    row.judgeRanks[judgeCode] = rank;
    byCompetitor.set(competitorId, row);
  });

  const ordered: FinalResultRow[] = Array.from(byCompetitor.values())
    .sort((a, b) => {
      if (a.totalRank !== b.totalRank) return a.totalRank - b.totalRank;
      if (a.firstPlaces !== b.firstPlaces) return b.firstPlaces - a.firstPlaces;
      return Number(a.competitorNumber) - Number(b.competitorNumber);
    })
    .map((row, index) => ({
      ...row,
      placement: index + 1,
    }));

  const ops = ordered.map((row) => ({
    updateOne: {
      filter: {
        round: finalRound._id,
        competitor: new Types.ObjectId(row.competitorId),
      },
      update: {
        $set: {
          category: new Types.ObjectId(categoryId),
          round: finalRound._id,
          competitor: new Types.ObjectId(row.competitorId),
          placement: row.placement,
          totalPoints: row.totalRank,
          marks: row.firstPlaces,
          isQualified: true,
          isWinner: row.placement === 1,
          calculatedAt: new Date(),
        },
      },
      upsert: true,
    },
  }));

  if (ops.length > 0) {
    await RankingModel.bulkWrite(ops);
  }

  return {
    categoryId,
    finalRoundId: String(finalRound._id),
    count: ordered.length,
    rows: ordered,
  };
}
