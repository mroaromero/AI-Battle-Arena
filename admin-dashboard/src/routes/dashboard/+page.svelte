<script lang="ts">
  import { onMount } from 'svelte';
  
  let settings: Record<string, string> = $state({});
  let isLoading = $state(true);
  let isSaving = $state(false);
  let messages = $state<{id: number, text: string, type: 'success' | 'error' | 'info'}[]>([]);
  let messageIdCount = 0;
  
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  let token = '';

  onMount(async () => {
    token = localStorage.getItem('admin_secret') || '';
    if (!token) {
      window.location.href = '/';
      return;
    }
    await loadSettings();
  });

  async function loadSettings() {
    try {
      const res = await fetch(`${API_URL}/admin/config`, {
        headers: { console, 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401) {
        localStorage.removeItem('admin_secret');
        window.location.href = '/';
        return;
      }
      settings = await res.json();
    } catch (err) {
      showMessage('ERR_CONNECT: CANNOT READ DB', 'error');
    } finally {
      isLoading = false;
    }
  }

  async function saveSettings(e: Event) {
    e.preventDefault();
    isSaving = true;
    showMessage('WRITING_OVERRIDE...', 'info');

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
        showMessage('SYS_UPDATED: CONFIG SAVED', 'success');
        await loadSettings();
      } else {
        showMessage('ERR_CODE_500: OVERWRITE FAILED', 'error');
      }
    } catch (err) {
      showMessage('ERR_CONNECT: LINK LOST', 'error');
    } finally {
      isSaving = false;
    }
  }

  function showMessage(text: string, type: 'success' | 'error' | 'info') {
    const id = messageIdCount++;
    messages = [...messages, { id, text, type }];
    setTimeout(() => { messages = messages.filter(m => m.id !== id); }, 4000);
  }

  function logout() {
    localStorage.removeItem('admin_secret');
    window.location.href = '/';
  }
</script>

