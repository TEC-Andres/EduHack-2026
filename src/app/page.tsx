import { Dashboard } from "~/app/_components/dashboard";
import { Hero } from "~/app/_components/hero";
import { api } from "~/trpc/server";

export default async function Home() {
  return (await api.auth.me()) ? <Dashboard /> : <Hero />;
}
