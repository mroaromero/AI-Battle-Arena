<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  
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
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.status === 401) {
        localStorage.removeItem('admin_secret');
        window.location.href = '/';
        return;
      }
      settings = await res.json();
    } catch (err) {
      showMessage('ERROR CRÍTICO LEYENDO BD', 'error');
    } finally {
      isLoading = false;
    }
  }

  async function saveSettings(e: Event) {
    e.preventDefault();
    isSaving = true;
    showMessage('INICIANDO SOBREESCRITURA...', 'info');

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
        showMessage('PARÁMETROS ACTUALIZADOS CON ÉXITO', 'success');
        await loadSettings();
      } else {
        showMessage('FALLA EN LA SOBREESCRITURA DE DATOS', 'error');
      }
    } catch (err) {
      showMessage('ENLACE PERDIDO MIENTRAS SE GUARDABA', 'error');
    } finally {
      isSaving = false;
    }
  }

  function showMessage(text: string, type: 'success' | 'error' | 'info') {
    const id = messageIdCount++;
    messages = [...messages, { id, text, type }];
    setTimeout(() => {
      messages = messages.filter(m => m.id !== id);
    }, 4000);
  }

  function logout() {
    localStorage.removeItem('admin_secret');
    window.location.href = '/';
  }
</script>

