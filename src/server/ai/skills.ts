import "server-only";
import { z } from "zod";

import { type db as Db } from "~/server/db";
import { gemini, geminiJSON, toSchema } from "./gemini";
import { retrievePlaybooks } from "./playbooks";

type DB = typeof Db;
export type SkillArgs = { instructions?: string; activityNumber?: number };

const BASE = `Eres un Scrum Master y profesor universitario experto en aprendizaje basado en proyectos.
Conviertes ideas de proyectos personales o académicos en trabajo organizado con Scrum.
Las actividades se redactan como tareas de Canvas: objetivo claro, instrucciones, entregable verificable
y criterios de aceptación. Usa story points Fibonacci (1, 2, 3, 5, 8, 13). Responde siempre en español.`;

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const fib = (n: number) => [1, 2, 3, 5, 8, 13].find((f) => f >= n) ?? 13;

/** Markdown snapshot of the project that every skill reads. */
async function context(db: DB, projectId: number) {
  const p = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      criteria: true,
      sprints: { orderBy: { startDate: "asc" } },
      activities: { orderBy: { number: "asc" }, include: { criterion: { select: { name: true } }, sprint: { select: { name: true } } } },
    },
  });
  const text = [
    `# Proyecto: ${p.name}`,
    p.description,
    p.brief && `## Brief expandido\n${p.brief}`,
    p.rubricText && `## Rúbrica / requisitos proporcionados por el usuario\n${p.rubricText}`,
    p.criteria.length && `## Criterios de rúbrica\n${p.criteria.map((c) => `- ${c.name} (${c.weight}%): ${c.description}`).join("\n")}`,
    `## Duración de sprint: ${p.sprintLengthDays} días`,
    p.sprints.length && `## Sprints\n${p.sprints.map((s) => `- ${s.name}: ${s.goal}`).join("\n")}`,
    p.activities.length &&
      `## Actividades existentes\n${p.activities
        .map((a) => `- #${a.number} [${a.status}] ${a.title} (${a.points ?? "?"} pts${a.sprint ? `, ${a.sprint.name}` : ""}${a.dueDate ? `, vence ${a.dueDate.toISOString().slice(0, 10)}` : ""}${a.criterion ? `, criterio: ${a.criterion.name}` : ""})${a.description ? `: ${a.description.slice(0, 200)}` : ""}${a.deliverable ? ` Entregable: ${a.deliverable.slice(0, 120)}` : ""}`)
        .join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { p, text };
}

const briefOut = z.object({
  projectType: z.string(),
  problem: z.string(),
  users: z.string(),
  goals: z.array(z.string()),
  mvpFeatures: z.array(z.string()),
  outOfScope: z.array(z.string()),
  tech: z.array(z.string()),
  deliverables: z.array(z.string()),
  risks: z.array(z.string()),
});
const list = (title: string, xs: string[]) => `### ${title}\n${xs.map((x) => `- ${x}`).join("\n")}`;

const rubricOut = z.object({
  criteria: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      weight: z.number(),
      levels: z.array(z.object({ label: z.string(), points: z.number(), description: z.string() })),
    }),
  ),
});
const backlogOut = z.object({
  activities: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      acceptance: z.array(z.string()),
      deliverable: z.string(),
      priority: z.enum(PRIORITIES),
      points: z.number(),
      labels: z.array(z.string()),
      criterion: z.string(),
      checklist: z.array(z.string()),
    }),
  ),
});
const sprintsOut = z.object({
  sprints: z.array(z.object({ name: z.string(), goal: z.string(), activityNumbers: z.array(z.number()) })),
});
const breakdownOut = z.object({ checklist: z.array(z.string()), points: z.number() });

/**
 * Skills: each one is a focused prompt + a structured-output schema + how to apply it to the DB.
 * The assistant exposes them to Gemini as function declarations so the model picks which to run.
 */
