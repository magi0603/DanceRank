import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  JUDGE_COOKIE_NAME,
  authCookieOptions,
  createExpiry,
  verifyJudgePin,
  signSession,
  verifySession,
  type JudgeSession,
} from "@/lib/auth";
import { connectMongoDB } from "@/lib/mongoose";
import { JudgeModel } from "@/models";

const JUDGE_SESSION_SECONDS = 60 * 60 * 12;

type SessionPayload = {
  judgeCode?: string;
  competitionId?: string;
  pin?: string;
};

function parsePayload(body: SessionPayload) {
  const judgeCode = body?.judgeCode?.trim().toUpperCase();
  const competitionId = body?.competitionId?.trim();
  const pin = body?.pin?.trim();
  return { judgeCode, competitionId, pin };
}

export async function POST(req: Request) {
  let payload: SessionPayload;
  try {
    payload = (await req.json()) as SessionPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  const { judgeCode, competitionId, pin } = parsePayload(payload);
  if (!judgeCode) {
    return NextResponse.json(
      { ok: false, error: "judgeCode is required." },
      { status: 400 },
    );
  }
  if (!pin) {
    return NextResponse.json(
      { ok: false, error: "Judge PIN is required." },
      { status: 400 },
    );
  }

  await connectMongoDB();

  const judge = await JudgeModel.findOne({
    code: judgeCode,
    ...(competitionId ? { competition: competitionId } : {}),
  })
    .select("+pinHash")
    .lean();

  if (!judge) {
    return NextResponse.json(
      { ok: false, error: "Judge not found." },
      { status: 404 },
    );
  }
  if (!judge.isActive) {
    return NextResponse.json(
      { ok: false, error: "Judge is not active." },
      { status: 403 },
    );
  }

  const isPinValid = await verifyJudgePin(pin, judge.pinHash);
  if (!isPinValid) {
    return NextResponse.json(
      { ok: false, error: "Invalid judge PIN." },
      { status: 401 },
    );
  }

  const cookieStore = await cookies();
  const token = await signSession({
    judgeId: String(judge._id),
    competitionId: judge.competition ? String(judge.competition) : undefined,
    code: judge.code,
    exp: createExpiry(JUDGE_SESSION_SECONDS),
  } satisfies JudgeSession);
  cookieStore.set(
    JUDGE_COOKIE_NAME,
    token,
    authCookieOptions(JUDGE_SESSION_SECONDS),
  );

  return NextResponse.json({
    ok: true,
    judge: {
      id: String(judge._id),
      code: judge.code,
      name: judge.name,
      competitionId: judge.competition ? String(judge.competition) : null,
    },
  });
}

export async function GET() {
  const cookieStore = await cookies();
  const session = await verifySession<JudgeSession>(
    cookieStore.get(JUDGE_COOKIE_NAME)?.value,
  );

  if (!session?.judgeId) {
    return NextResponse.json({ ok: true, judge: null });
  }

  await connectMongoDB();
  const judge = await JudgeModel.findById(session.judgeId).lean();

  if (!judge) {
    return NextResponse.json({ ok: true, judge: null });
  }

  return NextResponse.json({
    ok: true,
    judge: { id: String(judge._id), code: judge.code, name: judge.name },
  });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(JUDGE_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
