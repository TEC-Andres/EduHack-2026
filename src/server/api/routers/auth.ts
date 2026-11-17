import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { TRPCError } from "@trpc/server";
import { cookies } from "next/headers";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

const scryptAsync = promisify(scrypt);
const DAY = 24 * 60 * 60 * 1000;

const credentials = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(128),
});

const hash = async (password: string) => {
  const salt = randomBytes(16);
  const key = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt.toString("hex")}:${key.toString("hex")}`;
};

const verify = async (password: string, stored: string) => {
  const [salt, key] = stored.split(":") as [string, string];
  const derived = (await scryptAsync(password, Buffer.from(salt, "hex"), 64)) as Buffer;
  return timingSafeEqual(derived, Buffer.from(key, "hex"));
};

export const authRouter = createTRPCRouter({
  register: publicProcedure.input(credentials).mutation(async ({ ctx, input }) => {
    if (await ctx.db.user.findUnique({ where: { email: input.email } })) {
      throw new TRPCError({ code: "CONFLICT", message: "Email already registered" });
    }
    const user = await ctx.db.user.create({
      data: { email: input.email, password: await hash(input.password) },
    });
    await startSession(ctx.db, user.id);
  }),

  login: publicProcedure.input(credentials).mutation(async ({ ctx, input }) => {
    const user = await ctx.db.user.findUnique({ where: { email: input.email } });
    if (!user?.password || !(await verify(input.password, user.password))) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
    }
    await startSession(ctx.db, user.id);
  }),

  me: publicProcedure.query(async ({ ctx }) => {
    const token = (await cookies()).get("session")?.value;
    if (!token) return null;
    const s = await ctx.db.session.findUnique({
      where: { token },
      include: { user: { select: { email: true, name: true, image: true, role: true } } },
    });
    return s && s.expiresAt > new Date() ? s.user : null;
  }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    const jar = await cookies();
    const token = jar.get("session")?.value;
    if (token) await ctx.db.session.deleteMany({ where: { token } });
    jar.delete("session");
  }),
});

export async function startSession(
  db: typeof import("~/server/db").db,
  userId: number,
) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * DAY);
  await db.session.create({ data: { token, userId, expiresAt } });
  (await cookies()).set("session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}
