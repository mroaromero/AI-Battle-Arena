import { useState, useEffect } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

export type DebateConfig = {
  mode: "manual" | "random";
  ejes: string[];
  judges: string[];
  methodology: "logica" | "retorica" | "academica";
  moderator_enabled: boolean;
  timers: {
    total_minutes: number;
    opening_seconds: number;
    cross_seconds: number;
    synthesis_seconds: number;
    present_seconds: number;
  };
  max_ejes: number;
};

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_DEBATE: DebateConfig = {
  mode: "manual",
  ejes: ["", "", "", "", ""],
  judges: ["anthropic"],
  methodology: "retorica",
  moderator_enabled: true,
  timers: {
    total_minutes: 20,
    opening_seconds: 30,
    cross_seconds: 120,
    synthesis_seconds: 45,
    present_seconds: 15,
  },
  max_ejes: 0,
};

// ─── Component ───────────────────────────────────────────────────────────────

export function DebateConfigForm({
  onChange,
  initialValues,
}: {
  onChange: (config: DebateConfig | null) => void;
  initialValues?: Partial<DebateConfig>;
}) {
  const [debateMode, _setDebateMode] = useState<"manual" | "random">(
    initialValues?.mode ?? DEFAULT_DEBATE.mode,
  );
  const [ejes, setEjes] = useState<string[]>(
    initialValues?.ejes ?? DEFAULT_DEBATE.ejes,
  );
  const [judges, setJudges] = useState<string[]>(
    initialValues?.judges ?? DEFAULT_DEBATE.judges,
  );
  const [methodology, setMethodology] = useState<
    "logica" | "retorica" | "academica"
  >(initialValues?.methodology ?? DEFAULT_DEBATE.methodology);
  const [moderatorEnabled, setModeratorEnabled] = useState(
    initialValues?.moderator_enabled ?? DEFAULT_DEBATE.moderator_enabled,
  );
  const [timerTotal, setTimerTotal] = useState(
    initialValues?.timers?.total_minutes ??
      DEFAULT_DEBATE.timers.total_minutes,
  );
  const [timerOpening, setTimerOpening] = useState(
    initialValues?.timers?.opening_seconds ??
      DEFAULT_DEBATE.timers.opening_seconds,
  );
  const [timerCross, setTimerCross] = useState(
    initialValues?.timers?.cross_seconds ??
      DEFAULT_DEBATE.timers.cross_seconds,
  );
  const [timerSynthesis, setTimerSynthesis] = useState(
    initialValues?.timers?.synthesis_seconds ??
      DEFAULT_DEBATE.timers.synthesis_seconds,
  );

  // Emit config to parent whenever fields change
  useEffect(() => {
    const validEjes = ejes.filter((e) => e.trim());
    if (validEjes.length < 1) {
      onChange(null);
      return;
    }
    onChange({
      mode: debateMode,
      ejes: validEjes,
      judges: judges.length ? judges : ["anthropic"],
      methodology,
      moderator_enabled: moderatorEnabled,
      timers: {
        total_minutes: timerTotal,
        opening_seconds: timerOpening,
        cross_seconds: timerCross,
        synthesis_seconds: timerSynthesis,
        present_seconds: 15,
      },
      max_ejes: validEjes.length,
    });
  }, [
    debateMode,
    ejes,
    judges,
    methodology,
    moderatorEnabled,
    timerTotal,
    timerOpening,
    timerCross,
    timerSynthesis,
    onChange,
  ]);

  return (
    <div className="border border-borderBright bg-surface2 p-4 space-y-4">
      <div className="font-mono text-[0.55rem] text-gold uppercase tracking-widest">
        CONFIGURACIÓN DE DEBATE
      </div>

      {/* Ejes */}
      <div>
        <label className="font-mono text-[0.5rem] text-textDim uppercase tracking-wider block mb-1">
          EJES DE DEBATE (SUB-PREGUNTAS)
        </label>
        {ejes.map((eje, i) => (
          <input
            key={i}
            type="text"
            value={eje}
            onChange={(e) => {
              const newEjes = [...ejes];
              newEjes[i] = e.target.value;
              setEjes(newEjes);
            }}
            placeholder={`Eje ${i + 1}: ¿...?`}
            className="w-full bg-bg border border-borderBright px-3 py-2 font-mono text-xs text-text placeholder-textDim outline-none focus:border-gold transition-colors mb-1"
          />
        ))}
      </div>

      {/* Judges */}
      <div>
        <label className="font-mono text-[0.5rem] text-textDim uppercase tracking-wider block mb-1">
          PANEL DE JUECES
        </label>
        <div className="flex gap-2">
          {["anthropic", "openai", "google", "openrouter", "groq"].map((j) => (
            <label
              key={j}
              className="flex items-center gap-1.5 font-mono text-xs text-text cursor-pointer"
            >
              <input
                type="checkbox"
                checked={judges.includes(j)}
                onChange={(e) => {
                  const newJudges = e.target.checked
                    ? [...judges, j]
                    : judges.filter((x) => x !== j);
                  setJudges(
                    newJudges.length ? newJudges : ["anthropic"],
                  );
                }}
                className="accent-gold"
              />
              {j.toUpperCase()}
            </label>
          ))}
        </div>
      </div>

      {/* Methodology */}
      <div>
        <label className="font-mono text-[0.5rem] text-textDim uppercase tracking-wider block mb-1">
          METODOLOGÍA DE EVALUACIÓN
        </label>
        <select
          value={methodology}
          onChange={(e) =>
            setMethodology(
              e.target.value as "logica" | "retorica" | "academica",
            )
          }
          className="w-full bg-bg border border-borderBright px-3 py-2 font-mono text-xs text-text outline-none focus:border-gold transition-colors"
        >
          <option value="logica">
            LÓGICA (50% coherencia, 35% evidencia, 15% retórica)
          </option>
          <option value="retorica">
            RETÓRICA (20% coherencia, 25% evidencia, 55% retórica)
          </option>
          <option value="academica">
            ACADÉMICA (30% coherencia, 50% evidencia, 20% retórica)
          </option>
        </select>
      </div>

      {/* Moderator */}
      <label className="flex items-center gap-2 font-mono text-xs text-text cursor-pointer">
        <input
          type="checkbox"
          checked={moderatorEnabled}
          onChange={(e) => setModeratorEnabled(e.target.checked)}
          className="accent-gold"
        />
        MODERADOR LLM (síntesis + detección de falacias)
      </label>

      {/* Timers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <label className="font-mono text-[0.5rem] text-textDim uppercase tracking-wider block mb-0.5">
            TOTAL (MIN)
          </label>
          <input
            type="number"
            value={timerTotal}
            min={5}
            max={60}
            onChange={(e) => setTimerTotal(parseInt(e.target.value) || 20)}
            className="w-full bg-bg border border-borderBright px-2 py-1.5 font-mono text-xs text-text outline-none focus:border-gold"
          />
        </div>
        <div>
          <label className="font-mono text-[0.5rem] text-textDim uppercase tracking-wider block mb-0.5">
            APERTURA (S)
          </label>
          <input
            type="number"
            value={timerOpening}
            min={10}
            max={120}
            onChange={(e) => setTimerOpening(parseInt(e.target.value) || 30)}
            className="w-full bg-bg border border-borderBright px-2 py-1.5 font-mono text-xs text-text outline-none focus:border-gold"
          />
        </div>
        <div>
          <label className="font-mono text-[0.5rem] text-textDim uppercase tracking-wider block mb-0.5">
            CRUCE (S)
          </label>
          <input
            type="number"
            value={timerCross}
            min={30}
            max={600}
            onChange={(e) => setTimerCross(parseInt(e.target.value) || 120)}
            className="w-full bg-bg border border-borderBright px-2 py-1.5 font-mono text-xs text-text outline-none focus:border-gold"
          />
        </div>
        <div>
          <label className="font-mono text-[0.5rem] text-textDim uppercase tracking-wider block mb-0.5">
            SÍNTESIS (S)
          </label>
          <input
            type="number"
            value={timerSynthesis}
            min={15}
            max={120}
            onChange={(e) => setTimerSynthesis(parseInt(e.target.value) || 45)}
            className="w-full bg-bg border border-borderBright px-2 py-1.5 font-mono text-xs text-text outline-none focus:border-gold"
          />
        </div>
      </div>
    </div>
  );
}

export { DEFAULT_DEBATE };
