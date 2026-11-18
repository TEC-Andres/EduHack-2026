"use client";

import { CheckSquare, Download, Loader2, Plus, Search, Send, Settings, Sparkles, Users } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Avatar, Button, cn, Field, Modal, Page, PRIORITY, STATUS, STATUS_KEYS, StatusBar, type Priority, type Status } from "~/app/_components/ui";
import { api } from "~/trpc/react";
import { ActivityPanel } from "./activity-panel";
import { RubricView, SprintsView } from "./insights";
import { SaveWidget } from "./save-widget";
import { membersOf, useActivityOps, type Activity, type Project } from "./shared";
import { CalendarView, GanttView } from "./views";

export function ProjectView({ id }: { id: number }) {
  const q = api.project.get.useQuery(id);
  const params = useSearchParams();
  const tab = params.get("tab") ?? "board"; // tabs live in the header nav (Shell)
  const [sprint, setSprint] = useState("all");
  const [search, setSearch] = useState("");
  const [openNum, setOpenNum] = useState<number | null>(Number(params.get("a")) || null);
  const [settings, setSettings] = useState(false);
  const [saving, setSaving] = useState(false);

  if (q.isLoading) return <div className="grid h-[60vh] place-items-center text-dim"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!q.data) return <p className="mx-auto max-w-[1400px] px-6 py-8 text-sm text-dim">{q.error?.message ?? "Proyecto no encontrado"}</p>;
  const p = q.data;

  const visible = p.activities.filter(
    (a) =>
      (sprint === "all" || (sprint === "none" ? a.sprintId === null : a.sprintId === Number(sprint))) &&
      (!search || `${a.number} ${a.title} ${a.labels.join(" ")}`.toLowerCase().includes(search.toLowerCase())),
  );
  const counts: Partial<Record<Status, number>> = {};
  for (const a of p.activities) counts[a.status as Status] = (counts[a.status as Status] ?? 0) + 1;
  const open = p.activities.find((a) => a.number === openNum);

  return (
    <Page
      title={p.name}
      description={
        <>
          <span className="inline-flex items-center gap-1.5">
            {p.team ? <><Users className="h-3.5 w-3.5" /> {p.team.name}</> : "Proyecto personal"} · sprints de {p.sprintLengthDays} días
          </span>
          {p.description && <p className="mt-1">{p.description}</p>}
          {p.brief && (
            <details className="mt-2">
              <summary className="cursor-pointer text-fg">Brief expandido por IA</summary>
              <div className="mt-2 whitespace-pre-wrap rounded-md border border-line bg-panel-2 p-3 text-xs">{p.brief}</div>
            </details>
          )}
        </>
      }
      actions={
        <>
          <div className="flex -space-x-2">{membersOf(p).slice(0, 5).map((m) => <Avatar key={m.id} user={m} />)}</div>
          <Button onClick={() => setSaving(true)}><Download className="h-4 w-4" /> Guardar / widget</Button>
          <Button onClick={() => setSettings(true)}><Settings className="h-4 w-4" /> Ajustes</Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
      <StatusBar counts={counts} />

      <AiBar project={p} />

      {["board", "table", "calendar", "gantt"].includes(tab) && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-2 left-2.5 h-4 w-4 text-dim" />
            <input className="field pl-8" placeholder="Filtrar actividades…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="field w-44" value={sprint} onChange={(e) => setSprint(e.target.value)} aria-label="Sprint">
            <option value="all">Todos los sprints</option>
            <option value="none">Sin sprint</option>
            {p.sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}

      {tab === "board" && <Board project={p} items={visible} sprintId={Number(sprint) || null} onOpen={setOpenNum} />}
      {tab === "calendar" && <CalendarView project={p} items={visible} onOpen={setOpenNum} />}
      {tab === "gantt" && <GanttView project={p} items={visible} onOpen={setOpenNum} />}
      {tab === "table" && <TableView project={p} items={visible} onOpen={setOpenNum} />}
      {tab === "rubric" && <RubricView project={p} />}
      {tab === "sprints" && <SprintsView project={p} />}

      <Modal side open={!!open} onClose={() => setOpenNum(null)} title={open && <span className="font-mono text-sm text-dim">#{open.number}</span>}>
        {open && <ActivityPanel key={open.id} project={p} activity={open} onDeleted={() => setOpenNum(null)} />}
      </Modal>
      {/* mounted only while open so the form starts from fresh data */}
      {saving && <SaveWidget project={p} open onClose={() => setSaving(false)} />}
      {settings && <ProjectSettings project={p} open onClose={() => setSettings(false)} />}
      </div>
    </Page>
  );
}

function AiBar({ project }: { project: Project }) {
  const utils = api.useUtils();
  const [msg, setMsg] = useState("");
  const [log, setLog] = useState<{ text: string; error?: boolean }[]>([]);
  const done = (lines: string[]) => {
    setLog((l) => [...lines.map((text) => ({ text })), ...l].slice(0, 6));
    void utils.project.invalidate();
  };
  const fail = (e: { message: string }) => setLog((l) => [{ text: e.message, error: true }, ...l]);
  const assistant = api.ai.assistant.useMutation({
    onSuccess: (r) => done([...r.results.map((x) => `✓ ${x.summary}`), ...(r.reply ? [r.reply] : [])]),
    onError: fail,
  });
  const skill = api.ai.skill.useMutation({ onSuccess: (r) => done([`✓ ${r.summary}`]), onError: fail });
  const busy = assistant.isPending || skill.isPending;
  const chips = [
    { skill: "expand_idea", label: project.brief ? "Re-expandir idea" : "Expandir idea" },
    { skill: "generate_rubric", label: project.criteria.length ? "Regenerar rúbrica" : "Generar rúbrica" },
    { skill: "generate_backlog", label: "Generar actividades" },
    { skill: "plan_sprints", label: "Planear sprints" },
  ] as const;

  return (
    <section className="card relative overflow-hidden">
      {busy && <div className="absolute inset-x-0 top-0 h-0.5 bg-[linear-gradient(90deg,transparent,var(--color-accent),var(--color-accent-2),transparent)] bg-[length:200%_100%] animate-shimmer" />}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (msg.trim()) assistant.mutate({ projectId: project.id, message: msg });
          setMsg("");
        }}
        className="flex items-center gap-2 px-3"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-dim" />
        <input
          className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-dim"
          placeholder='Pídele a Gemini: "crea la rúbrica, genera el backlog y planea 3 sprints"'
          value={msg}
          disabled={busy}
          onChange={(e) => setMsg(e.target.value)}
        />
        <Button variant="primary" disabled={busy || !msg.trim()} aria-label="Enviar">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-panel-2/50 px-3 py-2">
        {chips.map((c) => (
          <button
            key={c.skill}
            disabled={busy}
            onClick={() => skill.mutate({ projectId: project.id, skill: c.skill })}
            className="rounded-md border border-line bg-panel px-2.5 py-1 text-xs text-fg transition-colors hover:bg-panel-2 disabled:opacity-50"
          >
            {c.label}
          </button>
        ))}
        {busy && <span className="ml-auto text-xs text-dim">Gemini está trabajando…</span>}
      </div>
      {log.length > 0 && (
        <ul className="space-y-1 border-t border-line px-4 py-2 text-xs">
          {log.map((l, i) => (
            <li key={i} className={cn("whitespace-pre-wrap motion-safe:animate-fade-up", l.error ? "text-red-600 dark:text-red-400" : "text-dim")}>{l.text}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Board({ project, items, sprintId, onOpen }: { project: Project; items: Activity[]; sprintId: number | null; onOpen: (n: number) => void }) {
  const ops = useActivityOps(project.id);
  const [over, setOver] = useState<Status | null>(null);
  const [adding, setAdding] = useState<Status | null>(null);
  const crit = new Map(project.criteria.map((c) => [c.id, c.name]));

  const drop = (e: React.DragEvent, status: Status, col: Activity[], before?: Activity) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(null);
    const id = Number(e.dataTransfer.getData("text/plain"));
    const rest = col.filter((a) => a.id !== id);
    const idx = before ? rest.findIndex((a) => a.id === before.id) : -1;
    // fractional position: midpoint between neighbours, or after the last card
    const position = before && idx >= 0
      ? ((rest[idx - 1]?.position ?? before.position - 1) + before.position) / 2
      : (rest.at(-1)?.position ?? 0) + 1;
    if (id) ops.move.mutate({ id, status, position });
  };

  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 md:-mx-6 md:px-6">
      {STATUS_KEYS.map((status) => {
        const col = items.filter((a) => a.status === status).sort((a, b) => a.position - b.position);
        return (
          <section
            key={status}
            onDragOver={(e) => { e.preventDefault(); setOver(status); }}
            onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(null)}
            onDrop={(e) => drop(e, status, col)}
            className={cn("flex w-72 shrink-0 flex-col rounded-lg border border-line bg-panel-2/40 transition-colors", over === status && "border-accent bg-accent/5")}
          >
            <header className="flex items-center gap-2 px-3 py-3 text-sm">
              <span className={cn("h-2.5 w-2.5 rounded-full", STATUS[status].dot)} />
              <span className="font-medium">{STATUS[status].label}</span>
              <span className="rounded-full bg-panel-2 px-2 font-mono text-xs text-dim">{col.length}</span>
              <span className="ml-auto font-mono text-xs text-dim">{col.reduce((s, a) => s + (a.points ?? 0), 0)} pts</span>
            </header>
            <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
              {col.map((a) => {
                const list = a.checklist as { done: boolean }[];
                const doneN = list.filter((c) => c.done).length;
                return (
                  <article
                    key={a.id}
                    draggable
                    tabIndex={0}
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", String(a.id))}
                    onDrop={(e) => drop(e, status, col, a)}
                    onClick={() => onOpen(a.number)}
                    onKeyDown={(e) => e.key === "Enter" && onOpen(a.number)}
                    className="cursor-grab rounded-md border border-line bg-panel p-3 text-sm shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-colors hover:border-dim/60 active:cursor-grabbing"
                  >
                    <div className="flex items-start gap-2">
                      <span className="font-mono text-xs text-dim">#{a.number}</span>
                      <span className="flex-1 leading-snug font-medium">{a.title}</span>
                    </div>
                    {(a.labels.length > 0 || a.criterionId) && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {a.criterionId && <span className="rounded border border-line px-1.5 py-0.5 text-[11px] text-fg">🎓 {crit.get(a.criterionId)}</span>}
                        {a.labels.map((l) => <span key={l} className="rounded bg-panel-2 px-1.5 py-0.5 text-[11px] text-dim">{l}</span>)}
                      </div>
                    )}
                    <div className="mt-3 flex items-center gap-2 text-[11px] text-dim">
                      <span className={cn("rounded px-1.5 py-0.5", PRIORITY[a.priority as Priority].cls)}>{PRIORITY[a.priority as Priority].label}</span>
                      {a.points != null && <span className="rounded bg-panel-2 px-1.5 py-0.5 font-mono">{a.points} pts</span>}
                      {list.length > 0 && <span className="flex items-center gap-1"><CheckSquare className="h-3 w-3" />{doneN}/{list.length}</span>}
                      <span className="ml-auto"><Avatar user={a.assignee} size={5} /></span>
                    </div>
                  </article>
                );
              })}
              {adding === status ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const title = new FormData(e.currentTarget).get("title") as string;
                    if (title.trim()) ops.create.mutate({ projectId: project.id, title, status, sprintId });
                    setAdding(null);
                  }}
                >
                  <input name="title" autoFocus className="field" placeholder="Título de la actividad" onBlur={() => setAdding(null)} />
                </form>
              ) : (
                <button onClick={() => setAdding(status)} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-dim transition-colors hover:bg-panel hover:text-fg">
                  <Plus className="h-3.5 w-3.5" /> Agregar
                </button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TableView({ project, items, onOpen }: { project: Project; items: Activity[]; onOpen: (n: number) => void }) {
  const sprints = new Map(project.sprints.map((s) => [s.id, s.name]));
  const crit = new Map(project.criteria.map((c) => [c.id, c.name]));
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[56rem] text-left text-sm">
        <thead className="border-b border-line bg-panel-2/50 text-xs text-dim">
          <tr>{["#", "Título", "Estado", "Prioridad", "Pts", "Sprint", "Criterio", "Responsable", "Entrega"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {[...items].sort((a, b) => a.number - b.number).map((a) => (
            <tr key={a.id} onClick={() => onOpen(a.number)} className="cursor-pointer transition-colors hover:bg-panel-2/60">
              <td className="px-4 py-2.5 font-mono text-dim">{a.number}</td>
              <td className="px-4 py-2.5 font-medium">{a.title}</td>
              <td className="px-4 py-2.5"><span className="inline-flex items-center gap-2"><span className={cn("h-2 w-2 rounded-full", STATUS[a.status as Status].dot)} />{STATUS[a.status as Status].label}</span></td>
              <td className="px-4 py-2.5"><span className={cn("rounded px-1.5 py-0.5 text-xs", PRIORITY[a.priority as Priority].cls)}>{PRIORITY[a.priority as Priority].label}</span></td>
              <td className="px-4 py-2.5 font-mono tabular-nums">{a.points ?? "—"}</td>
              <td className="px-4 py-2.5 text-dim">{a.sprintId ? sprints.get(a.sprintId) : "—"}</td>
              <td className="max-w-48 truncate px-4 py-2.5 text-dim">{a.criterionId ? crit.get(a.criterionId) : "—"}</td>
              <td className="px-4 py-2.5"><Avatar user={a.assignee} size={6} /></td>
              <td className="px-4 py-2.5 text-dim">{a.dueDate?.toLocaleDateString() ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length && <p className="p-8 text-center text-sm text-dim">Sin actividades. Usa la barra de IA para generarlas.</p>}
    </div>
  );
}

function ProjectSettings({ project, open, onClose }: { project: Project; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const utils = api.useUtils();
  const [f, setF] = useState({ name: project.name, description: project.description, rubricText: project.rubricText, sprintLengthDays: project.sprintLengthDays });
  const update = api.project.update.useMutation({ onSuccess: async () => { await utils.project.invalidate(); onClose(); } });
  const del = api.project.delete.useMutation({ onSuccess: async () => { await utils.project.list.invalidate(); router.push("/"); } });
  return (
    <Modal open={open} onClose={onClose} title="Ajustes del proyecto">
      <form onSubmit={(e) => { e.preventDefault(); update.mutate({ id: project.id, data: { ...f, sprintLengthDays: Number(f.sprintLengthDays) } }); }} className="flex flex-col gap-4">
        <Field label="Nombre"><input required className="field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Descripción"><textarea rows={3} className="field" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Rúbrica / requisitos"><textarea rows={6} className="field font-mono text-xs" value={f.rubricText} onChange={(e) => setF({ ...f, rubricText: e.target.value })} /></Field>
        <Field label="Días por sprint"><input type="number" min={1} max={60} className="field" value={f.sprintLengthDays} onChange={(e) => setF({ ...f, sprintLengthDays: Number(e.target.value) })} /></Field>
        {(update.error ?? del.error) && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{(update.error ?? del.error)?.message}</p>}
        <div className="flex justify-between">
          <Button type="button" variant="danger" onClick={() => confirm("¿Borrar el proyecto y todas sus actividades?") && del.mutate(project.id)}>Borrar proyecto</Button>
          <Button variant="primary" disabled={update.isPending}>Guardar</Button>
        </div>
      </form>
    </Modal>
  );
}
