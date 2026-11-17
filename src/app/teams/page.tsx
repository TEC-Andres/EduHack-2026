import { redirect } from "next/navigation";

import { api } from "~/trpc/server";
import { Teams } from "./teams";

export default async function TeamsPage() {
  if (!(await api.auth.me())) redirect("/login");
  return <Teams />;
}
