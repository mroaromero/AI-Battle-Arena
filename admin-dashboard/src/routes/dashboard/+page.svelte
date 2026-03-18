<script lang="ts">
  import { onMount } from 'svelte';
  
  let settings: Record<string, string> = $state({});
  let isLoading = $state(true);
  let isSaving = $state(false);
  let message = $state({ text: '', type: '' });
  
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
      showMessage('Error cargando configuraciones', 'error');
    } finally {
      isLoading = false;
    }
  }

  async function saveSettings(e: Event) {
    e.preventDefault();
    isSaving = true;
    showMessage('Guardando...', 'info');

    try {
      const payload = { ...settings };
      // Omit keys that are empty or contain masked passwords
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
        showMessage('Configuración guardada exitosamente.', 'success');
        await loadSettings();
      } else {
        showMessage('Error al guardar.', 'error');
      }
    } catch (err) {
      showMessage('Error de conexión.', 'error');
    } finally {
      isSaving = false;
    }
  }

  function showMessage(text: string, type: 'success' | 'error' | 'info') {
    message = { text, type };
    if (type === 'success') setTimeout(() => message = { text: '', type: '' }, 3000);
  }

  function logout() {
    localStorage.removeItem('admin_secret');
    window.location.href = '/';
  }
</script>

<div class="min-h-screen bg-background text-foreground p-8">
  <div class="max-w-4xl mx-auto space-y-8">
    
    <header class="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-border pb-6">
      <div>
        <h1 class="text-3xl font-bold text-white tracking-tight">System Configuration</h1>
        <p class="text-muted-foreground mt-1">AI Battle Arena Backend Overrides</p>
      </div>
      <button onclick={logout} class="mt-4 sm:mt-0 px-4 py-2 bg-red-950/50 hover:bg-red-900 border border-red-900 text-red-200 text-sm font-medium rounded transition-colors">
        Logout
      </button>
    </header>

    {#if message.text}
      <div class={`p-4 rounded border ${message.type === 'error' ? 'bg-red-950/50 border-red-900 text-red-200' : message.type === 'success' ? 'bg-green-950/50 border-green-900 text-green-200' : 'bg-blue-950/50 border-blue-900 text-blue-200'}`}>
        {message.text}
      </div>
    {/if}

    {#if isLoading}
      <div class="flex items-center justify-center p-12">
        <div class="animate-pulse flex space-x-2">
          <div class="w-3 h-3 bg-primary rounded-full"></div>
          <div class="w-3 h-3 bg-primary rounded-full"></div>
          <div class="w-3 h-3 bg-primary rounded-full"></div>
        </div>
      </div>
    {:else}
      <form onsubmit={saveSettings} class="space-y-8">
        
        <!-- LLM Config Section -->
        <section class="bg-zinc-950 border border-border rounded-xl p-6 shadow-xl">
          <div class="mb-6">
            <h2 class="text-xl font-semibold text-white">LLM Judge Parameters</h2>
            <p class="text-sm text-muted-foreground">Configure global provider and API credentials.</p>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="col-span-1 md:col-span-2 space-y-2">
              <label class="text-sm font-medium text-white">Active Provider</label>
              <select bind:value={settings['JUDGE_PROVIDER']} class="w-full bg-black border border-border rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-primary">
                <option value="auto">Auto (Detect by API Key)</option>
                <option value="anthropic">Anthropic</option>
                <option value="openrouter">OpenRouter</option>
                <option value="groq">Groq</option>
              </select>
            </div>

            <!-- Anthropic -->
            <div class="space-y-2">
              <label class="text-sm font-medium text-white flex justify-between">
                <span>Anthropic API Key</span>
                {#if settings['ANTHROPIC_API_KEY']?.includes('...')}<span class="text-xs text-green-500">Configured</span>{/if}
              </label>
              <input type="password" placeholder="sk-ant-..." bind:value={settings['ANTHROPIC_API_KEY']} class="w-full bg-black border border-border rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-primary" />
            </div>
            <div class="space-y-2">
              <label class="text-sm font-medium text-white">Anthropic Model</label>
              <input type="text" placeholder="claude-3-5-sonnet-20241022" bind:value={settings['JUDGE_MODEL_ANTHROPIC']} class="w-full bg-black border border-border rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-primary" />
            </div>

            <!-- OpenRouter -->
            <div class="space-y-2">
              <label class="text-sm font-medium text-white flex justify-between">
                <span>OpenRouter API Key</span>
                {#if settings['OPENROUTER_API_KEY']?.includes('...')}<span class="text-xs text-green-500">Configured</span>{/if}
              </label>
              <input type="password" placeholder="sk-or-..." bind:value={settings['OPENROUTER_API_KEY']} class="w-full bg-black border border-border rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-primary" />
            </div>
            <div class="space-y-2">
              <label class="text-sm font-medium text-white">OpenRouter Model</label>
              <input type="text" placeholder="google/gemini-2.0-flash-001" bind:value={settings['JUDGE_MODEL_OPENROUTER']} class="w-full bg-black border border-border rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-primary" />
            </div>

            <!-- Groq -->
            <div class="space-y-2">
              <label class="text-sm font-medium text-white flex justify-between">
                <span>Groq API Key</span>
                {#if settings['GROQ_API_KEY']?.includes('...')}<span class="text-xs text-green-500">Configured</span>{/if}
              </label>
              <input type="password" placeholder="gsk_..." bind:value={settings['GROQ_API_KEY']} class="w-full bg-black border border-border rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-primary" />
            </div>
            <div class="space-y-2">
              <label class="text-sm font-medium text-white">Groq Model</label>
              <input type="text" placeholder="llama-3.3-70b-versatile" bind:value={settings['JUDGE_MODEL_GROQ']} class="w-full bg-black border border-border rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-primary" />
            </div>
          </div>
        </section>

        <!-- Battle Rules Section -->
        <section class="bg-zinc-950 border border-border rounded-xl p-6 shadow-xl">
          <div class="mb-6">
            <h2 class="text-xl font-semibold text-white">Global Rules</h2>
            <p class="text-sm text-muted-foreground">Default parameters for new matches.</p>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2">
              <label class="text-sm font-medium text-white">Max Rounds Allowed</label>
              <input type="number" min="1" max="10" placeholder="3" bind:value={settings['MAX_ROUNDS']} class="w-full bg-black border border-border rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-primary" />
              <p class="text-xs text-muted-foreground">Maximum rounds a debate can last.</p>
            </div>
            <div class="space-y-2">
              <label class="text-sm font-medium text-white">Max Words Per Argument</label>
              <input type="number" min="50" max="2000" placeholder="Unbounded" bind:value={settings['MAX_WORDS']} class="w-full bg-black border border-border rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-primary" />
              <p class="text-xs text-muted-foreground">Empty means no restriction.</p>
            </div>
          </div>
        </section>

        <div class="flex justify-end pt-4">
          <button type="submit" disabled={isSaving} class="px-8 py-3 bg-primary text-primary-foreground font-bold rounded-md hover:bg-primary/90 focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 transition-colors">
            {isSaving ? 'SAVING...' : 'SAVE CONFIGURATION'}
          </button>
        </div>
        
      </form>
    {/if}
  </div>
</div>
