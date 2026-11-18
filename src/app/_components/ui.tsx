"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export const STATUS = {
  backlog: { label: "Backlog", dot: "bg-slate-400", bar: "bg-slate-500" },
  todo: { label: "Por hacer", dot: "bg-sky-400", bar: "bg-sky-500" },
  in_progress: { label: "En progreso", dot: "bg-amber-400", bar: "bg-amber-500" },
  review: { label: "En revisión", dot: "bg-violet-400", bar: "bg-violet-500" },
  done: { label: "Hecho", dot: "bg-emerald-400", bar: "bg-emerald-500" },
} as const;
export type Status = keyof typeof STATUS;
export const STATUS_KEYS = Object.keys(STATUS) as Status[];

export const PRIORITY = {
  low: { label: "Baja", cls: "text-dim bg-panel-2" },
  medium: { label: "Media", cls: "text-sky-700 bg-sky-500/10 dark:text-sky-300" },
  high: { label: "Alta", cls: "text-amber-700 bg-amber-500/10 dark:text-amber-300" },
  urgent: { label: "Urgente", cls: "text-red-700 bg-red-500/10 dark:text-red-300" },
} as const;
export type Priority = keyof typeof PRIORITY;

const VARIANTS = {
  primary: "bg-brand text-white hover:bg-brand/90",
  ghost: "text-dim hover:bg-panel-2 hover:text-fg",
  outline: "border border-line bg-panel hover:bg-panel-2",
  danger: "text-red-600 hover:bg-red-500/10 dark:text-red-400",
};

export function Button({ variant = "outline", className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS }) {
  return (
    <button
      {...p}
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        className,
      )}
    />
  );
}

export function Avatar({ user, size = 7 }: { user?: { name: string | null; email: string; image: string | null } | null; size?: number }) {
  if (!user) return null;
  const label = user.name ?? user.email;
  return (
    <span
      title={label}
      style={{ width: size * 4, height: size * 4 }}
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-panel-2 text-[11px] font-medium text-fg ring-2 ring-panel"
    >
      {label[0]?.toUpperCase()}
      {/* plain img: Google avatar host isn't configured for next/image */}
      {user.image && <img src={user.image} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" />}
    </span>
  );
}

/** Stacked bar: one segment per status. */
export function StatusBar({ counts, className }: { counts: Partial<Record<Status, number>>; className?: string }) {
  const total = STATUS_KEYS.reduce((s, k) => s + (counts[k] ?? 0), 0);
  return (
    <div className={cn("flex h-1.5 w-full overflow-hidden rounded-full bg-panel-2", className)}>
      {total > 0 &&
        STATUS_KEYS.map((k) => (
          <div key={k} className={cn(STATUS[k].bar, "transition-all duration-500")} style={{ width: `${((counts[k] ?? 0) / total) * 100}%` }} />
        ))}
    </div>
  );
}

/** Native <dialog>: focus trap, Esc and backdrop for free. `side` renders it as a right drawer. */
export function Modal({ open, onClose, title, side, children }: { open: boolean; onClose: () => void; title: React.ReactNode; side?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (open && !d?.open) d?.showModal();
    if (!open && d?.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cn(
        "card text-fg shadow-xl backdrop:bg-black/40",
        side ? "m-0 ml-auto h-dvh max-h-dvh w-full max-w-xl rounded-none border-y-0 border-r-0" : "m-auto max-h-[calc(100dvh-2rem)] w-[min(40rem,calc(100vw-2rem))]",
      )}
    >
      {open && (
        <div className="flex h-full max-h-[inherit] flex-col motion-safe:animate-fade-up">
          <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
            <div className="min-w-0 text-base font-semibold">{title}</div>
            <button onClick={onClose} aria-label="Cerrar" className="rounded-md p-1 text-dim hover:bg-panel-2 hover:text-fg">
              <X className="h-5 w-5" />
            </button>
          </header>
          <div className="overflow-y-auto px-6 py-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] font-medium text-dim">
      {label}
      <span>{children}</span>
    </label>
  );
}

/** Vercel-style page: full-width title band + centered content container. */
export function Page({ title, description, actions, children }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <div className="border-b border-line bg-panel">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-4 py-8 md:px-6">
          <div className="min-w-0">
            <h1 className="font-display text-3xl tracking-tight md:text-[40px] md:leading-tight">{title}</h1>
            {description && <div className="mt-1 max-w-3xl text-sm text-dim">{description}</div>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      </div>
      <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-6">{children}</div>
    </>
  );
}

const BARS = [[8, 17, 8], [14, 12, 13], [20, 7, 18]] as const; // x, y, height: three rising sprints

/** ZenSprint mark; `animated` makes the bars pulse (loading states). */
export function Logo({ size = 24, animated, className }: { size?: number; animated?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={cn("shrink-0", className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--brand)" />
      {BARS.map(([x, y, h], i) => (
        <rect
          key={x}
          x={x}
          y={y}
          width="4.5"
          height={h}
          rx="2.25"
          fill="white"
          style={animated ? { transformBox: "fill-box", transformOrigin: "bottom", animationDelay: `${i * 150}ms` } : undefined}
          className={animated ? "motion-safe:animate-bar" : undefined}
        />
      ))}
    </svg>
  );
}

export const Wordmark = ({ className }: { className?: string }) => (
  <span className={cn("font-display text-xl tracking-tight", className)}>
    Zen<em className="text-accent">Sprint</em>
  </span>
);
