import "server-only";

import { embed } from "./gemini";

/**
 * Playbooks: reusable "scripts" of work for common kinds of projects, one chunk per phase.
 * The RAG pulls the phases most similar to the user's idea and feeds them to the backlog/sprint skills,
 * so even a vague idea gets a complete, ordered set of tasks.
 * Add a playbook by adding an entry here; each "## " heading becomes a retrievable chunk.
 */
const PLAYBOOKS: Record<string, string> = {
  "Aplicación web": `
## Descubrimiento
- Entrevistar a 3-5 usuarios objetivo y documentar sus problemas
- Definir el MVP: historias de usuario priorizadas (MoSCoW)
## Diseño
- Wireframes de las pantallas principales (Figma)
- Modelo de datos (diagrama entidad-relación) y diseño de la API
## Desarrollo
- Configurar repositorio, CI y despliegue inicial (Vercel/Render)
- Autenticación de usuarios
- CRUD de la entidad principal con validación
- Interfaz responsiva y accesible
## Calidad y entrega
- Pruebas unitarias y de integración de los flujos críticos
- Prueba de usabilidad con usuarios reales y correcciones
- README, video demo y presentación final`,

  "App móvil": `
## Descubrimiento
- Investigación de usuarios y apps competidoras
- Definir funcionalidades del MVP y plataforma (Android/iOS/multiplataforma)
## Diseño
- Flujo de navegación y prototipo interactivo
- Definir backend/almacenamiento (Firebase, Supabase, API propia)
## Desarrollo
- Proyecto base (Flutter/React Native) con navegación
- Pantallas principales y conexión al backend
- Permisos del dispositivo (cámara, ubicación, notificaciones) si aplica
## Calidad y entrega
- Pruebas en dispositivos reales
- Build de distribución (APK/TestFlight), video demo y presentación`,

  "Ciencia de datos / Machine Learning": `
## Planteamiento
- Formular la pregunta o problema de predicción y la métrica de éxito
- Revisión de literatura y soluciones existentes
## Datos
- Obtener o recolectar el dataset y documentar su origen y licencia
- Limpieza, análisis exploratorio (EDA) y visualizaciones
- Ingeniería de características y división train/validation/test
## Modelado
- Modelo base (baseline) simple
- Entrenar y comparar al menos 2 modelos más; ajuste de hiperparámetros
- Análisis de errores, sesgos e interpretabilidad
## Entrega
- Notebook reproducible y reporte técnico
- Demo (dashboard o API) y presentación de resultados`,

  "Investigación / reporte académico": `
## Planteamiento
- Pregunta de investigación, objetivos e hipótesis
- Búsqueda y fichaje de fuentes (mínimo 10 confiables)
## Metodología
- Diseñar instrumento (encuesta, entrevista, experimento)
- Validar instrumento con un piloto
## Ejecución
- Aplicar instrumento y recolectar datos
- Análisis cualitativo/cuantitativo de resultados
## Redacción y entrega
- Borrador: introducción, marco teórico, metodología, resultados, conclusiones
- Revisión de citas en formato APA y revisión por pares
- Documento final y exposición`,

  "Hardware / IoT": `
## Diseño
- Requerimientos y diagrama de bloques del sistema
- Selección de componentes y presupuesto (BOM)
## Prototipo
- Montaje en protoboard y pruebas de cada sensor/actuador
- Firmware base (Arduino/ESP32) y comunicación (WiFi/BLE/MQTT)
- Dashboard o app para visualizar datos
## Integración
- Diseño de carcasa (impresión 3D) y PCB o placa perforada
- Pruebas de integración, consumo y calibración
## Entrega
- Documentación de conexiones y código, video demo y presentación`,

  "Videojuego": `
## Concepto
- Documento de diseño (GDD): mecánicas, público, estilo
- Prototipo en papel o greybox de la mecánica principal
## Producción
- Configurar motor (Unity/Godot) y control de versiones
- Implementar mecánica principal, controles y cámara
- Arte, sonido e interfaz (menús, HUD)
- Diseñar niveles
## Pulido y entrega
- Playtesting con usuarios y balanceo
- Build ejecutable, tráiler y presentación`,

  "Emprendimiento / pitch": `
## Validación
- Definir problema, segmento de clientes y propuesta de valor (Lean Canvas)
- Entrevistas de validación con clientes potenciales
- Análisis de competencia y tamaño de mercado
## Solución
- Prototipo o MVP mínimo para validar
- Modelo de negocio, costos e ingresos proyectados
## Entrega
- Pitch deck (problema, solución, mercado, modelo, equipo, pedido)
- Ensayo del pitch con retroalimentación y presentación final`,

  "Trabajo en equipo Scrum (transversal)": `
## Organización
- Definir roles (Product Owner, Scrum Master, equipo) y acuerdos de trabajo
- Configurar tablero, repositorio y canal de comunicación
## Cierre de cada sprint
- Sprint review: demo del incremento al profesor/usuarios
- Retrospectiva: qué funcionó, qué mejorar, acciones concretas`,
};

type Chunk = { text: string; vec: number[] };

// shortcut: embeddings cached in memory per server instance; move to pgvector if playbooks grow past a few hundred chunks
let index: Promise<Chunk[]> | null = null;

function chunks() {
  return Object.entries(PLAYBOOKS).flatMap(([name, body]) =>
    body.split(/^## /m).slice(1).map((section) => `[${name}] ${section.trim()}`),
  );
}

export function cosine(a: number[], b: number[]) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! ** 2;
    nb += b[i]! ** 2;
  }
  return dot / (Math.sqrt(na * nb) || 1);
}

/** Top-k playbook phases most relevant to the query, as markdown ready to paste into a prompt. */
export async function retrievePlaybooks(query: string, k = 6) {
  index ??= (async () => {
    const texts = chunks();
    const vecs = await embed(texts, "RETRIEVAL_DOCUMENT");
    return texts.map((text, i) => ({ text, vec: vecs[i]! }));
  })().catch((e: unknown) => {
    index = null; // don't cache a failed build
    throw e;
  });
  const [all, [q]] = await Promise.all([index, embed([query], "RETRIEVAL_QUERY")]);
  return all
    .map((c) => ({ c, score: cosine(q!, c.vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(({ c }) => c.text)
    .join("\n\n");
}
