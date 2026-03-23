import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import i18n, { setLocale, getCurrentLocale } from "../lib/i18n";
import {
  IconRefresh,
  IconCheck,
  IconX,
  IconKey,
  IconSword,
  IconSettings,
  IconLoader2,
  IconEye,
  IconEyeOff,
  IconPlus,
  IconTrash,
  IconCopy,
  IconUsers,
  IconTrophy,
  IconPlugConnected,
} from "@tabler/icons-react";
import { getSecret, clearSession } from "../lib/auth";
import { api, type AdminStatus, type BattleRoom } from "../lib/api";
import {
  DebateConfigForm,
  type DebateConfig,
} from "../components/DebateConfigForm";
import {
  ChessConfigForm,
  type ChessConfig,
  DEFAULT_CHESS,
} from "../components/ChessConfigForm";
import { ModelSelector, type ModelOption } from "../components/ModelSelector";
import { ProviderCard } from "../components/ProviderCard";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const KNOWN_FIELDS: Record<string, string> = {
  ANTHROPIC_API_KEY: "",
  OPENAI_API_KEY: "",
  GOOGLE_API_KEY: "",
  OPENROUTER_API_KEY: "",
  GROQ_API_KEY: "",
  JUDGE_MODEL_ANTHROPIC: "",
  JUDGE_MODEL_OPENAI: "",
  JUDGE_MODEL_GOOGLE: "",
  JUDGE_MODEL_OPENROUTER: "",
  JUDGE_MODEL_GROQ: "",
  MAX_ROUNDS: "",
  MAX_WORDS: "",
};

function isKeyField(k: string) {
  return /KEY|TOKEN|SECRET/i.test(k);
}
function isMasked(v: string) {
  return v.includes("...****");
}
function isConfigured(v: string) {
  return Boolean(v);
}
function formatUptime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// ─── Toast ───────────────────────────────────────────────────────────────────

type Toast = { type: "ok" | "err"; msg: string } | null;

function useToast() {
  const [toast, setToast] = useState<Toast>(null);
  const show = useCallback((type: "ok" | "err", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4500);
  }, []);
  return { toast, show };
}

// ─── Setting row ─────────────────────────────────────────────────────────────

