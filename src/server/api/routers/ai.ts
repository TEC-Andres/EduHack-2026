import { z } from "zod";

import { assistant, skillNames, skills } from "~/server/ai/skills";
import { assertProject } from "~/server/api/routers/project";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const aiRouter = createTRPCRouter({
  /** Run one skill directly (buttons in the UI). */
  skill: protectedProcedure
    .input(z.object({
      projectId: z.number().int(),
      skill: z.enum(skillNames),
      instructions: z.string().max(2000).optional(),
      activityNumber: z.number().int().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertProject(ctx.db, ctx.user.id, input.projectId);
      return { summary: await skills[input.skill].run(ctx.db, input.projectId, input) };
    }),

  /** Natural-language request; Gemini decides which skills to call. */
  assistant: protectedProcedure
    .input(z.object({ projectId: z.number().int(), message: z.string().trim().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      await assertProject(ctx.db, ctx.user.id, input.projectId);
      return assistant(ctx.db, input.projectId, input.message);
    }),
});
