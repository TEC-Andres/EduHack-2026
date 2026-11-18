"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import { Button, cn, STATUS, type Status } from "~/app/_components/ui";
import { useActivityOps, type Activity, type Project } from "./shared";

const DAY = 86_400_000;
/** Local yyyy-mm-dd; due dates are stored at local noon (see activity panel), so this is their day. */
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function CalendarView({ project, items, onOpen }: { project: Project; items: Activity[]; onOpen: (n: number) => void }) {
  const ops = useActivityOps(project.id);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [over, setOver] = useState<string | null>(null);
  const start = new Date(month.getFullYear(), month.getMonth(), 1 - ((month.getDay() + 6) % 7)); // Monday-first grid
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const byDay = new Map<string, Activity[]>();
  for (const a of items) if (a.dueDate) byDay.set(ymd(a.dueDate), [...(byDay.get(ymd(a.dueDate)) ?? []), a]);
  const lastDay = (s: Project["sprints"][number]) => ymd(new Date(s.endDate.getTime() - DAY)); // endDate is exclusive (start + N days)
  const sprintOn = (d: Date) => project.sprints.find((s) => ymd(s.startDate) <= ymd(d) && ymd(d) <= lastDay(s));
  const today = ymd(new Date());
  const undated = items.filter((a) => !a.dueDate).length;
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <div className="card overflow-hidden">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="font-semibold capitalize">{month.toLocaleDateString("es-MX", { month: "long", year: "numeric" })}</h2>
        {undated > 0 && <span className="text-xs text-dim">· {undated} sin fecha (asígnala en la actividad) · arrastra una tarjeta a otro día para moverla</span>}
        <div className="ml-auto flex gap-1">
          <Button onClick={() => shift(-1)} aria-label="Mes anterior"><ChevronLeft className="h-4 w-4" /></Button>
          <Button onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Hoy</Button>
          <Button onClick={() => shift(1)} aria-label="Mes siguiente"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </header>
      <div className="overflow-x-auto">
        <div className="grid min-w-[44rem] grid-cols-7">
          {WEEKDAYS.map((w) => <div key={w} className="border-b border-line px-2 py-1.5 text-xs font-medium text-dim">{w}</div>)}
          {days.map((d) => {
            const k = ymd(d);
            const s = sprintOn(d);
            return (
              <div
                key={k}
                onDragOver={(e) => { e.preventDefault(); setOver(k); }}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(null);
                  const id = Number(e.dataTransfer.getData("text/plain"));
                  if (id) ops.update.mutate({ id, data: { dueDate: new Date(`${k}T12:00:00`) } });
                }}
                className={cn(
                  "min-h-28 border-r border-b border-line p-1.5 transition-colors [&:nth-child(7n)]:border-r-0",
                  d.getMonth() !== month.getMonth() && "bg-panel-2/40 text-dim",
                  over === k && "bg-accent/10",
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-1">
                  <span className={cn("grid h-6 w-6 place-items-center rounded-full font-mono text-xs", k === today && "bg-brand text-white")}>{d.getDate()}</span>
                  {s && <span title={s.name} className="truncate rounded bg-accent/10 px-1 text-[10px] text-accent">{ymd(s.startDate) === k ? `▶ ${s.name}` : lastDay(s) === k ? `■ ${s.name}` : ""}</span>}
                </div>
                <div className="flex flex-col gap-1">
                  {byDay.get(k)?.map((a) => (
                    <button
                      key={a.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", String(a.id))}
                      onClick={() => onOpen(a.number)}
                      className={cn("flex items-center gap-1 truncate rounded border border-line bg-panel px-1.5 py-0.5 text-left text-[11px] hover:border-dim/60", a.status === "done" && "line-through opacity-60")}
                    >
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS[a.status as Status].dot)} />
                      <span className="truncate">#{a.number} {a.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Bars: sprints span their dates; an activity spans its sprint start (or creation) → due date (or sprint end). */
export function GanttView({ project, items, onOpen }: { project: Project; items: Activity[]; onOpen: (n: number) => void }) {
  const sprint = new Map(project.sprints.map((s) => [s.id, s]));
  const span = (a: Activity) => {
    const s = a.sprintId ? sprint.get(a.sprintId) : undefined;
    const end = a.dueDate ?? s?.endDate;
    if (!end) return null;
    const begin = Math.min(s?.startDate.getTime() ?? a.createdAt.getTime(), end.getTime() - DAY);
    return { begin, end: end.getTime() };
  };
  const rows = items.map((a) => ({ a, r: span(a) })).filter((x): x is { a: Activity; r: { begin: number; end: number } } => !!x.r);
  const times = [...rows.flatMap((x) => [x.r.begin, x.r.end]), ...project.sprints.flatMap((s) => [s.startDate.getTime(), s.endDate.getTime()])];
  if (!times.length) return <div className="card p-10 text-center text-sm text-dim">Sin fechas todavía. Planea sprints o asigna fechas de entrega para ver el diagrama de Gantt.</div>;

  const min = new Date(Math.min(...times)).setHours(0, 0, 0, 0);
  const max = Math.max(...times) + DAY;
  const pct = (t: number) => ((t - min) / (max - min)) * 100;
  const weeks = Array.from({ length: Math.ceil((max - min) / (7 * DAY)) }, (_, i) => min + i * 7 * DAY);
  const now = Date.now();
  const groups = [
    ...project.sprints.map((s) => ({ key: String(s.id), label: s.name, bar: { begin: s.startDate.getTime(), end: s.endDate.getTime() }, rows: rows.filter((x) => x.a.sprintId === s.id) })),
    { key: "none", label: "Sin sprint", bar: null, rows: rows.filter((x) => !x.a.sprintId) },
  ].filter((g) => g.bar || g.rows.length);
  const skipped = items.length - rows.length;

  const Bar = ({ begin, end, className, children }: { begin: number; end: number; className: string; children?: React.ReactNode }) => (
    <div className={cn("absolute top-1/2 flex h-5 -translate-y-1/2 items-center overflow-hidden rounded px-1.5 text-[11px] whitespace-nowrap", className)} style={{ left: `${pct(begin)}%`, width: `max(${pct(end) - pct(begin)}%, 6px)` }}>
      {children}
    </div>
  );

  return (
    <div className="card overflow-x-auto">
      <div className="min-w-[56rem]">
        <div className="grid grid-cols-[16rem_1fr] border-b border-line text-xs text-dim">
          <div className="px-4 py-2 font-medium">Actividad</div>
          <div className="relative">
            {weeks.map((w) => <span key={w} className="absolute top-2 border-l border-line pl-1" style={{ left: `${pct(w)}%` }}>{new Date(w).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}</span>)}
          </div>
        </div>
        {groups.map((g) => (
          <div key={g.key} className="border-b border-line last:border-b-0">
            <Row label={<span className="font-semibold">{g.label}</span>} weeks={weeks} pct={pct} now={now} min={min} max={max}>
              {g.bar && <Bar {...g.bar} className="bg-accent/20 font-medium text-accent">{g.label}</Bar>}
            </Row>
            {g.rows.map(({ a, r }) => (
              <Row key={a.id} onClick={() => onOpen(a.number)} label={<><span className="font-mono text-dim">#{a.number}</span> {a.title}</>} weeks={weeks} pct={pct} now={now} min={min} max={max}>
                <Bar {...r} className={cn(STATUS[a.status as Status].bar, "text-white", a.status === "done" && "opacity-60")}>{STATUS[a.status as Status].label}</Bar>
              </Row>
            ))}
          </div>
        ))}
        {skipped > 0 && <p className="border-t border-line px-4 py-2 text-xs text-dim">{skipped} actividades sin sprint ni fecha no aparecen.</p>}
      </div>
    </div>
  );
}

function Row({ label, children, onClick, weeks, pct, now, min, max }: { label: React.ReactNode; children: React.ReactNode; onClick?: () => void; weeks: number[]; pct: (t: number) => number; now: number; min: number; max: number }) {
  return (
    <div onClick={onClick} className={cn("grid grid-cols-[16rem_1fr] text-sm", onClick && "cursor-pointer hover:bg-panel-2/60")}>
      <div className="truncate px-4 py-2">{label}</div>
      <div className="relative">
        {weeks.map((w) => <span key={w} className="absolute inset-y-0 border-l border-line/60" style={{ left: `${pct(w)}%` }} />)}
        {now >= min && now <= max && <span className="absolute inset-y-0 z-10 border-l-2 border-red-500/70" style={{ left: `${pct(now)}%` }} />}
        {children}
      </div>
    </div>
  );
}
