import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconRefresh, IconCheck, IconX, IconKey, IconSword,
  IconSettings, IconLoader2, IconEye, IconEyeOff,
} from '@tabler/icons-react';
import { getSecret, clearSession } from '../lib/auth';
import { api, type AdminStatus } from '../lib/api';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const KNOWN_FIELDS: Record<string, string> = {
  ANTHROPIC_API_KEY:  '',
  OPENROUTER_API_KEY: '',
  GROQ_API_KEY:       '',
  MAX_ROUNDS:         '',
  MAX_WORDS:          '',
};

function isKeyField(k: string) {
  return /KEY|TOKEN|SECRET/i.test(k);
}
function isMasked(v: string) {
  return v.includes('...****');
}
function isConfigured(v: string) {
  return Boolean(v);
}
function formatUptime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

// ─── Toast ───────────────────────────────────────────────────────────────────

type Toast = { type: 'ok' | 'err'; msg: string } | null;

function useToast() {
  const [toast, setToast] = useState<Toast>(null);
  const show = useCallback((type: 'ok' | 'err', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4500);
  }, []);
  return { toast, show };
}

// ─── Setting row ─────────────────────────────────────────────────────────────

function SettingRow({
  fieldKey, current, editValue, onChange,
}: {
  fieldKey:  string;
  current:   string;
  editValue: string;
  onChange:  (v: string) => void;
}) {
  const isKey      = isKeyField(fieldKey);
  const masked     = isMasked(current);
  const configured = isConfigured(current);
  const edited     = editValue !== '';
  const [show, setShow] = useState(false);

  return (
    <div className={`border bg-surface2 p-4 transition-colors ${
      edited ? 'border-gold/60' : 'border-borderBright'
    }`}>
      {/* Field name + status */}
      <div className="flex items-center justify-between gap-4 mb-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-text font-bold">
            {fieldKey}
          </div>
          {current && (
            <div className="font-mono text-[0.55rem] text-textDim mt-0.5">
              {isKey
                ? (masked ? current : `${current.substring(0,8)}...`)
                : `Actual: ${current}`}
            </div>
          )}
        </div>
        <div className={`flex items-center gap-1.5 font-mono text-[0.55rem] uppercase shrink-0 ${
          configured ? 'text-green' : 'text-textDim'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${configured ? 'bg-green animate-pulse' : 'bg-borderBright'}`} />
          {configured ? 'CONFIG' : 'VACÍO'}
        </div>
      </div>

      {/* Input */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-textDim text-xs shrink-0">{'>'}</span>
        <input
          type={isKey && !show ? 'password' : 'text'}
          value={editValue}
          onChange={e => onChange(e.target.value)}
          placeholder={
            isKey
              ? (masked ? 'Dejar vacío para mantener actual' : 'Nueva clave...')
              : (current || 'Valor...')
          }
          className="flex-1 bg-bg border border-borderBright px-3 py-2 font-mono text-xs text-text placeholder-textDim outline-none focus:border-alpha transition-colors"
        />
        {isKey && (
          <button
            type="button"
            onClick={() => setShow(v => !v)}
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

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="bg-surface border border-borderBright p-4 relative">
      <div className="absolute top-0 right-0 w-3 h-3 border-r border-t border-borderBright" />
      <div className="absolute bottom-0 left-0 w-3 h-3 border-l border-b border-borderBright" />
      <div className={`font-display text-3xl font-bold ${color} leading-none mb-1 tabular-nums`}>
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
  const secret   = getSecret();
  const { toast, show: showToast } = useToast();

  const [status,  setStatus]  = useState<AdminStatus | null>(null);
  const [config,  setConfig]  = useState<Record<string, string>>({});
  const [edits,   setEdits]   = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  const loadData = useCallback(async () => {
    if (!secret) { navigate('/login', { replace: true }); return; }
    setLoading(true);

    const [statusRes, configRes] = await Promise.all([
      api.getStatus(secret),
      api.getConfig(secret),
    ]);

    if (statusRes.data)                     setStatus(statusRes.data);
    if (configRes.error === 'ERR_AUTH')     { clearSession(); navigate('/login', { replace: true }); return; }
    if (configRes.data)                     setConfig(configRes.data);
    setLoading(false);
  }, [secret, navigate]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleEdit = (k: string, v: string) =>
    setEdits(prev => ({ ...prev, [k]: v }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secret) return;

    // Client-side validation
    const mr = edits['MAX_ROUNDS'];
    if (mr !== undefined && mr !== '') {
      const n = parseInt(mr, 10);
      if (isNaN(n) || n < 1 || n > 10) { showToast('err', 'MAX_ROUNDS debe ser entre 1 y 10'); return; }
    }
    const mw = edits['MAX_WORDS'];
    if (mw !== undefined && mw !== '') {
      const n = parseInt(mw, 10);
      if (isNaN(n) || n < 50 || n > 8000) { showToast('err', 'MAX_WORDS debe ser entre 50 y 8000'); return; }
    }

    setSaving(true);
    const result = await api.saveConfig(secret, edits);
    setSaving(false);

    if (result.data) {
      showToast('ok', 'CONFIGURACIÓN APLICADA EXITOSAMENTE');
      setEdits({});
      loadData();
    } else if (result.error === 'ERR_AUTH') {
      clearSession(); navigate('/login', { replace: true });
    } else {
      showToast('err', `ERROR AL GUARDAR: ${result.error}`);
    }
  };

  // Merge KNOWN_FIELDS with API data so we always show known fields
  const merged = { ...KNOWN_FIELDS, ...config };

  const apiKeys      = Object.entries(merged).filter(([k]) => isKeyField(k));
  const combatParams = Object.entries(merged).filter(([k]) => ['MAX_ROUNDS','MAX_WORDS'].includes(k));
  const otherParams  = Object.entries(merged).filter(([k]) =>
    !isKeyField(k) && !['MAX_ROUNDS','MAX_WORDS'].includes(k)
  );

  const pendingCount = Object.values(edits).filter(v => v !== '').length;
  const hasEdits     = pendingCount > 0;

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
        <div className={`fixed top-16 right-4 z-50 flex items-center gap-3 px-4 py-3 border font-mono text-xs uppercase tracking-wider shadow-lg ${
          toast.type === 'ok'
            ? 'bg-green/10 border-green text-green'
            : 'bg-alpha/10 border-alpha text-alpha'
        }`}>
          {toast.type === 'ok' ? <IconCheck size={14} /> : <IconX size={14} />}
          {toast.msg}
        </div>
      )}

      {/* ── PAGE HEADER ─────────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="font-mono text-[0.55rem] text-textDim tracking-widest uppercase mb-1">
          {new Date().toLocaleDateString('es-ES', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          }).toUpperCase()}
        </div>
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-display text-2xl font-bold uppercase tracking-widest text-text">
            ÁRBITRO <span className="text-alpha">IA</span>
          </h1>
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-widest text-textMuted hover:text-text border border-borderBright hover:border-borderBright px-3 py-1.5 transition-colors disabled:opacity-40"
          >
            <IconRefresh size={12} className={loading ? 'animate-spin' : ''} />
            ACTUALIZAR
          </button>
        </div>
        <div className="h-px bg-gradient-to-r from-alpha via-borderBright to-transparent mt-3" />
      </div>

      {/* ── STAT CARDS ──────────────────────────────────────────────── */}
      {status && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatCard label="TOTAL BATALLAS" value={status.battles.total}     color="text-text" />
          <StatCard label="EN ESPERA"       value={status.battles.waiting}   color="text-gold" />
          <StatCard label="EN COMBATE"      value={status.battles.active}    color="text-beta" />
          <StatCard label="FINALIZADAS"     value={status.battles.completed} color="text-green" />
        </div>
      )}

      {/* Server meta */}
      {status && (
        <div className="flex flex-wrap items-center gap-5 mb-8 font-mono text-[0.55rem] uppercase text-textDim">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
            SERVIDOR ONLINE
          </span>
          <span>v{status.version}</span>
          <span>UPTIME {formatUptime(status.uptime)}</span>
        </div>
      )}

      {/* ── SETTINGS FORM ───────────────────────────────────────────── */}
      <form onSubmit={handleSave} className="space-y-8">

        {/* API Keys */}
        {apiKeys.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-4">
              <IconKey size={14} className="text-alpha shrink-0" />
              <span className="font-mono text-[0.6rem] text-alpha uppercase tracking-widest">
                CREDENCIALES DE PROVEEDORES IA
              </span>
              <div className="flex-1 h-px bg-alpha/20" />
            </div>
            <div className="space-y-2">
              {apiKeys.map(([k, v]) => (
                <SettingRow
                  key={k}
                  fieldKey={k}
                  current={v}
                  editValue={edits[k] ?? ''}
                  onChange={val => handleEdit(k, val)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Combat params */}
        {combatParams.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-4">
              <IconSword size={14} className="text-gold shrink-0" />
              <span className="font-mono text-[0.6rem] text-gold uppercase tracking-widest">
                PARÁMETROS DE COMBATE
              </span>
              <div className="flex-1 h-px bg-gold/20" />
            </div>
            <div className="space-y-2">
              {combatParams.map(([k, v]) => (
                <SettingRow
                  key={k}
                  fieldKey={k}
                  current={v}
                  editValue={edits[k] ?? ''}
                  onChange={val => handleEdit(k, val)}
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
                OTROS PARÁMETROS
              </span>
              <div className="flex-1 h-px bg-beta/20" />
            </div>
            <div className="space-y-2">
              {otherParams.map(([k, v]) => (
                <SettingRow
                  key={k}
                  fieldKey={k}
                  current={v}
                  editValue={edits[k] ?? ''}
                  onChange={val => handleEdit(k, val)}
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
            ) : hasEdits
              ? `[ APLICAR ${pendingCount} CAMBIO${pendingCount > 1 ? 'S' : ''} ]`
              : '[ SIN CAMBIOS PENDIENTES ]'
            }
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
    </div>
  );
}
