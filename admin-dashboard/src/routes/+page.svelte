<script lang="ts">
  import { onMount } from 'svelte';
  
  let secret = $state('');
  let error = $state('');
  let isLoading = $state(false);
  
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  async function login() {
    isLoading = true;
    error = '';
    
    try {
      const res = await fetch(`${API_URL}/admin/config`, {
        headers: {
          'Authorization': `Bearer ${secret}`
        }
      });
      
      if (res.ok) {
        localStorage.setItem('admin_secret', secret);
        window.location.href = '/dashboard';
      } else {
        error = 'ACCESO DENEGADO [Código 401]';
      }
    } catch (err) {
      error = 'ENLACE PERDIDO [Servidor Inalcanzable]';
    } finally {
      isLoading = false;
    }
  }

  onMount(() => {
    if (localStorage.getItem('admin_secret')) {
      window.location.href = '/dashboard';
    }
  });
</script>

<div class="relative flex h-full min-h-screen items-center justify-center p-4 overflow-hidden">
  
  <!-- Decorative background elements -->
  <div class="absolute inset-0 z-0 pointer-events-none">
    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px]"></div>
    <div class="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-secondary/15 rounded-full blur-[100px]"></div>
  </div>

  <div class="relative z-10 w-full max-w-md glass-panel hud-corners p-[1px] shadow-2xl box-glow">
    <div class="bg-black/85 hud-corners p-8 w-full h-full relative overflow-hidden backdrop-blur-3xl">
      
      <!-- Scanline overlay -->
      <div class="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] pointer-events-none opacity-50"></div>
      
      <div class="relative z-20 mb-10 text-center">
        <h1 class="text-4xl font-bold tracking-tighter text-white mb-2 font-display text-glow">
          <span class="text-primary">AI</span> BATTLE ARENA
        </h1>
        <div class="flex items-center justify-center gap-2">
          <div class="h-[1px] w-8 bg-primary/50"></div>
          <p class="text-[0.65rem] font-bold text-primary uppercase tracking-[0.3em] font-display">
            Nexo de Control Central
          </p>
          <div class="h-[1px] w-8 bg-primary/50"></div>
        </div>
      </div>
      
      <form onsubmit={(e) => { e.preventDefault(); login(); }} class="relative z-20 space-y-7">
        <div class="space-y-3">
          <label for="secret" class="block text-[0.7rem] font-bold uppercase tracking-widest text-primary font-display flex justify-between">
            <span>[ Clave de Anulación del Sistema ]</span>
            <span class="animate-pulse">_</span>
          </label>
          <div class="relative group">
            <input 
              id="secret"
              type="password" 
              bind:value={secret}
              placeholder="INTRODUZCA TOKEN CRIPTOGRÁFICO"
              class="flex h-12 w-full border-b-2 border-border bg-black/50 px-4 py-2 text-sm text-foreground font-mono focus:outline-none focus:border-primary focus:bg-primary/5 transition-all duration-300 disabled:opacity-50 placeholder:text-muted-foreground/50"
              required
            />
            <div class="absolute bottom-0 left-0 w-0 h-[2px] bg-primary transition-all duration-300 group-focus-within:w-full box-glow"></div>
            <!-- Decorative inputs accent -->
            <div class="absolute top-0 right-0 w-2 h-2 border-t border-r border-primary/50 opacity-0 group-focus-within:opacity-100 transition-opacity"></div>
            <div class="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-primary/50 opacity-0 group-focus-within:opacity-100 transition-opacity"></div>
          </div>
        </div>
        
        {#if error}
          <div class="flex items-center gap-3 p-3 bg-red-950/40 border border-destructive/50 text-destructive text-sm font-display uppercase font-bold text-glow-destructive hud-corners animate-in fade-in slide-in-from-top-2">
            <svg class="shrink-0" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
            <p>{error}</p>
          </div>
        {/if}
        
        <div class="pt-2">
          <button 
            type="submit" 
            disabled={isLoading}
            class="group relative inline-flex h-12 w-full items-center justify-center bg-primary text-primary-foreground font-display text-base font-bold tracking-widest uppercase hover:bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background disabled:pointer-events-none disabled:opacity-50 hud-corners transition-all duration-300 overflow-hidden box-glow"
          >
            <span class="relative z-10 flex items-center gap-2 group-hover:text-black transition-colors duration-300">
              {#if isLoading}
                <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                ENLAZANDO...
              {:else}
                INICIAR SECUENCIA
              {/if}
            </span>
            <!-- Glitch/Hover effect layer -->
            <div class="absolute inset-0 bg-white translate-y-[100%] group-hover:translate-y-0 transition-transform duration-300 ease-in-out"></div>
          </button>
        </div>
      </form>

      <!-- Decorative Cyber text -->
      <div class="relative z-20 mt-10 text-center border-t border-white/10 pt-4">
        <p class="text-[0.60rem] text-muted-foreground font-mono uppercase tracking-[0.2em]">
          ACCESO RESTRINGIDO A NIVEL ÓMICRON.<br>INTENTOS DE BRECHA SERÁN NEUTRALIZADOS.
        </p>
      </div>

    </div>
  </div>
</div>
