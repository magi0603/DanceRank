import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { calculateFinalResults } from "@/lib/final-results";
import { splitIntoHeats } from "@/lib/heats";
import { connectMongoDB } from "@/lib/mongoose";
import {
  CategoryModel,
  CompetitionModel,
  CompetitorModel,
  JudgeModel,
  RoundModel,
  ScoreModel,
} from "@/models";

type RoundUpdate = {
  roundId: string;
  status: "pending" | "active" | "completed";
};

type JudgeRow = {
  _id: unknown;
  code: string;
  name: string;
};

type ScoreSubmissionRow = {
  round: unknown;
  dance: string;
  judge: unknown;
  competitor: unknown;
  rank?: number;
  heatNumber?: number;
};

type SelectedScoreRow = {
  competitor: unknown;
};

type CompetitorNumberRow = {
  _id: unknown;
  number: number;
};

type RoundForReadiness = {
  _id: Types.ObjectId;
  competition?: Types.ObjectId;
  type: string;
  dances: string[];
  competitors: Types.ObjectId[];
  heats: { number: number; competitors: Types.ObjectId[] }[];
};

function getRequiredDances(round: { type: string; dances: string[] }) {
  return round.type === "final" ? ["Final"] : round.dances;
}

function getExpectedSelectionsByHeat(round: Pick<RoundForReadiness, "heats">) {
  return round.heats.map((heat) => ({
    heatNumber: heat.number,
    expectedSelections: Math.floor(heat.competitors.length / 2),
  }));
}

function isRoundSubmissionComplete(
  round: RoundForReadiness,
  dance: string,
  judgeId: string,
  submissions: ScoreSubmissionRow[],
) {
  const judgeDanceSubmissions = submissions.filter(
    (score) => score.dance === dance && String(score.judge) === judgeId,
  );

  if (round.type === "final") {
    const expectedFinalists = round.competitors.length;
    if (judgeDanceSubmissions.length !== expectedFinalists) {
      return false;
    }

    const rankedCompetitorIds = judgeDanceSubmissions.map((score) =>
      String(score.competitor),
    );
    const ranks = judgeDanceSubmissions
      .map((score) => score.rank)
      .filter((rank): rank is number => typeof rank === "number");

    if (
      new Set(rankedCompetitorIds).size !== expectedFinalists ||
      new Set(ranks).size !== expectedFinalists
    ) {
      return false;
    }

    const finalistIds = new Set(
      round.competitors.map((competitorId) => String(competitorId)),
    );
    if (rankedCompetitorIds.some((competitorId) => !finalistIds.has(competitorId))) {
      return false;
    }

    return ranks.every((rank) => rank >= 1 && rank <= expectedFinalists);
  }

  const roundCompetitorIds = new Set(
    round.competitors.map((competitorId) => String(competitorId)),
  );
  if (
    judgeDanceSubmissions.some(
      (score) => !roundCompetitorIds.has(String(score.competitor)),
    )
  ) {
    return false;
  }

  const countsByHeat = new Map<number, number>();
  judgeDanceSubmissions.forEach((score) => {
    if (typeof score.heatNumber !== "number") {
      return;
    }
    countsByHeat.set(
      score.heatNumber,
      (countsByHeat.get(score.heatNumber) ?? 0) + 1,
    );
  });

  return getExpectedSelectionsByHeat(round).every(
    ({ heatNumber, expectedSelections }) =>
      (countsByHeat.get(heatNumber) ?? 0) === expectedSelections,
  );
}