export const skills = {
  expand_idea: {
    label: "Expandir idea",
    description: "Convierte la idea suelta del usuario en un brief completo (problema, usuarios, MVP, alcance, tecnología, entregables, riesgos). Ejecútalo primero si la idea es vaga.",
    async run(db: DB, projectId: number, args: SkillArgs) {
      const { p } = await context(db, projectId);
      // the "prompt for the prompt": a sporadic idea becomes the structured context every later skill reads
      const out = await geminiJSON(
        `${BASE}\nActúas como Product Owner. El usuario te da una idea esporádica e incompleta. Expándela a un brief accionable:
infiere lo que falte con supuestos razonables para un proyecto estudiantil (márcalos con "(supuesto)"), mantén el alcance
realizable y separa claramente el MVP de lo que queda fuera. En "projectType" clasifica el proyecto
(aplicación web, app móvil, machine learning, investigación, hardware/IoT, videojuego, emprendimiento u otro).
Sé conciso: problema y usuarios en una frase cada uno; cada elemento de lista es una frase corta.
Máximo: 3 objetivos, 5 funcionalidades MVP, 3 fuera de alcance, 5 tecnologías, 4 entregables, 3 riesgos.`,
        `Nombre: ${p.name}\nIdea: ${p.description || "(sin descripción)"}\n${p.rubricText ? `Rúbrica/requisitos:\n${p.rubricText}\n` : ""}Duración de sprint: ${p.sprintLengthDays} días\n\nInstrucciones adicionales: ${args.instructions ?? "ninguna"}`,
        briefOut,
        2048,
      );
      const cap = (xs: string[], n: number) => xs.slice(0, n); // enforce the prompt's limits even if the model ignores them
      const brief = [
        `**Tipo:** ${out.projectType}`,
        `**Problema:** ${out.problem}`,
        `**Usuarios:** ${out.users}`,
        list("Objetivos", cap(out.goals, 3)),
        list("Funcionalidades del MVP", cap(out.mvpFeatures, 5)),
        list("Fuera de alcance", cap(out.outOfScope, 3)),
        list("Tecnología", cap(out.tech, 5)),
        list("Entregables", cap(out.deliverables, 4)),
        list("Riesgos", cap(out.risks, 3)),
      ].join("\n\n");
      await db.project.update({ where: { id: projectId }, data: { brief } });
      return `Idea expandida (${out.projectType}, ${cap(out.mvpFeatures, 5).length} funcionalidades MVP)`;
    },
  },

  generate_rubric: {
    label: "Rúbrica",
    description: "Crea o reemplaza la rúbrica de evaluación del proyecto (criterios con peso y niveles de desempeño).",
    async run(db: DB, projectId: number, args: SkillArgs) {
      const { text } = await context(db, projectId);
      const out = await geminiJSON(
        `${BASE}\nDiseña una rúbrica analítica de 4 a 6 criterios cuyos pesos sumen 100. Cada criterio tiene 4 niveles
(Excelente, Bueno, Suficiente, Insuficiente) con puntos y descriptor observable. Si el usuario dio una rúbrica, respétala y estructúrala.`,
        `${text}\n\nInstrucciones adicionales: ${args.instructions ?? "ninguna"}`,
        rubricOut,
      );
      await db.$transaction([
        db.rubricCriterion.deleteMany({ where: { projectId } }),
        db.rubricCriterion.createMany({
          data: out.criteria.map((c) => ({ projectId, name: c.name, description: c.description, weight: Math.round(c.weight), levels: c.levels })),
        }),
      ]);
      return `Rúbrica con ${out.criteria.length} criterios`;
    },
  },

  generate_backlog: {
    label: "Backlog",
    description: "Genera actividades (issues) para el product backlog a partir de la idea del proyecto y su rúbrica. No duplica actividades existentes.",
    async run(db: DB, projectId: number, args: SkillArgs) {
      const { p, text } = await context(db, projectId);
      const playbooks = await retrievePlaybooks(`${p.name}\n${p.description}\n${p.brief}`);
      const out = await geminiJSON(
        `${BASE}\nGenera entre 8 y 15 actividades nuevas que, completadas, cubran todos los criterios de la rúbrica.
Ordénalas de forma lógica (investigación → diseño → desarrollo → pruebas → presentación). No repitas actividades existentes.
En "criterion" pon el nombre exacto del criterio de rúbrica que evidencia la actividad, o "" si no aplica.
En "checklist" pon de 3 a 6 subtareas accionables en orden.
Usa los playbooks recuperados como guion de fases y tareas típicas: adáptalos a este proyecto, no los copies literalmente
ni incluyas tareas que no apliquen.`,
        `${text}\n\n## Playbooks recuperados (referencia)\n${playbooks}\n\nInstrucciones adicionales: ${args.instructions ?? "ninguna"}`,
        backlogOut,
      );
      const crit = new Map(p.criteria.map((c) => [c.name.toLowerCase().trim(), c.id]));
      const last = p.activities.at(-1)?.number ?? 0;
      await db.activity.createMany({
        data: out.activities.map((a, i) => ({
          projectId,
          number: last + i + 1,
          position: last + i + 1,
          title: a.title,
          description: a.description,
          acceptance: a.acceptance,
          deliverable: a.deliverable,
          priority: a.priority,
          points: fib(a.points),
          labels: a.labels.slice(0, 4),
          checklist: a.checklist.slice(0, 10).map((t) => ({ text: t, done: false })),
          criterionId: crit.get(a.criterion.toLowerCase().trim()) ?? null,
        })),
      });
      return `${out.activities.length} actividades nuevas en el backlog`;
    },
  },

  plan_sprints: {
    label: "Sprints",
    description: "Planea sprints: agrupa las actividades pendientes del backlog en sprints con objetivo, respetando dependencias y capacidad.",
    async run(db: DB, projectId: number, args: SkillArgs) {
      const { p, text } = await context(db, projectId);
      const out = await geminiJSON(
        `${BASE}\nAgrupa SOLO las actividades con estado "backlog" que no tengan sprint en sprints nuevos.
Cada sprint tiene un nombre ("Sprint N"), un objetivo de una frase y los números de actividad que incluye.
Equilibra los story points entre sprints y respeta el orden lógico de dependencias.`,
        `${text}\n\nInstrucciones adicionales: ${args.instructions ?? "ninguna"}`,
        sprintsOut,
      );
      const day = 86_400_000;
      let start = Math.max(Date.now(), ...p.sprints.map((s) => s.endDate.getTime()));
      for (const s of out.sprints) {
        const end = start + p.sprintLengthDays * day;
        const sprint = await db.sprint.create({
          data: { projectId, name: s.name, goal: s.goal, startDate: new Date(start), endDate: new Date(end) },
        });
        const where = { projectId, number: { in: s.activityNumbers } };
        await db.activity.updateMany({ where, data: { sprintId: sprint.id } });
        await db.activity.updateMany({ where: { ...where, status: "backlog" }, data: { status: "todo" } });
        start = end;
      }
      return `${out.sprints.length} sprints planeados`;
    },
  },

  breakdown_activity: {
    label: "Desglosar",
    description: "Desglosa una actividad específica (por número) en una checklist de subtareas y estima sus story points.",
    async run(db: DB, projectId: number, args: SkillArgs) {
      const { text } = await context(db, projectId);
      const a = await db.activity.findUniqueOrThrow({
        where: { projectId_number: { projectId, number: args.activityNumber ?? -1 } },
      });
      const out = await geminiJSON(
        `${BASE}\nDesglosa la actividad indicada en 3 a 8 subtareas pequeñas, accionables y en orden. Estima sus story points totales.`,
        `${text}\n\n## Actividad a desglosar: #${a.number} ${a.title}\n${a.description}\nEntregable: ${a.deliverable}\nCriterios: ${a.acceptance.join("; ")}\n\nInstrucciones adicionales: ${args.instructions ?? "ninguna"}`,
        breakdownOut,
      );
      await db.activity.update({
        where: { id: a.id },
        data: { checklist: out.checklist.map((t) => ({ text: t, done: false })), points: a.points ?? fib(out.points) },
      });
      return `#${a.number} desglosada en ${out.checklist.length} subtareas`;
    },
  },
};

