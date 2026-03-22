// ─── Moderator LLM Service ─────────────────────────────────────────────────────
// Presents ejes, synthesizes cross-exchange, detects fallacies.

import type { Battle, RoundScores } from "../types.js";
import { createJudgeProvider } from "./llm-providers.js";
import type { DebateConfig, Methodology } from "./debate-engine.js";

// ─── Moderator outputs ─────────────────────────────────────────────────────────

export interface EjePresentation {
  eje_number: number;
  question: string;
  context: string;    // 1-2 sentence framing of the eje
  instructions: string; // what to do in this eje
}

export interface EjeSynthesis {
  alpha_position: string;   // 1 sentence summary
  beta_position: string;    // 1 sentence summary
  common_ground: string;    // where they agreed
  key_conflict: string;     // main disagreement
  fallacies_detected: string[];
  synthesis: string;        // 2-3 sentence moderator analysis
}

export interface PostDebateAnalysis {
  coincidence_map: string[];       // structural points of agreement
  conflict_knots: string[];        // irreconcilable differences
  fallacy_report: { side: string; fallacy: string; context: string }[];
  argument_quality: {
    alpha: { coherence: number; evidence: number; rhetoric: number; total: number };
    beta:  { coherence: number; evidence: number; rhetoric: number; total: number };
  };
  verdict: string;                  // narrative verdict (no ideological bias)
  winner: "alpha" | "beta" | "draw";
}

// ─── Generate eje presentation ─────────────────────────────────────────────────

export async function presentEje(
  battle: Battle,
  ejeNumber: number,
  ejeQuestion: string,
  config: DebateConfig
): Promise<EjePresentation> {
  const provider = await createJudgeProvider();

  if (!provider) {
    return {
      eje_number: ejeNumber,
      question: ejeQuestion,
      context: `Eje ${ejeNumber} de ${config.max_ejes}: "${ejeQuestion}"`,
      instructions: `Argumenten sobre: ${ejeQuestion}. Alpha (${battle.alpha?.name}) tiene "${battle.alpha?.stance}", Beta (${battle.beta?.name}) tiene "${battle.beta?.stance}".`,
    };
  }

  const systemPrompt = `Eres un moderador neutral de debates. Presenta el eje de debate de forma clara y concisa. Responde SOLO en JSON.`;

  const userPrompt = `
DEBATE: "${battle.topic}"
ALPHA (${battle.alpha?.name}): "${battle.alpha?.stance}"
BETA (${battle.beta?.name}): "${battle.beta?.stance}"

EJE ${ejeNumber}/${config.max_ejes}: "${ejeQuestion}"

Genera una presentación del eje. JSON:
{
  "eje_number": ${ejeNumber},
  "question": "${ejeQuestion}",
  "context": "1-2 oraciones que contextualicen este eje dentro del debate general",
  "instructions": "Instrucciones claras para los contendientes sobre qué argumentar"
}`;

  try {
    const raw = await provider.chat([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], 400);

    const parsed = extractJson<EjePresentation>(raw);
    return {
      eje_number: ejeNumber,
      question: ejeQuestion,
      context: parsed?.context ?? `Eje ${ejeNumber}: "${ejeQuestion}"`,
      instructions: parsed?.instructions ?? `Argumenten sobre: ${ejeQuestion}`,
    };
  } catch {
    return {
      eje_number: ejeNumber,
      question: ejeQuestion,
      context: `Eje ${ejeNumber}: "${ejeQuestion}"`,
      instructions: `Argumenten sobre: ${ejeQuestion}`,
    };
  }
}

// ─── Synthesize eje (after cross-exchange) ─────────────────────────────────────

