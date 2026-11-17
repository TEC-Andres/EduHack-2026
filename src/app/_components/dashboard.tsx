"use client";

import { Check, CheckCircle2, CircleDot, Flame, FolderKanban, Loader2, Plus, Sparkles, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button, cn, Field, Logo, Modal, Page, PRIORITY, StatusBar, type Priority, type Status } from "~/app/_components/ui";
import { api } from "~/trpc/react";

export function Dashboard() {
  const me = api.auth.me.useQuery();
  const projects = api.project.list.useQuery();
  const mine = api.project.myActivities.useQuery();
  const [creating, setCreating] = useState(false);
  // stop showing the skeleton after 3s: a user with no projects (or a slow DB) gets the empty state
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 3000);
    return () => clearTimeout(t);
  }, []);

  const all = projects.data?.flatMap((p) => p.activities) ?? [];
  const done = all.filter((a) => a.status === "done");
  const pts = (xs: typeof all) => xs.reduce((s, a) => s + (a.points ?? 0), 0);
  const stats = [
    { label: "Proyectos", value: projects.data?.length ?? 0, icon: FolderKanban },
    { label: "Actividades", value: all.length, icon: CircleDot },
    { label: "Completado", value: `${all.length ? Math.round((done.length / all.length) * 100) : 0}%`, icon: CheckCircle2 },
    { label: "Story points hechos", value: `${pts(done)}/${pts(all)}`, icon: Flame },
  ];

  return (
    <Page
      title="Overview"
      description={`Hola${me.data?.name ? `, ${me.data.name.split(" ")[0]}` : ""}. Tus proyectos académicos con Scrum, rúbricas y Gemini.`}
      actions={
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Nuevo proyecto
        </Button>
      }
    >
      <section className="card mb-8 grid grid-cols-2 gap-px overflow-hidden bg-line lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="flex flex-col gap-2 bg-panel p-5">
            <p className="flex items-center gap-2 text-[13px] text-dim"><Icon className="h-4 w-4" /> {label}</p>
            <p className="font-mono text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <section>
          <h2 className="mb-3 text-sm font-medium">Proyectos</h2>
          {projects.isLoading && !timedOut ? (
            <Skeletons />
          ) : !projects.data?.length ? (
            <button onClick={() => setCreating(true)} className="card flex w-full flex-col items-center gap-3 border-dashed p-12 text-sm text-dim transition-colors hover:border-dim/60 hover:text-fg">
              <Sparkles className="h-8 w-8 text-accent" />
              Crea tu primer proyecto: pega tu idea y tu rúbrica, la IA arma el backlog.
              {projects.isLoading && <span className="text-xs">Seguimos buscando tus proyectos…</span>}
              {projects.error && <span className="text-xs text-red-600 dark:text-red-400">No se pudieron cargar: {projects.error.message}</span>}
            </button>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {projects.data.map((p, i) => {
                const counts: Partial<Record<Status, number>> = {};
                for (const a of p.activities) counts[a.status as Status] = (counts[a.status as Status] ?? 0) + 1;
                const pct = p.activities.length ? Math.round(((counts.done ?? 0) / p.activities.length) * 100) : 0;
                return (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    style={{ animationDelay: `${i * 50}ms` }}
                    className="card flex flex-col gap-4 p-5 transition-colors hover:border-dim/60 motion-safe:animate-fade-up"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-medium">{p.name}</h3>
                      <span className="font-mono text-sm tabular-nums text-dim">{pct}%</span>
                    </div>
                    <p className="line-clamp-2 min-h-10 text-sm text-dim">{p.description || "Sin descripción"}</p>
                    <StatusBar counts={counts} />
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-dim">
                      <span>{p.activities.length} actividades</span>
                      <span>{p._count.sprints} sprints</span>
                      <span>{p._count.criteria} criterios</span>
                      {p.team && (
                        <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-fg">
                          <Users className="h-3 w-3" /> {p.team.name}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium">Asignadas a ti</h2>
          <div className="card divide-y divide-line overflow-hidden">
            {mine.data?.length ? (
              mine.data.map((a) => (
                <Link key={a.id} href={`/projects/${a.project.id}?a=${a.number}`} className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-panel-2">
                  <span className="text-sm font-medium">{a.title}</span>
                  <span className="flex items-center gap-2 text-xs text-dim">
                    <span className="truncate">{a.project.name} <span className="font-mono">#{a.number}</span></span>
                    <span className={`rounded px-1.5 ${PRIORITY[a.priority as Priority].cls}`}>{PRIORITY[a.priority as Priority].label}</span>
                    {a.dueDate && <span className="ml-auto">{a.dueDate.toLocaleDateString()}</span>}
                  </span>
                </Link>
              ))
            ) : (
              <p className="p-6 text-center text-sm text-dim">Nada pendiente 🎉</p>
            )}
          </div>
        </section>
      </div>

      <NewProject open={creating} onClose={() => setCreating(false)} onReopen={() => setCreating(true)} />
    </Page>
  );
}

function Skeletons() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="card h-44 bg-[linear-gradient(90deg,transparent,var(--panel-2),transparent)] bg-[length:200%_100%] motion-safe:animate-shimmer" />
      ))}
    </div>
  );
}

type Run = { name: string; steps: string[]; current: number; error?: string; projectId?: number };

function NewProject({ open, onClose, onReopen }: { open: boolean; onClose: () => void; onReopen: () => void }) {
  const router = useRouter();
  const utils = api.useUtils();
  const teams = api.team.list.useQuery(undefined, { enabled: open });
  const create = api.project.create.useMutation();
  const skill = api.ai.skill.useMutation();
  const [run, setRun] = useState<Run | null>(null);
  const [form, setForm] = useState({ name: "", description: "", rubricText: "", sprintLengthDays: 7, teamId: "", ai: true });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });
  const step = (current: number) => setRun((r) => r && { ...r, current });
  const fail = (err: unknown, projectId?: number) => setRun((r) => r && { ...r, error: (err as Error).message, projectId });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pipeline = [
      { skill: "expand_idea", label: "Gemini expande tu idea" },
      { skill: "generate_rubric", label: "Gemini diseña la rúbrica" },
      { skill: "generate_backlog", label: "Gemini genera las actividades (con playbooks)" },
      { skill: "plan_sprints", label: "Gemini reparte las actividades en sprints" },
    ] as const;
    const steps = ["Creando el proyecto", ...(form.ai ? pipeline.map((s) => s.label) : []), "Preparando tu tablero"];
    onClose(); // the <dialog> sits in the top layer, so close it before showing the overlay
    setRun({ name: form.name, steps, current: 0 });
    let p;
    try {
      p = await create.mutateAsync({ ...form, sprintLengthDays: Number(form.sprintLengthDays), teamId: form.teamId ? Number(form.teamId) : null });
    } catch (err) {
      return fail(err);
    }
    if (form.ai) {
      try {
        for (const [i, s] of pipeline.entries()) {
          step(i + 1);
          await skill.mutateAsync({ projectId: p.id, skill: s.skill });
        }
      } catch (err) {
        await utils.project.invalidate();
        return fail(err, p.id); // project exists; user can open it and retry the AI there
      }
    }
    step(steps.length - 1);
    await utils.project.invalidate();
    router.push(`/projects/${p.id}`); // overlay stays until the dashboard unmounts
  };

  return (
    <>
    {run && (
      <CreatingScreen
        run={run}
        onOpen={() => run.projectId && router.push(`/projects/${run.projectId}`)}
        onBack={() => { setRun(null); onReopen(); }}
      />
    )}
    <Modal open={open} onClose={onClose} title="Nuevo proyecto">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nombre">
          <input required className="field" value={form.name} onChange={set("name")} placeholder="App de reciclaje para mi campus" />
        </Field>
        <Field label="Idea / descripción">
          <textarea rows={3} className="field" value={form.description} onChange={set("description")} placeholder="¿Qué problema resuelve, para quién, con qué tecnología?" />
        </Field>
        <Field label="Rúbrica o requisitos (opcional)">
          <textarea rows={5} className="field font-mono text-xs" value={form.rubricText} onChange={set("rubricText")} placeholder="Pega aquí la rúbrica del profesor, del hackathon o tus propios criterios…" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Días por sprint">
            <input type="number" min={1} max={60} className="field" value={form.sprintLengthDays} onChange={set("sprintLengthDays")} />
          </Field>
          <Field label="Equipo">
            <select className="field" value={form.teamId} onChange={set("teamId")}>
              <option value="">Personal</option>
              {teams.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        </div>
        <label className="flex items-center gap-3 rounded-md border border-line bg-panel-2 p-3 text-sm">
          <input type="checkbox" checked={form.ai} onChange={set("ai")} className="h-4 w-4 accent-fg" />
          <Sparkles className="h-4 w-4 text-accent" />
          Expandir idea y generar rúbrica, tareas y sprints con Gemini
        </label>
        <Button variant="primary" className="h-10">Crear proyecto</Button>
      </form>
    </Modal>
    </>
  );
}

