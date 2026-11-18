import { projectIcs, validToken } from "~/server/calendar";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const url = new URL(req.url);
  if (!Number.isInteger(id) || !validToken(id, url.searchParams.get("token") ?? "")) return new Response("Not found", { status: 404 });
  const ics = await projectIcs(id, url.origin).catch(() => null);
  if (!ics) return new Response("Not found", { status: 404 });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, max-age=300",
      ...(url.searchParams.has("download") && { "Content-Disposition": `attachment; filename="sprintlab-${id}.ics"` }),
    },
  });
}
