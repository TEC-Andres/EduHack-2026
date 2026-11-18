import { ArrowRight, CalendarRange, ClipboardCheck, ListChecks, Split, Users } from "lucide-react";
import Link from "next/link";

import { Logo, Wordmark } from "~/app/_components/ui";

const FEATURES = [
  { icon: ClipboardCheck, title: "Rúbrica en segundos", text: "Pega los requisitos del profe y la IA arma criterios con pesos y niveles. Sabes desde el día uno qué se califica." },
  { icon: ListChecks, title: "Backlog tipo Canvas", text: "Cada idea se vuelve una actividad con objetivo, entregable y criterios de aceptación, estimada en story points." },
  { icon: CalendarRange, title: "Sprints planificados", text: "Reparte el trabajo en sprints con metas claras para avanzar cada semana en vez de todo la noche anterior." },
  { icon: Split, title: "Desglosa lo difícil", text: "¿Una tarea de 13 puntos te bloquea? La IA la parte en pasos pequeños que sí puedes empezar hoy." },
  { icon: Users, title: "Equipos alineados", text: "Tablero compartido: quién hace qué, en qué estado va y qué criterio de la rúbrica cubre." },
];

const STEPS = [
  ["Describe tu proyecto", "Nombre, idea y la rúbrica o requisitos de la materia."],
  ["Deja que la IA lo organice", "Rúbrica, backlog y sprints generados con Scrum."],
  ["Ejecuta y entrega", "Mueve tarjetas en el tablero y llega a la fecha con todo cubierto."],
];

// Static preview of the board; mirrors STATUS colors in ui.tsx (can't import that object into a server component).
const PREVIEW = [
  { label: "Por hacer", dot: "bg-sky-400", cards: [["Diagrama de arquitectura", 3], ["Pruebas unitarias", 5]] },
  { label: "En progreso", dot: "bg-amber-400", cards: [["API de sensores", 8]] },
  { label: "Hecho", dot: "bg-emerald-400", cards: [["Requisitos y rúbrica", 2], ["Prototipo en CAD", 5]] },
] as const;

/** Public landing for logged-out visitors at "/". */
export function Hero() {
  return (
    <div className="min-h-dvh overflow-x-hidden">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
        <span className="flex items-center gap-2">
          <Logo size={26} />
          <Wordmark />
        </span>
        <Link href="/login" className="rounded-md px-3 py-1.5 text-sm font-medium text-dim hover:bg-panel-2 hover:text-fg">
          Iniciar sesión
        </Link>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-20 md:px-6 lg:grid-cols-2 lg:pt-20">
          <div className="motion-safe:animate-fade-up">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-xs text-dim">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden /> Scrum + IA para estudiantes de ingeniería
            </p>
            <h1 className="font-display text-5xl leading-[1.05] tracking-tight md:text-6xl">
              Del enunciado al entregable, <em className="text-accent">sprint a sprint</em>.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-dim">
              ZenSprint convierte la rúbrica de tu proyecto en un plan de trabajo real: actividades claras, sprints semanales y un tablero
              compartido con tu equipo. Menos tiempo organizando, más tiempo construyendo.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className="inline-flex h-11 items-center gap-2 rounded-md bg-brand px-6 text-sm font-medium text-white transition-colors hover:bg-brand/90">
                Empieza gratis <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              {/* plain anchor: must hit the server route, not client-side routing */}
              <a href="/api/auth/google" className="inline-flex h-11 items-center rounded-md border border-line bg-panel px-6 text-sm font-medium transition-colors hover:bg-panel-2">
                Continuar con Google
              </a>
            </div>
          </div>

          <div aria-hidden className="card grid grid-cols-3 gap-3 p-4 shadow-xl motion-safe:animate-fade-up">
            {PREVIEW.map((col) => (
              <div key={col.label} className="min-w-0 rounded-md bg-panel-2 p-2">
                <p className="mb-2 flex items-center gap-1.5 truncate text-xs font-medium">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${col.dot}`} /> {col.label}
                </p>
                <div className="flex flex-col gap-2">
                  {col.cards.map(([title, pts]) => (
                    <div key={title} className="rounded-md border border-line bg-panel p-2 text-xs">
                      <p className="line-clamp-2">{title}</p>
                      <p className="mt-1.5 font-mono text-[10px] text-dim">{pts} pts</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-line bg-panel">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
            <h2 className="font-display text-3xl tracking-tight md:text-4xl">Hecho para cómo trabajas en la carrera</h2>
            <p className="mt-2 max-w-2xl text-dim">Proyectos integradores, laboratorios, capstones: la misma metodología que usarás en la industria, aplicada desde hoy.</p>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <li key={title} className="rounded-lg border border-line bg-bg p-5">
                  <Icon className="h-5 w-5 text-accent" aria-hidden />
                  <h3 className="mt-3 font-medium">{title}</h3>
                  <p className="mt-1 text-sm text-dim">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 md:px-6">
          <h2 className="font-display text-3xl tracking-tight md:text-4xl">Tres pasos</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand font-mono text-sm text-white">{i + 1}</span>
                <div>
                  <h3 className="font-medium">{title}</h3>
                  <p className="mt-1 text-sm text-dim">{text}</p>
                </div>
              </li>
            ))}
          </ol>
          <Link href="/login" className="mt-12 inline-flex h-11 items-center gap-2 rounded-md bg-brand px-6 text-sm font-medium text-white transition-colors hover:bg-brand/90">
            Crea tu primer proyecto <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </section>
      </main>

      <footer className="border-t border-line py-6 text-center text-xs text-dim">EduHack 2026 · Profesores Oceánicos</footer>
    </div>
  );
}
