import { NextResponse, type NextRequest } from "next/server";

import { env } from "~/env";
import { startSession } from "~/server/api/routers/auth";
import { db } from "~/server/db";

export async function GET(req: NextRequest) {
  const { origin, searchParams } = req.nextUrl;
  const fail = () => NextResponse.redirect(`${origin}/login?error=google`);

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state || state !== req.cookies.get("oauth_state")?.value) return fail();

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      code,
      client_id: env.CLIENT_ID,
      client_secret: env.CLIENT_SECRET,
      redirect_uri: `${origin}/api/auth/callback/google`,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return fail();
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!infoRes.ok) return fail();
  const info = (await infoRes.json()) as { email?: string; email_verified?: boolean; name?: string; picture?: string };
  if (!info.email || !info.email_verified) return fail();

  const email = info.email.toLowerCase();
  const profile = { name: info.name, image: info.picture };
  const user = await db.user.upsert({
    where: { email },
    update: profile,
    create: { email, ...profile },
  });
  await startSession(db, user.id);

  const res = NextResponse.redirect(origin);
  res.cookies.delete("oauth_state");
  return res;
}
