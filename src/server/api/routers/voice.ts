import { z } from "zod";

import { assertProject } from "~/server/api/routers/project";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

/** "Guardar" mode transcript: plain storage, no LLM involved. */
export const voiceRouter = createTRPCRouter({
  list: protectedProcedure.input(z.number().int()).query(async ({ ctx, input }) => {
    await assertProject(ctx.db, ctx.user.id, input);
    // newest 500, shown oldest-first
    return (await ctx.db.voiceNote.findMany({ where: { projectId: input }, orderBy: { createdAt: "desc" }, take: 500 })).reverse();
  }),

  add: protectedProcedure
    // stored verbatim (no trimming/cleanup); long continuous phrases are fine
    .input(z.object({ projectId: z.number().int(), text: z.string().max(20000).refine((t) => t.trim().length > 0) }))
    .mutation(async ({ ctx, input }) => {
      await assertProject(ctx.db, ctx.user.id, input.projectId);
      return ctx.db.voiceNote.create({ data: { ...input, userId: ctx.user.id } });
    }),

  clear: protectedProcedure.input(z.number().int()).mutation(async ({ ctx, input }) => {
    await assertProject(ctx.db, ctx.user.id, input);
    await ctx.db.voiceNote.deleteMany({ where: { projectId: input } });
  }),
});