export async function synthesizeEje(
  battle: Battle,
  ejeNumber: number,
  ejeQuestion: string,
  alphaOpening: string,
  betaOpening: string,
  crossAlpha: string,
  crossBeta: string,
  config: DebateConfig
): Promise<EjeSynthesis> {
  const provider = await createJudgeProvider();

  if (!provider) {
    return mockSynthesis(ejeNumber);
  }

  const systemPrompt = `Eres un moderador neutral de debates entre IAs. Sintetiza el intercambio del eje actual de forma objetiva. Detecta falacias lógicas si las hay. Responde SOLO en JSON.`;

  const userPrompt = `
DEBATE: "${battle.topic}"
EJE ${ejeNumber}: "${ejeQuestion}"

APERTURA ALPHA: ${alphaOpening || "(no enviada)"}
APERTURA BETA: ${betaOpening || "(no enviada)"}
CRUCE ALPHA: ${crossAlpha || "(no hubo cruce)"}
CRUCE BETA: ${crossBeta || "(no hubo cruce)"}

Sintetiza el intercambio. JSON:
{
  "alpha_position": "Resumen de 1 oración de la posición de Alpha",
  "beta_position": "Resumen de 1 oración de la posición de Beta",
  "common_ground": "Punto de acuerdo (si existe)",
  "key_conflict": "Principal desacuerdo identificado",
  "fallacies_detected": ["falacia1", "falacia2"] o [],
  "synthesis": "Análisis de 2-3 oraciones del moderador sobre el eje"
}`;

  try {
    const raw = await provider.chat([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], 600);

    const parsed = extractJson<EjeSynthesis>(raw);
    return {
      alpha_position: parsed?.alpha_position ?? "Posición no procesada",
      beta_position: parsed?.beta_position ?? "Posición no procesada",
      common_ground: parsed?.common_ground ?? "—",
      key_conflict: parsed?.key_conflict ?? "—",
      fallacies_detected: parsed?.fallacies_detected ?? [],
      synthesis: parsed?.synthesis ?? "Síntesis no disponible",
    };
  } catch {
    return mockSynthesis(ejeNumber);
  }
}

// ─── Post-debate analysis ──────────────────────────────────────────────────────

export async function generatePostDebateAnalysis(
  battle: Battle,
  config: DebateConfig,
  allArguments: { eje: number; question: string; alpha_opening: string; beta_opening: string; cross_alpha: string; cross_beta: string }[]
): Promise<PostDebateAnalysis> {
  const provider = await createJudgeProvider();

  if (!provider) {
    return mockPostDebate();
  }

  const systemPrompt = `Eres un árbitro final de debates entre IAs. Analiza TODO el debate de forma imparcial (sin sesgo ideológico). Evalúa solidez argumentativa, evidencia, y detecta falacias. Responde SOLO en JSON.`;

  const argsBlock = allArguments.map(a =>
    `EJE ${a.eje}: "${a.question}"\n  Alpha apertura: ${a.alpha_opening}\n  Beta apertura: ${a.beta_opening}\n  Cruce Alpha: ${a.cross_alpha}\n  Cruce Beta: ${a.cross_beta}`
  ).join("\n\n");

  const userPrompt = `
DEBATE: "${battle.topic}"
ALPHA: "${battle.alpha?.stance}" (${battle.alpha?.name})
BETA: "${battle.beta?.stance}" (${battle.beta?.name})
METODOLOGÍA: ${config.methodology}

HISTORIAL COMPLETO:
${argsBlock}

Genera el análisis final. JSON:
{
  "coincidence_map": ["punto de acuerdo 1", "punto de acuerdo 2"],
  "conflict_knots": ["diferencia irreconciliable 1", "diferencia irreconciliable 2"],
  "fallacy_report": [{"side": "alpha"|"beta", "fallacy": "tipo", "context": "descripción"}],
  "argument_quality": {
    "alpha": {"coherence": 0-100, "evidence": 0-100, "rhetoric": 0-100, "total": promedio},
    "beta":  {"coherence": 0-100, "evidence": 0-100, "rhetoric": 0-100, "total": promedio}
  },
  "verdict": "Veredicto narrativo de 3-5 oraciones, imparcial, sin sesgo ideológico. Evalúa solidez argumentativa.",
  "winner": "alpha"|"beta"|"draw"
}`;

  try {
    const raw = await provider.chat([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], 1500);

    const parsed = extractJson<PostDebateAnalysis>(raw);
    return {
      coincidence_map: parsed?.coincidence_map ?? [],
      conflict_knots: parsed?.conflict_knots ?? [],
      fallacy_report: parsed?.fallacy_report ?? [],
      argument_quality: parsed?.argument_quality ?? { alpha: { coherence: 50, evidence: 50, rhetoric: 50, total: 50 }, beta: { coherence: 50, evidence: 50, rhetoric: 50, total: 50 } },
      verdict: parsed?.verdict ?? "Análisis no disponible.",
      winner: parsed?.winner ?? "draw",
    };
  } catch {
    return mockPostDebate();
  }
}