function SettingRow({
  fieldKey,
  current,
  editValue,
  onChange,
}: {
  fieldKey: string;
  current: string;
  editValue: string;
  onChange: (v: string) => void;
}) {
  const isKey = isKeyField(fieldKey);
  const masked = isMasked(current);
  const configured = isConfigured(current);
  const edited = editValue !== "";
  const [show, setShow] = useState(false);

  return (
    <div
      id={`setting-${fieldKey}`}
      className={`border bg-surface2 p-4 transition-colors ${
        edited ? "border-gold/60" : "border-borderBright"
      }`}
    >
      {/* Field name + status */}
      <div className="flex items-center justify-between gap-4 mb-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-text font-bold">
            {fieldKey}
          </div>
          {current && (
            <div className="font-mono text-[0.55rem] text-textDim mt-0.5">
              {isKey
                ? masked
                  ? current
                  : `${current.substring(0, 8)}...`
                : `Actual: ${current}`}
            </div>
          )}
        </div>
        <div
          className={`flex items-center gap-1.5 font-mono text-[0.55rem] uppercase shrink-0 ${
            configured ? "text-green" : "text-textDim"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${configured ? "bg-green animate-pulse" : "bg-borderBright"}`}
          />
          {configured ? "CONFIG" : "VACÍO"}
        </div>
      </div>

      {/* Input */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-textDim text-xs shrink-0">{">"}</span>
        <input
          type={isKey && !show ? "password" : "text"}
          value={editValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            isKey
              ? masked
                ? "Dejar vacío para mantener actual"
                : "Nueva clave..."
              : current || "Valor..."
          }
          className="flex-1 bg-bg border border-borderBright px-3 py-2 font-mono text-xs text-text placeholder-textDim outline-none focus:border-alpha transition-colors"
        />
        {isKey && (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="text-textDim hover:text-text transition-colors p-1"
          >
            {show ? <IconEyeOff size={13} /> : <IconEye size={13} />}
          </button>
        )}
        {edited && (
          <span className="font-mono text-[0.5rem] text-gold uppercase tracking-wider shrink-0">
            EDITADO
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Stat card ───────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="bg-surface border border-borderBright p-4 relative">
      <div className="absolute top-0 right-0 w-3 h-3 border-r border-t border-borderBright" />
      <div className="absolute bottom-0 left-0 w-3 h-3 border-l border-b border-borderBright" />
      <div
        className={`font-display text-3xl font-bold ${color} leading-none mb-1 tabular-nums`}
      >
        {value}
      </div>
      <div className="font-mono text-[0.5rem] text-textDim uppercase tracking-widest">
        {label}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DashboardPage() {
  const navigate = useNavigate();
  const t = i18n.t.bind(i18n);
  const secretRef = useRef(getSecret());
  const secret = secretRef.current;
  const { toast, show: showToast } = useToast();
  const [lang, setLangState] = useState(getCurrentLocale());

  function toggleLang() {
    const newLang = lang === "es" ? "en" : "es";
    setLangState(newLang);
    setLocale(newLang);
  }

  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [availableModels, setAvailableModels] = useState<Record<string, ModelOption[]>>({});
  const [providerStatus, setProviderStatus] = useState<Record<string, { connected: boolean; method: string; setupUrl: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isLoadingData = useRef(false);

  // Room management state
  const [rooms, setRooms] = useState<BattleRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomForm, setRoomForm] = useState({
    count: 1,
    topic: "",
    alpha_stance: "",
    beta_stance: "",
    game_mode: "debate" as "debate" | "chess",
    max_rounds: 3,
  });
  const [debateConfig, setDebateConfig] = useState<DebateConfig | null>(null);
  const [chessConfig, setChessConfig] = useState<ChessConfig>(DEFAULT_CHESS);
  const [creatingRooms, setCreatingRooms] = useState(false);
  const [deletingRoom, setDeletingRoom] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadRooms = useCallback(async () => {
    if (!secret) return;
    setRoomsLoading(true);
    const res = await api.getRooms(secret);
    if (res.data) setRooms(res.data.rooms);
    setRoomsLoading(false);
  }, [secret]);

  const loadTournaments = useCallback(async () => {
    if (!secret) return;
    const res = await api.getTournaments(secret);
    if (res.data) setTournaments(res.data.tournaments);
  }, [secret]);

  const loadData = useCallback(
    async (showLoading = true) => {
      if (isLoadingData.current) return;
      isLoadingData.current = true;
      try {
        if (!secret) {
          navigate("/login", { replace: true });
          return;
        }
        if (showLoading) setLoading(true);

        const [statusRes, configRes] = await Promise.all([
          api.getStatus(secret),
          api.getConfig(secret),
        ]);

        // Fetch available models (no auth required)
        api.getModels().then((modelsRes) => {
          if (modelsRes.data) setAvailableModels(modelsRes.data);
        });

        // Fetch provider connection status
        api.getProvidersStatus(secret).then((provRes) => {
          if (provRes.data) setProviderStatus(provRes.data.providers);
        });

        if (statusRes.data) setStatus(statusRes.data);
        if (configRes.error === "ERR_AUTH") {
          console.log("[DEBUG] loadData got ERR_AUTH!");
          clearSession();
          navigate("/login", { replace: true });
          return;
        }
        if (configRes.data) {
          console.log("[DEBUG] loadData got config:", Object.keys(configRes.data).length, "keys");
          setConfig(configRes.data);
        }
        loadRooms();
        loadTournaments();
      } finally {
        isLoadingData.current = false;
        if (showLoading) setLoading(false);
      }
    },
    [secret, navigate, loadRooms, loadTournaments],
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleEdit = (k: string, v: string) =>
    setEdits((prev) => ({ ...prev, [k]: v }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secret) return;

    console.log("[DEBUG] handleSave called, edits:", JSON.stringify(edits));

    // Client-side validation
    const mr = edits["MAX_ROUNDS"];
    if (mr !== undefined && mr !== "") {
      const n = parseInt(mr, 10);
      if (isNaN(n) || n < 1 || n > 10) {
        showToast("err", "MAX_ROUNDS debe ser entre 1 y 10");
        return;
      }
    }
    const mw = edits["MAX_WORDS"];
    if (mw !== undefined && mw !== "") {
      const n = parseInt(mw, 10);
      if (isNaN(n) || n < 50 || n > 8000) {
        showToast("err", "MAX_WORDS debe ser entre 50 y 8000");
        return;
      }
    }

    setSaving(true);
    const result = await api.saveConfig(secret, edits);
    console.log("[DEBUG] saveConfig result:", JSON.stringify(result));
    setSaving(false);

    if (result.data) {
      showToast("ok", "CONFIGURACIÓN APLICADA EXITOSAMENTE");
      setEdits({});
      loadData(false);
    } else if (result.error === "ERR_AUTH") {
      clearSession();
      navigate("/login", { replace: true });
    } else {
      showToast("err", `ERROR AL GUARDAR: ${result.error}`);
    }
  };

  // Provider test handler
  const handleTestProvider = async (provider: string) => {
    if (!secret) return { success: false, error: "No auth" };
    const result = await api.testProvider(secret, provider);
    if (result.data) return result.data;
    return { success: false, error: result.error ?? "Error desconocido" };
  };

  // Scroll to API key input for a specific provider
  const scrollToApiKey = (provider: string) => {
    const keyField = `${provider.toUpperCase()}_API_KEY`;
    const el = document.getElementById(`setting-${keyField}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Focus the input inside
      const input = el.querySelector("input");
      if (input) input.focus();
    }
  };

  // Merge KNOWN_FIELDS with API data so we always show known fields
  const merged = { ...KNOWN_FIELDS, ...config };

  const apiKeys = Object.entries(merged).filter(([k]) => isKeyField(k));
  const combatParams = Object.entries(merged).filter(([k]) =>
    ["MAX_ROUNDS", "MAX_WORDS"].includes(k),
  );
  const otherParams = Object.entries(merged).filter(
    ([k]) => !isKeyField(k) && !k.startsWith("JUDGE_MODEL_") && !["MAX_ROUNDS", "MAX_WORDS"].includes(k),
  );

  const pendingCount = Object.values(edits).filter((v) => v !== "").length;
  const hasEdits = pendingCount > 0;

  // Room management handlers
  const handleCreateRooms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !secret ||
      !roomForm.topic.trim() ||
      !roomForm.alpha_stance.trim() ||
      !roomForm.beta_stance.trim()
    )
      return;

    // Validate mode-specific config
    if (roomForm.game_mode === "debate" && !debateConfig) {
      showToast("err", "INGRESA AL MENOS 1 EJE DE DEBATE");
      return;
    }

    setCreatingRooms(true);

    const body: any = {
      count: roomForm.count,
      topic: roomForm.topic,
      alpha_stance: roomForm.alpha_stance,
      beta_stance: roomForm.beta_stance,
      game_mode: roomForm.game_mode,
      max_rounds:
        roomForm.game_mode === "debate"
          ? debateConfig!.ejes.length
          : 999,
    };

    if (roomForm.game_mode === "debate" && debateConfig) {
      body.debate_config = {
        ...debateConfig,
        topic: roomForm.topic,
        alpha_stance: roomForm.alpha_stance,
        beta_stance: roomForm.beta_stance,
      };
    }

    if (roomForm.game_mode === "chess") {
      body.chess_config = chessConfig;
    }

    const result = await api.createRooms(secret, body);
    setCreatingRooms(false);
    if (result.data) {
      showToast(
        "ok",
        `${result.data.created} SALA${result.data.created > 1 ? "S" : ""} CREADA${result.data.created > 1 ? "S" : ""}`,
      );
      setRoomForm({
        count: 1,
        topic: "",
        alpha_stance: "",
        beta_stance: "",
        game_mode: "debate",
        max_rounds: 3,
      });
      setDebateConfig(null);
      setChessConfig(DEFAULT_CHESS);
      loadRooms();
      loadData(false);
    } else if (result.error === "ERR_AUTH") {
      clearSession();
      navigate("/login", { replace: true });
    } else {
      showToast("err", `ERROR: ${result.error}`);
    }
  };

  const handleDeleteRoom = async (id: string) => {
    if (!secret) return;
    setDeletingRoom(id);
    const result = await api.deleteRoom(secret, id);
    setDeletingRoom(null);
    if (result.data) {
      showToast("ok", "SALA ELIMINADA");
      loadRooms();
      loadData(false);
    } else {
      showToast("err", `ERROR: ${result.error}`);
    }
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Tournament state
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [tournamentForm, setTournamentForm] = useState({
    name: "",
    topic: "",
    game_mode: "debate" as "debate" | "chess",
    bracket_type: "single_elimination" as "single_elimination" | "round_robin",
    participants: [
      { name: "", model: "" },
      { name: "", model: "" },
      { name: "", model: "" },
      { name: "", model: "" },
    ],
    debate_ejes: ["", "", "", "", ""],
  });
  const [creatingTournament, setCreatingTournament] = useState(false);

  const handleCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secret || !tournamentForm.name.trim() || !tournamentForm.topic.trim())
      return;
    const validParticipants = tournamentForm.participants.filter((p) =>
      p.name.trim(),
    );
    if (validParticipants.length < 2) {
      showToast("err", "MÍNIMO 2 PARTICIPANTES");
      return;
    }
    setCreatingTournament(true);
    let debate_config = undefined;
    if (tournamentForm.game_mode === "debate") {
      const validEjes = tournamentForm.debate_ejes.filter((e) => e.trim());
      if (validEjes.length >= 1) {
        debate_config = {
          mode: "manual",
          topic: tournamentForm.topic,
          ejes: validEjes,
          alpha_stance: "",
          beta_stance: "",
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
          max_ejes: validEjes.length,
        };
      }
    }
    const result = await api.createTournament(secret, {
      name: tournamentForm.name,
      topic: tournamentForm.topic,
      game_mode: tournamentForm.game_mode,
      bracket_type: tournamentForm.bracket_type,
      max_participants: validParticipants.length,
      participants: validParticipants,
      debate_config,
    });
    setCreatingTournament(false);
    if (result.data) {
      showToast(
        "ok",
        `TORNEO CREADO — ${result.data.participants} PARTICIPANTES`,
      );
      setTournamentForm({
        name: "",
        topic: "",
        game_mode: "debate",
        bracket_type: "single_elimination",
        participants: [
          { name: "", model: "" },
          { name: "", model: "" },
          { name: "", model: "" },
          { name: "", model: "" },
        ],
        debate_ejes: ["", "", "", "", ""],
      });
      loadTournaments();
    } else {
      showToast("err", `ERROR: ${result.error}`);
    }
  };

  const handleDeleteTournament = async (id: string) => {
    if (!secret) return;
    await api.deleteTournament(secret, id);
    showToast("ok", "TORNEO ELIMINADO");
    loadTournaments();
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4">
        <IconLoader2 size={24} className="text-alpha animate-spin" />
        <p className="font-mono text-xs text-textMuted uppercase tracking-widest animate-pulse">
          Cargando parámetros del sistema...
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed top-16 right-4 z-50 flex items-center gap-3 px-4 py-3 border font-mono text-xs uppercase tracking-wider shadow-lg ${
            toast.type === "ok"
              ? "bg-green/10 border-green text-green"
              : "bg-alpha/10 border-alpha text-alpha"
          }`}
        >
          {toast.type === "ok" ? <IconCheck size={14} /> : <IconX size={14} />}
          {toast.msg}
        </div>
      )}

      {/* ── PAGE HEADER ─────────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="font-mono text-[0.55rem] text-textDim tracking-widest uppercase mb-1">
          {new Date()
            .toLocaleDateString("es-ES", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })
            .toUpperCase()}
        </div>
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-display text-2xl font-bold uppercase tracking-widest text-text">
            {t("dashboard.title")}
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleLang}
              className="flex items-center gap-1.5 font-mono text-[0.6rem] uppercase tracking-widest text-gold hover:text-white border border-gold/60 hover:border-gold px-3 py-1.5 transition-colors"
            >
              {lang === "es" ? "EN" : "ES"}
            </button>
            <button
              onClick={() => loadData()}
              disabled={loading}
              className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-widest text-textMuted hover:text-text border border-borderBright hover:border-borderBright px-3 py-1.5 transition-colors disabled:opacity-40"
            >
              <IconRefresh
                size={12}
                className={loading ? "animate-spin" : ""}
              />
              {t("dashboard.refresh")}
            </button>
          </div>
        </div>
        <div className="h-px bg-gradient-to-r from-alpha via-borderBright to-transparent mt-3" />
      </div>

      {/* ── STAT CARDS ──────────────────────────────────────────────── */}
      {status && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatCard
            label={t("stats.total")}
            value={status.battles.total}
            color="text-text"
          />
          <StatCard
            label={t("stats.waiting")}
            value={status.battles.waiting}
            color="text-gold"
          />
          <StatCard
            label={t("stats.active")}
            value={status.battles.active}
            color="text-beta"
          />
          <StatCard
            label={t("stats.completed")}
            value={status.battles.completed}
            color="text-green"
          />
        </div>
      )}

      {/* Server meta */}
      {status && (
        <div className="flex flex-wrap items-center gap-5 mb-8 font-mono text-[0.55rem] uppercase text-textDim">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
            {t("dashboard.server_online")}
          </span>
          <span>
            {t("dashboard.version")}
            {status.version}
          </span>
          <span>
            {t("dashboard.uptime")} {formatUptime(status.uptime)}
          </span>
        </div>
      )}

      {/* ── PROVIDER CONNECTION CARDS ────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <IconPlugConnected size={14} className="text-alpha shrink-0" />
          <span className="font-mono text-[0.6rem] text-alpha uppercase tracking-widest">
            PROVEEDORES DE IA
          </span>
          <div className="flex-1 h-px bg-alpha/20" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {["anthropic", "openai", "google", "openrouter", "groq"].map((provider) => (
            <ProviderCard
              key={provider}
              provider={provider}
              connected={providerStatus[provider]?.connected ?? false}
              setupUrl={providerStatus[provider]?.setupUrl ?? "#"}
              onTest={handleTestProvider}
              onScrollToKey={() => scrollToApiKey(provider)}
            />
          ))}
        </div>
      </div>

      {/* ── SETTINGS FORM ───────────────────────────────────────────── */}
      <form onSubmit={handleSave} className="space-y-8">
        {/* API Keys */}
        {apiKeys.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-4">
              <IconKey size={14} className="text-alpha shrink-0" />
              <span className="font-mono text-[0.6rem] text-alpha uppercase tracking-widest">
                {t("config.api_keys")}
              </span>
              <div className="flex-1 h-px bg-alpha/20" />
            </div>
            <div className="space-y-2">
              {apiKeys.map(([k, v]) => (
                <SettingRow
                  key={k}
                  fieldKey={k}
                  current={v}
                  editValue={edits[k] ?? ""}
                  onChange={(val) => handleEdit(k, val)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Model Selection per Provider */}
        {(() => {
          const providerMap: Record<string, string> = {
            ANTHROPIC_API_KEY: "anthropic",
            OPENAI_API_KEY: "openai",
            GOOGLE_API_KEY: "google",
            OPENROUTER_API_KEY: "openrouter",
            GROQ_API_KEY: "groq",
          };
          const configuredProviders = apiKeys
            .filter(([k, v]) => isConfigured(v) && providerMap[k])
            .map(([k]) => providerMap[k]);

          if (configuredProviders.length === 0) return null;

          return (
            <section>
              <div className="flex items-center gap-3 mb-4">
                <IconSettings size={14} className="text-green shrink-0" />
                <span className="font-mono text-[0.6rem] text-green uppercase tracking-widest">
                  MODELOS
                </span>
                <div className="flex-1 h-px bg-green/20" />
              </div>
              <div className="space-y-2">
                {configuredProviders.map((provider) => {
                  const modelKey = `JUDGE_MODEL_${provider.toUpperCase()}`;
                  const currentVal = merged[modelKey] ?? "";
                  const editVal = edits[modelKey] ?? "";
                  const models = availableModels[provider] ?? [];

                  return (
                    <ModelSelector
                      key={provider}
                      provider={provider}
                      currentModel={editVal || currentVal}
                      availableModels={models}
                      onChange={(modelId) => handleEdit(modelKey, modelId)}
                    />
                  );
                })}
              </div>
            </section>
          );
        })()}

        {/* Combat params */}
        {combatParams.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-4">
              <IconSword size={14} className="text-gold shrink-0" />
              <span className="font-mono text-[0.6rem] text-gold uppercase tracking-widest">
                {t("config.combat_params")}
              </span>
              <div className="flex-1 h-px bg-gold/20" />
            </div>
            <div className="space-y-2">
              {combatParams.map(([k, v]) => (
                <SettingRow
                  key={k}
                  fieldKey={k}
                  current={v}
                  editValue={edits[k] ?? ""}
                  onChange={(val) => handleEdit(k, val)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Other params */}
        {otherParams.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-4">
              <IconSettings size={14} className="text-beta shrink-0" />
              <span className="font-mono text-[0.6rem] text-beta uppercase tracking-widest">
                {t("config.other_params")}
              </span>
              <div className="flex-1 h-px bg-beta/20" />
            </div>
            <div className="space-y-2">
              {otherParams.map(([k, v]) => (
                <SettingRow
                  key={k}
                  fieldKey={k}
                  current={v}
                  editValue={edits[k] ?? ""}
                  onChange={(val) => handleEdit(k, val)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Save button */}
        <div className="border-t border-borderBright pt-6">
          <button
            type="submit"
            disabled={saving || !hasEdits}
            className="relative w-full bg-alpha text-bg font-mono font-extrabold text-[0.7rem] tracking-[0.25em] uppercase py-4 transition-all hover:bg-white hover:text-black disabled:opacity-30 disabled:pointer-events-none overflow-hidden group"
          >
            <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <IconLoader2 size={13} className="animate-spin" />
                APLICANDO CONFIGURACIÓN...
              </span>
            ) : hasEdits ? (
              `[ APLICAR ${pendingCount} CAMBIO${pendingCount > 1 ? "S" : ""} ]`
            ) : (
              "[ SIN CAMBIOS PENDIENTES ]"
            )}
          </button>
          {hasEdits && (
            <button
              type="button"
              onClick={() => setEdits({})}
              className="w-full mt-2 font-mono text-[0.55rem] text-textDim hover:text-textMuted uppercase tracking-widest py-1 transition-colors text-center"
            >
              Descartar cambios
            </button>
          )}
        </div>
      </form>

      {/* ── ROOM MANAGEMENT ───────────────────────────────────────────── */}
      <div className="mt-10">
        <div className="flex items-center gap-3 mb-6">
          <IconUsers size={14} className="text-beta shrink-0" />
          <span className="font-mono text-[0.6rem] text-beta uppercase tracking-widest">
            {t("rooms.title")}
          </span>
          <div className="flex-1 h-px bg-beta/20" />
        </div>

        {/* Create rooms form */}
        <form
          onSubmit={handleCreateRooms}
          className="border border-borderBright bg-surface p-5 mb-6"
        >
          <div className="font-mono text-[0.55rem] text-textDim uppercase tracking-widest mb-4">
            {t("rooms.create")}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="font-mono text-[0.5rem] text-textDim uppercase tracking-wider block mb-1">
                {roomForm.game_mode === "chess" ? "TEMA DEL AJEDREZ" : "TEMA DEL DEBATE"}
              </label>
              <input
                type="text"
                value={roomForm.topic}
                onChange={(e) =>
                  setRoomForm((f) => ({ ...f, topic: e.target.value }))
                }
                placeholder={roomForm.game_mode === "chess" ? "Campeonato mundial de ajedrez" : "¿La IA reemplazará a los profesores?"}
                className="w-full bg-bg border border-borderBright px-3 py-2 font-mono text-xs text-text placeholder-textDim outline-none focus:border-beta transition-colors"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="font-mono text-[0.5rem] text-textDim uppercase tracking-wider block mb-1">
                  CANTIDAD
                </label>
                <input
                  type="number"
                  value={roomForm.count}
                  min={1}
                  max={50}
                  onChange={(e) =>
                    setRoomForm((f) => ({
                      ...f,
                      count: parseInt(e.target.value) || 1,
                    }))
                  }
                  className="w-full bg-bg border border-borderBright px-3 py-2 font-mono text-xs text-text outline-none focus:border-beta transition-colors"
                />
              </div>
              <div className="flex-1">
                <label className="font-mono text-[0.5rem] text-textDim uppercase tracking-wider block mb-1">
                  MODO
                </label>
                <select
                  value={roomForm.game_mode}
                  onChange={(e) => {
                    const newMode = e.target.value as "debate" | "chess";
                    setRoomForm((f) => ({ ...f, game_mode: newMode }));
                    if (newMode === "chess") setDebateConfig(null);
                  }}
                  className="w-full bg-bg border border-borderBright px-3 py-2 font-mono text-xs text-text outline-none focus:border-beta transition-colors"
                >
                  <option value="debate">DEBATE</option>
                  <option value="chess">AJEDREZ</option>
                </select>
              </div>
              {roomForm.game_mode === "debate" && (
                <div className="flex-1">
                  <label className="font-mono text-[0.5rem] text-textDim uppercase tracking-wider block mb-1">
                    RONDAS
                  </label>
                  <input
                    type="number"
                    value={roomForm.max_rounds}
                    min={1}
                    max={10}
                    onChange={(e) =>
                      setRoomForm((f) => ({
                        ...f,
                        max_rounds: parseInt(e.target.value) || 3,
                      }))
                    }
                    className="w-full bg-bg border border-borderBright px-3 py-2 font-mono text-xs text-text outline-none focus:border-beta transition-colors"
                  />
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="font-mono text-[0.5rem] text-alpha uppercase tracking-wider block mb-1">
                {roomForm.game_mode === "chess" ? "JUGADOR BLANCAS" : "POSTURA ALPHA"}
              </label>
              <input
                type="text"
                value={roomForm.alpha_stance}
                onChange={(e) =>
                  setRoomForm((f) => ({ ...f, alpha_stance: e.target.value }))
                }
                placeholder={roomForm.game_mode === "chess" ? "IA con piezas blancas" : "A favor de la IA en educación"}
                className="w-full bg-bg border border-borderBright px-3 py-2 font-mono text-xs text-text placeholder-textDim outline-none focus:border-alpha transition-colors"
              />
            </div>
            <div>
              <label className="font-mono text-[0.5rem] text-beta uppercase tracking-wider block mb-1">
                {roomForm.game_mode === "chess" ? "JUGADOR NEGRAS" : "POSTURA BETA"}
              </label>
              <input
                type="text"
                value={roomForm.beta_stance}
                onChange={(e) =>
                  setRoomForm((f) => ({ ...f, beta_stance: e.target.value }))
                }
                placeholder={roomForm.game_mode === "chess" ? "IA con piezas negras" : "Defensa del docente humano"}
                className="w-full bg-bg border border-borderBright px-3 py-2 font-mono text-xs text-text placeholder-textDim outline-none focus:border-beta transition-colors"
              />
            </div>
          </div>

          {/* Mode-specific config */}
          {roomForm.game_mode === "debate" && (
            <DebateConfigForm onChange={setDebateConfig} />
          )}
          {roomForm.game_mode === "chess" && (
            <ChessConfigForm onChange={setChessConfig} />
          )}

          <button
            type="submit"
            disabled={
              creatingRooms ||
              !roomForm.topic.trim() ||
              !roomForm.alpha_stance.trim() ||
              !roomForm.beta_stance.trim()
            }
            className="w-full bg-beta text-bg font-mono font-extrabold text-[0.65rem] tracking-[0.25em] uppercase py-3 transition-all hover:bg-white hover:text-black disabled:opacity-30 disabled:pointer-events-none"
          >
            {creatingRooms ? (
              <span className="flex items-center justify-center gap-2">
                <IconLoader2 size={13} className="animate-spin" /> CREANDO...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <IconPlus size={13} /> CREAR{" "}
                {roomForm.count > 1 ? `${roomForm.count} SALAS` : "SALA"}
              </span>
            )}
          </button>
        </form>

        {/* ── TOURNAMENT MANAGEMENT ────────────────────────────────────────── */}
        <div className="mt-10">
          <div className="flex items-center gap-3 mb-6">
            <IconTrophy size={14} className="text-gold shrink-0" />
            <span className="font-mono text-[0.6rem] text-gold uppercase tracking-widest">
              {t("tournaments.title")}
            </span>
            <div className="flex-1 h-px bg-gold/20" />
          </div>

          {/* Create tournament form */}
          <form
            onSubmit={handleCreateTournament}
            className="border border-borderBright bg-surface p-5 mb-6"
          >
            <div className="font-mono text-[0.55rem] text-textDim uppercase tracking-widest mb-4">
              {t("tournaments.create")}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="font-mono text-[0.5rem] text-textDim uppercase tracking-wider block mb-1">
                  NOMBRE DEL TORNEO
                </label>
                <input
                  type="text"
                  value={tournamentForm.name}
                  onChange={(e) =>
                    setTournamentForm((f) => ({
                      ...f,
                      name: e.target.value,
                    }))
                  }
                  placeholder="Copa IA 2026"
                  className="w-full bg-bg border border-borderBright px-3 py-2 font-mono text-xs text-text placeholder-textDim outline-none focus:border-gold transition-colors"
                />
              </div>
              <div>
                <label className="font-mono text-[0.5rem] text-textDim uppercase tracking-wider block mb-1">
                  TEMA DEL DEBATE
                </label>
                <input
                  type="text"
                  value={tournamentForm.topic}
                  onChange={(e) =>
                    setTournamentForm((f) => ({
                      ...f,
                      topic: e.target.value,
                    }))
                  }
                  placeholder="¿La IA reemplazará a los profesores?"
                  className="w-full bg-bg border border-borderBright px-3 py-2 font-mono text-xs text-text placeholder-textDim outline-none focus:border-gold transition-colors"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              <div>
                <label className="font-mono text-[0.5rem] text-textDim uppercase tracking-wider block mb-1">
                  MODO
                </label>
                <select
                  value={tournamentForm.game_mode}
                  onChange={(e) =>
                    setTournamentForm((f) => ({
                      ...f,
                      game_mode: e.target.value as any,
                    }))
                  }
                  className="w-full bg-bg border border-borderBright px-3 py-2 font-mono text-xs text-text outline-none focus:border-gold transition-colors"
                >
                  <option value="debate">DEBATE</option>
                  <option value="chess">AJEDREZ</option>
                </select>
              </div>
              <div>
                <label className="font-mono text-[0.5rem] text-textDim uppercase tracking-wider block mb-1">
                  BRACKET
                </label>
                <select
                  value={tournamentForm.bracket_type}
                  onChange={(e) =>
                    setTournamentForm((f) => ({
                      ...f,
                      bracket_type: e.target.value as any,
                    }))
                  }
                  className="w-full bg-bg border border-borderBright px-3 py-2 font-mono text-xs text-text outline-none focus:border-gold transition-colors"
                >
                  <option value="single_elimination">
                    ELIMINACIÓN SIMPLE
                  </option>
                  <option value="round_robin">ROUND ROBIN</option>
                </select>
              </div>
              <div>
                <label className="font-mono text-[0.5rem] text-textDim uppercase tracking-wider block mb-1">
                  PARTICIPANTES
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setTournamentForm((f) => ({
                        ...f,
                        participants: [
                          ...f.participants,
                          { name: "", model: "" },
                        ],
                      }))
                    }
                    className="font-mono text-[0.6rem] px-2 py-1 border border-borderBright text-gold hover:border-gold"
                  >
                    + ADD
                  </button>
                  <span className="font-mono text-xs text-textDim py-1">
                    {
                      tournamentForm.participants.filter((p) =>
                        p.name.trim(),
                      ).length
                    }
                  </span>
                </div>
              </div>
            </div>

            {/* Participants list */}
            <div className="space-y-1 mb-4">
              {tournamentForm.participants.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={p.name}
                    onChange={(e) => {
                      const newP = [...tournamentForm.participants];
                      newP[i] = { ...newP[i], name: e.target.value };
                      setTournamentForm((f) => ({
                        ...f,
                        participants: newP,
                      }));
                    }}
                    placeholder={`Contender ${i + 1}`}
                    className="flex-1 bg-bg border border-borderBright px-2 py-1 font-mono text-xs text-text placeholder-textDim outline-none focus:border-gold"
                  />
                  <input
                    type="text"
                    value={p.model}
                    onChange={(e) => {
                      const newP = [...tournamentForm.participants];
                      newP[i] = { ...newP[i], model: e.target.value };
                      setTournamentForm((f) => ({
                        ...f,
                        participants: newP,
                      }));
                    }}
                    placeholder="Modelo"
                    className="w-32 bg-bg border border-borderBright px-2 py-1 font-mono text-xs text-text placeholder-textDim outline-none focus:border-gold"
                  />
                  {tournamentForm.participants.length > 2 && (
                    <button
                      type="button"
                      onClick={() =>
                        setTournamentForm((f) => ({
                          ...f,
                          participants: f.participants.filter(
                            (_, j) => j !== i,
                          ),
                        }))
                      }
                      className="text-alpha/50 hover:text-alpha px-1"
                    >
                      <IconTrash size={10} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Ejes (debate only) */}
            {tournamentForm.game_mode === "debate" && (
              <div className="mb-4">
                <label className="font-mono text-[0.5rem] text-textDim uppercase tracking-wider block mb-1">
                  EJES DE DEBATE
                </label>
                {tournamentForm.debate_ejes.map((eje, i) => (
                  <input
                    key={i}
                    type="text"
                    value={eje}
                    onChange={(e) => {
                      const newEjes = [...tournamentForm.debate_ejes];
                      newEjes[i] = e.target.value;
                      setTournamentForm((f) => ({
                        ...f,
                        debate_ejes: newEjes,
                      }));
                    }}
                    placeholder={`Eje ${i + 1}: ¿...?`}
                    className="w-full bg-bg border border-borderBright px-2 py-1 font-mono text-xs text-text placeholder-textDim outline-none focus:border-gold mb-1"
                  />
                ))}
              </div>
            )}

            <button
              type="submit"
              disabled={
                creatingTournament ||
                !tournamentForm.name.trim() ||
                !tournamentForm.topic.trim()
              }
              className="w-full bg-gold text-bg font-mono font-extrabold text-[0.65rem] tracking-[0.25em] uppercase py-3 transition-all hover:bg-white hover:text-black disabled:opacity-30 disabled:pointer-events-none"
            >
              {creatingTournament ? (
                <span className="flex items-center justify-center gap-2">
                  <IconLoader2 size={13} className="animate-spin" />{" "}
                  CREANDO TORNEO...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <IconTrophy size={13} /> {t("tournaments.create")}
                </span>
              )}
            </button>
          </form>

          {/* Tournaments list */}
          {tournaments.length === 0 ? (
            <div className="text-center py-8 border border-borderBright bg-surface">
              <div className="font-display text-2xl text-textDim mb-2">
                ∅
              </div>
              <p className="font-mono text-xs text-textDim uppercase tracking-wider">
                Sin torneos
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {tournaments.map((t) => (
                <div
                  key={t.id}
                  className="border border-borderBright bg-surface p-4 flex items-center justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="tag bg-gold/10 text-gold border border-gold/30 font-mono text-[0.55rem] px-2 py-0.5">
                        {t.bracket_type === "single_elimination"
                          ? "ELIMINACIÓN"
                          : "ROUND ROBIN"}
                      </span>
                      <span
                        className={`tag font-mono text-[0.55rem] px-2 py-0.5 ${
                          t.status === "active"
                            ? "bg-green/10 text-green border border-green/30"
                            : t.status === "finished"
                              ? "bg-surface2 text-textDim border border-borderBright"
                              : "bg-gold/10 text-gold border border-gold/30"
                        }`}
                      >
                        {t.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="font-mono text-xs text-text">
                      {t.name}
                    </div>
                    <div className="font-mono text-[0.55rem] text-textDim">
                      {t.topic} · {t.participant_count} jugadores ·{" "}
                      {t.completed_matches}/{t.match_count} partidos
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleCopyId(t.id)}
                      className="flex items-center gap-1 font-mono text-[0.55rem] px-2 py-1.5 border border-borderBright text-textDim hover:text-text hover:border-text transition-colors uppercase"
                    >
                      <IconCopy size={11} />{" "}
                      {copiedId === t.id ? "COPIADO" : "COPIAR ID"}
                    </button>
                    <button
                      onClick={() => handleDeleteTournament(t.id)}
                      className="flex items-center gap-1 font-mono text-[0.55rem] px-2 py-1.5 border border-alpha/30 text-alpha/50 hover:text-alpha hover:border-alpha transition-colors uppercase"
                    >
                      <IconTrash size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rooms list */}
        {roomsLoading ? (
          <div className="flex items-center gap-2 justify-center py-8">
            <IconLoader2 size={16} className="text-beta animate-spin" />
            <span className="font-mono text-xs text-textDim uppercase">
              Cargando salas...
            </span>
          </div>
        ) : rooms.length === 0 ? (
          <div className="text-center py-8 border border-borderBright bg-surface">
            <div className="font-display text-2xl text-textDim mb-2">∅</div>
            <p className="font-mono text-xs text-textDim uppercase tracking-wider">
              Sin salas activas
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {rooms.map((room) => (
              <div
                key={room.id}
                className="border border-borderBright bg-surface p-4 flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`tag font-mono text-[0.55rem] px-2 py-0.5 ${room.game_mode === "chess" ? "bg-beta/10 text-beta border border-beta/30" : "bg-alpha/10 text-alpha border border-alpha/30"}`}
                    >
                      {room.game_mode === "chess" ? "CHESS" : "DEBATE"}
                    </span>
                    <span
                      className={`tag font-mono text-[0.55rem] px-2 py-0.5 ${
                        room.status === "waiting"
                          ? "bg-gold/10 text-gold border border-gold/30"
                          : room.status === "active"
                            ? "bg-green/10 text-green border border-green/30"
                            : "bg-surface2 text-textDim border border-borderBright"
                      }`}
                    >
                      {room.status.toUpperCase()}
                    </span>
                    <span className="font-mono text-[0.6rem] font-bold text-text tracking-wider">
                      #{room.id}
                    </span>
                  </div>
                  <div className="font-mono text-xs text-text truncate">
                    {room.topic}
                  </div>
                  <div className="font-mono text-[0.55rem] text-textDim mt-0.5">
                    {room.alpha_name
                      ? `${room.alpha_name} vs ${room.beta_name ?? "..."}`
                      : "Esperando contendientes..."}
                    {room.alpha_model && ` · ${room.alpha_model}`}
                    {room.max_rounds < 999 && ` · ${room.max_rounds} rondas`}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleCopyId(room.id)}
                    className="flex items-center gap-1 font-mono text-[0.55rem] px-2 py-1.5 border border-borderBright text-textDim hover:text-text hover:border-text transition-colors uppercase"
                  >
                    <IconCopy size={11} />
                    {copiedId === room.id ? "COPIADO" : "COPIAR ID"}
                  </button>
                  <button
                    onClick={() => handleDeleteRoom(room.id)}
                    disabled={deletingRoom === room.id}
                    className="flex items-center gap-1 font-mono text-[0.55rem] px-2 py-1.5 border border-alpha/30 text-alpha/50 hover:text-alpha hover:border-alpha transition-colors uppercase disabled:opacity-40"
                  >
                    {deletingRoom === room.id ? (
                      <IconLoader2 size={11} className="animate-spin" />
                    ) : (
                      <IconTrash size={11} />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
