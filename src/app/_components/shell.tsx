"use client";

import { Check, ChevronsUpDown, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Avatar, cn, Logo, Wordmark } from "~/app/_components/ui";
import { VoiceControl } from "~/app/_components/voice-control";
import { api } from "~/trpc/react";

const GLOBAL_TABS = [
  { href: "/", label: "Overview" },
  { href: "/teams", label: "Equipos" },
  { href: "/voice", label: "Asistente" },
];
export const PROJECT_TABS = [
  { id: "board", label: "Kanban" },
  { id: "calendar", label: "Calendario" },
  { id: "gantt", label: "Gantt" },
  { id: "table", label: "Tabla" },
  { id: "rubric", label: "Rúbrica" },
  { id: "sprints", label: "Sprints" },
] as const;

const Slash = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0 text-line" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
    <path d="M16.88 3.549L7.12 20.451" />
  </svg>
);

/** Vercel-style app shell: breadcrumb header + tab nav. Renders children bare when logged out. */
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const utils = api.useUtils();
  const me = api.auth.me.useQuery();
  const projects = api.project.list.useQuery(undefined, { enabled: !!me.data });
  const logout = api.auth.logout.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
      router.push("/login");
    },
  });
  const user = me.data;
  if (!user) return <>{children}</>;

  const projectId = /^\/projects\/(\d+)/.exec(path)?.[1];
  const current = projects.data?.find((p) => String(p.id) === projectId);
  const tab = params.get("tab") ?? "board";
  const tabs = projectId
    ? PROJECT_TABS.map((t) => ({ href: `/projects/${projectId}?tab=${t.id}`, label: t.label, active: tab === t.id }))
    : GLOBAL_TABS.map((t) => ({ ...t, active: path === t.href }));

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-panel/80 backdrop-blur-md">
        <div className="flex h-16 items-center gap-1 px-4 md:px-6">
          <Link href="/" aria-label="ZenSprint, inicio" className="mr-1 flex items-center gap-2">
            <Logo size={26} />
            <Wordmark className="hidden md:inline" />
          </Link>
          <Slash />
          <Link href="/" className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-sm font-medium hover:bg-panel-2">
            <Avatar user={user} size={5} />
            <span className="hidden truncate sm:inline">{user.name ?? user.email}</span>
          </Link>
          {projectId && (
            <>
              <Slash />
              <details className="relative">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium hover:bg-panel-2 [&::-webkit-details-marker]:hidden">
                  <span className="max-w-[40vw] truncate">{current?.name ?? "Proyecto"}</span>
                  <ChevronsUpDown className="h-3.5 w-3.5 text-dim" />
                </summary>
                <div className="card absolute top-full left-0 z-40 mt-2 w-64 p-1 shadow-xl">
                  <p className="px-2 py-1.5 text-xs text-dim">Proyectos</p>
                  {projects.data?.map((p) => (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      onClick={(e) => e.currentTarget.closest("details")?.removeAttribute("open")}
                      className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-panel-2"
                    >
                      <span className="truncate">{p.name}</span>
                      {p.id === current?.id && <Check className="h-4 w-4 shrink-0" />}
                    </Link>
                  ))}
                </div>
              </details>
            </>
          )}
          <div className="ml-auto" />
          <VoiceControl projectId={projectId ? Number(projectId) : undefined} />
          <button
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-dim hover:bg-panel-2 hover:text-fg"
          >
            <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
        <nav className="-mb-px flex gap-1 overflow-x-auto px-2 md:px-4" aria-label="Secciones">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              aria-current={t.active ? "page" : undefined}
              className={cn(
                "relative shrink-0 px-3 pt-2 pb-3 text-sm transition-colors",
                t.active ? "text-fg after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand" : "text-dim hover:text-fg",
              )}
            >
              <span className="rounded-md px-1 py-1 hover:bg-panel-2">{t.label}</span>
            </Link>
          ))}
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
