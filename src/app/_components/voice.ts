"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { api } from "~/trpc/react";

// Web Speech API isn't in TS's DOM lib; this is the slice we use (Chrome/Android/Safari expose it as webkitSpeechRecognition).
export type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: (e: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void;
  onend: () => void;
  onerror: (e: { error: string }) => void;
};

export function getRecognition() {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const R = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!R) return null;
  const r = new R();
  r.lang = "es-MX";
  return r;
}

/**
 * Voice preferences live in cookies (per browser), never in the DB or the LLM.
 * mode: "save" = transcribe and store, never answer; "respond" = typed requests to Gemini, text replies.
 * listen: keep the mic on in project pages while in "save" mode.
 * speak: read assistant replies aloud on /voice.
 * hotword: listen for "Hey SprintLab" on every page (without saving anything unless listen is also on).
 */
export type Mode = "save" | "respond";
export type Prefs = { mode: Mode; listen: boolean; speak: boolean; hotword: boolean };
const COOKIE = { mode: "sl_mode", listen: "sl_listen", speak: "sl_speak", hotword: "sl_hotword" } as const;

function readCookie(name: string) {
  return new RegExp(`(?:^|; )${name}=([^;]*)`).exec(document.cookie)?.[1];
}
export function getPrefs(): Prefs {
  return { mode: readCookie(COOKIE.mode) === "respond" ? "respond" : "save", listen: readCookie(COOKIE.listen) === "1", speak: readCookie(COOKIE.speak) !== "0", hotword: readCookie(COOKIE.hotword) === "1" };
}
export function setPrefs(p: Partial<Prefs>) {
  const year = "path=/; max-age=31536000; SameSite=Lax";
  if (p.mode) document.cookie = `${COOKIE.mode}=${p.mode}; ${year}`;
  if (p.listen !== undefined) document.cookie = `${COOKIE.listen}=${p.listen ? 1 : 0}; ${year}`;
  if (p.speak !== undefined) document.cookie = `${COOKIE.speak}=${p.speak ? 1 : 0}; ${year}`;
  if (p.hotword !== undefined) document.cookie = `${COOKIE.hotword}=${p.hotword ? 1 : 0}; ${year}`;
  window.dispatchEvent(new Event("voiceprefs")); // let every mounted usePrefs() re-read
}

/** Cookie prefs as React state (defaults until mounted, so SSR and first render agree). */
export function usePrefs() {
  const [prefs, set] = useState<Prefs>({ mode: "save", listen: false, speak: true, hotword: false });
  useEffect(() => {
    const read = () => set(getPrefs());
    read();
    window.addEventListener("voiceprefs", read);
    return () => window.removeEventListener("voiceprefs", read);
  }, []);
  return prefs;
}

