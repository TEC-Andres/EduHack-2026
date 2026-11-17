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
        .map((a) => `- #${a.number} [${a.status}] ${a.title} (${a.points ?? "?"} pts${a.sprint ? `, ${a.sprint.name}` : ""}${a.criterion ? `, criterio: ${a.criterion.name}` : ""})`)
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

/** Free-form request: Gemini chooses which skills to call (function calling), then we run them in order. */
export async function assistant(db: DB, projectId: number, message: string) {
  const { text } = await context(db, projectId);
  const parts = await gemini({
    systemInstruction: {
      parts: [{
        text: `${BASE}\nTienes skills (herramientas). Para cumplir la petición llama las necesarias en orden lógico
(expandir idea antes que rúbrica, rúbrica antes que backlog, backlog antes que sprints). Si solo es una pregunta o consejo, responde en texto breve sin herramientas.`,
      }],
    },
    contents: [{ role: "user", parts: [{ text: `${text}\n\n## Petición del usuario\n${message}` }] }],
    tools: [{
      functionDeclarations: skillNames.map((name) => ({
        name,
        description: skills[name].description,
        parameters: toSchema(
          name === "breakdown_activity"
            ? callArgs.required({ activityNumber: true })
            : callArgs.pick({ instructions: true }),
        ),
      })),
    }],
  });

  const results: { skill: SkillName; summary: string }[] = [];
  for (const call of parts.flatMap((p) => (p.functionCall ? [p.functionCall] : [])).slice(0, 5)) {
    if (!(call.name in skills)) continue;
    const skill = call.name as SkillName;
    results.push({ skill, summary: await skills[skill].run(db, projectId, callArgs.parse(call.args ?? {})) });
  }
  return { reply: parts.map((p) => p.text ?? "").join("").trim(), results };
}
