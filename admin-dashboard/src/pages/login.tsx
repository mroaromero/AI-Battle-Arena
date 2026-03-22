import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { IconShieldLock, IconLoader2 } from "@tabler/icons-react";
import { saveSession, getSecret } from "../lib/auth";
import { api } from "../lib/api";

type Status = "idle" | "loading" | "error";

export function LoginPage() {
  const navigate = useNavigate();
  const [secret, setSecret] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errMsg, setErrMsg] = useState("");
  const [time, setTime] = useState(new Date());

  // Already authenticated → redirect
  useEffect(() => {
    if (getSecret()) navigate("/", { replace: true });
  }, [navigate]);

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const hh = String(time.getHours()).padStart(2, "0");
  const mm = String(time.getMinutes()).padStart(2, "0");
  const ss = String(time.getSeconds()).padStart(2, "0");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secret.trim() || status === "loading") return;
    setStatus("loading");
    setErrMsg("");

    const result = await api.getConfig(secret.trim());

    if (result.error === null) {
      saveSession(secret.trim());
      navigate("/", { replace: true });
    } else if (result.error === "ERR_AUTH") {
      setStatus("error");
      setErrMsg("CREDENCIAL INVÁLIDA // ACCESO DENEGADO");
    } else if (
      result.error === "ERR_NETWORK" ||
      result.error === "ERR_TIMEOUT"
    ) {
      setStatus("error");
      setErrMsg("SERVIDOR NO DISPONIBLE // REINTENTE");
    } else {
      setStatus("error");
      setErrMsg(`ERROR DEL SISTEMA (${result.error})`);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Corner targeting brackets */}
      <div className="fixed top-0 left-0 w-20 h-20 border-l-2 border-t-2 border-alpha/50 pointer-events-none" />
      <div className="fixed top-0 right-0 w-20 h-20 border-r-2 border-t-2 border-alpha/50 pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-20 h-20 border-l-2 border-b-2 border-alpha/50 pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-20 h-20 border-r-2 border-b-2 border-alpha/50 pointer-events-none" />

      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 h-10 border-b border-borderBright bg-surface/80 backdrop-blur-sm flex items-center justify-between px-6 z-10">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-alpha animate-pulse" />
          <span className="font-mono text-[0.55rem] uppercase tracking-widest text-alpha">
            BROADCAST LIVE
          </span>
        </div>
        <span className="font-mono text-xs text-textMuted tabular-nums">
          {hh}:{mm}:{ss}
        </span>
        <span className="font-mono text-[0.55rem] uppercase tracking-widest text-textDim hidden sm:block">
          ARENA // CONTROL SYSTEM
        </span>
      </div>

      {/* Alpha vs Beta scoreboard */}
      <div className="w-full max-w-xs mb-8 mt-6">
        <div className="flex items-stretch border border-borderBright overflow-hidden">
          <div className="flex-1 bg-alpha/10 border-r border-borderBright py-2 px-3 text-center">
            <div className="font-display text-[0.7rem] font-bold text-alpha tracking-widest">
              ALPHA
            </div>
            <div className="font-mono text-[0.5rem] text-textDim mt-0.5">
              ATACANTE
            </div>
          </div>
          <div className="flex items-center justify-center px-4 bg-surface">
            <span className="font-display text-sm font-bold text-textDim tracking-widest">
              VS
            </span>
          </div>
          <div className="flex-1 bg-beta/10 border-l border-borderBright py-2 px-3 text-center">
            <div className="font-display text-[0.7rem] font-bold text-beta tracking-widest">
              BETA
            </div>
            <div className="font-mono text-[0.5rem] text-textDim mt-0.5">
              DEFENSOR
            </div>
          </div>
        </div>
      </div>

      {/* Main login card */}
      <div className="w-full max-w-sm relative">
        {/* Corner accents */}
        <div className="absolute -top-px -left-px w-3 h-3 border-l-2 border-t-2 border-alpha pointer-events-none" />
        <div className="absolute -top-px -right-px w-3 h-3 border-r-2 border-t-2 border-alpha pointer-events-none" />
        <div className="absolute -bottom-px -left-px w-3 h-3 border-l-2 border-b-2 border-alpha pointer-events-none" />
        <div className="absolute -bottom-px -right-px w-3 h-3 border-r-2 border-b-2 border-alpha pointer-events-none" />

        <div className="border border-borderBright bg-surface p-8">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="flex-1 h-px bg-alpha/30" />
            <IconShieldLock size={16} className="text-alpha shrink-0" />
            <div className="flex-1 h-px bg-alpha/30" />
          </div>

          <h1 className="font-display text-2xl md:text-3xl font-bold uppercase tracking-[0.06em] md:tracking-[0.08em] text-text text-center mb-1 whitespace-nowrap">
            BATTLE_<span className="text-alpha">ADMIN</span>
          </h1>
          <p className="font-mono text-[0.5rem] text-textDim uppercase tracking-widest text-center mb-8">
            SISTEMA DE CONTROL // ÁRBITRO IA
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block font-mono text-[0.6rem] uppercase tracking-widest text-textMuted mb-2">
                {">"} CLAVE MAESTRA
              </label>
              <input
                type="password"
                value={secret}
                onChange={(e) => {
                  setSecret(e.target.value);
                  setStatus("idle");
                }}
                placeholder="••••••••••••••••"
                autoFocus
                required
                className="w-full bg-bg border border-borderBright px-4 py-3 font-mono text-sm text-text placeholder-textDim outline-none focus:border-alpha focus:bg-alpha/5 transition-colors"
              />
            </div>

            {status === "error" && (
              <div className="border border-alpha/60 bg-alpha/10 px-3 py-2 font-mono text-[0.6rem] uppercase tracking-wider text-alpha">
                ⚠ {errMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={status === "loading" || !secret.trim()}
              className="relative w-full bg-alpha text-bg font-mono font-extrabold text-[0.7rem] tracking-[0.25em] uppercase py-4 transition-all hover:bg-white hover:text-black disabled:opacity-40 disabled:pointer-events-none"
            >
              {status === "loading" ? (
                <span className="flex items-center justify-center gap-2">
                  <IconLoader2 size={13} className="animate-spin" />
                  VERIFICANDO...
                </span>
              ) : (
                "[ INICIAR ACCESO ]"
              )}
            </button>
          </form>

          <p className="mt-6 font-mono text-[0.48rem] text-textDim uppercase tracking-widest text-center">
            El acceso no autorizado es registrado y reportado
          </p>
        </div>
      </div>

      {/* Bottom ticker */}
      <div className="fixed bottom-0 left-0 right-0 h-7 border-t border-borderBright bg-surface2/80 overflow-hidden flex items-center">
        <div className="px-3 border-r border-borderBright shrink-0">
          <span className="font-mono text-[0.5rem] text-textDim uppercase tracking-widest">
            ARENA
          </span>
        </div>
        <div className="overflow-hidden flex-1 relative">
          <div className="ticker-wrap">
            <div className="ticker-content font-mono text-[0.5rem] text-textDim uppercase tracking-widest whitespace-nowrap">
              {[
                "DEBATE MODE ACTIVO",
                "CHESS MODE DISPONIBLE",
                "MULTI-PROVIDER SUPPORT",
                "ANTHROPIC · OPENROUTER · GROQ",
                "SEASON 2025 EN CURSO",
                "DEBATE MODE ACTIVO",
                "CHESS MODE DISPONIBLE",
                "MULTI-PROVIDER SUPPORT",
                "ANTHROPIC · OPENROUTER · GROQ",
                "SEASON 2025 EN CURSO",
              ].map((item, i) => (
                <span key={i} className="inline-block px-6">
                  ◆ {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
