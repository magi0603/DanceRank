import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  JUDGE_COOKIE_NAME,
  verifySession,
  type JudgeSession,
} from "@/lib/auth";
import { connectMongoDB } from "@/lib/mongoose";
import { CategoryModel, JudgeModel, RoundModel, ScoreModel } from "@/models";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const competitionId = url.searchParams.get("competitionId");
  const includeCompleted = url.searchParams.get("includeCompleted") === "true";
  const judgeCode = url.searchParams.get("judgeCode");

  if (judgeCode && !competitionId) {
    return NextResponse.json(
      {
        ok: false,
        error: "competitionId is required for judge category access.",
      },
      { status: 400 },
    );
  }

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

  await connectMongoDB();
  const query = competitionId
    ? {
        status: includeCompleted ? { $in: ["active", "completed"] } : "active",
        competition: competitionId,
      }
    : {
        status: includeCompleted ? { $in: ["active", "completed"] } : "active",
      };
  const categories = await CategoryModel.find(query)
    .sort({ discipline: 1, ageGroup: 1, name: 1 })
    .lean();
  const categoryIds = categories.map((category) => category._id);
  const activeRounds = await RoundModel.find({
    category: { $in: categoryIds },
    status: "active",
  })
    .select({ category: 1, type: 1, name: 1, dances: 1 })
    .lean();
  const activeRoundByCategory = new Map(
    activeRounds.map((round) => [String(round.category), round]),
  );
  const submittedDancesByRound = new Map<string, Set<string>>();

  if (judgeCode) {
    const judge = await JudgeModel.findOne({
      code: judgeCode.trim().toUpperCase(),
      ...(competitionId ? { competition: competitionId } : {}),
    }).lean();

    if (judge) {
      const scores = await ScoreModel.find({
        judge: judge._id,
        round: { $in: activeRounds.map((round) => round._id) },
      })
        .select({ round: 1, dance: 1 })
        .lean();

      scores.forEach((score) => {
        const roundId = String(score.round);
        const dances = submittedDancesByRound.get(roundId) ?? new Set<string>();
        dances.add(score.dance);
        submittedDancesByRound.set(roundId, dances);
      });
    }
  }

  return NextResponse.json({
    ok: true,
    categories: categories.map((category) => {
      const activeRound = activeRoundByCategory.get(String(category._id));
      const requiredDances = activeRound
        ? activeRound.type === "final"
          ? ["Final"]
          : activeRound.dances
        : [];
      const submittedDances = activeRound
        ? Array.from(submittedDancesByRound.get(String(activeRound._id)) ?? [])
        : [];
      const submittedCount = submittedDances.filter((dance) =>
        requiredDances.includes(dance),
      ).length;
      const allSubmitted =
        requiredDances.length > 0 && submittedCount >= requiredDances.length;

      return {
        id: String(category._id),
        name: category.name,
        discipline: category.discipline,
        ageGroup: category.ageGroup,
        dances: category.dances,
        status: category.status,
        slug: slugify(category.name),
        activeRoundId: activeRound ? String(activeRound._id) : null,
        activeRoundName: activeRound?.name ?? null,
        activeRoundType: activeRound?.type ?? null,
        judgeProgress: {
          required: requiredDances.length,
          submitted: submittedCount,
          allSubmitted,
        },
      };
    }),
  });
}
