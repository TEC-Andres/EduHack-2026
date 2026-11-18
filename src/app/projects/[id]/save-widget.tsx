"use client";

import { CalendarDays, Copy, Download, GanttChart, KanbanSquare, MonitorSmartphone } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button, cn, Modal } from "~/app/_components/ui";
import { api } from "~/trpc/react";
import { type Project } from "./shared";

type InstallPrompt = Event & { prompt: () => Promise<void> };
// Chrome/Edge (Windows, macOS, Linux, Android) fire this once on load; keep it for the install button.
let deferred: InstallPrompt | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
  });
}

const VIEWS = [
  { id: "board", label: "Kanban", Icon: KanbanSquare },
  { id: "calendar", label: "Calendario", Icon: CalendarDays },
  { id: "gantt", label: "Gantt", Icon: GanttChart },
] as const;

export function SaveWidget({ project, open, onClose }: { project: Project; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const params = useSearchParams();
  const tab = params.get("tab") ?? "board";
  const view = VIEWS.find((v) => v.id === tab)?.id ?? "board";
  const feed = api.project.calendarFeed.useQuery(project.id);
  const [copied, setCopied] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    setCanInstall(!!deferred);
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);
  }, []);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const https = feed.data ? `${origin}${feed.data}` : "";
  const webcal = https.replace(/^https?:/, "webcal:");
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in globalThis);

  const install = async () => {
    await deferred?.prompt();
    deferred = null;
    setCanInstall(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Guardar calendario y widget">
      <div className="flex flex-col gap-6 text-sm">
        <section className="flex flex-col gap-3">
          <h3 className="font-semibold">1 · Elige el formato</h3>
          <div className="grid grid-cols-3 gap-2">
            {VIEWS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => router.replace(`/projects/${project.id}?tab=${id}`)}
                aria-pressed={view === id}
                className={cn("flex flex-col items-center gap-1.5 rounded-md border p-3 transition-colors", view === id ? "border-brand bg-brand/5 text-fg" : "border-line text-dim hover:bg-panel-2")}
              >
                <Icon className="h-5 w-5" />
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="flex items-center gap-2 font-semibold"><MonitorSmartphone className="h-4 w-4" /> 2 · Guárdalo como app / widget</h3>
          <p className="text-dim">Se abre directo en la vista <b className="text-fg">{VIEWS.find((v) => v.id === view)?.label}</b> de este proyecto, sin barra del navegador.</p>
          {installed ? (
            <p className="text-emerald-700 dark:text-emerald-300">Ya estás usando la app instalada.</p>
          ) : canInstall ? (
            <Button variant="primary" onClick={install} className="self-start">Instalar en este dispositivo</Button>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-dim">
              <li className={cn(ios && "text-fg")}><b>iPhone / iPad (Safari):</b> Compartir <span aria-hidden>⎋</span> → “Añadir a pantalla de inicio”.</li>
              <li><b>Android (Chrome):</b> menú ⋮ → “Instalar app” o “Añadir a pantalla de inicio”.</li>
              <li><b>Windows / Linux / macOS (Chrome, Edge):</b> icono de instalar en la barra de direcciones, o menú → “Instalar SprintLab”.</li>
              <li><b>macOS (Safari):</b> Archivo → “Añadir al Dock”.</li>
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="flex items-center gap-2 font-semibold"><CalendarDays className="h-4 w-4" /> 3 · Sincroniza con tu calendario</h3>
          <p className="text-dim">Sprints y fechas de entrega se actualizan solos, y aparecen en el widget de calendario nativo de tu teléfono o escritorio.</p>
          {feed.error && <p role="alert" className="text-red-600 dark:text-red-400">{feed.error.message}</p>}
          <div className="flex flex-wrap gap-2">
            <a className={cn("inline-flex h-8 items-center rounded-md border border-line px-3 font-medium hover:bg-panel-2", !https && "pointer-events-none opacity-50")} href={webcal}>Apple Calendar / Outlook</a>
            <a className={cn("inline-flex h-8 items-center rounded-md border border-line px-3 font-medium hover:bg-panel-2", !https && "pointer-events-none opacity-50")} href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`} target="_blank" rel="noreferrer">Google Calendar (Android)</a>
            <a className={cn("inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-3 font-medium hover:bg-panel-2", !https && "pointer-events-none opacity-50")} href={`${https}&download`} download>
              <Download className="h-4 w-4" /> Descargar .ics
            </a>
          </div>
          <div className="flex gap-2">
            <input readOnly className="field font-mono text-xs" value={https} onFocus={(e) => e.currentTarget.select()} aria-label="URL del calendario" />
            <Button onClick={() => void navigator.clipboard.writeText(https).then(() => setCopied(true))} disabled={!https}>
              <Copy className="h-4 w-4" /> {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
          <p className="text-xs text-dim">Linux (Thunderbird, GNOME Calendar) y Outlook web: “Suscribirse desde URL” y pega el enlace. Es privado: cualquiera con el enlace ve el calendario.</p>
        </section>
      </div>
    </Modal>
  );
}
