import { NextResponse, type NextRequest } from "next/server";

import {
  ADMIN_COOKIE_NAME,
  JUDGE_COOKIE_NAME,
  type AdminSession,
  type JudgeSession,
  verifySession,
} from "@/lib/auth";

function isAdminAuthRoute(pathname: string) {
  return pathname === "/api/admin/auth/login" || pathname === "/api/admin/auth/logout";
}

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Admin authentication required." },
    { status: 401 },
  );
}

function getJudgeCategoryPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] !== "judge") return null;

  if (segments[1] === "competition") {
    if (
      segments.length >= 5 &&
      (segments[4] === "flow" || segments[4] === "final")
    ) {
      return {
        code: segments[3],
        competitionId: segments[2],
        categoryPath: `/judge/competition/${segments[2]}/${segments[3]}/categories`,
      };
    }
    return null;
  }

  if (
    segments.length >= 4 &&
    (segments[2] === "flow" || segments[2] === "final")
  ) {
    return {
      code: segments[1],
      competitionId: "",
      categoryPath: `/judge/${segments[1]}/categories`,
    };
  }

  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAdminApi = pathname.startsWith("/api/admin/");
  const isLoginPage = pathname === "/admin/login";
  const judgeRoute = getJudgeCategoryPath(pathname);

  if (isAdminApi && isAdminAuthRoute(pathname)) {
    return NextResponse.next();
  }

  const session = await verifySession<AdminSession>(
    request.cookies.get(ADMIN_COOKIE_NAME)?.value,
  );
  const isAuthedAdmin = session?.role === "admin";

  if (isLoginPage) {
    if (isAuthedAdmin) {
      return NextResponse.redirect(new URL("/admin/competitions", request.url));
    }
    return NextResponse.next();
  }

  if (isAdminApi && !isAuthedAdmin) {
    return unauthorized();
  }

  if (isAdminPage && !isAuthedAdmin) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (judgeRoute) {
    const judgeSession = await verifySession<JudgeSession>(
      request.cookies.get(JUDGE_COOKIE_NAME)?.value,
    );
    const hasMatchingJudgeSession =
      Boolean(judgeSession?.judgeId) &&
      judgeSession?.code?.toUpperCase() === judgeRoute.code.toUpperCase() &&
      (judgeRoute.competitionId
        ? judgeSession?.competitionId === judgeRoute.competitionId
        : true);

    if (!hasMatchingJudgeSession) {
      return NextResponse.redirect(new URL(judgeRoute.categoryPath, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/judge/:path*"],
};
