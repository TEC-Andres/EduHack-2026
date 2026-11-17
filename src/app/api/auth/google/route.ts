import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "~/env";

export function GET(req: NextRequest) {
  const state = randomBytes(16).toString("hex");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: env.CLIENT_ID,
    redirect_uri: `${req.nextUrl.origin}/api/auth/callback/google`,
    response_type: "code",
    scope: "openid email profile",
    state,
  }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set("oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });
  return res;
}