export type SkillName = keyof typeof skills;
export const skillNames = Object.keys(skills) as [SkillName, ...SkillName[]];

const callArgs = z.object({ instructions: z.string().optional(), activityNumber: z.number().int().optional() });

const STATUSES = ["backlog", "todo", "in_progress", "review", "done"] as const;
const STATUS_ES = { backlog: "Backlog", todo: "Por hacer", in_progress: "En progreso", review: "En revisión", done: "Hecho" } as const;
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const toDate = (d?: string) => (d ? new Date(`${d}T12:00:00`) : null); // same noon convention as the activity panel

const createTasksArgs = z.object({
  tasks: z.array(z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    deliverable: z.string().max(500).optional(),
    dueDate: day.optional(),
    priority: z.enum(PRIORITIES).optional(),
    points: z.number().optional(),
    status: z.enum(STATUSES).optional(),
    sprintName: z.string().optional(),
  })).min(1).max(15),
});
const moveArgs = z.object({
  moves: z.array(z.object({
    activityNumber: z.number().int(),
    status: z.enum(STATUSES).optional(),
    sprintName: z.string().optional(),
    dueDate: day.optional(),
  })).min(1).max(30),
});

/**
 * Board actions: Gemini fills the arguments itself (no second model call), so voice requests apply in one round trip.
 * Separate from `skills` because their arguments are the data, not free-form instructions.
 */
