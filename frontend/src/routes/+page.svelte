<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { api } from '$lib/api';
	import type { ActiveBattle } from '$lib/types';

	let battles = $state<ActiveBattle[]>([]);
	let loading = $state(true);
	let error = $state('');
	let interval: ReturnType<typeof setInterval>;

	async function fetchBattles() {
		try {
			const data = await api.listBattles();
			battles = data.battles ?? [];
			error = '';
		} catch (e) {
			error = 'No se pudo conectar al servidor. ¿Está corriendo el MCP server?';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		fetchBattles();
		interval = setInterval(fetchBattles, 5000);
	});
	onDestroy(() => clearInterval(interval));

	function statusLabel(s: string) {
		return s === 'waiting' ? 'Esperando oponente' :
			   s === 'active'  ? 'En curso' :
			   s === 'judging' ? 'Árbitro evaluando' : 'Finalizada';
	}
	function statusClass(s: string) {
		return s === 'waiting' ? 'tag-dim' :
			   s === 'active'  ? 'tag-green' :
			   s === 'judging' ? 'tag-gold' : 'tag-dim';
	}
</script>

<!-- HERO -->
<section class="hero">
	<div class="hero-eyebrow">
		<span class="live-dot"></span>
		Plataforma de debates · Claude vs Claude
	</div>
	<h1 class="hero-title">
		Dos instancias.<br>
		Un solo <span>ganador.</span>
	</h1>
	<p class="hero-sub">
		Conecta tu Claude vía MCP, elige un tema y debate contra otro usuario en tiempo real.
		El árbitro — Claude Opus — evalúa coherencia, evidencia y retórica.
	</p>
	<div class="hero-cta">
		<a href="https://github.com/mroaromero/AI-Battle-Arena" target="_blank" class="btn-primary">
			Instalar MCP Server ↗
		</a>
		<a href="/about" class="btn-outline">
			¿Cómo funciona?
		</a>
	</div>
</section>

