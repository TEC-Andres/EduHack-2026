import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { calendarToken } from "~/server/calendar";
import { type db as Db } from "~/server/db";

export const STATUSES = ["backlog", "todo", "in_progress", "review", "done"] as const;
export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;

/** Visible to its owner and to every member of its team. */
const canSee = (userId: number) => ({
  OR: [{ ownerId: userId }, { team: { members: { some: { userId } } } }],
});

export async function assertProject(db: typeof Db, userId: number, projectId: number) {
  const p = await db.project.findFirst({ where: { id: projectId, ...canSee(userId) } });
  if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Proyecto no encontrado" });
  return p;
}

async function assertActivity(db: typeof Db, userId: number, id: number) {
  const a = await db.activity.findUnique({ where: { id } });
  if (!a) throw new TRPCError({ code: "NOT_FOUND" });
  await assertProject(db, userId, a.projectId);
  return a;
}

const userSelect = { select: { id: true, name: true, email: true, image: true } } as const;

const projectInput = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(5000).default(""),
  rubricText: z.string().max(20000).default(""),
  sprintLengthDays: z.number().int().min(1).max(60).default(7),
  teamId: z.number().int().nullable().default(null),
});

const activityPatch = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(10000),
  acceptance: z.array(z.string().max(500)).max(30),
  deliverable: z.string().max(1000),
  status: z.enum(STATUSES),
  priority: z.enum(PRIORITIES),
  points: z.number().int().min(0).max(100).nullable(),
  labels: z.array(z.string().max(40)).max(10),
  checklist: z.array(z.object({ text: z.string().max(500), done: z.boolean() })).max(50),
  dueDate: z.date().nullable(),
  sprintId: z.number().int().nullable(),
  assigneeId: z.number().int().nullable(),
  criterionId: z.number().int().nullable(),
});

export const projectRouter = createTRPCRouter({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db.project.findMany({
      where: canSee(ctx.user.id),
      orderBy: { createdAt: "desc" },
      include: {
        team: { select: { name: true } },
        activities: { select: { status: true, points: true } },
        _count: { select: { sprints: true, criteria: true } },
      },
    }),
  ),

  myActivities: protectedProcedure.query(({ ctx }) =>
    ctx.db.activity.findMany({
      where: { assigneeId: ctx.user.id, status: { not: "done" }, project: canSee(ctx.user.id) },
      orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
      take: 20,
      include: { project: { select: { id: true, name: true } } },
    }),
  ),

  get: protectedProcedure.input(z.number().int()).query(async ({ ctx, input }) => {
    await assertProject(ctx.db, ctx.user.id, input);
    return ctx.db.project.findUniqueOrThrow({
      where: { id: input },
      include: {
        owner: userSelect,
        team: { include: { members: { include: { user: userSelect } } } },
        criteria: { orderBy: { id: "asc" } },
        sprints: { orderBy: { startDate: "asc" } },
        activities: { orderBy: { position: "asc" }, include: { assignee: userSelect } },
      },
    });
  }),

  /** Secret feed path for calendar apps (Google/Apple/Outlook/Thunderbird) that can't log in. */
  calendarFeed: protectedProcedure.input(z.number().int()).query(async ({ ctx, input }) => {
    await assertProject(ctx.db, ctx.user.id, input);
    return `/api/calendar/${input}?token=${calendarToken(input)}`;
  }),

  create: protectedProcedure.input(projectInput).mutation(async ({ ctx, input }) => {
    if (input.teamId && !(await ctx.db.teamMember.findUnique({ where: { teamId_userId: { teamId: input.teamId, userId: ctx.user.id } } }))) {
      throw new TRPCError({ code: "FORBIDDEN", message: "No perteneces a ese equipo" });
    }
    return ctx.db.project.create({ data: { ...input, ownerId: ctx.user.id } });
  }),

  update: protectedProcedure
    .input(z.object({ id: z.number().int(), data: projectInput.partial() }))
    .mutation(async ({ ctx, input }) => {
      await assertProject(ctx.db, ctx.user.id, input.id);
      return ctx.db.project.update({ where: { id: input.id }, data: input.data });
    }),

  delete: protectedProcedure.input(z.number().int()).mutation(async ({ ctx, input }) => {
    const p = await assertProject(ctx.db, ctx.user.id, input);
    if (p.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Solo el dueño puede borrar el proyecto" });
    await ctx.db.project.delete({ where: { id: input } });
  }),

  // ---- activities (issues) ----
  createActivity: protectedProcedure
    .input(z.object({ projectId: z.number().int(), title: z.string().trim().min(1).max(200), status: z.enum(STATUSES).default("backlog"), sprintId: z.number().int().nullable().default(null) }))
    .mutation(async ({ ctx, input }) => {
      await assertProject(ctx.db, ctx.user.id, input.projectId);
      const last = await ctx.db.activity.aggregate({ where: { projectId: input.projectId }, _max: { number: true, position: true } });
      return ctx.db.activity.create({
        data: { ...input, number: (last._max.number ?? 0) + 1, position: (last._max.position ?? 0) + 1 },
      });
    }),

  updateActivity: protectedProcedure
    .input(z.object({ id: z.number().int(), data: activityPatch.partial() }))
    .mutation(async ({ ctx, input }) => {
      const a = await assertActivity(ctx.db, ctx.user.id, input.id);
      const { sprintId, criterionId } = input.data;
      // referenced rows must belong to the same project
      if (sprintId && !(await ctx.db.sprint.findFirst({ where: { id: sprintId, projectId: a.projectId } }))) throw new TRPCError({ code: "BAD_REQUEST" });
      if (criterionId && !(await ctx.db.rubricCriterion.findFirst({ where: { id: criterionId, projectId: a.projectId } }))) throw new TRPCError({ code: "BAD_REQUEST" });
      return ctx.db.activity.update({ where: { id: input.id }, data: input.data });
    }),

  moveActivity: protectedProcedure
    .input(z.object({ id: z.number().int(), status: z.enum(STATUSES), position: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertActivity(ctx.db, ctx.user.id, input.id);
      return ctx.db.activity.update({ where: { id: input.id }, data: { status: input.status, position: input.position } });
    }),

  deleteActivity: protectedProcedure.input(z.number().int()).mutation(async ({ ctx, input }) => {
    await assertActivity(ctx.db, ctx.user.id, input);
    await ctx.db.activity.delete({ where: { id: input } });
  }),

  // ---- sprints ----
  createSprint: protectedProcedure
    .input(z.object({ projectId: z.number().int(), name: z.string().trim().min(1).max(80), goal: z.string().max(500).default(""), startDate: z.date(), endDate: z.date() }))
    .mutation(async ({ ctx, input }) => {
      await assertProject(ctx.db, ctx.user.id, input.projectId);
      return ctx.db.sprint.create({ data: input });
    }),

  deleteSprint: protectedProcedure.input(z.number().int()).mutation(async ({ ctx, input }) => {
    const s = await ctx.db.sprint.findUnique({ where: { id: input } });
    if (!s) throw new TRPCError({ code: "NOT_FOUND" });
    await assertProject(ctx.db, ctx.user.id, s.projectId);
    await ctx.db.sprint.delete({ where: { id: input } });
  }),
});
