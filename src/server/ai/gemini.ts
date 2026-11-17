import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { env } from "~/env";

export type Part = { text?: string; functionCall?: { name: string; args?: Record<string, unknown> } };

/** Hard cap per skill (primary + fallback + retries), so the 4-step project kickoff stays under ~2 minutes. */
const CALL_BUDGET_MS = 28_000;
const BUSY = [429, 500, 503];

/**
 * POST to a Gemini REST method (e.g. "gemini-x:generateContent").
 * Retries 429/5xx ("high demand") with backoff until `deadline`; `retry: false` gives up after one attempt.
 */
async function call(method: string, body: Record<string, unknown>, deadline = Date.now() + CALL_BUDGET_MS, retry = true): Promise<unknown> {
  if (!env.GEMINI_API_KEY) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Falta GEMINI_API_KEY en .env" });
  }
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
      });
    } catch (e) {
      if ((e as Error).name !== "TimeoutError") throw e;
      throw new TRPCError({ code: "TIMEOUT", message: "Gemini tardó demasiado en responder, intenta de nuevo" });
    }
    if (res.ok) return res.json();
    const wait = 1000 * 2 ** (attempt - 1);
    if (!retry || !BUSY.includes(res.status) || Date.now() + wait >= deadline) {
      throw new TRPCError({
        code: BUSY.includes(res.status) ? "TOO_MANY_REQUESTS" : "BAD_GATEWAY",
        message: `Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`,
      });
    }
    await new Promise((r) => setTimeout(r, wait));
  }
}

/** generateContent on GEMINI_MODEL; if it is overloaded or slow, one shared time budget falls through to GEMINI_FALLBACK_MODEL. */
export async function gemini(body: Record<string, unknown>): Promise<Part[]> {
  const deadline = Date.now() + CALL_BUDGET_MS;
  const fallback = env.GEMINI_FALLBACK_MODEL && env.GEMINI_FALLBACK_MODEL !== env.GEMINI_MODEL ? env.GEMINI_FALLBACK_MODEL : null;
  let data: unknown;
  try {
    // with a fallback available, give the primary one attempt and at most 60% of the budget
    data = fallback
      ? await call(`${env.GEMINI_MODEL}:generateContent`, body, Date.now() + CALL_BUDGET_MS * 0.6, false)
      : await call(`${env.GEMINI_MODEL}:generateContent`, body, deadline);
  } catch (e) {
    if (!fallback || !(e instanceof TRPCError) || !["TOO_MANY_REQUESTS", "TIMEOUT"].includes(e.code)) throw e;
    data = await call(`${fallback}:generateContent`, body, deadline);
  }
  return (data as { candidates?: { content?: { parts?: Part[] } }[] }).candidates?.[0]?.content?.parts ?? [];
}

const EMBED_MODEL = "gemini-embedding-001";

/** One embedding vector per text (used by the playbook RAG). */
export async function embed(texts: string[], taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"): Promise<number[][]> {
  const data = (await call(`${EMBED_MODEL}:batchEmbedContents`, {
    requests: texts.map((text) => ({ model: `models/${EMBED_MODEL}`, content: { parts: [{ text }] }, taskType })),
  })) as { embeddings?: { values: number[] }[] };
  return (data.embeddings ?? []).map((e) => e.values);
}

/** Zod (objects, arrays, enums, numbers, strings) → Gemini OpenAPI-subset schema. */
export function toSchema(t: z.ZodTypeAny): Record<string, unknown> {
  if (t instanceof z.ZodObject) {
    const shape = t.shape as Record<string, z.ZodTypeAny>;
    return {
      type: "OBJECT",
      properties: Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, toSchema(v)])),
      required: Object.keys(shape).filter((k) => !shape[k]!.isOptional()),
    };
  }
  if (t instanceof z.ZodOptional) return toSchema(t.unwrap() as z.ZodTypeAny);
  if (t instanceof z.ZodArray) return { type: "ARRAY", items: toSchema(t.element as z.ZodTypeAny) };
  if (t instanceof z.ZodEnum) return { type: "STRING", enum: t.options as string[] };
  if (t instanceof z.ZodNumber) return { type: "INTEGER" };
  return { type: "STRING" };
}

/** Structured output: the response is forced to JSON and validated with the same zod schema. */
export async function geminiJSON<T extends z.ZodTypeAny>(system: string, prompt: string, schema: T, maxOutputTokens = 8192): Promise<z.infer<T>> {
  const parts = await gemini({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    // the token cap bounds generation time; a reply cut off by it fails validation below instead of hanging
    generationConfig: { responseMimeType: "application/json", responseSchema: toSchema(schema), temperature: 0.4, maxOutputTokens },
  });
  try {
    return schema.parse(JSON.parse(parts.map((p) => p.text ?? "").join(""))) as z.infer<T>;
  } catch {
    throw new TRPCError({ code: "BAD_GATEWAY", message: "Gemini devolvió una respuesta inválida, intenta de nuevo" });
  }
}