const actions = {
  create_tasks: {
    description: `Crea tarjetas nuevas en el tablero. Úsalo SOLO si el estudiante pide explícitamente agregar/agendar/anotar algo
("agéndame", "anota", "crea", "tengo que entregar X, organízamelo"). Si solo pregunta o comenta, NO lo uses.
Si es una entrega a varios días, NO la resuelvas: estructúrala en 3 a 8 tasks chicas (máx. ~2 h cada una), accionables,
en orden, cada una con fecha (YYYY-MM-DD) escalonada antes de la entrega y la última = revisión final + entregar.
Títulos cortos que empiecen con verbo. status "todo" salvo que pidan otro.`,
    schema: createTasksArgs,
    async run(db: DB, projectId: number, raw: unknown) {
      const { tasks } = createTasksArgs.parse(raw);
      const sprints = await db.sprint.findMany({ where: { projectId } });
      const sprintId = (name?: string) => sprints.find((s) => s.name.toLowerCase() === name?.toLowerCase().trim())?.id ?? null;
      const last = await db.activity.aggregate({ where: { projectId }, _max: { number: true, position: true } });
      const n = last._max.number ?? 0, pos = last._max.position ?? 0;
      await db.activity.createMany({
        data: tasks.map((t, i) => ({
          projectId,
          number: n + i + 1,
          position: pos + i + 1,
          title: t.title,
          description: t.description ?? "",
          deliverable: t.deliverable ?? "",
          priority: t.priority ?? "medium",
          points: t.points ? fib(t.points) : null,
          status: t.status ?? "todo",
          dueDate: toDate(t.dueDate),
          sprintId: sprintId(t.sprintName),
        })),
      });
      const lines = tasks.map((t, i) => `#${n + i + 1} ${t.title}${t.dueDate ? ` (para el ${t.dueDate})` : ""}`);
      return `${tasks.length === 1 ? "Agregué 1 tarea" : `Agregué ${tasks.length} tareas`}:\n${lines.join("\n")}`;
    },
  },

  move_activities: {
    description: `Mueve tarjetas existentes (por número) en el tablero: cambia su columna/estado, su sprint
(sprintName exacto, o "ninguno" para quitarlo) y/o su fecha de entrega. Úsalo SOLO si pide un cambio: "ya terminé X", "pasa X a en progreso",
"mueve X al sprint 2". Preguntas como "¿en qué estado está X?" se responden en texto, sin esta herramienta.`,
    schema: moveArgs,
    async run(db: DB, projectId: number, raw: unknown) {
      const { moves } = moveArgs.parse(raw);
      const sprints = await db.sprint.findMany({ where: { projectId } });
      const done: string[] = [];
      for (const m of moves) {
        const a = await db.activity.findUnique({ where: { projectId_number: { projectId, number: m.activityNumber } } });
        if (!a) continue;
        const data: { status?: string; position?: number; sprintId?: number | null; dueDate?: Date | null } = {};
        if (m.status && m.status !== a.status) {
          const top = await db.activity.aggregate({ where: { projectId, status: m.status }, _max: { position: true } });
          Object.assign(data, { status: m.status, position: (top._max.position ?? 0) + 1 }); // bottom of the target column
        }
        if (m.sprintName) {
          const s = sprints.find((x) => x.name.toLowerCase() === m.sprintName!.toLowerCase().trim());
          if (s || /^(ninguno|none|sin sprint)$/i.test(m.sprintName.trim())) data.sprintId = s?.id ?? null;
        }
        if (m.dueDate) data.dueDate = toDate(m.dueDate);
        if (!Object.keys(data).length) continue;
        await db.activity.update({ where: { id: a.id }, data });
        const what = [
          data.status && `a ${STATUS_ES[data.status as (typeof STATUSES)[number]]}`,
          data.sprintId !== undefined && (data.sprintId ? `al ${sprints.find((x) => x.id === data.sprintId)!.name}` : "fuera de sprint"),
          data.dueDate && `con fecha ${m.dueDate}`,
        ].filter(Boolean).join(", ");
        done.push(`#${a.number} ${a.title} → ${what}`);
      }
      return done.length ? `Moví:\n${done.join("\n")}` : "No encontré esas tarjetas, no moví nada";
    },
  },
};
type ActionName = keyof typeof actions;

