"use client";

import { Loader2, Mic, Send, Square, Trash2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { cn } from "~/app/_components/ui";
import { setPrefs, useCapture, usePrefs, useSpeechSupported, type Mode } from "~/app/_components/voice";
import { api } from "~/trpc/react";

const SUGGESTIONS = ["Convierte la conversación guardada en tasks", "¿Qué tengo para hoy?", "Ya terminé la #1, pásala a hecho"];
const PROJECT_KEY = "voice.project";

type Turn = { role: "me" | "ai"; text: string; actions?: string[]; error?: boolean };

export function Voice() {
  const projects = api.project.list.useQuery();
  const [projectId, setProjectId] = useState<number | null>(null);
  const { mode } = usePrefs();
  const params = useSearchParams(); // set by "Hey SprintLab": ?project=<id>&ask=<what was said after the hotword>
  const ask = params.get("ask") ?? "";

  // remembered project, else the most recent one
  useEffect(() => {
    if (!projects.data?.length || projectId) return;
    let saved: number | null = Number(params.get("project")) || null;
    try { saved ??= Number(localStorage.getItem(PROJECT_KEY)) || null; } catch {}
    setProjectId(projects.data.find((p) => p.id === saved)?.id ?? projects.data[0]!.id);
  }, [projects.data, projectId, params]);

  if (projects.data && !projects.data.length) {
    return <p className="p-6 text-center text-sm text-dim">Crea un proyecto primero en <Link href="/" className="underline">Overview</Link>.</p>;
  }
  const project = projects.data?.find((p) => p.id === projectId);

  return (
    <div className="mx-auto flex h-[calc(100dvh-7.5rem)] max-w-lg flex-col px-4">
      <div className="flex items-center gap-2 py-3">
        <select
          className="field min-w-0 flex-1"
          aria-label="Proyecto"
          value={projectId ?? ""}
          onChange={(e) => {
            setProjectId(Number(e.target.value));
            try { localStorage.setItem(PROJECT_KEY, e.target.value); } catch {}
          }}
        >
          {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="flex shrink-0 rounded-md bg-panel-2 p-1" role="radiogroup" aria-label="Modo">
          {([["save", "Guardar"], ["respond", "Responder"]] as [Mode, string][]).map(([id, label]) => (
            <button
              key={id}
              role="radio"
              aria-checked={mode === id}
              onClick={() => setPrefs({ mode: id })}
              className={cn("rounded px-2.5 py-1 text-sm", mode === id ? "bg-panel font-medium shadow-sm" : "text-dim hover:text-fg")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {projectId && (mode === "save" ? <SaveMode key={projectId} projectId={projectId} /> : <RespondMode key={`${projectId}:${ask}`} projectId={projectId} initial={ask} />)}

      {project && (
        <Link href={`/projects/${project.id}`} className="pb-3 text-center text-xs text-dim underline">
          Ver tablero de {project.name}
        </Link>
      )}
    </div>
  );
}

/** Transcribe and store; never calls Gemini, never answers. */
function SaveMode({ projectId }: { projectId: number }) {
  const [recording, setRecording] = useState(false);
  const supported = useSpeechSupported();
  const { listening, live, error, refreshes } = useCapture({ projectId, on: recording, save: true });
  const notes = api.voice.list.useQuery(projectId);
  const utils = api.useUtils();
  const clear = api.voice.clear.useMutation({ onSuccess: () => utils.voice.list.invalidate(projectId) });
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [notes.data, live]);

  return (
    <>
      <div className="flex-1 space-y-2 overflow-y-auto pb-4" aria-live="polite">
        {notes.data?.length ? (
          <>
            <div className="flex items-center justify-between text-xs text-dim">
              <span>{notes.data.length} fragmentos guardados · no se envían a la IA</span>
              <button
                onClick={() => confirm("¿Borrar toda la conversación guardada de este proyecto?") && clear.mutate(projectId)}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-panel-2 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" /> Borrar
              </button>
            </div>
            {notes.data.map((n) => (
              <p key={n.id} className="card px-3 py-2 text-sm">
                <span className="mr-2 font-mono text-xs text-dim">{n.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                {n.text}
              </p>
            ))}
          </>
        ) : (
          <div className="pt-8 text-center">
            <p className="font-display text-2xl">Modo Guardar</p>
            <p className="mt-1 text-sm text-dim">
              Graba tu clase o tus ideas. Solo se transcribe y guarda; no responde. Di “Hey SprintLab, …” o cambia a Responder para pedirle algo por escrito.
            </p>
          </div>
        )}
        {live && <p className="px-3 text-sm text-dim italic">{live}…</p>}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div ref={bottom} />
      </div>

      <div className="flex flex-col items-center gap-2 border-t border-line py-4">
        <button
          onClick={() => setRecording((r) => !r)}
          disabled={!supported}
          aria-label={recording ? "Dejar de guardar" : "Empezar a guardar"}
          className={cn(
            "grid h-20 w-20 place-items-center rounded-full text-white shadow-lg transition disabled:opacity-50",
            listening ? "animate-pulse bg-red-500" : "bg-brand active:scale-95",
          )}
        >
          {recording ? <Square className="h-7 w-7" /> : <Mic className="h-8 w-8" />}
        </button>
        <span className="text-xs text-dim">{!supported ? "Este navegador no soporta reconocimiento de voz" : listening ? "Guardando…" : recording ? "Reconectando…" : "Toca para grabar"}
          {refreshes.count > 0 && ` · ${refreshes.count} reconexiones (última: ${refreshes.reason})`}</span>
      </div>
    </>
  );
}

/** Typed requests only; Gemini answers in text (it can read the saved conversation). */
function RespondMode({ projectId, initial }: { projectId: number; initial: string }) {
  const utils = api.useUtils();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState(initial);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [turns]);

  const ask = api.ai.assistant.useMutation({
    onSuccess: (r) => {
      const text = r.reply || r.results.map((x) => x.summary).join(". ") || "No entendí, ¿lo repites?";
      setTurns((t) => [...t, { role: "ai", text, actions: r.results.map((x) => x.summary) }]);
      void utils.project.invalidate();
    },
    onError: (e) => setTurns((t) => [...t, { role: "ai", text: e.message, error: true }]),
  });
  const send = (message: string) => {
    if (!message.trim() || ask.isPending) return;
    setTurns((t) => [...t, { role: "me", text: message.trim() }]);
    ask.mutate({ projectId, message: message.trim(), today: new Date().toLocaleDateString("en-CA") });
  };

  return (
    <>
      <div className="flex-1 space-y-3 overflow-y-auto pb-4" aria-live="polite">
        {!turns.length && (
          <div className="pt-8 text-center">
            <p className="font-display text-2xl">¿Qué necesitas?</p>
            <p className="mt-1 text-sm text-dim">Escribe una entrega y la divido en tasks chicas con fecha, o pide mover tarjetas.</p>
            <div className="mt-6 flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} disabled={ask.isPending} className="card px-4 py-3 text-left text-sm hover:bg-panel-2">
                  “{s}”
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={cn("flex", t.role === "me" && "justify-end")}>
            <div className={cn("max-w-[85%] rounded-2xl px-4 py-2.5 text-sm", t.role === "me" ? "bg-brand text-white" : "card", t.error && "text-red-600 dark:text-red-400")}>
              <p className="whitespace-pre-wrap">{t.text}</p>
              {!!t.actions?.length && (
                <ul className="mt-2 space-y-0.5 border-t border-line pt-2 text-xs text-dim">
                  {t.actions.map((a, j) => <li key={j}>✓ {a}</li>)}
                </ul>
              )}
            </div>
          </div>
        ))}
        {ask.isPending && <Loader2 className="h-4 w-4 animate-spin text-dim" />}
        <div ref={bottom} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(draft); setDraft(""); }} className="flex gap-2 border-t border-line py-4">
        <input className="field flex-1" autoFocus placeholder="Escribe tu petición…" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="grid h-9 w-9 place-items-center rounded-md bg-brand text-white disabled:opacity-50" disabled={!draft.trim() || ask.isPending} aria-label="Enviar">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </>
  );
}
