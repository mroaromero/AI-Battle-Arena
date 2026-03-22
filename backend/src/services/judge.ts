import type { Battle, RoundScores } from "../types.js";
import { createJudgeProvider } from "./llm-providers.js";
import { getMethodologyWeights, type Methodology } from "./debate-engine.js";

// ─── Judge Output ─────────────────────────────────────────────────────────────

interface JudgeOutput {
  winner: "alpha" | "beta" | "draw";
  verdict: string;
  scores: RoundScores;
  judge_provider?: string;
}

// ─── Panel Output (aggregated from multiple judges) ────────────────────────────

export interface PanelJudgeScore {
  judge_name: string;
  winner: "alpha" | "beta" | "draw";
  scores: RoundScores;
}

export interface PanelOutput {
  winner: "alpha" | "beta" | "draw";
  verdict: string;
  scores: RoundScores;
  panel: PanelJudgeScore[];
  consensus: boolean;  // true if all judges agreed
}

// ─── Judge a single eje with methodology weighting ─────────────────────────────

export function applyMethodology(scores: RoundScores, methodology: Methodology): { alpha_total: number; beta_total: number } {
  const w = getMethodologyWeights(methodology);
  const alphaWeighted = Math.round(
    scores.alpha_coherence * w.coherence +
    scores.alpha_evidence * w.evidence +
    scores.alpha_rhetoric * w.rhetoric
  );
  const betaWeighted = Math.round(
    scores.beta_coherence * w.coherence +
    scores.beta_evidence * w.evidence +
    scores.beta_rhetoric * w.rhetoric
  );
  return { alpha_total: alphaWeighted, beta_total: betaWeighted };
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

// ─── Panel judge — multiple judges score, results aggregated ────────────────────

export async function judgePanel(
  battle: Battle,
  ejeNumber: number,
  alphaArgument: string,
  betaArgument: string,
  methodology: Methodology,
  judgeNames: string[] = ["anthropic"]
): Promise<PanelOutput> {
  // In mock mode, return single mock judge
  const provider = await createJudgeProvider();
  if (!provider) {
    const mock = mockJudge(alphaArgument, betaArgument, ejeNumber);
    const weighted = applyMethodology(mock.scores, methodology);
    return {
      winner: mock.winner,
      verdict: mock.verdict,
      scores: { ...mock.scores, alpha_total: weighted.alpha_total, beta_total: weighted.beta_total },
      panel: [{ judge_name: "mock", winner: mock.winner, scores: mock.scores }],
      consensus: true,
    };
  }

  // Run each judge (sequentially to avoid rate limits)
  const panelResults: PanelJudgeScore[] = [];

  for (const judgeName of judgeNames) {
    try {
      const result = await judgeRound(battle, ejeNumber, alphaArgument, betaArgument);
      panelResults.push({
        judge_name: result.judge_provider ?? judgeName,
        winner: result.winner,
        scores: result.scores,
      });
    } catch (e) {
      console.error(`[Panel] Judge ${judgeName} failed: ${e}`);
      panelResults.push({
        judge_name: judgeName,
        winner: "draw",
        scores: {
          alpha_coherence: 50, alpha_evidence: 50, alpha_rhetoric: 50, alpha_total: 50,
          beta_coherence: 50, beta_evidence: 50, beta_rhetoric: 50, beta_total: 50,
        },
      });
    }
  }

  // Aggregate: average scores across judges
  const count = panelResults.length;
  const avgScores: RoundScores = {
    alpha_coherence: Math.round(panelResults.reduce((s, p) => s + p.scores.alpha_coherence, 0) / count),
    alpha_evidence: Math.round(panelResults.reduce((s, p) => s + p.scores.alpha_evidence, 0) / count),
    alpha_rhetoric: Math.round(panelResults.reduce((s, p) => s + p.scores.alpha_rhetoric, 0) / count),
    alpha_total: Math.round(panelResults.reduce((s, p) => s + p.scores.alpha_total, 0) / count),
    beta_coherence: Math.round(panelResults.reduce((s, p) => s + p.scores.beta_coherence, 0) / count),
    beta_evidence: Math.round(panelResults.reduce((s, p) => s + p.scores.beta_evidence, 0) / count),
    beta_rhetoric: Math.round(panelResults.reduce((s, p) => s + p.scores.beta_rhetoric, 0) / count),
    beta_total: Math.round(panelResults.reduce((s, p) => s + p.scores.beta_total, 0) / count),
  };

  // Apply methodology weights
  const weighted = applyMethodology(avgScores, methodology);
  const finalScores = { ...avgScores, alpha_total: weighted.alpha_total, beta_total: weighted.beta_total };

  // Determine winner: majority vote, then by total score
  const alphaWins = panelResults.filter(p => p.winner === "alpha").length;
  const betaWins = panelResults.filter(p => p.winner === "beta").length;
  const draws = panelResults.filter(p => p.winner === "draw").length;

  let winner: "alpha" | "beta" | "draw";
  if (alphaWins > betaWins && alphaWins > draws) winner = "alpha";
  else if (betaWins > alphaWins && betaWins > draws) winner = "beta";
  else if (alphaWins === betaWins && alphaWins > 0) {
    // Tiebreak by total score
    winner = weighted.alpha_total > weighted.beta_total ? "alpha" : weighted.beta_total > weighted.alpha_total ? "beta" : "draw";
  } else winner = "draw";

  const consensus = panelResults.every(p => p.winner === winner);

  const verdict = consensus
    ? `Panel unánime: ${winner.toUpperCase()} (${count} jueces)`
    : `Panel dividido (${count} jueces). Mayoría: ${winner.toUpperCase()}. Jueces: ${panelResults.map(p => `${p.judge_name}→${p.winner}`).join(", ")}`;

  return {
    winner,
    verdict,
    scores: finalScores,
    panel: panelResults,
    consensus,
  };
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
    verdict: `[MODO DEMO — sin API key] Eje ${round}: ${winner === "draw" ? "Ambos contendientes empataron." : `${winner === "alpha" ? "Alpha" : "Beta"} obtuvo ventaja marginal.`}`,
    scores: {
      alpha_coherence: aC, alpha_evidence: aE, alpha_rhetoric: aR,
      alpha_total: Math.round((aC + aE + aR) / 3),
      beta_coherence: bC, beta_evidence: bE, beta_rhetoric: bR,
      beta_total: Math.round((bC + bE + bR) / 3),
    },
    judge_provider: "mock",
  };
}
