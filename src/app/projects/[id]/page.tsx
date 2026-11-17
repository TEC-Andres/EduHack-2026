import { notFound, redirect } from "next/navigation";

import { api } from "~/trpc/server";
import { ProjectView } from "./project-view";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await api.auth.me())) redirect("/login");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  return <ProjectView id={id} />;
}
