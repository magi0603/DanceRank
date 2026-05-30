import { NextResponse } from "next/server";

import { connectMongoDB } from "@/lib/mongoose";
import { JudgeModel } from "@/models";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const judgeCode = url.searchParams.get("judgeCode")?.trim().toUpperCase();
  const competitionId = url.searchParams.get("competitionId")?.trim();

  if (!judgeCode) {
    return NextResponse.json(
      { ok: false, error: "judgeCode is required." },
      { status: 400 },
    );
  }

  await connectMongoDB();

  const judge = await JudgeModel.findOne({
    code: judgeCode,
    ...(competitionId ? { competition: competitionId } : {}),
    isActive: true,
  })
    .select({ _id: 1, code: 1, name: 1 })
    .lean();

  return NextResponse.json({
    ok: true,
    exists: Boolean(judge),
    judge: judge
      ? {
          id: String(judge._id),
          code: judge.code,
          name: judge.name,
        }
      : null,
  });
}