async function updateNextRoundQualifiers(roundId: string) {
  const round = await RoundModel.findById(roundId);
  if (!round || round.type === "final") return null;

  const [category, nextRound, selectedScores, competitors] = await Promise.all([
    CategoryModel.findById(round.category).lean(),
    RoundModel.findOne({ category: round.category, order: round.order + 1 }),
    ScoreModel.find({
      round: round._id,
      type: "selection",
      selected: true,
    })
      .select({ competitor: 1 })
      .lean<SelectedScoreRow[]>(),
    CompetitorModel.find({ _id: { $in: round.competitors } })
      .select({ number: 1 })
      .lean<CompetitorNumberRow[]>(),
  ]);

  if (!nextRound) return null;

  const numberByCompetitor = new Map(
    competitors.map((competitor) => [
      String(competitor._id),
      competitor.number,
    ]),
  );
  const marksByCompetitor = new Map<string, number>();

  selectedScores.forEach((score) => {
    const competitorId = String(score.competitor);
    marksByCompetitor.set(
      competitorId,
      (marksByCompetitor.get(competitorId) ?? 0) + 1,
    );
  });

  const targetQualifierCount =
    nextRound.type === "final"
      ? Math.min(
          category?.maxFinalists ?? round.targetQualifierCount ?? 6,
          round.competitors.length,
        )
      : Math.min(
          Math.max(1, Math.floor(round.competitors.length / 2)),
          round.competitors.length,
        );

  const qualifiedIds = round.competitors
    .map((competitorId) => String(competitorId))
    .sort((a, b) => {
      const marksA = marksByCompetitor.get(a) ?? 0;
      const marksB = marksByCompetitor.get(b) ?? 0;
      if (marksA !== marksB) return marksB - marksA;
      return (numberByCompetitor.get(a) ?? 0) - (numberByCompetitor.get(b) ?? 0);
    })
    .slice(0, targetQualifierCount);

  const qualifiedObjectIds = qualifiedIds.map(
    (competitorId) => new Types.ObjectId(competitorId),
  );

  nextRound.set({
    competitors: qualifiedObjectIds,
    heats: splitIntoHeats(qualifiedObjectIds, 8).map((group, index) => ({
      number: index + 1,
      competitors: group,
    })),
  });
  if (nextRound.status === "completed") {
    nextRound.status = "pending";
  }
  await nextRound.save();

  return {
    nextRoundId: String(nextRound._id),
    nextRoundName: nextRound.name,
    qualified: qualifiedObjectIds.length,
    heats: nextRound.heats.length,
    qualifiers: qualifiedIds.map((competitorId, index) => ({
      id: competitorId,
      number: numberByCompetitor.get(competitorId) ?? "—",
      marks: marksByCompetitor.get(competitorId) ?? 0,
      order: index + 1,
    })),
  };
}

