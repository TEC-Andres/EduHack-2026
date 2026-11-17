"use client";

import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button, cn, Field, PRIORITY, STATUS, STATUS_KEYS, type Priority, type Status } from "~/app/_components/ui";
import { api } from "~/trpc/react";
import { membersOf, useActivityOps, type Activity, type Project } from "./shared";

type Item = { text: string; done: boolean };

export function ActivityPanel({ project, activity: a, onDeleted }: { project: Project; activity: Activity; onDeleted: () => void }) {
  const utils = api.useUtils();
  const ops = useActivityOps(project.id);
  const save = (data: Parameters<typeof ops.update.mutate>[0]["data"]) => ops.update.mutate({ id: a.id, data });
  const breakdown = api.ai.skill.useMutation({ onSuccess: () => utils.project.get.invalidate(project.id) });

  // free-text fields are local until blur
  const [title, setTitle] = useState(a.title);
  const [description, setDescription] = useState(a.description);
  const [deliverable, setDeliverable] = useState(a.deliverable);
  const [acceptance, setAcceptance] = useState(a.acceptance.join("\n"));
  const [labels, setLabels] = useState(a.labels.join(", "));
  const [newItem, setNewItem] = useState("");
  const checklist = a.checklist as Item[];
  const num = (v: string) => (v ? Number(v) : null);

  return (
    <div className="flex flex-col gap-5">
      <input
        className="-mx-1 w-full rounded-md bg-transparent px-1 text-xl font-semibold outline-none focus:bg-panel-2"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title.trim() && title !== a.title && save({ title })}
        aria-label="Título"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Estado">
          <select className="field" value={a.status} onChange={(e) => save({ status: e.target.value as Status })}>
            {STATUS_KEYS.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
          </select>
        </Field>
        <Field label="Prioridad">
          <select className="field" value={a.priority} onChange={(e) => save({ priority: e.target.value as Priority })}>
            {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="Story points">
          <select className="field" value={a.points ?? ""} onChange={(e) => save({ points: num(e.target.value) })}>
            <option value="">—</option>
            {[1, 2, 3, 5, 8, 13, 21].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
        <Field label="Responsable">
          <select className="field" value={a.assigneeId ?? ""} onChange={(e) => save({ assigneeId: num(e.target.value) })}>
            <option value="">Sin asignar</option>
            {membersOf(project).map((m) => <option key={m.id} value={m.id}>{m.name ?? m.email}</option>)}
          </select>
        </Field>
        <Field label="Sprint">
          <select className="field" value={a.sprintId ?? ""} onChange={(e) => save({ sprintId: num(e.target.value) })}>
            <option value="">Sin sprint</option>
            {project.sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Entrega">
          <input
            type="date"
            className="field"
            value={a.dueDate?.toISOString().slice(0, 10) ?? ""}
            onChange={(e) => save({ dueDate: e.target.value ? new Date(`${e.target.value}T12:00:00`) : null })}
          />
        </Field>
      </div>

      <Field label="Criterio de rúbrica que evidencia">
        <select className="field" value={a.criterionId ?? ""} onChange={(e) => save({ criterionId: num(e.target.value) })}>
          <option value="">Ninguno</option>
          {project.criteria.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.weight}%)</option>)}
        </select>
      </Field>

      <Field label="Instrucciones">
        <textarea rows={6} className="field" value={description} onChange={(e) => setDescription(e.target.value)} onBlur={() => description !== a.description && save({ description })} />
      </Field>
      <Field label="Entregable">
        <input className="field" value={deliverable} onChange={(e) => setDeliverable(e.target.value)} onBlur={() => deliverable !== a.deliverable && save({ deliverable })} />
      </Field>
      <Field label="Criterios de aceptación (uno por línea)">
        <textarea
          rows={4}
          className="field"
          value={acceptance}
          onChange={(e) => setAcceptance(e.target.value)}
          onBlur={() => save({ acceptance: acceptance.split("\n").map((s) => s.trim()).filter(Boolean) })}
        />
      </Field>
      <Field label="Etiquetas (separadas por coma)">
        <input className="field" value={labels} onChange={(e) => setLabels(e.target.value)} onBlur={() => save({ labels: labels.split(",").map((s) => s.trim()).filter(Boolean) })} />
      </Field>

      <section className="rounded-lg border border-line p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[13px] font-medium text-dim">
            Subtareas {checklist.length > 0 && `· ${checklist.filter((c) => c.done).length}/${checklist.length}`}
          </h3>
          <Button
            variant="ghost"
            className="h-7 text-xs"
            disabled={breakdown.isPending}
            onClick={() => breakdown.mutate({ projectId: project.id, skill: "breakdown_activity", activityNumber: a.number })}
          >
            {breakdown.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Desglosar con IA
          </Button>
        </div>
        {breakdown.error && <p role="alert" className="mb-2 text-xs text-red-600 dark:text-red-400">{breakdown.error.message}</p>}
        <ul className="flex flex-col gap-1">
          {checklist.map((c, i) => (
            <li key={i} className="group flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={c.done}
                className="h-4 w-4 accent-fg"
                onChange={() => save({ checklist: checklist.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })}
                aria-label={c.text}
              />
              <span className={cn("flex-1", c.done && "text-dim line-through")}>{c.text}</span>
              <button onClick={() => save({ checklist: checklist.filter((_, j) => j !== i) })} aria-label="Quitar" className="text-dim opacity-0 group-hover:opacity-100 focus:opacity-100">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (newItem.trim()) save({ checklist: [...checklist, { text: newItem.trim(), done: false }] });
            setNewItem("");
          }}
        >
          <input className="field h-8" placeholder="Nueva subtarea" value={newItem} onChange={(e) => setNewItem(e.target.value)} />
          <Button className="h-8" aria-label="Agregar subtarea"><Plus className="h-4 w-4" /></Button>
        </form>
      </section>

      <div className="flex items-center justify-between border-t border-line pt-4 text-xs text-dim">
        <span>Actualizada {a.updatedAt.toLocaleString()}</span>
        <Button variant="danger" onClick={() => confirm(`¿Borrar #${a.number}?`) && ops.remove.mutate(a.id, { onSuccess: onDeleted })}>
          <Trash2 className="h-4 w-4" /> Borrar
        </Button>
      </div>
    </div>
  );
}
