import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "~/env";
import { db } from "~/server/db";

/**
 * Calendar apps can't send our session cookie, so the feed URL carries a per-project HMAC token.
 * shortcut: derived from CLIENT_SECRET and not revocable per project; add a stored, rotatable token column if links leak.
 */
export const calendarToken = (projectId: number) => createHmac("sha256", env.CLIENT_SECRET).update(`calendar:${projectId}`).digest("base64url").slice(0, 32);

export const validToken = (projectId: number, token: string) => {
  const a = Buffer.from(calendarToken(projectId));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
};

// RFC 5545: escape text, fold lines at 75 octets, CRLF endings.
const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");
const fold = (line: string) => {
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > (out.length ? 74 : 75)) { out.push(cur); cur = ""; }
    cur += ch;
  }
  return [...out, cur].join("\r\n ");
};
const day = (d: Date) => d.toISOString().slice(0, 10).replaceAll("-", "");
const nextDay = (d: Date) => day(new Date(d.getTime() + 86_400_000));

export async function projectIcs(projectId: number, baseUrl: string) {
  const p = await db.project.findUniqueOrThrow({ where: { id: projectId }, include: { sprints: true, activities: { where: { dueDate: { not: null } } } } });
  const stamp = `${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
  const event = (uid: string, start: Date, end: Date, summary: string, description: string, url: string) => [
    "BEGIN:VEVENT",
    `UID:${uid}@sprintlab`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${day(start)}`,
    `DTEND;VALUE=DATE:${nextDay(end)}`, // all-day DTEND is exclusive
    `SUMMARY:${esc(summary)}`,
    `DESCRIPTION:${esc(description)}`,
    `URL:${url}`,
    "END:VEVENT",
  ];
  const link = `${baseUrl}/projects/${p.id}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ZenSprint//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(`ZenSprint · ${p.name}`)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...p.sprints.flatMap((s) => event(`sprint-${s.id}`, s.startDate, new Date(s.endDate.getTime() - 86_400_000), // sprint endDate is exclusive (start + N days)
       `🏃 ${s.name}`, s.goal, `${link}?tab=sprints`)),
    ...p.activities.flatMap((a) =>
      event(`activity-${a.id}`, a.dueDate!, a.dueDate!, `${a.status === "done" ? "✓ " : ""}#${a.number} ${a.title}`, [a.description, a.deliverable && `Entregable: ${a.deliverable}`].filter(Boolean).join("\n\n"), `${link}?a=${a.number}`),
    ),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