async function getSubmissionReadiness(roundId: string) {
  const round = await RoundModel.findById(roundId).lean<RoundForReadiness | null>();
  if (!round) return { required: 0, submitted: 0, isReady: false };

  const competitionId = round.competition ? String(round.competition) : "";
  const [judges, submissions] = await Promise.all([
    JudgeModel.find({
      ...(competitionId ? { competition: competitionId } : {}),
      isActive: true,
    })
      .select({ _id: 1 })
      .lean(),
    ScoreModel.find({ round: round._id })
      .select({ dance: 1, judge: 1, competitor: 1, rank: 1, heatNumber: 1 })
      .lean<ScoreSubmissionRow[]>(),
  ]);
  const requiredDances = getRequiredDances(round);
  let submitted = 0;

  requiredDances.forEach((dance) => {
    judges.forEach((judge) => {
      if (isRoundSubmissionComplete(round, dance, String(judge._id), submissions)) {
        submitted += 1;
      }
    });
  });

  const required = requiredDances.length * judges.length;
  return {
    required,
    submitted,
    isReady: required > 0 && submitted >= required,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const categoryId = url.searchParams.get("categoryId");
  const competitionId = url.searchParams.get("competitionId");

  await connectMongoDB();

  const query = {
    ...(categoryId ? { category: categoryId } : {}),
    ...(competitionId ? { competition: competitionId } : {}),
  };
  const rounds = await RoundModel.find(query).sort({ order: 1 }).lean();
  const roundIds = rounds.map((round) => round._id);
  const competitionIds = Array.from(
    new Set(
      rounds
        .map((round) => (round.competition ? String(round.competition) : ""))
        .filter(Boolean),
    ),
  );

  const judgeQuery = competitionId
    ? { competition: competitionId, isActive: true }
    : competitionIds.length === 1
      ? { competition: competitionIds[0], isActive: true }
      : { isActive: true };
  const [judges, submissions] = await Promise.all([
    JudgeModel.find(judgeQuery)
      .sort({ displayOrder: 1 })
      .select({ code: 1, name: 1 })
      .lean<JudgeRow[]>(),
    ScoreModel.find({ round: { $in: roundIds } })
      .select({ round: 1, dance: 1, judge: 1 })
      .lean<ScoreSubmissionRow[]>(),
  ]);
  const competitorIds = Array.from(
    new Set(rounds.flatMap((round) => round.competitors.map((id) => String(id)))),
  );
  const competitorNumbers = await CompetitorModel.find({
    _id: { $in: competitorIds },
  })
    .select({ number: 1 })
    .lean<CompetitorNumberRow[]>();
  const numberByCompetitor = new Map(
    competitorNumbers.map((competitor) => [
      String(competitor._id),
      competitor.number,
    ]),
  );

  const submittedKeys = new Set(
    submissions.map(
      (score) =>
        `${String(score.round)}:${score.dance}:${String(score.judge)}`,
    ),
  );

  return NextResponse.json({
    ok: true,
    rounds: rounds.map((round) => {
      const dances = getRequiredDances(round);
      const missing: { dance: string; judges: string[] }[] = [];
      const byDance: {
        dance: string;
        judges: { code: string; name: string; submitted: boolean }[];
      }[] = [];
      let submitted = 0;

      dances.forEach((dance) => {
        const missingJudges: string[] = [];
        const judgeRows = judges.map((judge) => {
          const key = `${String(round._id)}:${dance}:${String(judge._id)}`;
          const hasSubmitted = submittedKeys.has(key);
          if (hasSubmitted) {
            submitted += 1;
          } else {
            missingJudges.push(judge.code);
          }

          return {
            code: judge.code,
            name: judge.name,
            submitted: hasSubmitted,
          };
        });

        byDance.push({ dance, judges: judgeRows });

        if (missingJudges.length > 0) {
          missing.push({ dance, judges: missingJudges });
        }
      });

      const required = dances.length * judges.length;

      return {
        id: String(round._id),
        name: round.name,
        order: round.order,
        type: round.type,
        status: round.status,
        categoryId: String(round.category),
        dances,
        competitorCount: round.competitors.length,
        heats: round.heats.map((heat) => ({
          number: heat.number,
          competitorCount: heat.competitors.length,
          competitors: heat.competitors.map((competitorId) => ({
            id: String(competitorId),
            number: numberByCompetitor.get(String(competitorId)) ?? "—",
          })),
        })),
        submissionProgress: {
          submitted,
          required,
          isReady: required > 0 && submitted >= required,
          missing,
          byDance,
        },
      };
    }),
  });
}

export async function PATCH(req: Request) {
  let payload: RoundUpdate;
  try {
    payload = (await req.json()) as RoundUpdate;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  if (!payload.roundId) {
    return NextResponse.json(
      { ok: false, error: "roundId is required." },
      { status: 400 },
    );
  }

  await connectMongoDB();
  const round = await RoundModel.findById(payload.roundId);
  if (!round) {
    return NextResponse.json({ ok: false, error: "Round not found." }, { status: 404 });
  }

  if (payload.status === "active") {
    if (round.status === "completed") {
      return NextResponse.json(
        { ok: false, error: "Completed rounds cannot be activated again." },
        { status: 400 },
      );
    }

    const previousRound = await RoundModel.findOne({
      category: round.category,
      order: round.order - 1,
    }).lean();

    if (previousRound && previousRound.status !== "completed") {
      return NextResponse.json(
        {
          ok: false,
          error: `${previousRound.name} must be completed before this round can be activated.`,
        },
        { status: 400 },
      );
    }

    await RoundModel.updateMany(
      { category: round.category, _id: { $ne: round._id }, status: "active" },
      { $set: { status: "pending" } },
    );
  }

  if (payload.status === "completed" && round.status !== "active") {
    return NextResponse.json(
      { ok: false, error: "Only active rounds can be completed." },
      { status: 400 },
    );
  }

  if (payload.status === "completed") {
    const readiness = await getSubmissionReadiness(payload.roundId);
    if (!readiness.isReady) {
      return NextResponse.json(
        {
          ok: false,
          error: `Round cannot be completed yet. Submissions ${readiness.submitted}/${readiness.required}.`,
        },
        { status: 400 },
      );
    }
  }

  round.status = payload.status;
  await round.save();

  const qualifierUpdate =
    payload.status === "completed"
      ? await updateNextRoundQualifiers(payload.roundId)
      : null;
  const finalResult =
    payload.status === "completed" && round.type === "final"
      ? await calculateFinalResults(String(round.category))
      : null;

  if (payload.status === "completed" && round.type === "final") {
    await CategoryModel.findByIdAndUpdate(round.category, {
      $set: { status: "completed" },
    });

    const remainingActiveCategories = await CategoryModel.countDocuments({
      competition: round.competition,
      status: { $ne: "completed" },
    });

    if (remainingActiveCategories === 0 && round.competition) {
      await CompetitionModel.findByIdAndUpdate(round.competition, {
        $set: { status: "completed" },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    round: {
      id: String(round._id),
      name: round.name,
      order: round.order,
      type: round.type,
      status: round.status,
    },
    qualifierUpdate,
    finalResult: finalResult
      ? {
          count: finalResult.count,
          winner: finalResult.rows[0]
            ? {
                competitorNumber: finalResult.rows[0].competitorNumber,
                placement: finalResult.rows[0].placement,
              }
            : null,
        }
      : null,
  });
}
