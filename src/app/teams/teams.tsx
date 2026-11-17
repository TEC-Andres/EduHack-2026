"use client";

import { Crown, LogOut, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { useState } from "react";

import { Avatar, Button, Page } from "~/app/_components/ui";
import { api } from "~/trpc/react";

export function Teams() {
  const utils = api.useUtils();
  const me = api.auth.me.useQuery();
  const teams = api.team.list.useQuery();
  const [name, setName] = useState("");
  const [emails, setEmails] = useState<Record<number, string>>({});
  const refresh = () => Promise.all([utils.team.invalidate(), utils.project.invalidate()]);
  const create = api.team.create.useMutation({ onSuccess: () => { setName(""); return refresh(); } });
  const add = api.team.addMember.useMutation({ onSuccess: (_, v) => { setEmails((e) => ({ ...e, [v.teamId]: "" })); return refresh(); } });
  const remove = api.team.removeMember.useMutation({ onSuccess: refresh });
  const del = api.team.delete.useMutation({ onSuccess: refresh });
  const error = create.error ?? add.error ?? remove.error ?? del.error;

  return (
    <Page
      title="Equipos"
      description="Comparte proyectos: todos los miembros ven y editan el tablero del equipo."
      actions={
        <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate({ name }); }} className="flex gap-2">
          <input className="field w-56" placeholder="Nombre del equipo" value={name} onChange={(e) => setName(e.target.value)} />
          <Button variant="primary" disabled={create.isPending}><Plus className="h-4 w-4" /> Crear</Button>
        </form>
      }
    >
    <div className="flex flex-col gap-6">
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error.message}</p>}

      {teams.data?.length === 0 && (
        <div className="card flex flex-col items-center gap-3 p-12 text-center text-sm text-dim">
          <Users className="h-6 w-6" /> Aún no perteneces a ningún equipo.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {teams.data?.map((t, i) => {
          const mine = t.members.find((m) => m.user.email === me.data?.email);
          const owner = mine?.role === "owner";
          return (
            <article key={t.id} style={{ animationDelay: `${i * 50}ms` }} className="card flex flex-col gap-4 p-5 motion-safe:animate-fade-up">
              <header className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-medium">{t.name}</h2>
                  <p className="text-xs text-dim">{t.members.length} miembros · {t._count.projects} proyectos</p>
                </div>
                {owner ? (
                  <Button variant="danger" className="h-8" onClick={() => confirm(`¿Borrar ${t.name}? Sus proyectos pasan a ser personales del dueño.`) && del.mutate(t.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : (
                  mine && <Button variant="ghost" className="h-8" onClick={() => remove.mutate({ teamId: t.id, userId: mine.userId })}><LogOut className="h-4 w-4" /> Salir</Button>
                )}
              </header>
              <ul className="divide-y divide-line">
                {t.members.map((m) => (
                  <li key={m.userId} className="group flex items-center gap-3 py-2 text-sm">
                    <Avatar user={m.user} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{m.user.name ?? m.user.email}</span>
                      <span className="block truncate text-xs text-dim">{m.user.email}</span>
                    </span>
                    {m.role === "owner" ? (
                      <span className="inline-flex items-center gap-1 text-xs text-dim"><Crown className="h-3.5 w-3.5" aria-hidden /> Dueño</span>
                    ) : (
                      owner && (
                        <button onClick={() => remove.mutate({ teamId: t.id, userId: m.userId })} aria-label={`Quitar a ${m.user.email}`} className="text-dim opacity-0 transition group-hover:opacity-100 hover:text-red-500 focus:opacity-100">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )
                    )}
                  </li>
                ))}
              </ul>
              {owner && (
                <form onSubmit={(e) => { e.preventDefault(); add.mutate({ teamId: t.id, email: emails[t.id] ?? "" }); }} className="flex gap-2">
                  <input type="email" required className="field" placeholder="correo@ejemplo.com" value={emails[t.id] ?? ""} onChange={(e) => setEmails({ ...emails, [t.id]: e.target.value })} />
                  <Button disabled={add.isPending}><UserPlus className="h-4 w-4" /> Invitar</Button>
                </form>
              )}
            </article>
          );
        })}
      </div>
    </div>
    </Page>
  );
}
