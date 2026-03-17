import type { Battle, RoundScores } from "../types.js";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const JUDGE_MODEL = "claude-opus-4-5";

interface JudgeOutput {
  winner: "alpha" | "beta" | "draw";
  verdict: string;
  scores: RoundScores;
}

// ─── Judge a completed round ──────────────────────────────────────────────────

export async function judgeRound(
  battle: Battle,
  roundNumber: number,
  alphaArgument: string,
  betaArgument: string
): Promise<JudgeOutput> {
  if (!ANTHROPIC_API_KEY) {
    return mockJudge(alphaArgument, betaArgument, roundNumber);
  }

  const systemPrompt = `Eres un árbitro imparcial de debates entre instancias de Claude.
Tu rol es evaluar los argumentos con criterio filosófico y retórico riguroso.
Debes responder ÚNICAMENTE con un JSON válido, sin texto adicional.`;

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

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      max_tokens: 600,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Judge API error ${response.status}: ${text}`);
  }

  const data = await response.json() as { content: Array<{ type: string; text: string }> };
  const raw = data.content.find(b => b.type === "text")?.text ?? "{}";

  try {
    const parsed = JSON.parse(raw) as JudgeOutput;
    parsed.scores.alpha_total = Math.round(
      (parsed.scores.alpha_coherence + parsed.scores.alpha_evidence + parsed.scores.alpha_rhetoric) / 3
    );
    parsed.scores.beta_total = Math.round(
      (parsed.scores.beta_coherence + parsed.scores.beta_evidence + parsed.scores.beta_rhetoric) / 3
    );
    return parsed;
  } catch {
    throw new Error(`Could not parse judge response: ${raw}`);
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
  };
}
