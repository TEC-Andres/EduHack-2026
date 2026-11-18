import { redirect } from "next/navigation";

import { api } from "~/trpc/server";
import { Voice } from "./voice";

export default async function VoicePage() {
  if (!(await api.auth.me())) redirect("/login");
  return <Voice />;
}
