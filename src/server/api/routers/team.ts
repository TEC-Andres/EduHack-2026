import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

const id = z.number().int();

export const teamRouter = createTRPCRouter({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db.team.findMany({
      where: { members: { some: { userId: ctx.user.id } } },
      orderBy: { createdAt: "desc" },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
        _count: { select: { projects: true } },
      },
    }),
  ),

  create: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(80) })).mutation(({ ctx, input }) =>
    ctx.db.team.create({ data: { name: input.name, members: { create: { userId: ctx.user.id, role: "owner" } } } }),
  ),

  addMember: protectedProcedure
    .input(z.object({ teamId: id, email: z.string().email().toLowerCase() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwner(ctx, input.teamId);
      const user = await ctx.db.user.findUnique({ where: { email: input.email } });
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Ese correo aún no tiene cuenta" });
      await ctx.db.teamMember.upsert({
        where: { teamId_userId: { teamId: input.teamId, userId: user.id } },
        update: {},
        create: { teamId: input.teamId, userId: user.id },
      });
    }),

  /** Owners remove anyone but themselves; members can remove themselves (leave). */
  removeMember: protectedProcedure.input(z.object({ teamId: id, userId: id })).mutation(async ({ ctx, input }) => {
    if (input.userId !== ctx.user.id) await assertOwner(ctx, input.teamId);
    const m = await ctx.db.teamMember.findUnique({ where: { teamId_userId: input } });
    if (m?.role === "owner") throw new TRPCError({ code: "BAD_REQUEST", message: "El dueño no puede salir; borra el equipo" });
    await ctx.db.teamMember.deleteMany({ where: input });
  }),

  delete: protectedProcedure.input(id).mutation(async ({ ctx, input }) => {
    await assertOwner(ctx, input);
    await ctx.db.team.delete({ where: { id: input } });
  }),
});

async function assertOwner(
  ctx: { db: typeof import("~/server/db").db; user: { id: number } },
  teamId: number,
) {
  const m = await ctx.db.teamMember.findUnique({ where: { teamId_userId: { teamId, userId: ctx.user.id } } });
  if (m?.role !== "owner") throw new TRPCError({ code: "FORBIDDEN", message: "Solo el dueño del equipo puede hacer esto" });
}
