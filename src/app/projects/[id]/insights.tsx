"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button, StatusBar, type Status } from "~/app/_components/ui";
import { api } from "~/trpc/react";
import { type Activity, type Project } from "./shared";

type Level = { label: string; points: number; description: string };
const DAY = 86_400_000;

const countBy = (xs: Activity[]) => {
  const c: Partial<Record<Status, number>> = {};
  for (const a of xs) c[a.status as Status] = (c[a.status as Status] ?? 0) + 1;
  return c;
};
const pts = (xs: Activity[]) => xs.reduce((s, a) => s + (a.points ?? 0), 0);

export function RubricView({ project }: { project: Project }) {
  const rows = project.criteria.map((c) => {
    const acts = project.activities.filter((a) => a.criterionId === c.id);
    const done = acts.filter((a) => a.status === "done").length;
    return { c, acts, progress: acts.length ? done / acts.length : 0 };
  });
  const totalW = rows.reduce((s, r) => s + r.c.weight, 0) || 1;
  const score = Math.round((rows.reduce((s, r) => s + r.c.weight * r.progress, 0) / totalW) * 100);

  if (!rows.length)
    return (
      <div className="card p-10 text-center text-sm text-dim">
        Aún no hay rúbrica. Usa <b className="text-fg">Generar rúbrica</b> en la barra de IA{project.rubricText ? " — se basará en la que pegaste." : "."}
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-wrap items-center gap-6 p-5">
        <div className="relative grid h-24 w-24 place-items-center">
          <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="3" className="text-panel-2" />
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="url(#g)" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${score} 100`} className="transition-all duration-700" />
            <defs><linearGradient id="g"><stop offset="0" stopColor="var(--color-accent)" /><stop offset="1" stopColor="var(--color-accent-2)" /></linearGradient></defs>
          </svg>
          <span className="font-mono text-xl font-semibold tabular-nums">{score}%</span>
        </div>
        <div className="flex-1">
          <h2 className="font-semibold">Avance ponderado de la rúbrica</h2>
          <p className="text-sm text-dim">Peso de cada criterio × porcentaje de sus actividades terminadas.</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map(({ c, acts, progress }, i) => (
          <article key={c.id} style={{ animationDelay: `${i * 50}ms` }} className="card p-5 motion-safe:animate-fade-up">
            <header className="flex items-start justify-between gap-3">
              <h3 className="font-semibold">{c.name}</h3>
              <span className="rounded-full border border-line px-2.5 py-0.5 font-mono text-xs">{c.weight}%</span>
            </header>
            <p className="mt-1 text-sm text-dim">{c.description}</p>
            <div className="mt-4 flex items-center gap-3 text-xs text-dim">
              <StatusBar counts={countBy(acts)} className="flex-1" />
              <span className="font-mono tabular-nums">{Math.round(progress * 100)}% · {acts.length} act.</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(c.levels as Level[]).map((l) => (
                <div key={l.label} className="rounded-md border border-line bg-panel-2/50 p-2.5">
                  <p className="text-xs font-semibold">{l.label} <span className="text-dim">· {l.points}</span></p>
                  <p className="mt-1 text-[11px] leading-snug text-dim">{l.description}</p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function SprintsView({ project }: { project: Project }) {
  const utils = api.useUtils();
  const refresh = () => utils.project.get.invalidate(project.id);
  const create = api.project.createSprint.useMutation({ onSuccess: refresh });
  const del = api.project.deleteSprint.useMutation({ onSuccess: refresh });
  const now = Date.now();

  const addNext = () => {
    const start = Math.max(now, ...project.sprints.map((s) => s.endDate.getTime()));
    create.mutate({
      projectId: project.id,
      name: `Sprint ${project.sprints.length + 1}`,
      startDate: new Date(start),
      endDate: new Date(start + project.sprintLengthDays * DAY),
    });
  };
  const unplanned = project.activities.filter((a) => !a.sprintId && a.status !== "done");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-dim">{unplanned.length} actividades pendientes sin sprint · {pts(unplanned)} pts</p>
        <Button onClick={addNext} disabled={create.isPending}><Plus className="h-4 w-4" /> Nuevo sprint</Button>
      </div>
      {!project.sprints.length && <div className="card p-10 text-center text-sm text-dim">Sin sprints. Usa <b className="text-fg">Planear sprints</b> en la barra de IA.</div>}
      <div className="grid gap-4 lg:grid-cols-2">
        {project.sprints.map((s, i) => {
          const acts = project.activities.filter((a) => a.sprintId === s.id);
          const done = acts.filter((a) => a.status === "done");
          const active = s.startDate.getTime() <= now && now <= s.endDate.getTime();
          return (
            <article key={s.id} style={{ animationDelay: `${i * 50}ms` }} className={`card p-5 motion-safe:animate-fade-up ${active ? "border-accent" : ""}`}>
              <header className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 font-semibold">
                    {s.name}
                    {active && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">Activo</span>}
                  </h3>
                  <p className="text-xs text-dim">{s.startDate.toLocaleDateString()} → {s.endDate.toLocaleDateString()}</p>
                </div>
                <button onClick={() => confirm(`¿Borrar ${s.name}? Sus actividades quedan sin sprint.`) && del.mutate(s.id)} aria-label={`Borrar ${s.name}`} className="rounded-md p-1.5 text-dim hover:bg-panel-2 hover:text-red-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              </header>
              {s.goal && <p className="mt-2 text-sm">🎯 {s.goal}</p>}
              <div className="mt-4 flex items-center gap-3 text-xs text-dim">
                <StatusBar counts={countBy(acts)} className="flex-1" />
                <span className="font-mono tabular-nums">{pts(done)}/{pts(acts)} pts</span>
              </div>
              <Burndown start={s.startDate.getTime()} end={s.endDate.getTime()} acts={acts} />
            </article>
          );
        })}
      </div>
    </div>
  );
}

/** shortcut: uses updatedAt of done activities as completion time; add a completedAt column if edits after "done" skew it. */
function Burndown({ start, end, acts }: { start: number; end: number; acts: Activity[] }) {
  const total = pts(acts);
  if (!total) return null;
  const days = Math.max(1, Math.round((end - start) / DAY));
  const today = Math.min(days, Math.floor((Date.now() - start) / DAY));
  const remaining = (d: number) => total - pts(acts.filter((a) => a.status === "done" && a.updatedAt.getTime() <= start + (d + 1) * DAY));
  const x = (d: number) => (d / days) * 100;
  const y = (v: number) => 36 - (v / total) * 32;
  const actual = today >= 0 ? Array.from({ length: today + 1 }, (_, d) => `${x(d)},${y(remaining(d))}`).join(" ") : "";
  return (
    <figure className="mt-4">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-24 w-full overflow-visible" role="img" aria-label="Burndown del sprint">
        <line x1="0" y1={y(total)} x2="100" y2={y(0)} stroke="currentColor" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" className="text-dim/50" />
        {actual && <polyline points={actual} fill="none" stroke="var(--color-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
      </svg>
      <figcaption className="mt-1 flex justify-between text-[11px] text-dim"><span>Burndown · ideal (punteado) vs real</span><span>{days} días</span></figcaption>
    </figure>
  );
}
