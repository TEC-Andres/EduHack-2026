import { type Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { api } from "~/trpc/server";
import { ProjectView } from "./project-view";

const VIEWS = ["board", "calendar", "gantt"];

/** Manifest follows the open view, so "Install" / "Add to home screen" pins that view as an app. */
export async function generateMetadata({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }): Promise<Metadata> {
  const id = Number((await params).id);
  const tab = (await searchParams).tab ?? "board";
  const view = VIEWS.includes(tab) ? tab : "board";
  const project = Number.isInteger(id) ? await api.project.get(id).catch(() => null) : null;
  return {
    title: project ? `${project.name} — ZenSprint` : "ZenSprint",
    manifest: `/api/manifest?project=${id}&view=${view}&name=${encodeURIComponent(project?.name ?? "ZenSprint")}`,
    appleWebApp: { capable: true, title: project?.name ?? "ZenSprint", statusBarStyle: "default" },
    icons: { apple: "/api/pwa-icon?s=180" },
  };
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await api.auth.me())) redirect("/login");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  return <ProjectView id={id} />;
}
