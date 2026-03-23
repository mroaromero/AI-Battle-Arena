export type ModelOption = { id: string; name: string };

export function ModelSelector({
  provider,
  currentModel,
  availableModels,
  onChange,
}: {
  provider: string;
  currentModel: string;
  availableModels: ModelOption[];
  onChange: (modelId: string) => void;
}) {
  const displayName = provider.toUpperCase();
  const edited = currentModel !== "";

  return (
    <div
      className={`border bg-surface2 p-4 transition-colors ${
        edited ? "border-gold/60" : "border-borderBright"
      }`}
    >
      <div className="flex items-center justify-between gap-4 mb-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-text font-bold">
            MODELO: {displayName}
          </div>
        </div>
        {edited && (
          <span className="font-mono text-[0.5rem] text-gold uppercase tracking-wider shrink-0">
            EDITADO
          </span>
        )}
      </div>

      <select
        value={currentModel}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-bg border border-borderBright px-3 py-2 font-mono text-xs text-text outline-none focus:border-alpha transition-colors"
      >
        {availableModels.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </div>
  );
}
