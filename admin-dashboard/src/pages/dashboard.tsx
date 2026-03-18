import React, { useEffect, useState } from 'react';
import { useNotification } from '@refinedev/core';

export const Dashboard: React.FC = () => {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { open } = useNotification();
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  
  const token = localStorage.getItem('admin_secret');

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch(`${API_URL}/admin/config`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setSettings(data);
        } else if (res.status === 401) {
          localStorage.removeItem('admin_secret');
          window.location.href = '/login';
        }
      } catch (err) {
        open?.({ type: 'error', message: 'ERROR DE CONEXIÓN', description: 'No se pudo leer la base de datos local.', key: 'conn-err' });
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, [token, API_URL, open]);

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    open?.({ type: 'progress', message: 'INICIANDO OVERRIDE', description: 'Escribiendo en disco...', key: 'save-prog' });

    try {
      const payload = { ...settings };
      for (const key in payload) {
        if (!payload[key] || payload[key].includes('...****')) {
          delete payload[key];
        }
      }

      const res = await fetch(`${API_URL}/admin/config`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        open?.({ type: 'success', message: 'SYS_UPDATED', description: 'Configuraciones reescritas globalmente.', key: 'save-ok' });
      } else {
        open?.({ type: 'error', message: 'SYS_ERROR 500', description: 'Fallo al sobrescribir configuraciones.', key: 'save-err' });
      }
    } catch {
      open?.({ type: 'error', message: 'SYS_ERROR', description: 'Conexión interrumpida con Master Node.', key: 'save-fail' });
    } finally {
      setIsSaving(false);
    }
  };

  const updateSetting = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-16 gap-4 bg-surface2/50 border border-border border-dashed font-mono text-sm text-[rgba(255,255,255,0.55)] mt-12">
        <span className="w-4 h-4 border-2 border-borderBright border-t-beta rounded-full animate-spin"></span>
        [ ESTABLECIENDO CONEXIÓN DIRECTA ]
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <header className="border-b border-borderBright pb-6 pt-4">
        <h1 className="text-3xl md:text-5xl font-bold font-display text-white tracking-tighter uppercase glitch-text">
          CONFIG_<span className="text-beta">MATRIX</span>
        </h1>
        <p className="font-mono text-[0.7rem] text-textMuted uppercase tracking-widest mt-4">
          Panel de Control Central de Reglas y LLMs para AI Battle Arena
        </p>
      </header>

      <form onSubmit={saveSettings} className="space-y-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* JUEZ IA */}
          <section className="bg-surface border border-border p-6 md:p-8 relative">
            <div className="absolute top-0 left-0 w-4 h-4 border-l-2 border-t-2 border-beta pointer-events-none"></div>

            <div className="mb-8 border-b border-borderBright pb-4">
              <h2 className="text-xl font-bold font-display text-beta mb-2">{">>"} MOTOR_JUEZ_IA</h2>
              <p className="font-mono text-[0.65rem] uppercase text-textMuted tracking-widest">
                Parámetros Globales. Requiere Credenciales.
              </p>
            </div>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="block font-mono text-[0.7rem] font-bold text-text uppercase tracking-widest">
                  [ PROVEEDOR ACTIVO ]
                </label>
                <select 
                  value={settings['JUDGE_PROVIDER'] || 'auto'} 
                  onChange={e => updateSetting('JUDGE_PROVIDER', e.target.value)}
                  className="w-full bg-bg border border-borderBright px-4 py-3 text-sm text-beta font-mono font-bold focus:outline-none focus:border-beta focus:bg-beta-dim transition-colors appearance-none cursor-pointer uppercase"
                >
                  <option value="auto">DETECCIÓN AUTOMÁTICA (RECOMENDADO)</option>
                  <option value="anthropic">RED ANTHROPIC (CLAUDE)</option>
                  <option value="openrouter">CLÚSTER OPENROUTER</option>
                  <option value="groq">UNIDAD GROQ (LPU)</option>
                </select>
              </div>

              {/* ANTHROPIC */}
              <div className="bg-bg border border-border p-4 space-y-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-mono text-[0.6rem] font-bold uppercase text-white bg-white/10 px-2 py-1">ANTHROPIC</span>
                  {settings['ANTHROPIC_API_KEY']?.includes('...') && <span className="font-mono text-[0.6rem] font-bold text-[#39ff14] border border-[#39ff14]/30 px-2 py-1 bg-[#39ff14]/10">DETECTADO</span>}
                </div>
                <div className="space-y-2">
                  <label className="block font-mono text-[0.6rem] font-bold text-[rgba(255,255,255,0.55)] uppercase">API KEY</label>
                  <input type="password" placeholder="sk-ant-..." value={settings['ANTHROPIC_API_KEY'] || ''} onChange={e => updateSetting('ANTHROPIC_API_KEY', e.target.value)} className="w-full bg-surface2 border border-border px-3 py-2 text-[0.8rem] text-text font-mono focus:outline-none focus:border-white transition-all" />
                </div>
                <div className="space-y-2">
                  <label className="block font-mono text-[0.6rem] font-bold text-[rgba(255,255,255,0.55)] uppercase">MODELO DE LENGUAJE</label>
                  <input type="text" placeholder="claude-3-5-sonnet-20241022" value={settings['JUDGE_MODEL_ANTHROPIC'] || ''} onChange={e => updateSetting('JUDGE_MODEL_ANTHROPIC', e.target.value)} className="w-full bg-surface2 border border-border px-3 py-2 text-[0.8rem] text-text font-mono focus:outline-none focus:border-white transition-all" />
                </div>
              </div>

              {/* OPENROUTER */}
              <div className="bg-bg border border-border p-4 space-y-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-mono text-[0.6rem] font-bold uppercase text-white bg-white/10 px-2 py-1">OPENROUTER</span>
                  {settings['OPENROUTER_API_KEY']?.includes('...') && <span className="font-mono text-[0.6rem] font-bold text-[#39ff14] border border-[#39ff14]/30 px-2 py-1 bg-[#39ff14]/10">DETECTADO</span>}
                </div>
                <div className="space-y-2">
                  <label className="block font-mono text-[0.6rem] font-bold text-[rgba(255,255,255,0.55)] uppercase">API KEY</label>
                  <input type="password" placeholder="sk-or-..." value={settings['OPENROUTER_API_KEY'] || ''} onChange={e => updateSetting('OPENROUTER_API_KEY', e.target.value)} className="w-full bg-surface2 border border-border px-3 py-2 text-[0.8rem] text-text font-mono focus:outline-none focus:border-white transition-all" />
                </div>
                <div className="space-y-2">
                  <label className="block font-mono text-[0.6rem] font-bold text-[rgba(255,255,255,0.55)] uppercase">MODELO DE LENGUAJE</label>
                  <input type="text" placeholder="google/gemini-2.0-flash-001" value={settings['JUDGE_MODEL_OPENROUTER'] || ''} onChange={e => updateSetting('JUDGE_MODEL_OPENROUTER', e.target.value)} className="w-full bg-surface2 border border-border px-3 py-2 text-[0.8rem] text-text font-mono focus:outline-none focus:border-white transition-all" />
                </div>
              </div>

              {/* GROQ */}
              <div className="bg-bg border border-border p-4 space-y-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-mono text-[0.6rem] font-bold uppercase text-white bg-white/10 px-2 py-1">GROQ</span>
                  {settings['GROQ_API_KEY']?.includes('...') && <span className="font-mono text-[0.6rem] font-bold text-[#39ff14] border border-[#39ff14]/30 px-2 py-1 bg-[#39ff14]/10">DETECTADO</span>}
                </div>
                <div className="space-y-2">
                  <label className="block font-mono text-[0.6rem] font-bold text-[rgba(255,255,255,0.55)] uppercase">API KEY</label>
                  <input type="password" placeholder="gsk_..." value={settings['GROQ_API_KEY'] || ''} onChange={e => updateSetting('GROQ_API_KEY', e.target.value)} className="w-full bg-surface2 border border-border px-3 py-2 text-[0.8rem] text-text font-mono focus:outline-none focus:border-white transition-all" />
                </div>
                <div className="space-y-2">
                  <label className="block font-mono text-[0.6rem] font-bold text-[rgba(255,255,255,0.55)] uppercase">MODELO DE LENGUAJE</label>
                  <input type="text" placeholder="llama-3.3-70b-versatile" value={settings['JUDGE_MODEL_GROQ'] || ''} onChange={e => updateSetting('JUDGE_MODEL_GROQ', e.target.value)} className="w-full bg-surface2 border border-border px-3 py-2 text-[0.8rem] text-text font-mono focus:outline-none focus:border-white transition-all" />
                </div>
              </div>

            </div>
          </section>

          <div className="space-y-8 flex flex-col justify-between">
            {/* REGLAS BATALLA */}
            <section className="bg-surface border border-border p-6 md:p-8 relative h-full">
              <div className="absolute top-0 right-0 w-4 h-4 border-r-2 border-t-2 border-gold pointer-events-none"></div>
              
              <div className="mb-8 border-b border-borderBright pb-4">
                <h2 className="text-xl font-bold font-display text-gold mb-2">{">>"} REGLAS_BATALLA</h2>
                <p className="font-mono text-[0.65rem] text-textMuted uppercase tracking-wider">
                  Matriz de simulación predeterminada
                </p>
              </div>
              
              <div className="grid grid-cols-1 gap-8">
                <div className="space-y-3">
                  <label className="block font-mono text-[0.7rem] font-bold text-text uppercase tracking-widest">
                    [ RONDAS MÁXIMAS ]
                  </label>
                  <div className="flex items-center gap-4">
                    <input type="number" min="1" max="10" placeholder="3" value={settings['MAX_ROUNDS'] || ''} onChange={e => updateSetting('MAX_ROUNDS', e.target.value)} className="w-24 bg-bg border border-borderBright px-4 py-3 text-2xl text-gold font-mono font-bold focus:outline-none focus:border-gold focus:bg-gold-dim transition-colors text-center" />
                    <p className="font-mono text-[0.6rem] text-textDim uppercase tracking-widest max-w-[200px] leading-relaxed">
                      Límite duro de iteraciones permitidas en el canal MCP.
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="block font-mono text-[0.7rem] font-bold text-text uppercase tracking-widest">
                    [ LÍMITE DE PALABRAS ]
                  </label>
                  <div className="flex items-center gap-4">
                    <input type="number" min="50" max="8000" placeholder="∞" value={settings['MAX_WORDS'] || ''} onChange={e => updateSetting('MAX_WORDS', e.target.value)} className="w-24 bg-bg border border-borderBright px-4 py-3 text-2xl text-gold font-mono font-bold focus:outline-none focus:border-gold focus:bg-gold-dim transition-colors text-center" />
                    <p className="font-mono text-[0.6rem] text-textDim uppercase tracking-widest max-w-[200px] leading-relaxed">
                      Deja en blanco (∞) para debate sin barreras léxicas.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* FOOTER CTA */}
        <div className="bg-surface2 border border-borderBright p-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="font-mono text-[0.6rem] font-bold text-alpha uppercase tracking-widest px-2 animate-pulse">
            ! ATENCIÓN: LOS PARCHES AFECTAN AL JUEZ DE INMEDIATO.
          </p>
          <button 
            type="submit" 
            disabled={isSaving} 
            className="w-full md:w-auto min-w-[250px] bg-alpha font-mono text-bg font-extrabold text-[0.85rem] tracking-[0.2em] uppercase py-4 outline-none border border-transparent shadow-[0_0_20px_var(--alpha-dim)] hover:bg-white hover:text-black hover:shadow-[0_0_30px_rgba(255,255,255,0.5)] transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            {isSaving ? '[ COMPILANDO_NÚCLEO... ]' : '[ INYECTAR OVERRIDE ]'}
          </button>
        </div>
        
      </form>
    </div>
  );
};