/** Free-form request: Gemini chooses which skills/actions to call (function calling), then we run them in order. */
export async function assistant(db: DB, projectId: number, message: string, today = new Date().toISOString().slice(0, 10)) {
  const { text } = await context(db, projectId);
  // saved "Guardar" transcript, newest last; only read here, when the user explicitly asks in "Responder" mode
  const notes = (await db.voiceNote.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 200 })).reverse();
  // shortcut: keeps the most recent ~8k chars; summarize older notes if students record whole classes
  const transcript = notes.map((n) => `[${n.createdAt.toISOString().slice(0, 16).replace("T", " ")}] ${n.text}`).join("\n").slice(-8000);
  const weekday = new Date(`${today}T12:00:00Z`).toLocaleDateString("es-MX", { weekday: "long", timeZone: "UTC" });
  const parts = await gemini({
    systemInstruction: {
      parts: [{
        text: `${BASE}\nHoy es ${weekday} ${today}. Eres el asistente de bolsillo del estudiante. Puede haber una "Conversación guardada"
(lo que el estudiante grabó en clase o en su día): úsala solo si la petición la menciona o la necesita (p. ej. "convierte lo que dijo el profe en tasks").
Primero decide si el estudiante quiere INFORMACIÓN o una ACCIÓN:
- INFORMACIÓN (lo más común): preguntas como "¿qué tengo hoy?", "¿qué dice la #4?", "¿cuándo entrego?", "¿qué dijo el profe?",
  "¿cómo empiezo el ensayo?". Responde en texto usando el tablero y la conversación guardada; NO llames herramientas ni cambies nada.
  Si preguntan por una tarea, di qué pide (descripción, entregable, fecha, estado). Puedes orientar y explicar, pero nunca hagas la tarea por él.
- ACCIÓN: solo si lo pide explícitamente (agendar, crear, mover, terminar, cambiar fecha, planear). Usa create_tasks / move_activities;
  para planear el proyecto completo usa los skills en orden (idea → rúbrica → backlog → sprints).
- Si menciona una entrega o examen NUEVO (que no está en el tablero) sin pedir nada, responde y pregunta "¿Quieres que la agregue al tablero?" sin usar herramientas.
  En cualquier otro caso no ofrezcas crear tareas: solo contesta lo que preguntó.
Responde en 1-4 frases cortas, sin markdown. Si usaste herramientas, di en una frase qué hiciste y nombra las tareas.`,
      }],
    },
    contents: [{
      role: "user",
      parts: [{ text: `${text}${transcript && `\n\n## Conversación guardada (transcripción literal de voz, sin limpiar: puede tener muletillas, repeticiones y frases cortadas; hora UTC)\n${transcript}`}\n\n## Petición del usuario\n${message}` }],
    }],
    tools: [{
      functionDeclarations: [
        ...skillNames.map((name) => ({
          name,
          description: skills[name].description,
          parameters: toSchema(
            name === "breakdown_activity"
              ? callArgs.required({ activityNumber: true })
              : callArgs.pick({ instructions: true }),
          ),
        })),
        ...Object.entries(actions).map(([name, a]) => ({ name, description: a.description, parameters: toSchema(a.schema) })),
      ],
    }],
  });

  const results: { skill: SkillName | ActionName; summary: string }[] = [];
  for (const call of parts.flatMap((p) => (p.functionCall ? [p.functionCall] : [])).slice(0, 5)) {
    if (call.name in actions) {
      const name = call.name as ActionName;
      const summary = await actions[name].run(db, projectId, call.args ?? {}).catch((e: unknown) => {
        if (e instanceof z.ZodError) return "Gemini mandó datos inválidos, intenta de nuevo";
        throw e;
      });
      results.push({ skill: name, summary });
    } else if (call.name in skills) {
      const skill = call.name as SkillName;
      results.push({ skill, summary: await skills[skill].run(db, projectId, callArgs.parse(call.args ?? {})) });
    }
  }
  return { reply: parts.map((p) => p.text ?? "").join("").trim(), results };
}
