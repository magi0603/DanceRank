import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  JUDGE_COOKIE_NAME,
  verifySession,
  type JudgeSession,
} from "@/lib/auth";
import { connectMongoDB } from "@/lib/mongoose";
import {
  CategoryModel,
  CompetitorModel,
  JudgeModel,
  RoundModel,
  ScoreModel,
} from "@/models";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const categorySlug = url.searchParams.get("category");
  const competitionId = url.searchParams.get("competitionId");
  const judgeCode = url.searchParams.get("judgeCode");

  if (!categorySlug) {
    return NextResponse.json(
      { ok: false, error: "category is required." },
      { status: 400 },
    );
  }
  if (judgeCode && !competitionId) {
    return NextResponse.json(
      {
        ok: false,
        error: "competitionId is required for judge round access.",
      },
      { status: 400 },
    );
  }

  await connectMongoDB();

  if (judgeCode) {
    const cookieStore = await cookies();
    const judgeSession = await verifySession<JudgeSession>(
      cookieStore.get(JUDGE_COOKIE_NAME)?.value,
    );
    const hasMatchingJudgeSession =
      Boolean(judgeSession?.judgeId) &&
      judgeSession?.code?.toUpperCase() === judgeCode.trim().toUpperCase() &&
      (competitionId ? judgeSession?.competitionId === competitionId : true);

    if (!hasMatchingJudgeSession) {
      return NextResponse.json(
        { ok: false, error: "Judge session required." },
        { status: 401 },
      );
    }
  }

  const categories = await CategoryModel.find({
    status: { $in: ["active", "completed"] },
    ...(competitionId ? { competition: competitionId } : {}),
  }).lean();
  const category = categories.find(
    (item) => slugify(item.name) === categorySlug,
  );

  if (!category) {
    return NextResponse.json(
      { ok: false, error: "Category not found." },
      { status: 404 },
    );
  }

  const rounds = await RoundModel.find({ category: category._id })
    .sort({ order: 1 })
    .lean();
  const activeRound = rounds.find((round) => round.status === "active");
  const activeRoundId = activeRound ? String(activeRound._id) : null;

  const competitors = await CompetitorModel.find({ category: category._id })
    .sort({ number: 1 })
    .lean();

  let submittedDancesByRound: Record<string, string[]> = {};
  if (judgeCode) {
    const judge = await JudgeModel.findOne({
      code: judgeCode.trim().toUpperCase(),
      ...(competitionId ? { competition: competitionId } : {}),
    }).lean();

    if (judge) {
      const scores = await ScoreModel.find({
        judge: judge._id,
        category: category._id,
        round: { $in: rounds.map((round) => round._id) },
      })
        .select({ round: 1, dance: 1 })
        .lean();

      const submitted = new Map<string, Set<string>>();
      scores.forEach((score) => {
        const roundId = String(score.round);
        const dances = submitted.get(roundId) ?? new Set<string>();
        dances.add(score.dance);
        submitted.set(roundId, dances);
      });

      submittedDancesByRound = Object.fromEntries(
        Array.from(submitted.entries()).map(([roundId, dances]) => [
          roundId,
          Array.from(dances),
        ]),
      );
    }
  }

  return NextResponse.json({
    ok: true,
    category: {
      id: String(category._id),
      name: category.name,
      dances: category.dances,
      maxFinalists: category.maxFinalists,
    },
    competitors: competitors.map((competitor) => ({
      id: String(competitor._id),
      number: competitor.number,
    })),
    rounds: rounds.map((round) => ({
      id: String(round._id),
      name: round.name,
      order: round.order,
      type: round.type,
      status: round.status,
      dances: round.dances,
      heats: round.heats.map((heat) => ({
        number: heat.number,
        competitors: heat.competitors.map((id) => String(id)),
      })),
    })),
    activeRoundId,
    activeRoundType: activeRound?.type ?? null,
    submittedDancesByRound,
  });
}
