import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  ADMIN_COOKIE_NAME,
  authCookieOptions,
  createExpiry,
  getAdminPassword,
  signSession,
  type AdminSession,
} from "@/lib/auth";

const ADMIN_SESSION_SECONDS = 60 * 60 * 12;

type LoginPayload = {
  password?: string;
};

export async function POST(req: Request) {
  let payload: LoginPayload;
  try {
    payload = (await req.json()) as LoginPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  const expectedPassword = getAdminPassword();
  if (!expectedPassword) {
    return NextResponse.json(
      { ok: false, error: "ADMIN_PASSWORD is not configured." },
      { status: 500 },
    );
  }

  if (payload.password !== expectedPassword) {
    return NextResponse.json(
      { ok: false, error: "Invalid admin password." },
      { status: 401 },
    );
  }

  const session: AdminSession = {
    role: "admin",
    exp: createExpiry(ADMIN_SESSION_SECONDS),
  };
  const token = await signSession(session);

  const cookieStore = await cookies();
  cookieStore.set(
    ADMIN_COOKIE_NAME,
    token,
    authCookieOptions(ADMIN_SESSION_SECONDS),
  );

  return NextResponse.json({ ok: true });
}
