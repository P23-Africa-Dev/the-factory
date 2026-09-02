import { NextRequest, NextResponse } from "next/server";
import {
  SUPPORT_ACTIVE_COOKIE,
  SUPPORT_LEVEL_COOKIE,
  SUPPORT_TOKEN_COOKIE,
  type SupportAccessLevel,
} from "@/lib/auth/support-session";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.thefactory23.com/api/v1";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const code = String(formData.get("code") ?? "").trim();

  if (code.length !== 64) {
    return NextResponse.redirect(new URL("/login?support_error=invalid", request.url), 303);
  }

  const exchangeResponse = await fetch(`${API_BASE_URL}/support-access/exchange`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code }),
    cache: "no-store",
  });

  const payload = await exchangeResponse.json().catch(() => null);

  if (!exchangeResponse.ok || !payload?.success || !payload?.data?.token) {
    return NextResponse.redirect(new URL("/login?support_error=exchange", request.url), 303);
  }

  const level = payload.data.support_session?.access_level as SupportAccessLevel;
  const dashboardPath =
    payload.data.support_session?.dashboard_path === "/agent/dashboard"
      ? "/agent/dashboard"
      : "/dashboard";
  const response = NextResponse.redirect(new URL(dashboardPath, request.url), 303);
  const secure = process.env.NODE_ENV === "production";
  const maxAge = 15 * 60;

  response.cookies.set(SUPPORT_TOKEN_COOKIE, String(payload.data.token), {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  response.cookies.set(SUPPORT_ACTIVE_COOKIE, "1", {
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  response.cookies.set(
    SUPPORT_LEVEL_COOKIE,
    level === "operational_full" ? "operational_full" : "read_only",
    {
      httpOnly: false,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge,
    },
  );

  return response;
}