<div class="min-h-screen bg-bg text-text p-4 md:p-8 relative">
  <!-- Toasts -->
  <div class="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
    {#each messages as msg (msg.id)}
      <div 
        class="pointer-events-auto p-4 border font-mono text-[0.65rem] font-bold uppercase tracking-wider flex items-center gap-3 w-72
        {msg.type === 'error' ? 'bg-alpha-dim border-alpha/40 text-alpha' 
        : msg.type === 'success' ? 'bg-[#39ff14]/10 border-[#39ff14]/40 text-[#39ff14]' 
        : 'bg-beta-dim border-beta/40 text-beta'}"
      >
        <span>[{msg.type === 'error' ? 'FAIL' : msg.type === 'success' ? 'OK' : 'SYS'}]</span>
        {msg.text}
      </div>
    {/each}
  </div>

  <div class="max-w-5xl mx-auto space-y-12 relative z-10 stagger-enter">
    
    <header class="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-borderBright pb-6 gap-4">
      <div>
        <div class="font-mono text-[0.65rem] text-textMuted tracking-[0.2em] mb-4 bg-beta-dim border border-beta/30 inline-flex items-center gap-3 px-3 py-1 uppercase">
          <div class="w-1.5 h-1.5 bg-beta animate-[pulse-neon_1s_infinite_alternate]"></div>
          // PANEL DE SISTEMA V2.0 //
        </div>
        <h1 class="text-3xl md:text-5xl font-bold font-display text-white tracking-tighter uppercase glitch-text">
          CONFIG_<span class="text-beta">MATRIX</span>
        </h1>
      </div>
      <button onclick={logout} class="px-4 py-2 border border-borderBright bg-white/5 font-mono text-xs font-bold uppercase tracking-widest text-textMuted hover:border-text hover:text-text hover:bg-surface2 transition-colors">
        _DESCONECTAR
      </button>
    </header>

    {#if isLoading}
      <div class="flex items-center justify-center p-16 gap-4 bg-surface2/50 border border-border border-dashed font-mono text-sm text-textMuted">
        <span class="w-4 h-4 border-2 border-borderBright border-t-beta rounded-full animate-spin"></span>
        [ ESTABLECIENDO CONEXIÓN ]
      </div>
    {:else}
      <form onsubmit={saveSettings} class="space-y-10">
        
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          <!-- LLM Config Section -->
          <section class="bg-surface border border-border p-6 md:p-8 relative">
            <div class="absolute top-0 left-0 w-4 h-4 border-l-2 border-t-2 border-beta pointer-events-none"></div>

            <div class="mb-8 border-b border-borderBright pb-4">
              <h2 class="text-xl font-bold font-display text-white mb-2 text-beta">
                >> MOTOR_JUEZ_IA
              </h2>
              <p class="font-mono text-[0.65rem] uppercase text-textMuted tracking-widest">
                Parámetros Globales. Requiere Credenciales Válidas.
              </p>
            </div>
            
            <div class="space-y-6">
              <div class="space-y-2">
                <label class="block font-mono text-[0.7rem] font-bold text-text uppercase tracking-widest">
                  [ PROVEEDOR ACTIVO ]
                </label>
                <select bind:value={settings['JUDGE_PROVIDER']} class="w-full bg-bg border border-borderBright px-4 py-3 text-sm text-beta font-mono font-bold focus:outline-none focus:border-beta focus:bg-beta-dim transition-colors appearance-none cursor-pointer uppercase">
                  <option value="auto">DETECCIÓN AUTOMÁTICA (RECOMENDADO)</option>
                  <option value="anthropic">RED ANTHROPIC (CLAUDE)</option>
                  <option value="openrouter">CLÚSTER OPENROUTER</option>
                  <option value="groq">UNIDAD GROQ (LPU)</option>
                </select>
              </div>

              <!-- Anthropic -->
              <div class="bg-bg border border-border p-4 space-y-4">
                <div class="flex justify-between items-center mb-2">
                  <span class="font-mono text-[0.6rem] font-bold uppercase text-white bg-white/10 px-2 py-1">ANTHROPIC</span>
                  {#if settings['ANTHROPIC_API_KEY']?.includes('...')}<span class="font-mono text-[0.6rem] font-bold text-[#39ff14] border border-[#39ff14]/30 px-2 py-1 bg-[#39ff14]/10">DETECTADO</span>{/if}
                </div>
                <div class="space-y-2">
                  <label class="block font-mono text-[0.6rem] font-bold text-textMuted uppercase">API KEY</label>
                  <input type="password" placeholder="sk-ant-..." bind:value={settings['ANTHROPIC_API_KEY']} class="w-full bg-surface2 border border-border px-3 py-2 text-[0.8rem] text-text font-mono focus:outline-none focus:border-white transition-all" />
                </div>
                <div class="space-y-2">
                  <label class="block font-mono text-[0.6rem] font-bold text-textMuted uppercase">MODELO DE LENGUAJE</label>
                  <input type="text" placeholder="claude-3-5-sonnet-20241022" bind:value={settings['JUDGE_MODEL_ANTHROPIC']} class="w-full bg-surface2 border border-border px-3 py-2 text-[0.8rem] text-text font-mono focus:outline-none focus:border-white transition-all" />
                </div>
              </div>

              <!-- OpenRouter -->
              <div class="bg-bg border border-border p-4 space-y-4">
                <div class="flex justify-between items-center mb-2">
                  <span class="font-mono text-[0.6rem] font-bold uppercase text-white bg-white/10 px-2 py-1">OPENROUTER</span>
                  {#if settings['OPENROUTER_API_KEY']?.includes('...')}<span class="font-mono text-[0.6rem] font-bold text-[#39ff14] border border-[#39ff14]/30 px-2 py-1 bg-[#39ff14]/10">DETECTADO</span>{/if}
                </div>
                <div class="space-y-2">
                  <label class="block font-mono text-[0.6rem] font-bold text-textMuted uppercase">API KEY</label>
                  <input type="password" placeholder="sk-or-..." bind:value={settings['OPENROUTER_API_KEY']} class="w-full bg-surface2 border border-border px-3 py-2 text-[0.8rem] text-text font-mono focus:outline-none focus:border-white transition-all" />
                </div>
                <div class="space-y-2">
                  <label class="block font-mono text-[0.6rem] font-bold text-textMuted uppercase">MODELO DE LENGUAJE</label>
                  <input type="text" placeholder="google/gemini-2.0-flash-001" bind:value={settings['JUDGE_MODEL_OPENROUTER']} class="w-full bg-surface2 border border-border px-3 py-2 text-[0.8rem] text-text font-mono focus:outline-none focus:border-white transition-all" />
                </div>
              </div>

              <!-- Groq -->
              <div class="bg-bg border border-border p-4 space-y-4">
                <div class="flex justify-between items-center mb-2">
                  <span class="font-mono text-[0.6rem] font-bold uppercase text-white bg-white/10 px-2 py-1">GROQ</span>
                  {#if settings['GROQ_API_KEY']?.includes('...')}<span class="font-mono text-[0.6rem] font-bold text-[#39ff14] border border-[#39ff14]/30 px-2 py-1 bg-[#39ff14]/10">DETECTADO</span>{/if}
                </div>
                <div class="space-y-2">
                  <label class="block font-mono text-[0.6rem] font-bold text-textMuted uppercase">API KEY</label>
                  <input type="password" placeholder="gsk_..." bind:value={settings['GROQ_API_KEY']} class="w-full bg-surface2 border border-border px-3 py-2 text-[0.8rem] text-text font-mono focus:outline-none focus:border-white transition-all" />
                </div>
                <div class="space-y-2">
                  <label class="block font-mono text-[0.6rem] font-bold text-textMuted uppercase">MODELO DE LENGUAJE</label>
                  <input type="text" placeholder="llama-3.3-70b-versatile" bind:value={settings['JUDGE_MODEL_GROQ']} class="w-full bg-surface2 border border-border px-3 py-2 text-[0.8rem] text-text font-mono focus:outline-none focus:border-white transition-all" />
                </div>
              </div>
            </div>
          </section>

          <div class="space-y-8 flex flex-col justify-between">
            <!-- Rules Section -->
            <section class="bg-surface border border-border p-6 md:p-8 relative h-full">
              <div class="absolute top-0 right-0 w-4 h-4 border-r-2 border-t-2 border-gold pointer-events-none"></div>
              
              <div class="mb-8 border-b border-borderBright pb-4">
                <h2 class="text-xl font-bold font-display text-white mb-2 text-gold">
                  >> REGLAS_BATALLA
                </h2>
                <p class="font-mono text-[0.65rem] text-textMuted uppercase tracking-wider">
                  Matriz de simulación predeterminada
                </p>
              </div>
              
              <div class="grid grid-cols-1 gap-8">
                <div class="space-y-3">
                  <label class="block font-mono text-[0.7rem] font-bold text-text uppercase tracking-widest">
                    [ RONDAS MÁXIMAS ]
                  </label>
                  <div class="flex items-center gap-4">
                    <input type="number" min="1" max="10" placeholder="3" bind:value={settings['MAX_ROUNDS']} class="w-24 bg-bg border border-borderBright px-4 py-3 text-2xl text-gold font-mono font-bold focus:outline-none focus:border-gold focus:bg-gold-dim transition-colors text-center" />
                    <p class="font-mono text-[0.6rem] text-textDim uppercase tracking-widest max-w-[200px] leading-relaxed">
                      Límite duro de iteraciones permitidas en el canal MCP.
                    </p>
                  </div>
                </div>
                <div class="space-y-3">
                  <label class="block font-mono text-[0.7rem] font-bold text-text uppercase tracking-widest">
                    [ LÍMITE DE PALABRAS ]
                  </label>
                  <div class="flex items-center gap-4">
                    <input type="number" min="50" max="2000" placeholder="∞" bind:value={settings['MAX_WORDS']} class="w-24 bg-bg border border-borderBright px-4 py-3 text-2xl text-gold font-mono font-bold focus:outline-none focus:border-gold focus:bg-gold-dim transition-colors text-center" />
                    <p class="font-mono text-[0.6rem] text-textDim uppercase tracking-widest max-w-[200px] leading-relaxed">
                      Deja en blanco (∞) para debate sin barreras léxicas.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        <!-- Submit Footer -->
        <div class="bg-surface2 border border-borderBright p-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <p class="font-mono text-[0.6rem] font-bold text-alpha uppercase tracking-widest px-2 animate-pulse">
            ! ATENCIÓN: LOS PARCHES AFECTAN A LA MATRIZ DEL JUEZ DE INMEDIATO.
          </p>
          <button 
            type="submit" 
            disabled={isSaving} 
            class="w-full md:w-auto min-w-[250px] bg-alpha font-mono text-bg font-extrabold text-[0.85rem] tracking-[0.2em] uppercase py-4 outline-none border border-transparent shadow-[0_0_20px_var(--alpha-dim)] hover:bg-white hover:text-black hover:shadow-[0_0_30px_rgba(255,255,255,0.5)] transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            {#if isSaving}
              [ COMPILANDO_NÚCLEO... ]
            {:else}
              [ INYECTAR OVERRIDE ]
            {/if}
          </button>
        </div>
        
      </form>
    {/if}
  </div>
</div>