<div class="min-h-screen bg-transparent text-foreground p-4 md:p-8 relative">
  <!-- Toasts container -->
  <div class="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
    {#each messages as msg (msg.id)}
      <div 
        transition:fade
        class="pointer-events-auto p-4 hud-corners border-l-4 text-sm font-display font-bold uppercase tracking-wider backdrop-blur-xl flex items-center gap-3 glass-panel shadow-2xl
        {msg.type === 'error' ? 'bg-destructive/20 border-destructive text-destructive text-glow-destructive' 
        : msg.type === 'success' ? 'bg-success/20 border-success text-success' 
        : 'bg-primary/20 border-primary text-primary text-glow'}"
      >
        <span class="w-2 h-2 rounded-full {msg.type === 'error' ? 'bg-destructive animate-ping' : msg.type === 'success' ? 'bg-success' : 'bg-primary'}"></span>
        {msg.text}
      </div>
    {/each}
  </div>

  <div class="max-w-6xl mx-auto space-y-8 relative z-10">
    
    <header class="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-white/10 pb-6 gap-4">
      <div>
        <div class="flex items-center gap-3 mb-2">
          <div class="h-2 w-2 bg-primary animate-pulse"></div>
          <p class="text-[0.65rem] text-primary font-mono uppercase tracking-[0.4em]">Enlace Establecido</p>
        </div>
        <h1 class="text-3xl md:text-5xl font-bold font-display text-white tracking-tighter text-glow">
          PANEL DE <span class="text-primary">CONTROL</span> V1.0
        </h1>
      </div>
      <button onclick={logout} class="group flex items-center gap-2 px-5 py-2.5 bg-red-950/30 hover:bg-destructive/20 border border-destructive/50 text-destructive text-xs font-display font-bold uppercase tracking-widest hud-corners transition-all duration-300 backdrop-blur-md">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="group-hover:-translate-x-1 transition-transform"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
        Desconectar
      </button>
    </header>

    {#if isLoading}
      <div class="flex flex-col items-center justify-center p-24 space-y-4">
        <div class="relative w-16 h-16">
          <div class="absolute inset-0 border-t-2 border-primary rounded-full animate-spin"></div>
          <div class="absolute inset-2 border-r-2 border-secondary rounded-full animate-spin" style="animation-direction: reverse; animation-duration: 2s;"></div>
        </div>
        <p class="text-sm font-mono text-primary animate-pulse uppercase tracking-widest text-glow">Decodificando Variables...</p>
      </div>
    {:else}
      <form onsubmit={saveSettings} class="space-y-8">
        
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          <!-- LLM Config Section -->
          <section class="glass-panel hud-corners p-6 md:p-8 relative group">
            <!-- Decorative accents -->
            <div class="absolute top-0 left-0 w-8 h-[2px] bg-primary"></div>
            <div class="absolute top-0 left-0 w-[2px] h-8 bg-primary"></div>
            
            <div class="mb-8 border-b border-white/5 pb-4">
              <h2 class="text-2xl font-bold font-display text-white mb-1 flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                MOTOR DE IA CENTRAL
              </h2>
              <p class="text-[0.7rem] text-muted-foreground font-mono uppercase tracking-wider">Credenciales y Modelos del Sistema Juez</p>
            </div>
            
            <div class="space-y-6">
              <div class="space-y-2">
                <label class="block text-xs font-bold text-white uppercase tracking-widest font-display">Proveedor Activo</label>
                <div class="relative group/select">
                  <select bind:value={settings['JUDGE_PROVIDER']} class="w-full bg-black/60 border border-white/10 rounded-none px-4 py-3 text-sm text-primary font-mono focus:outline-none focus:border-primary focus:bg-primary/5 transition-colors appearance-none cursor-pointer">
                    <option value="auto">Detección Automática (Recomendado)</option>
                    <option value="anthropic">Red Anthropic</option>
                    <option value="openrouter">Clúster OpenRouter</option>
                    <option value="groq">Unidad Groq (LPU)</option>
                  </select>
                  <div class="absolute inset-y-0 right-4 flex items-center pointer-events-none text-primary group-focus-within/select:rotate-180 transition-transform">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                  </div>
                </div>
              </div>

              <div class="my-6 border-t border-white/5 border-dashed"></div>

              <!-- Anthropic -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="space-y-2 group/input">
                  <label class="flex justify-between text-[0.65rem] font-bold text-white uppercase font-mono">
                    <span class="text-blue-400">Anthropic API Key</span>
                    {#if settings['ANTHROPIC_API_KEY']?.includes('...')}<span class="text-success animate-pulse">■ Activa</span>{/if}
                  </label>
                  <input type="password" placeholder="sk-ant-..." bind:value={settings['ANTHROPIC_API_KEY']} class="w-full bg-black/40 border-b border-l border-white/10 px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:border-blue-400 focus:bg-blue-400/5 transition-all" />
                </div>
                <div class="space-y-2 group/input">
                  <label class="block text-[0.65rem] font-bold text-white uppercase font-mono text-blue-400">Modelo Anthropic</label>
                  <input type="text" placeholder="claude-3-5-sonnet-20241022" bind:value={settings['JUDGE_MODEL_ANTHROPIC']} class="w-full bg-black/40 border-b border-l border-white/10 px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:border-blue-400 focus:bg-blue-400/5 transition-all" />
                </div>
              </div>

              <!-- OpenRouter -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="space-y-2 group/input">
                  <label class="flex justify-between text-[0.65rem] font-bold text-white uppercase font-mono">
                    <span class="text-indigo-400">OpenRouter API Key</span>
                    {#if settings['OPENROUTER_API_KEY']?.includes('...')}<span class="text-success animate-pulse">■ Activa</span>{/if}
                  </label>
                  <input type="password" placeholder="sk-or-..." bind:value={settings['OPENROUTER_API_KEY']} class="w-full bg-black/40 border-b border-l border-white/10 px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:border-indigo-400 focus:bg-indigo-400/5 transition-all" />
                </div>
                <div class="space-y-2 group/input">
                  <label class="block text-[0.65rem] font-bold text-white uppercase font-mono text-indigo-400">Modelo OpenRouter</label>
                  <input type="text" placeholder="google/gemini-2.0-flash-001" bind:value={settings['JUDGE_MODEL_OPENROUTER']} class="w-full bg-black/40 border-b border-l border-white/10 px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:border-indigo-400 focus:bg-indigo-400/5 transition-all" />
                </div>
              </div>

              <!-- Groq -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="space-y-2 group/input">
                  <label class="flex justify-between text-[0.65rem] font-bold text-white uppercase font-mono">
                    <span class="text-orange-400">Groq API Key</span>
                    {#if settings['GROQ_API_KEY']?.includes('...')}<span class="text-success animate-pulse">■ Activa</span>{/if}
                  </label>
                  <input type="password" placeholder="gsk_..." bind:value={settings['GROQ_API_KEY']} class="w-full bg-black/40 border-b border-l border-white/10 px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:border-orange-400 focus:bg-orange-400/5 transition-all" />
                </div>
                <div class="space-y-2 group/input">
                  <label class="block text-[0.65rem] font-bold text-white uppercase font-mono text-orange-400">Modelo Groq</label>
                  <input type="text" placeholder="llama-3.3-70b-versatile" bind:value={settings['JUDGE_MODEL_GROQ']} class="w-full bg-black/40 border-b border-l border-white/10 px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:border-orange-400 focus:bg-orange-400/5 transition-all" />
                </div>
              </div>
            </div>
          </section>

          <div class="space-y-8 flex flex-col justify-between">
            <!-- Battle Rules Section -->
            <section class="glass-panel hud-corners p-6 md:p-8 relative group">
              <div class="absolute top-0 right-0 w-8 h-[2px] bg-secondary"></div>
              <div class="absolute top-0 right-0 w-[2px] h-8 bg-secondary"></div>
              
              <div class="mb-8 border-b border-white/5 pb-4">
                <h2 class="text-2xl font-bold font-display text-white mb-1 flex items-center gap-3">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-secondary"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  MATRIZ DE COMBATE
                </h2>
                <p class="text-[0.7rem] text-muted-foreground font-mono uppercase tracking-wider">Parámetros Globales de Batalla</p>
              </div>
              
              <div class="grid grid-cols-1 gap-6">
                <div class="space-y-2 relative">
                  <label class="block text-[0.7rem] font-bold text-white uppercase font-display tracking-widest text-shadow-[0_0_5px_rgba(255,255,255,0.3)]">Rondas Máximas</label>
                  <div class="flex items-center">
                    <input type="number" min="1" max="10" placeholder="3" bind:value={settings['MAX_ROUNDS']} class="w-24 bg-black/60 border-b border-l border-white/10 px-4 py-3 text-2xl text-secondary font-mono font-bold focus:outline-none focus:border-secondary focus:bg-secondary/10 transition-colors text-center" />
                    <span class="ml-4 text-[0.65rem] text-muted-foreground font-mono uppercase tracking-widest max-w-[150px]">Tope absoluto de iteraciones permitidas en la arena.</span>
                  </div>
                </div>
                <div class="space-y-2 relative mt-4">
                  <label class="block text-[0.7rem] font-bold text-white uppercase font-display tracking-widest text-shadow-[0_0_5px_rgba(255,255,255,0.3)]">Límite de Palabras <span class="text-[0.6rem] text-muted-foreground">(Por turno)</span></label>
                  <div class="flex items-center">
                    <input type="number" min="50" max="2000" placeholder="∞" bind:value={settings['MAX_WORDS']} class="w-24 bg-black/60 border-b border-l border-white/10 px-4 py-3 text-2xl text-secondary font-mono font-bold focus:outline-none focus:border-secondary focus:bg-secondary/10 transition-colors text-center" />
                    <span class="ml-4 text-[0.65rem] text-muted-foreground font-mono uppercase tracking-widest max-w-[150px]">Vacio (∞) para desactivar el límite léxico de las IAs.</span>
                  </div>
                </div>
              </div>
            </section>

            <!-- Save Action -->
            <div class="flex flex-col items-end pt-4">
              <button 
                type="submit" 
                disabled={isSaving} 
                class="group relative inline-flex h-16 w-full md:w-auto min-w-[300px] items-center justify-center bg-primary text-black font-display text-xl font-bold tracking-widest uppercase hover:bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background disabled:pointer-events-none disabled:opacity-50 hud-corners transition-all duration-300 overflow-hidden box-glow"
              >
                <span class="relative z-10 flex items-center gap-3">
                  {#if isSaving}
                    <div class="w-4 h-4 border-2 border-black border-r-transparent rounded-full animate-spin"></div>
                    APLICANDO PARCHE...
                  {:else}
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="group-hover:scale-110 transition-transform"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                    COMPILAR OVERRIDE
                  {/if}
                </span>
                <div class="absolute inset-0 bg-white translate-y-[100%] group-hover:translate-y-0 transition-transform duration-300 ease-in-out"></div>
              </button>
              <div class="mt-4 flex items-center justify-end gap-2 text-[0.60rem] text-muted-foreground font-mono uppercase tracking-widest text-right">
                <span class="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-pulse"></span>
                Atención: Impacto inmediato en la matriz operativa.
              </div>
            </div>

          </div>
        </div>
        
      </form>
    {/if}
  </div>
</div>
