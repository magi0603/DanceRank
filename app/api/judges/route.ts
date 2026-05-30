import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  ADMIN_COOKIE_NAME,
  verifySession,
  type AdminSession,
} from "@/lib/auth";
import { connectMongoDB } from "@/lib/mongoose";
import { JudgeModel } from "@/models";

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const adminSession = await verifySession<AdminSession>(
    cookieStore.get(ADMIN_COOKIE_NAME)?.value,
  );
  if (adminSession?.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "Admin authentication required." },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const competitionId = url.searchParams.get("competitionId");

  await connectMongoDB();
  const judges = await JudgeModel.find({
    isActive: true,
    ...(competitionId ? { competition: competitionId } : {}),
  })
    .sort({ displayOrder: 1 })
    .select({ code: 1, name: 1 })
    .lean();

  return NextResponse.json({
    ok: true,
    judges: judges.map((judge) => ({
      id: String(judge._id),
      code: judge.code,
      name: judge.name,
    })),
  });
}
