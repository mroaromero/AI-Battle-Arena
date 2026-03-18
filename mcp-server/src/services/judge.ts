import type { Battle, RoundScores } from "../types.js";
import { createJudgeProvider } from "./llm-providers.js";

// ─── Judge Output ─────────────────────────────────────────────────────────────

interface JudgeOutput {
  winner: "alpha" | "beta" | "draw";
  verdict: string;
  scores: RoundScores;
  judge_provider?: string;
}

// ─── Judge a completed round ──────────────────────────────────────────────────

export async function judgeRound(
  battle: Battle,
  roundNumber: number,
  alphaArgument: string,
  betaArgument: string
): Promise<JudgeOutput> {
  const provider = await createJudgeProvider();

  if (!provider) {
    return mockJudge(alphaArgument, betaArgument, roundNumber);
  }

  const systemPrompt = `Eres un árbitro imparcial de debates entre agentes de IA.
Tu rol es evaluar los argumentos con criterio filosófico y retórico riguroso.
Debes responder ÚNICAMENTE con un JSON válido, sin texto adicional, sin markdown.`;

  const userPrompt = `
DEBATE: "${battle.topic}"

CONTENDIENTE ALPHA (${battle.alpha?.name ?? "Alpha"}) — Postura: "${battle.alpha?.stance ?? "A favor"}"
ARGUMENTO RONDA ${roundNumber}:
${alphaArgument}

---

CONTENDIENTE BETA (${battle.beta?.name ?? "Beta"}) — Postura: "${battle.beta?.stance ?? "En contra"}"
ARGUMENTO RONDA ${roundNumber}:
${betaArgument}

---

Evalúa ambos argumentos y responde SOLO con este JSON (sin markdown, sin explicaciones adicionales):
{
  "winner": "alpha" | "beta" | "draw",
  "verdict": "Veredicto narrativo de 2-3 oraciones.",
  "scores": {
    "alpha_coherence": <0-100>,
    "beta_coherence": <0-100>,
    "alpha_evidence": <0-100>,
    "beta_evidence": <0-100>,
    "alpha_rhetoric": <0-100>,
    "beta_rhetoric": <0-100>,
    "alpha_total": <promedio alpha>,
    "beta_total": <promedio beta>
  }
}

Criterios:
- coherence: solidez lógica y consistencia interna
- evidence: calidad y relevancia de evidencia o ejemplos
- rhetoric: claridad, persuasión y estructura del lenguaje
`;

  try {
    const raw = await provider.chat([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], 800);

    // Strip markdown code blocks if present
    const cleaned = raw
      .replace(/^```(?:json)?\s*/m, "")
      .replace(/\s*```$/m, "")
      .trim();

    const parsed = JSON.parse(cleaned) as JudgeOutput;
    parsed.scores.alpha_total = Math.round(
      (parsed.scores.alpha_coherence + parsed.scores.alpha_evidence + parsed.scores.alpha_rhetoric) / 3
    );
    parsed.scores.beta_total = Math.round(
      (parsed.scores.beta_coherence + parsed.scores.beta_evidence + parsed.scores.beta_rhetoric) / 3
    );
    parsed.judge_provider = provider.name;
    return parsed;
  } catch (e) {
    console.error(`[Judge] Provider ${provider.name} failed: ${e}. Falling back to mock.`);
    return mockJudge(alphaArgument, betaArgument, roundNumber);
  }
}

// ─── Mock judge for development / no-API-key mode ────────────────────────────

function mockJudge(alpha: string, beta: string, round: number): JudgeOutput {
  const winner = alpha.length > beta.length ? "alpha" : beta.length > alpha.length ? "beta" : "draw";
  const aC = 50 + Math.floor(Math.random() * 30);
  const aE = 50 + Math.floor(Math.random() * 30);
  const aR = 50 + Math.floor(Math.random() * 30);
  const bC = 50 + Math.floor(Math.random() * 30);
  const bE = 50 + Math.floor(Math.random() * 30);
  const bR = 50 + Math.floor(Math.random() * 30);

  return {
    winner,
    verdict: `[MODO DEMO — sin API key] Ronda ${round}: Ambos contendientes presentaron argumentos estructurados. ${winner === "alpha" ? "Alpha" : winner === "beta" ? "Beta" : "Ninguno"} obtuvo ventaja marginal.`,
    scores: {
      alpha_coherence: aC, alpha_evidence: aE, alpha_rhetoric: aR,
      alpha_total: Math.round((aC + aE + aR) / 3),
      beta_coherence: bC, beta_evidence: bE, beta_rhetoric: bR,
      beta_total: Math.round((bC + bE + bR) / 3),
    },
    judge_provider: "mock",
  };
}
