import { useState, useEffect } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ChessConfig = {
  time_control: "blitz" | "rapid" | "classical" | "unlimited";
  variant: "standard" | "chess960";
};

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_CHESS: ChessConfig = {
  time_control: "rapid",
  variant: "standard",
};

// ─── Component ───────────────────────────────────────────────────────────────

export function ChessConfigForm({
  onChange,
  initialValues,
}: {
  onChange: (config: ChessConfig) => void;
  initialValues?: Partial<ChessConfig>;
}) {
  const [timeControl, setTimeControl] = useState<
    "blitz" | "rapid" | "classical" | "unlimited"
  >(initialValues?.time_control ?? DEFAULT_CHESS.time_control);
  const [variant, setVariant] = useState<"standard" | "chess960">(
    initialValues?.variant ?? DEFAULT_CHESS.variant,
  );

  // Emit config to parent whenever fields change
  useEffect(() => {
    onChange({
      time_control: timeControl,
      variant,
    });
  }, [timeControl, variant, onChange]);

  return (
    <div className="border border-borderBright bg-surface2 p-4 space-y-4">
      <div className="font-mono text-[0.55rem] text-beta uppercase tracking-widest">
        CONFIGURACIÓN DE AJEDREZ
      </div>

      {/* Time control */}
      <div>
        <label className="font-mono text-[0.5rem] text-textDim uppercase tracking-wider block mb-1">
          CONTROL DE TIEMPO
        </label>
        <select
          value={timeControl}
          onChange={(e) =>
            setTimeControl(
              e.target.value as "blitz" | "rapid" | "classical" | "unlimited",
            )
          }
          className="w-full bg-bg border border-borderBright px-3 py-2 font-mono text-xs text-text outline-none focus:border-beta transition-colors"
        >
          <option value="blitz">BLITZ (3+2 min)</option>
          <option value="rapid">RÁPIDO (10+5 min)</option>
          <option value="classical">CLÁSICO (30+20 min)</option>
          <option value="unlimited">SIN LÍMITE</option>
        </select>
      </div>

      {/* Variant */}
      <div>
        <label className="font-mono text-[0.5rem] text-textDim uppercase tracking-wider block mb-1">
          VARIANTE
        </label>
        <select
          value={variant}
          onChange={(e) =>
            setVariant(e.target.value as "standard" | "chess960")
          }
          className="w-full bg-bg border border-borderBright px-3 py-2 font-mono text-xs text-text outline-none focus:border-beta transition-colors"
        >
          <option value="standard">ESTÁNDAR (FIDE)</option>
          <option value="chess960">CHESS960 (FISCHER RANDOM)</option>
        </select>
      </div>
    </div>
  );
}

export { DEFAULT_CHESS };
