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
        error = 'ERROR DE CÓDIGO 401: AUTORIZACIÓN DENEGADA';
      }
    } catch (err) {
      error = 'ERROR CRÍTICO: SERVIDOR INALCANZABLE';
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

<div class="min-h-screen flex items-center justify-center p-6 relative">
  <div class="w-full max-w-lg stagger-enter">
    
    <div class="font-mono text-[0.65rem] text-textMuted tracking-[0.2em] mb-6 bg-alpha-dim border border-alpha/30 inline-flex items-center gap-3 px-4 py-1.5 uppercase">
      <div class="w-2 h-2 bg-alpha animate-[pulse-neon_1s_infinite_alternate] shadow-[0_0_10px_var(--alpha-neon)]"></div>
      // ACCESO RESTRINGIDO - MODO ADMINISTRADOR //
    </div>
    
    <h1 class="font-display text-4xl sm:text-5xl font-bold uppercase tracking-tighter mb-8 glitch-text cursor-default">
       BATTLE_<span class="text-alpha">ADMIN</span>
    </h1>

    <div class="bg-surface border border-borderBright p-8 relative">
      <form onsubmit={(e: Event) => { e.preventDefault(); login(); }} class="space-y-8 relative z-10">
        
        <div class="space-y-4">
          <label for="secret" class="block font-mono text-sm font-bold text-text uppercase tracking-widest cursor-text">
            {'>'} INSERTE TOKEN MAESTRO
          </label>
          <input 
            id="secret"
            type="password" 
            bind:value={secret}
            placeholder="••••••••••••"
            class="w-full bg-bg border border-borderBright px-4 py-3 text-lg font-mono text-text outline-none focus:border-alpha focus:bg-alpha-dim transition-colors placeholder:text-textDim"
            required
          />
        </div>
        
        {#if error}
          <div class="font-mono text-[0.7rem] font-bold text-alpha bg-alpha-dim border border-alpha/30 p-4 tracking-widest uppercase">
            [!]: {error}
          </div>
        {/if}
        
        <button 
          type="submit" 
          disabled={isLoading}
          class="w-full bg-alpha font-mono text-bg font-extrabold text-[0.8rem] tracking-[0.2em] uppercase py-4 outline-none border border-transparent shadow-[0_0_20px_var(--alpha-dim)] hover:bg-white hover:text-black hover:shadow-[0_0_30px_rgba(255,255,255,0.5)] active:translate-y-px transition-all disabled:opacity-50 disabled:pointer-events-none"
        >
          {#if isLoading}
            [ ESTABLECIENDO CONEXIÓN... ]
          {:else}
            [ INICIAR_ACCESO ]
          {/if}
        </button>
      </form>
      
      <!-- Decorative brutalist corners -->
      <div class="absolute bottom-[-1px] right-[-1px] w-4 h-4 border-r-2 border-b-2 border-alpha pointer-events-none"></div>
      <div class="absolute top-[-1px] left-[-1px] w-4 h-4 border-l-2 border-t-2 border-alpha pointer-events-none"></div>
    </div>
    
  </div>
</div>
