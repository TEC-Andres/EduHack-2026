"use client";

import { Ear, Mic, MicOff } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "~/app/_components/ui";
import { setPrefs, useCapture, usePrefs, useSpeechSupported, type Mode } from "~/app/_components/voice";

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "save", label: "Guardar", hint: "Transcribe y guarda lo que escucha. No responde ni usa la IA." },
  { id: "respond", label: "Responder", hint: "Solo texto: escribes tu petición y Gemini responde por escrito." },
];

/** Header voice menu: prefs (cookies), plus the background mic loop for "Hey SprintLab" and "Guardar" capture. */
export function VoiceControl({ projectId }: { projectId?: number }) {
  const prefs = usePrefs();
  const supported = useSpeechSupported();
  const path = usePathname();
  const saving = prefs.mode === "save" && prefs.listen && !!projectId;
  // /voice runs its own mic; browsers allow one recognizer at a time
  const { listening, awake, heard, error, refreshes } = useCapture({ projectId, on: path !== "/voice" && (prefs.hotword || saving), save: saving });

  const status = awake
    ? "Te escucho… di tu petición"
    : listening
      ? saving ? "Guardando conversación" + (prefs.hotword ? " · di “Hey SprintLab”" : "") : "Esperando “Hey SprintLab”"
      : "Micrófono apagado";

  return (
    <details className="relative">
      <summary
        aria-label={`Voz: ${status}`}
        title={status}
        className="flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-1 text-sm text-dim hover:bg-panel-2 hover:text-fg [&::-webkit-details-marker]:hidden"
      >
        {!listening ? <MicOff className="h-4 w-4" /> : (
          <span className="relative">
            {saving ? <Mic className="h-4 w-4 text-red-500" /> : <Ear className={cn("h-4 w-4", awake && "text-brand")} />}
            <span className={cn("absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full", awake ? "animate-ping bg-brand" : saving ? "animate-pulse bg-red-500" : "bg-emerald-500")} />
          </span>
        )}
        {awake && <span className="text-xs font-medium text-brand">Te escucho…</span>}
      </summary>
      <div className="card absolute top-full right-0 z-40 mt-2 w-72 space-y-3 p-3 text-sm shadow-xl">
        <p className="font-medium">Asistente de voz</p>

        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-0.5" checked={prefs.hotword} disabled={!supported} onChange={(e) => setPrefs({ hotword: e.target.checked })} />
          <span>
            Activar con “Hey SprintLab”
            <span className="block text-xs text-dim">
              {supported
                ? "Escucha en cualquier página. Di “Hey SprintLab, ¿qué tengo hoy?” y se abre Responder con tu petición escrita, lista para enviar."
                : "Este navegador no soporta reconocimiento de voz (usa Chrome o Safari)."}
            </span>
          </span>
        </label>

        <div className="grid grid-cols-2 gap-1 rounded-md bg-panel-2 p-1" role="radiogroup" aria-label="Modo">
          {MODES.map((m) => (
            <button
              key={m.id}
              role="radio"
              aria-checked={prefs.mode === m.id}
              onClick={() => setPrefs({ mode: m.id })}
              className={cn("rounded px-2 py-1 text-sm", prefs.mode === m.id ? "bg-panel font-medium shadow-sm" : "text-dim hover:text-fg")}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-dim">{MODES.find((m) => m.id === prefs.mode)!.hint}</p>
        {prefs.mode === "save" && (
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5" checked={prefs.listen} disabled={!supported} onChange={(e) => setPrefs({ listen: e.target.checked })} />
            <span>Guardar lo que escucha dentro de los proyectos</span>
          </label>
        )}

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        <div className="space-y-1 border-t border-line pt-2 text-xs text-dim">
          <p>{prefs.mode === "save" && prefs.listen && !projectId && !prefs.hotword ? "Abre un proyecto para empezar a guardar." : status}</p>
          {heard && <p className="truncate" title={heard}>Último que escuché: “{heard}”</p>}
          {refreshes.count > 0 && <p>Reconexiones del micrófono: {refreshes.count} (última: {refreshes.reason})</p>}
          <p>Ajustes en cookies de este navegador. <Link href="/voice" className="underline">Ver conversación</Link></p>
        </div>
      </div>
    </details>
  );
}
