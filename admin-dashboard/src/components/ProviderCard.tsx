import { useState } from "react";
import {
  IconCheck,
  IconX,
  IconExternalLink,
  IconKey,
  IconLoader2,
  IconPlugConnected,
} from "@tabler/icons-react";

// ─── Provider metadata ──────────────────────────────────────────────────────────

const PROVIDER_META: Record<string, { label: string; color: string; icon: string }> = {
  anthropic: { label: "ANTHROPIC", color: "text-[#d4a574]", icon: "◆" },
  openai:    { label: "OPENAI",    color: "text-[#10a37f]", icon: "●" },
  google:    { label: "GOOGLE",    color: "text-[#4285f4]", icon: "◉" },
  openrouter:{ label: "OPENROUTER",color: "text-[#8b5cf6]", icon: "◎" },
  groq:      { label: "GROQ",      color: "text-[#f55036]", icon: "◈" },
};

// ─── Component ──────────────────────────────────────────────────────────────────

export function ProviderCard({
  provider,
  connected,
  setupUrl,
  onTest,
  onScrollToKey,
}: {
  provider: string;
  connected: boolean;
  setupUrl: string;
  onTest: (provider: string) => Promise<{ success: boolean; error: string | null }>;
  onScrollToKey: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error: string | null } | null>(null);

  const meta = PROVIDER_META[provider] ?? { label: provider.toUpperCase(), color: "text-text", icon: "◇" };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await onTest(provider);
    setTestResult(result);
    setTesting(false);
  };

  return (
    <div className={`border bg-surface2 p-4 transition-all ${
      connected ? "border-green/40" : "border-borderBright"
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <span className={`text-lg ${meta.color} leading-none`}>{meta.icon}</span>
          <span className={`font-mono text-xs uppercase tracking-widest font-bold ${meta.color}`}>
            {meta.label}
          </span>
        </div>
        <div className={`flex items-center gap-1.5 font-mono text-[0.55rem] uppercase shrink-0 ${
          connected ? "text-green" : "text-textDim"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green animate-pulse" : "bg-borderBright"}`} />
          {connected ? "CONECTADO" : "NO CONECTADO"}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Get API Key link */}
        <a
          href={setupUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 font-mono text-[0.55rem] uppercase tracking-wider px-3 py-1.5 border border-borderBright text-textDim hover:text-text hover:border-text transition-colors"
        >
          <IconExternalLink size={11} />
          OBTENER CLAVE
        </a>

        {/* Scroll to key input */}
        <button
          type="button"
          onClick={onScrollToKey}
          className="flex items-center gap-1.5 font-mono text-[0.55rem] uppercase tracking-wider px-3 py-1.5 border border-borderBright text-textDim hover:text-text hover:border-text transition-colors"
        >
          <IconKey size={11} />
          INGRESAR CLAVE
        </button>

        {/* Test connection — only if connected */}
        {connected && (
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="flex items-center gap-1.5 font-mono text-[0.55rem] uppercase tracking-wider px-3 py-1.5 border border-green/40 text-green hover:bg-green/10 transition-colors disabled:opacity-40"
          >
            {testing ? (
              <IconLoader2 size={11} className="animate-spin" />
            ) : (
              <IconPlugConnected size={11} />
            )}
            {testing ? "PROBANDO..." : "PROBAR"}
          </button>
        )}
      </div>

      {/* Test result */}
      {testResult && (
        <div className={`mt-3 flex items-center gap-2 font-mono text-[0.55rem] uppercase tracking-wider px-3 py-2 border ${
          testResult.success
            ? "bg-green/10 border-green/30 text-green"
            : "bg-alpha/10 border-alpha/30 text-alpha"
        }`}>
          {testResult.success ? <IconCheck size={12} /> : <IconX size={12} />}
          {testResult.success ? "CONEXIÓN EXITOSA" : `ERROR: ${testResult.error ?? "Desconocido"}`}
        </div>
      )}
    </div>
  );
}
