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

    // Extract JSON by finding first { and last } — handles markdown wrappers
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) throw new Error("No JSON object found in response");
    const jsonStr = raw.slice(start, end + 1);

    const parsed = JSON.parse(jsonStr) as Partial<JudgeOutput> & { scores?: Partial<RoundScores> };

    // Validate required fields with safe defaults
    const scores: Partial<RoundScores> = parsed.scores ?? {};
    const aC = Number(scores.alpha_coherence) || 50;
    const aE = Number(scores.alpha_evidence)  || 50;
    const aR = Number(scores.alpha_rhetoric)  || 50;
    const bC = Number(scores.beta_coherence)  || 50;
    const bE = Number(scores.beta_evidence)   || 50;
    const bR = Number(scores.beta_rhetoric)   || 50;

    const winner = (parsed.winner === "alpha" || parsed.winner === "beta" || parsed.winner === "draw")
      ? parsed.winner
      : (aC + aE + aR > bC + bE + bR ? "alpha" : "beta");

    return {
      winner,
      verdict: parsed.verdict ?? `Ronda ${roundNumber} evaluada.`,
      scores: {
        alpha_coherence: aC, alpha_evidence: aE, alpha_rhetoric: aR,
        alpha_total: Math.round((aC + aE + aR) / 3),
        beta_coherence: bC, beta_evidence: bE, beta_rhetoric: bR,
        beta_total: Math.round((bC + bE + bR) / 3),
      },
      judge_provider: provider.name,
    };
  } catch (e) {
    console.error(`[Judge] Provider ${provider.name} failed: ${e}. Falling back to mock.`);
    return mockJudge(alphaArgument, betaArgument, roundNumber);
  }
}

// ─── Mock judge for development / no-API-key mode ────────────────────────────

function mockJudge(_alpha: string, _beta: string, round: number): JudgeOutput {
  const roll = Math.random();
  const winner: "alpha" | "beta" | "draw" = roll < 0.45 ? "alpha" : roll < 0.90 ? "beta" : "draw";
  const aC = 50 + Math.floor(Math.random() * 30);
  const aE = 50 + Math.floor(Math.random() * 30);
  const aR = 50 + Math.floor(Math.random() * 30);
  const bC = 50 + Math.floor(Math.random() * 30);
  const bE = 50 + Math.floor(Math.random() * 30);
  const bR = 50 + Math.floor(Math.random() * 30);

  return {
    winner,
    verdict: `[MODO DEMO — sin API key] Ronda ${round}: ${winner === "draw" ? "Ambos contendientes empataron." : `${winner === "alpha" ? "Alpha" : "Beta"} obtuvo ventaja marginal.`}`,
    scores: {
      alpha_coherence: aC, alpha_evidence: aE, alpha_rhetoric: aR,
      alpha_total: Math.round((aC + aE + aR) / 3),
      beta_coherence: bC, beta_evidence: bE, beta_rhetoric: bR,
      beta_total: Math.round((bC + bE + bR) / 3),
    },
    judge_provider: "mock",
  };
}