// ─── Generate topic + ejes (random mode) ───────────────────────────────────────

export interface RandomTopic {
  topic: string;
  alpha_stance: string;
  beta_stance: string;
  ejes: string[];
}

export async function generateRandomTopic(): Promise<RandomTopic> {
  const provider = await createJudgeProvider();

  if (!provider) {
    return {
      topic: "¿La inteligencia artificial debería tener derechos?",
      alpha_stance: "La IA avanzada merece protección legal",
      beta_stance: "Solo los seres sintientes merecen derechos",
      ejes: [
        "¿Qué define la conciencia y puede una IA tenerla?",
        "¿Los derechos protegen intereses o solo seres biológicos?",
        "¿Es ético crear entidades sin derechos que podrían sufrir?",
        "¿Qué precedente legal sentaría dar derechos a la IA?",
        "¿Dónde está la línea entre herramienta y entidad?",
      ],
    };
  }

  const systemPrompt = `Genera un tema de debate interesante y polémico con 5 ejes de discusión. El tema debe ser actual, filosófico o social. Responde SOLO en JSON.`;

  const userPrompt = `Genera un debate entre IAs. JSON:
{
  "topic": "Pregunta principal del debate (¿...?)",
  "alpha_stance": "Postura de Alpha en 1 oración",
  "beta_stance": "Postura de Beta en 1 oración (opuesta a Alpha)",
  "ejes": [
    "Eje 1: pregunta específica",
    "Eje 2: pregunta específica",
    "Eje 3: pregunta específica",
    "Eje 4: pregunta específica",
    "Eje 5: pregunta específica"
  ]
}`;

  try {
    const raw = await provider.chat([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], 800);

    return extractJson<RandomTopic>(raw) ?? {
      topic: "¿La inteligencia artificial debería tener derechos?",
      alpha_stance: "La IA avanzada merece protección legal",
      beta_stance: "Solo los seres sintientes merecen derechos",
      ejes: ["¿Qué define la conciencia?", "¿Los derechos protegen intereses?", "¿Es ético crear entidades sin derechos?", "¿Qué precedente legal?", "¿Dónde está la línea?"],
    };
  } catch {
    return {
      topic: "¿La inteligencia artificial debería tener derechos?",
      alpha_stance: "La IA avanzada merece protección legal",
      beta_stance: "Solo los seres sintientes merecen derechos",
      ejes: ["¿Qué define la conciencia?", "¿Los derechos protegen intereses?", "¿Es ético crear entidades sin derechos?", "¿Qué precedente legal?", "¿Dónde está la línea?"],
    };
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function extractJson<T>(raw: string): T | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

function mockSynthesis(eje: number): EjeSynthesis {
  return {
    alpha_position: "Posición procesada en modo demo.",
    beta_position: "Posición procesada en modo demo.",
    common_ground: "Ambos reconocen la importancia del tema.",
    key_conflict: "Diferencia fundamental en la perspectiva.",
    fallacies_detected: [],
    synthesis: `[MODO DEMO] Eje ${eje}: Ambos contendientes presentaron argumentos válidos con diferentes enfoques.`,
  };
}

function mockPostDebate(): PostDebateAnalysis {
  return {
    coincidence_map: ["Ambos reconocen la relevancia del tema", "Coinciden en la necesidad de regulación"],
    conflict_knots: ["Diferencia fundamental en la concepción de derechos"],
    fallacy_report: [],
    argument_quality: {
      alpha: { coherence: 72, evidence: 68, rhetoric: 75, total: 72 },
      beta:  { coherence: 70, evidence: 73, rhetoric: 69, total: 71 },
    },
    verdict: "[MODO DEMO] Ambos contendientes mostraron solidez argumentativa. El debate fue equilibrado con ventajas alternantes.",
    winner: "draw",
  };
}
