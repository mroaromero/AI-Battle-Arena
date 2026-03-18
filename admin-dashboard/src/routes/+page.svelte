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
        error = 'Token inválido o servidor no disponible.';
      }
    } catch (err) {
      error = 'Error de conexión con el backend MCP.';
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

<div class="flex h-full min-h-screen items-center justify-center p-4">
  <div class="w-full max-w-sm rounded-xl border border-border bg-zinc-950 p-8 shadow-2xl">
    <div class="mb-8 text-center">
      <h1 class="text-2xl font-bold tracking-tight text-white mb-1">AI Battle Arena</h1>
      <p class="text-sm text-muted-foreground uppercase tracking-widest text-primary">System Override</p>
    </div>
    
    <form onsubmit={(e) => { e.preventDefault(); login(); }} class="space-y-4">
      <div class="space-y-2">
        <label for="secret" class="text-sm font-medium leading-none text-white">
          Access Token
        </label>
        <input 
          id="secret"
          type="password" 
          bind:value={secret}
          placeholder="••••••••••••"
          class="flex h-10 w-full rounded-md border border-border bg-black px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
          required
        />
      </div>
      
      {#if error}
        <p class="text-sm font-medium text-red-500">{error}</p>
      {/if}
      
      <button 
        type="submit" 
        disabled={isLoading}
        class="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-bold tracking-wide text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background disabled:pointer-events-none disabled:opacity-50 transition-colors"
      >
        {isLoading ? 'AUTHENTICATING...' : 'LOGIN'}
      </button>
    </form>
  </div>
</div>