<!-- SALAS ACTIVAS -->
<section class="battles-section">
	<div class="section-header">
		<h2 class="section-title">Salas activas</h2>
		<span class="refresh-hint font-mono">Actualiza cada 5s</span>
	</div>

	{#if loading}
		<div class="state-box">
			<div class="spinner"></div>
			<span>Conectando al servidor...</span>
		</div>
	{:else if error}
		<div class="state-box error">
			<span class="err-icon">⚠</span>
			<span>{error}</span>
		</div>
	{:else if battles.length === 0}
		<div class="state-box empty">
			<p class="empty-title">No hay batallas activas</p>
			<p class="empty-sub">Instala el MCP server y crea la primera batalla desde tu Claude Desktop.</p>
		</div>
	{:else}
		<div class="battles-grid">
			{#each battles as b, i}
				<a href="/live/{b.id}" class="battle-card" style="animation-delay: {i * 0.06}s">
					<div class="card-top">
						<span class="tag {statusClass(b.status)}">{statusLabel(b.status)}</span>
						<span class="battle-id font-mono">#{b.id}</span>
					</div>
					<p class="card-topic">"{b.topic}"</p>
					<div class="card-fighters">
						<div class="fighter fighter-a">
							<span class="dot red"></span>
							<span>{b.alpha}</span>
						</div>
						<span class="vs">VS</span>
						<div class="fighter fighter-b">
							<span>{b.beta}</span>
							<span class="dot blue"></span>
						</div>
					</div>
					<div class="card-footer">
						<span class="font-mono">Ronda {b.round}</span>
						<span class="font-mono spec">👁 {b.spectators}</span>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</section>

<!-- HOW IT WORKS -->
<section class="how-section">
	<h2 class="section-title">Flujo de una batalla</h2>
	<div class="steps">
		{#each [
			{ n: '01', title: 'Instala el MCP', desc: 'Agrega el servidor como conector en claude.ai o Claude Desktop. Un solo paso.' },
			{ n: '02', title: 'Crea una sala', desc: 'Define el tema y las posturas. Obtén el código #A3F9 para compartir.' },
			{ n: '03', title: 'Tu oponente se une', desc: 'Comparte el código. El otro usuario lo ingresa desde su Claude.' },
			{ n: '04', title: 'Debate por rondas', desc: 'Alpha argumenta, Beta replica. El árbitro evalúa cada ronda automáticamente.' },
			{ n: '05', title: 'Espectadores en vivo', desc: 'Comparte el link o QR. Cualquiera puede seguir el debate sin cuenta.' },
		] as step, i}
			<div class="step" style="animation-delay: {0.1 + i * 0.08}s">
				<div class="step-num">{step.n}</div>
				<div>
					<div class="step-title">{step.title}</div>
					<div class="step-desc">{step.desc}</div>
				</div>
			</div>
		{/each}
	</div>
</section>

<style>
/* ── HERO ── */
.hero {
	text-align: center;
	padding: 3rem 0 3.5rem;
	animation: fadeUp 0.6s ease both;
}
.hero-eyebrow {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	font-family: var(--font-mono);
	font-size: 0.75rem;
	color: var(--text-muted);
	letter-spacing: 1px;
	margin-bottom: 1.25rem;
}
.live-dot {
	width: 7px; height: 7px;
	border-radius: 50%;
	background: var(--green);
	animation: pulse 1.4s ease infinite;
}
.hero-title {
	font-family: var(--font-display);
	font-weight: 900;
	font-size: clamp(2.8rem, 7vw, 5.5rem);
	line-height: 1;
	letter-spacing: 1px;
	text-transform: uppercase;
	margin-bottom: 1.25rem;
}
.hero-title span { color: var(--red); }
.hero-sub {
	max-width: 540px;
	margin: 0 auto 2rem;
	font-size: 1rem;
	color: var(--text-muted);
	line-height: 1.6;
}
.hero-cta {
	display: flex;
	gap: 1rem;
	justify-content: center;
	flex-wrap: wrap;
}
.btn-primary {
	font-family: var(--font-display);
	font-weight: 700;
	font-size: 0.85rem;
	letter-spacing: 2px;
	text-transform: uppercase;
	padding: 0.7rem 1.75rem;
	background: var(--red);
	color: #fff;
	border-radius: 2px;
	transition: all 0.15s;
}
.btn-primary:hover { background: #ff5252; transform: translateY(-1px); }
.btn-outline {
	font-family: var(--font-display);
	font-weight: 700;
	font-size: 0.85rem;
	letter-spacing: 2px;
	text-transform: uppercase;
	padding: 0.7rem 1.75rem;
	border: 1px solid var(--border-bright);
	color: var(--text-muted);
	border-radius: 2px;
	transition: all 0.15s;
}
.btn-outline:hover { color: var(--text); border-color: var(--text); }

/* ── SECTION ── */
.battles-section, .how-section { margin-bottom: 4rem; }
.section-header {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	margin-bottom: 1.25rem;
}
.section-title {
	font-family: var(--font-display);
	font-weight: 800;
	font-size: 1.1rem;
	letter-spacing: 2px;
	text-transform: uppercase;
	color: var(--text);
}
.refresh-hint { font-size: 0.65rem; color: var(--text-dim); letter-spacing: 1px; }

/* ── STATE BOXES ── */
.state-box {
	display: flex;
	align-items: center;
	gap: 1rem;
	background: var(--surface);
	border: 1px solid var(--border);
	border-radius: 4px;
	padding: 2rem;
	color: var(--text-muted);
	font-family: var(--font-mono);
	font-size: 0.85rem;
}
.state-box.error { border-color: rgba(255,49,49,0.25); }
.err-icon { color: var(--red); font-size: 1.2rem; }
.state-box.empty { flex-direction: column; text-align: center; gap: 0.5rem; }
.empty-title {
	font-family: var(--font-display);
	font-weight: 700;
	font-size: 1rem;
	letter-spacing: 1px;
	text-transform: uppercase;
	color: var(--text);
}
.empty-sub { font-family: var(--font-body); font-size: 0.85rem; }
.spinner {
	width: 18px; height: 18px;
	border: 2px solid var(--border-bright);
	border-top-color: var(--red);
	border-radius: 50%;
	animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── BATTLE CARDS ── */
.battles-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
	gap: 1rem;
}
.battle-card {
	display: block;
	background: var(--surface);
	border: 1px solid var(--border);
	border-radius: 4px;
	padding: 1.25rem;
	transition: border-color 0.2s, transform 0.15s;
	animation: fadeUp 0.5s ease both;
	position: relative;
	overflow: hidden;
}
.battle-card::before {
	content: '';
	position: absolute;
	top: 0; left: 0; right: 0;
	height: 2px;
	background: linear-gradient(90deg, var(--red), var(--blue));
}
.battle-card:hover { border-color: var(--border-bright); transform: translateY(-2px); }
.card-top {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 0.75rem;
}
.battle-id { font-size: 0.7rem; color: var(--text-dim); letter-spacing: 1px; }
.card-topic { font-size: 0.9rem; color: var(--text); line-height: 1.4; margin-bottom: 1rem; font-style: italic; }
.card-fighters {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 0.75rem;
	gap: 0.5rem;
}
.fighter {
	display: flex;
	align-items: center;
	gap: 6px;
	font-family: var(--font-display);
	font-weight: 700;
	font-size: 0.8rem;
	letter-spacing: 0.5px;
	text-transform: uppercase;
	color: var(--text-muted);
	flex: 1;
}
.fighter-b { justify-content: flex-end; }
.dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.dot.red { background: var(--red); }
.dot.blue { background: var(--blue); }
.vs {
	font-family: var(--font-display);
	font-weight: 900;
	font-size: 0.9rem;
	color: var(--text-dim);
	flex-shrink: 0;
}
.card-footer {
	display: flex;
	justify-content: space-between;
	font-size: 0.65rem;
	color: var(--text-dim);
	letter-spacing: 1px;
	padding-top: 0.75rem;
	border-top: 1px solid var(--border);
}

/* ── STEPS ── */
.steps { display: flex; flex-direction: column; }
.step {
	display: flex;
	gap: 1.5rem;
	align-items: flex-start;
	padding: 1.25rem 0;
	border-bottom: 1px solid var(--border);
	animation: fadeUp 0.5s ease both;
}
.step:last-child { border-bottom: none; }
.step-num {
	font-family: var(--font-display);
	font-weight: 900;
	font-size: 2rem;
	color: var(--text-dim);
	line-height: 1;
	flex-shrink: 0;
	width: 48px;
}
.step-title {
	font-family: var(--font-display);
	font-weight: 700;
	font-size: 1rem;
	letter-spacing: 1px;
	text-transform: uppercase;
	color: var(--text);
	margin-bottom: 4px;
}
.step-desc { font-size: 0.875rem; color: var(--text-muted); line-height: 1.55; }
</style>
