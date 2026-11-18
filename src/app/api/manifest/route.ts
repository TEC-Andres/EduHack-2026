// Per-project, per-view web app manifest: "install" / "add to home screen" opens straight into that view.
const VIEWS = { board: "Kanban", calendar: "Calendario", gantt: "Gantt" } as const;

export function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const project = Number(q.get("project"));
  const view = (q.get("view") ?? "board") as keyof typeof VIEWS;
  const name = (q.get("name") ?? "SprintLab").slice(0, 60);
  if (!Number.isInteger(project) || !(view in VIEWS)) return new Response("Bad request", { status: 400 });
  const icon = (s: number) => ({ src: `/api/pwa-icon?s=${s}`, sizes: `${s}x${s}`, type: "image/png", purpose: "any" });
  return Response.json(
    {
      id: `/projects/${project}?tab=${view}`,
      name: `${name} · ${VIEWS[view]}`,
      short_name: VIEWS[view],
      start_url: `/projects/${project}?tab=${view}`,
      scope: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#5746e5",
      icons: [icon(192), icon(512), { ...icon(512), purpose: "maskable" }],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
