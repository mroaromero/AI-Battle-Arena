import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconSettings,
  IconLogout,
  IconActivity,
  IconMenu2,
  IconX,
} from "@tabler/icons-react";
import { clearSession } from "../lib/auth";

const TICKER_ITEMS = [
  "BATTLE ARENA v2.0 // ÁRBITRO IA EN LÍNEA",
  "ALPHA vs BETA // COMBATES MULTI-PROVEEDOR",
  "POWERED BY ANTHROPIC · OPENROUTER · GROQ",
  "DEBATE MODE & CHESS MODE DISPONIBLES",
  "SEASON 2025 // REGISTRO ACTIVO",
];

export function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [time, setTime] = useState(new Date());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const handleLogout = () => {
    clearSession();
    navigate("/login", { replace: true });
  };

  const hh = String(time.getHours()).padStart(2, "0");
  const mm = String(time.getMinutes()).padStart(2, "0");
  const ss = String(time.getSeconds()).padStart(2, "0");

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <header className="h-14 border-b border-borderBright bg-surface flex items-center justify-between px-4 sticky top-0 z-30 shrink-0">
        {/* Left: logo + mobile burger */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setOpen((v) => !v)}
            className="md:hidden text-textMuted hover:text-text transition-colors"
          >
            {open ? <IconX size={18} /> : <IconMenu2 size={18} />}
          </button>
          <span className="font-display font-bold text-sm md:text-base tracking-[0.08em] md:tracking-[0.15em] text-text cursor-default select-none whitespace-nowrap">
            BATTLE_<span className="text-alpha">ADMIN</span>
          </span>
        </div>

        {/* Center: live badge */}
        <div className="hidden sm:flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-alpha animate-pulse" />
          <span className="font-mono text-[0.6rem] uppercase tracking-widest text-alpha">
            BROADCAST LIVE
          </span>
        </div>

        {/* Right: clock + logout */}
        <div className="flex items-center gap-4">
          <span className="font-mono text-sm text-textMuted hidden sm:block tabular-nums">
            {hh}:{mm}:{ss}
          </span>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 font-mono text-[0.65rem] uppercase tracking-widest text-textMuted hover:text-alpha border border-borderBright hover:border-alpha px-3 py-1.5 transition-colors"
          >
            <IconLogout size={13} />
            <span className="hidden sm:inline">DESCONECTAR</span>
          </button>
        </div>
      </header>

      {/* ── BODY ───────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Mobile overlay */}
        {open && (
          <div
            className="fixed inset-0 bg-black/70 z-20 md:hidden"
            onClick={() => setOpen(false)}
          />
        )}

        {/* ── SIDEBAR ──────────────────────────────────────────────────── */}
        <aside
          className={`
          fixed md:static top-14 bottom-0 left-0 z-20
          w-56 bg-surface border-r border-borderBright
          flex flex-col shrink-0
          transform transition-transform duration-200
          md:translate-x-0
          ${open ? "translate-x-0" : "-translate-x-full"}
        `}
        >
          <div className="p-4 border-b border-borderBright">
            <p className="font-mono text-[0.55rem] text-textDim uppercase tracking-widest">
              // MÓDULOS DE CONTROL
            </p>
          </div>

          <nav className="p-3 flex-1">
            {/* Only one module for now */}
            <button
              onClick={() => {
                navigate("/");
                setOpen(false);
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 font-mono text-[0.65rem] uppercase tracking-widest text-text bg-alpha-dim border-l-2 border-alpha transition-all"
            >
              <IconSettings size={13} />
              ÁRBITRO IA
            </button>
          </nav>

          {/* Sidebar footer */}
          <div className="p-4 border-t border-borderBright space-y-2">
            <div className="flex items-center gap-2 font-mono text-[0.55rem] text-green uppercase tracking-widest">
              <IconActivity size={10} />
              SISTEMA EN LÍNEA
            </div>
            <p className="font-mono text-[0.5rem] text-textDim">
              BATTLE ARENA v2.0.0
            </p>
          </div>
        </aside>

        {/* ── MAIN ─────────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6">{children}</div>
        </main>
      </div>

      {/* ── TICKER ─────────────────────────────────────────────────────── */}
      <div className="border-t border-borderBright bg-surface2 h-7 overflow-hidden shrink-0 flex items-center">
        <div className="flex items-center gap-1 border-r border-alpha/50 px-3 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-alpha animate-pulse" />
          <span className="font-mono text-[0.5rem] text-alpha uppercase tracking-widest">
            LIVE
          </span>
        </div>
        <div className="overflow-hidden flex-1 relative">
          <div className="ticker-wrap">
            <div className="ticker-content font-mono text-[0.55rem] text-textDim uppercase tracking-widest">
              {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
                <span key={i} className="inline-block px-8">
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
