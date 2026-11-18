import { ImageResponse } from "next/og";

// PNG app icon (iOS and Android launchers don't accept the SVG favicon).
export function GET(req: Request) {
  const s = Math.min(512, Math.max(64, Number(new URL(req.url).searchParams.get("s")) || 192));
  const bar = (left: number, top: number, height: number) => (
    <div style={{ position: "absolute", left: (left / 32) * s, top: (top / 32) * s, width: (4.5 / 32) * s, height: (height / 32) * s, borderRadius: s, background: "#fff" }} />
  );
  return new ImageResponse(
    <div style={{ width: s, height: s, display: "flex", position: "relative", background: "#5746e5" }}>
      {bar(8, 17, 8)}
      {bar(14, 12, 13)}
      {bar(20, 7, 18)}
    </div>,
    { width: s, height: s, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