function CreatingScreen({ run, onOpen, onBack }: { run: Run; onOpen: () => void; onBack: () => void }) {
  return (
    <div role="status" aria-live="polite" className="fixed inset-0 z-50 grid place-items-center bg-bg/90 px-4 backdrop-blur-sm motion-safe:animate-fade-up">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <Logo size={64} animated={!run.error} />
        <h2 className="mt-6 font-display text-3xl tracking-tight">{run.error ? "Algo salió mal" : "Armando tu proyecto"}</h2>
        <p className="mt-1 truncate text-sm text-dim">{run.name}</p>

        <ol className="card mt-8 w-full divide-y divide-line text-left text-sm">
          {run.steps.map((label, i) => {
            const state = i < run.current ? "done" : i > run.current ? "pending" : run.error ? "error" : "active";
            return (
              <li key={label} className={cn("flex items-center gap-3 px-4 py-3", state === "pending" && "text-dim")}>
                <span
                  className={cn(
                    "grid h-5 w-5 shrink-0 place-items-center rounded-full",
                    state === "done" && "bg-brand text-white",
                    state === "error" && "bg-red-500 text-white",
                    state === "pending" && "border border-line",
                  )}
                >
                  {state === "done" && <Check className="h-3 w-3" />}
                  {state === "error" && <X className="h-3 w-3" />}
                  {state === "active" && <Loader2 className="h-4 w-4 animate-spin text-accent" />}
                </span>
                {label}
              </li>
            );
          })}
        </ol>

        {run.error ? (
          <>
            <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">{run.error}</p>
            <div className="mt-4 flex gap-2">
              {run.projectId ? (
                <Button variant="primary" onClick={onOpen}>Abrir proyecto y reintentar ahí</Button>
              ) : (
                <Button onClick={onBack}>Volver al formulario</Button>
              )}
            </div>
          </>
        ) : (
          <p className="mt-6 text-xs text-dim">
            {run.steps.length > 2 ? "Gemini lee tu idea y tu rúbrica para proponer actividades tipo Canvas. Puede tardar unos segundos." : "Un momento…"}
          </p>
        )}
      </div>
    </div>
  );
}