/** Reads `text` aloud in Spanish when the "speak" pref is on; resolves when done (or immediately if unsupported). */
export function say(text: string) {
  return new Promise<void>((resolve) => {
    if (!getPrefs().speak || !("speechSynthesis" in window)) return resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "es-MX";
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

export const useSpeechSupported = () => {
  const [ok, setOk] = useState(true);
  useEffect(() => setOk(!!getRecognition()), []);
  return ok;
};

/**
 * "Hey SprintLab" (also "Oye SprintLab"), tolerant of how es-MX recognizers spell it:
 * "hay/ey/jey/eh" for "Hey", and "sprint lab" / "spring lab" / "es print lap" / "sprintlab" for the name.
 * A greeting is required so just saying the app's name in conversation doesn't trigger it.
 */
export const HOTWORD =
  /(?:^|[^\p{L}])(?:hey|hei|hay|ey|ei|eh|jey|jei|oye|oigan?|ok|okay)[\s,.!¡?¿]*(?:e?s\s?)?(?:sprint|spring|print|esprint)\s*-?\s*la(?:b|p|v|bs)(?![\p{L}])[\s,.!:?]*/iu;
const AWAKE_MS = 6000; // after a bare "Hey SprintLab", how long the next phrase counts as the request
// Watchdog: the browser's recognizer degrades in long or noisy sessions, so we refresh it before it drops words.
const NOISE_MS = 12_000; // a phrase that never finalizes = noise keeps the recognizer from detecting a pause
const STALL_MS = 20_000; // no events at all = the service froze silently (restarting during real silence loses nothing)
const MAX_SESSION_MS = 50_000; // refresh at the next quiet moment before the browser's own session cap cuts mid-phrase
const STOP_GRACE_MS = 1500; // stop() normally finalizes and fires onend; abort if it doesn't

/**
 * Mic loop. While `on`, listens for the hotword; with `save`, also stores every other final phrase as a VoiceNote
 * (no Gemini involved). "Hey SprintLab, <petición>" switches to Responder and opens /voice with the request typed in,
 * ready to send (Responder is typed-only, so nothing reaches Gemini until the student hits send).
 */
export function useCapture({ projectId, on, save }: { projectId?: number; on: boolean; save: boolean }) {
  const [listening, setListening] = useState(false);
  const [awake, setAwake] = useState(false);
  const [live, setLive] = useState("");
  const [heard, setHeard] = useState(""); // last final phrase, shown in the menu to debug the hotword
  const [error, setError] = useState<string | null>(null);
  const [refreshes, setRefreshes] = useState<{ count: number; reason: string }>({ count: 0, reason: "" });
  const router = useRouter();
  const utils = api.useUtils();
  const add = api.voice.add.useMutation({
    retry: 3, // a dropped request would lose that phrase for good
    onSuccess: (_, v) => utils.voice.list.invalidate(v.projectId),
    onError: () => setError("No se pudo guardar un fragmento (¿sin conexión?)."),
  });
  const latest = useRef({ add: add.mutate, router, projectId, save });
  latest.current = { add: add.mutate, router, projectId, save };

  useEffect(() => {
    if (!on) return;
    let stopped = false;
    let rec: Recognition | null = null;
    let awakeUntil = 0;
    let awakeTimer: ReturnType<typeof setTimeout> | undefined;
    let pending = ""; // words heard but not finalized yet; flushed on stop so they aren't lost
    setError(null);

    /** Stores exactly what the recognizer heard: fillers, restarts and the hotword included. */
    const store = (text: string) => {
      const { add, projectId, save } = latest.current;
      if (save && projectId && text) add({ projectId, text });
    };
    const flush = () => { store(pending); pending = ""; };

    const wake = (command: string) => {
      stopped = true;
      clearTimeout(awakeTimer);
      flush();
      rec?.abort();
      setAwake(false);
      const { router, projectId } = latest.current;
      setPrefs({ mode: "respond" });
      const q = new URLSearchParams({ ...(projectId && { project: String(projectId) }), ...(command && { ask: command }) });
      router.push(`/voice?${q}`);
    };

    let sessionStart = 0;
    let lastEvent = 0;
    let pendingSince = 0;
    let failures = 0; // consecutive errors, for backoff
    let refreshing = false;
    let restartTimer: ReturnType<typeof setTimeout> | undefined;

    /** Restart the recognizer. stop() (not abort) so the phrase in progress is finalized and stored instead of dropped. */
    const refresh = (reason: string) => {
      if (refreshing || !rec) return;
      refreshing = true;
      setRefreshes((r) => ({ count: r.count + 1, reason }));
      const current = rec;
      current.stop();
      setTimeout(() => { if (rec === current && refreshing) { flush(); current.abort(); } }, STOP_GRACE_MS);
    };

    const watchdog = setInterval(() => {
      if (stopped || !rec || refreshing) return;
      const now = Date.now();
      if (pending && now - pendingSince > NOISE_MS) refresh("ruido: la frase no se cerraba");
      else if (now - lastEvent > STALL_MS) refresh("el reconocedor dejó de responder");
      else if (!pending && now - sessionStart > MAX_SESSION_MS) refresh("sesión larga");
    }, 1000);

    const schedule = () => {
      clearTimeout(restartTimer);
      // fast restart normally; back off on repeated errors (offline, mic busy) instead of hammering
      restartTimer = setTimeout(listen, failures ? Math.min(250 * 2 ** failures, 8000) : 50);
    };

    const listen = () => {
      if (stopped) return;
      const r = getRecognition();
      if (!r) return setError("Este navegador no soporta reconocimiento de voz (usa Chrome o Safari).");
      rec = r;
      r.continuous = true;
      r.interimResults = true;
      r.onresult = (e) => {
        if (rec !== r) return; // late event from a session we already replaced
        lastEvent = Date.now();
        failures = 0;
        setError(null);
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const text = e.results[i]![0].transcript.trim(); // edge whitespace only; the words stay as heard
          if (!e.results[i]!.isFinal) { interim += text + " "; continue; }
          if (!text) continue;
          setHeard(text);
          store(text);
          if (Date.now() < awakeUntil) return wake(text);
          const m = HOTWORD.exec(text);
          if (!m) continue;
          const command = text.slice(m.index + m[0].length).trim();
          if (command) return wake(command);
          awakeUntil = Date.now() + AWAKE_MS;
          setAwake(true);
          awakeTimer = setTimeout(() => wake(""), AWAKE_MS); // no follow-up: open Responder empty
        }
        const next = interim.trim();
        if (next && !pending) pendingSince = Date.now();
        pending = next;
        setLive(pending);
      };
      r.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          stopped = true;
          setPrefs({ listen: false, hotword: false });
          setError("Permiso de micrófono denegado: actívalo en el navegador.");
        } else if (e.error !== "no-speech" && e.error !== "aborted") {
          failures++;
          setError(e.error === "network" ? "Sin conexión con el reconocimiento de voz, reintentando…" : `Micrófono: ${e.error}, reintentando…`);
        }
      };
      r.onend = () => {
        if (rec !== r) return;
        flush(); // a session can end mid-phrase (silence, network, refresh); keep the partial words
        refreshing = false;
        rec = null;
        setLive("");
        if (stopped) setListening(false);
        else schedule(); // browsers end sessions on their own; keep going
      };
      try {
        r.start();
      } catch {
        // previous session not fully released yet ("already started"): this used to kill the loop silently
        rec = null;
        failures++;
        return schedule();
      }
      sessionStart = lastEvent = Date.now();
      setListening(true);
    };

    listen();
    return () => {
      stopped = true;
      clearInterval(watchdog);
      clearTimeout(restartTimer);
      clearTimeout(awakeTimer);
      flush();
      rec?.abort();
      setListening(false);
      setAwake(false);
      setLive("");
    };
  }, [on]);

  return { listening, awake, live, heard, error, refreshes };
}
