import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Types } from "mongoose";

import {
  JUDGE_COOKIE_NAME,
  verifySession,
  type JudgeSession,
} from "@/lib/auth";
import { connectMongoDB } from "@/lib/mongoose";
import {
  JudgeModel,
  RoundModel,
  ScoreModel,
} from "@/models";

type RoundForValidation = {
  _id: Types.ObjectId;
  category: Types.ObjectId;
  competition?: Types.ObjectId;
  type: "round_of_16" | "quarter_final" | "semi_final" | "final";
  status: "pending" | "active" | "completed";
  dances: string[];
  competitors: Types.ObjectId[];
  heats: { number: number; competitors: Types.ObjectId[] }[];
};

type SelectionPayload = {
  competitionId?: string;
  categoryId: string;
  roundId: string;
  dance: string;
  type: "selection";
  heatNumber?: number;
  selections: string[];
  submittedAt?: string;
  signature?: string;
};

type RankingPayload = {
  competitionId?: string;
  categoryId: string;
  roundId: string;
  dance: string;
  type: "ranking";
  rankings: { competitorId: string; rank: number }[];
  submittedAt?: string;
  signature?: string;
};

type ScorePayload = SelectionPayload | RankingPayload;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

function getAllowedDances(round: Pick<RoundForValidation, "type" | "dances">) {
  return round.type === "final" ? ["Final"] : round.dances;
}

function getExpectedSelectionsPerHeat(round: Pick<RoundForValidation, "heats">) {
  return round.heats.map((heat) => ({
    heatNumber: heat.number,
    expectedSelections: Math.floor(heat.competitors.length / 2),
  }));
}

function buildHeatLookup(round: Pick<RoundForValidation, "heats">) {
  const heatByCompetitor = new Map<string, number>();

  round.heats.forEach((heat) => {
    heat.competitors.forEach((competitorId) => {
      heatByCompetitor.set(String(competitorId), heat.number);
    });
  });

  return heatByCompetitor;
}

export async function POST(req: Request) {
  let payload: ScorePayload;
  try {
    payload = (await req.json()) as ScorePayload;
  } catch {
    return badRequest("Invalid JSON payload.");
  }

  const { competitionId, categoryId, roundId, dance } = payload;
  if (
    !isNonEmptyString(categoryId) ||
    !isNonEmptyString(roundId) ||
    !isNonEmptyString(dance)
  ) {
    return badRequest("categoryId, roundId, and dance are required.");
  }

  if (payload.type !== "selection" && payload.type !== "ranking") {
    return badRequest("type must be 'selection' or 'ranking'.");
  }

  await connectMongoDB();

  const cookieStore = await cookies();
  const judgeSession = await verifySession<JudgeSession>(
    cookieStore.get(JUDGE_COOKIE_NAME)?.value,
  );
  if (!judgeSession?.judgeId) {
    return NextResponse.json(
      { ok: false, error: "Judge session required." },
      { status: 401 },
    );
  }

  if (
    !Types.ObjectId.isValid(judgeSession.judgeId) ||
    !Types.ObjectId.isValid(categoryId) ||
    !Types.ObjectId.isValid(roundId)
  ) {
    return badRequest("judgeId, categoryId, or roundId is invalid.");
  }
  if (
    isNonEmptyString(competitionId) &&
    judgeSession.competitionId &&
    competitionId !== judgeSession.competitionId
  ) {
    return NextResponse.json(
      { ok: false, error: "Judge session does not match this competition." },
      { status: 403 },
    );
  }

  const judgeObjectId = new Types.ObjectId(judgeSession.judgeId);
  const categoryObjectId = new Types.ObjectId(categoryId);
  const roundObjectId = new Types.ObjectId(roundId);

  const submittedAt = payload.submittedAt
    ? new Date(payload.submittedAt)
    : new Date();

  const [judge, round] = await Promise.all([
    JudgeModel.findById(judgeObjectId).lean(),
    RoundModel.findById(roundObjectId).lean<RoundForValidation | null>(),
  ]);

  if (!judge) {
    return badRequest("judgeId is invalid.");
  }
  if (!judge.isActive) {
    return NextResponse.json(
      { ok: false, error: "Judge is not active for submissions." },
      { status: 403 },
    );
  }
  if (!round) {
    return badRequest("roundId is invalid.");
  }
  if (String(round.category) !== categoryId) {
    return badRequest("roundId does not belong to the provided category.");
  }
  if (
    round.competition &&
    judge.competition &&
    String(round.competition) !== String(judge.competition)
  ) {
    return NextResponse.json(
      { ok: false, error: "Judge is not assigned to this competition." },
      { status: 403 },
    );
  }
  if (!getAllowedDances(round).includes(dance)) {
    return badRequest("dance is not valid for this round.");
  }

  const existingSubmission = await ScoreModel.exists({
    judge: judgeObjectId,
    round: roundObjectId,
    dance,
  });
  if (existingSubmission) {
    return NextResponse.json(
      {
        ok: false,
        error: "Scores for this judge, round, and dance were already submitted.",
      },
      { status: 409 },
    );
  }

  if (payload.type === "selection") {
    if (!Array.isArray(payload.selections) || payload.selections.length === 0) {
      return badRequest("selections must be a non-empty array.");
    }

    if (round.status !== "active") {
      return badRequest("Round is not active.");
    }
    if (round.type === "final") {
      return badRequest("Final rounds require rankings, not selections.");
    }
    const uniqueSelections = Array.from(new Set(payload.selections));
    if (
      uniqueSelections.some((competitorId) =>
        !Types.ObjectId.isValid(competitorId),
      )
    ) {
      return badRequest("selections include an invalid competitor.");
    }

    const roundCompetitorIds = new Set(
      round.competitors.map((competitorId) => String(competitorId)),
    );
    if (
      uniqueSelections.some((competitorId) => !roundCompetitorIds.has(competitorId))
    ) {
      return badRequest("selections must only include competitors in this round.");
    }

    const heatByCompetitor = buildHeatLookup(round);
    const countsByHeat = new Map<number, number>();
    uniqueSelections.forEach((competitorId) => {
      const heatNumber = heatByCompetitor.get(competitorId);
      if (!heatNumber) {
        return;
      }
      countsByHeat.set(heatNumber, (countsByHeat.get(heatNumber) ?? 0) + 1);
    });

    const invalidHeat = getExpectedSelectionsPerHeat(round).find(
      ({ heatNumber, expectedSelections }) =>
        (countsByHeat.get(heatNumber) ?? 0) !== expectedSelections,
    );
    if (invalidHeat) {
      return badRequest(
        `Heat ${invalidHeat.heatNumber} must include exactly ${invalidHeat.expectedSelections} selections.`,
      );
    }

    const ops = uniqueSelections.map((competitorId) => {
      const competitorObjectId = new Types.ObjectId(competitorId);
      return {
        updateOne: {
          filter: {
            judge: judgeObjectId,
            round: roundObjectId,
            dance,
            competitor: competitorObjectId,
          },
          update: {
            $set: {
              judge: judgeObjectId,
              category: categoryObjectId,
              round: roundObjectId,
              competitor: competitorObjectId,
              dance,
              type: "selection" as const,
              selected: true,
              heatNumber: heatByCompetitor.get(competitorId),
              submittedAt,
              signature: payload.signature,
            },
            $unset: { rank: "" as const },
          },
          upsert: true,
        },
      };
    });

    const result = await ScoreModel.bulkWrite(ops);
    return NextResponse.json({
      ok: true,
      type: "selection",
      matched: result.matchedCount,
      modified: result.modifiedCount,
      upserted: result.upsertedCount,
    });
  }

  if (!Array.isArray(payload.rankings) || payload.rankings.length === 0) {
    return badRequest("rankings must be a non-empty array.");
  }

  const ranks = payload.rankings.map((ranking) => ranking.rank);
  const uniqueRanks = new Set(ranks);
  if (uniqueRanks.size !== payload.rankings.length) {
    return badRequest("rankings must use unique positions.");
  }
  if (
    payload.rankings.some(
      (ranking) => !Types.ObjectId.isValid(ranking.competitorId),
    )
  ) {
    return badRequest("rankings include an invalid competitor.");
  }
  if (round.status !== "active") {
    return badRequest("Round is not active.");
  }
  if (round.type !== "final") {
    return badRequest("Rankings can only be submitted for the final round.");
  }

  const finalistIds = new Set(
    round.competitors.map((competitorId) => String(competitorId)),
  );
  if (payload.rankings.length !== finalistIds.size) {
    return badRequest(
      `rankings must include exactly ${finalistIds.size} finalists.`,
    );
  }

  const rankedCompetitorIds = payload.rankings.map(
    (ranking) => ranking.competitorId,
  );
  if (new Set(rankedCompetitorIds).size !== payload.rankings.length) {
    return badRequest("rankings must not repeat a competitor.");
  }
  if (rankedCompetitorIds.some((competitorId) => !finalistIds.has(competitorId))) {
    return badRequest("rankings must only include finalists in this round.");
  }

  const hasOutOfRangeRank = ranks.some(
    (rank) => !Number.isInteger(rank) || rank < 1 || rank > finalistIds.size,
  );
  if (hasOutOfRangeRank) {
    return badRequest(
      `rankings must use each position from 1 to ${finalistIds.size} exactly once.`,
    );
  }

  const ops = payload.rankings.map((ranking) => {
    const competitorObjectId = new Types.ObjectId(ranking.competitorId);
    return {
      updateOne: {
        filter: {
          judge: judgeObjectId,
          round: roundObjectId,
          dance,
          competitor: competitorObjectId,
        },
        update: {
          $set: {
            judge: judgeObjectId,
            category: categoryObjectId,
            round: roundObjectId,
            competitor: competitorObjectId,
            dance,
            type: "ranking" as const,
            selected: false,
            rank: ranking.rank,
            submittedAt,
            signature: payload.signature,
          },
        },
        upsert: true,
      },
    };
  });

  const result = await ScoreModel.bulkWrite(ops);
  return NextResponse.json({
    ok: true,
    type: "ranking",
    matched: result.matchedCount,
    modified: result.modifiedCount,
    upserted: result.upsertedCount,
  });
}
