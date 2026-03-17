<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { api } from '$lib/api';
	import type { Battle } from '$lib/types';

	const battleId = $page.params.id.toUpperCase();

	let battle = $state<Battle | null>(null);
	let loading = $state(true);
	let error = $state('');
	let qrUrl = $state('');
	let interval: ReturnType<typeof setInterval>;

	async function fetchBattle() {
		try {
			battle = await api.watchBattle(battleId);
			error = '';
		} catch (e) {
			error = `Sala #${battleId} no encontrada.`;
		} finally {
			loading = false;
		}
	}

	onMount(async () => {
		await fetchBattle();
		interval = setInterval(() => {
			if (battle?.status !== 'finished') fetchBattle();
		}, 3000);
		qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(window.location.href)}&bgcolor=ffffff&color=111111&margin=2`;
	});
	onDestroy(() => clearInterval(interval));

	// ── Derived ──────────────────────────────────────────────────────────────
	let totalAlpha = $derived(battle?.rounds.reduce((s, r) => s + (r.scores?.alpha_total ?? 0), 0) ?? 0);
	let totalBeta  = $derived(battle?.rounds.reduce((s, r) => s + (r.scores?.beta_total ?? 0), 0) ?? 0);
	let totalMax   = $derived(Math.max(totalAlpha + totalBeta, 1));
	let pctAlpha   = $derived(Math.round((totalAlpha / totalMax) * 100));
	let pctBeta    = $derived(Math.round((totalBeta  / totalMax) * 100));

	let currentRound = $derived(
		battle?.rounds.find(r => r.round === battle?.rounds.length && !r.winner) ?? null
	);

	function winnerName(w: string | null) {
		if (!w) return '';
		if (w === 'draw') return 'Empate';
		if (w === 'alpha') return battle?.contenders.alpha?.name ?? 'Alpha';
		return battle?.contenders.beta?.name ?? 'Beta';
	}

	function statusLabel(s: string) {
		return s === 'waiting'  ? 'Esperando oponente' :
			   s === 'active'   ? 'En curso' :
			   s === 'judging'  ? 'Árbitro evaluando...' : 'Finalizada';
	}
</script>

<svelte:head>
	<title>#{battleId} — AI Battle Arena</title>
</svelte:head>

{#if loading}
	<div class="center-state">
		<div class="spinner-lg"></div>
		<span class="font-mono">Cargando batalla #{battleId}...</span>
	</div>
{:else if error || !battle}
	<div class="center-state error">
		<span class="err-icon">⚠</span>
		<p>{error || 'Batalla no encontrada.'}</p>
		<a href="/" class="back-link">← Volver al lobby</a>
	</div>
{:else}

<!-- BATTLE HEADER -->
<div class="battle-header">
	<div class="header-top">
		<a href="/" class="back-link">← Lobby</a>
		<div class="status-group">
			{#if battle.status !== 'finished'}
				<span class="live-indicator"><span class="live-dot"></span> En vivo</span>
			{/if}
			<span class="tag {battle.status === 'active' ? 'tag-green' : battle.status === 'judging' ? 'tag-gold' : 'tag-dim'}">
				{statusLabel(battle.status)}
			</span>
			<span class="room-id font-mono">#{battleId}</span>
		</div>
	</div>
	<h1 class="topic">"{battle.topic}"</h1>
	<div class="battle-meta font-mono">
		<span>Ronda {battle.rounds.filter(r => r.winner).length}/{battle.rounds.length}</span>
		<span>👁 {battle.spectator_count} espectadores</span>
	</div>
</div>

<!-- FIGHTERS + SCORE -->
<div class="fighters-row">
	<div class="fighter-card red" class:active={battle.status === 'active' && currentRound && !currentRound.alpha_argument}>
		<div class="fc-label">Contendiente Alpha</div>
		<div class="fc-name">{battle.contenders.alpha?.name ?? '—'}</div>
		<span class="tag tag-red">{battle.contenders.alpha?.stance ?? 'A favor'}</span>
		{#if battle.final_winner === 'alpha'}
			<div class="winner-crown">🏆 Ganador</div>
		{/if}
	</div>

	<div class="vs-col">
		<div class="vs-text">VS</div>
		<div class="score-block">
			<div class="score-nums">
				<span style="color:var(--red)">{totalAlpha}</span>
				<span class="score-sep font-mono">—</span>
				<span style="color:var(--blue)">{totalBeta}</span>
			</div>
			<div class="score-track">
				<div class="sf-red" style="width:{pctAlpha}%"></div>
				<div class="sf-blue" style="width:{pctBeta}%"></div>
			</div>
		</div>
	</div>

	<div class="fighter-card blue" class:active={battle.status === 'active' && currentRound?.alpha_argument && !currentRound?.beta_argument}>
		<div class="fc-label">Contendiente Beta</div>
		<div class="fc-name">{battle.contenders.beta?.name ?? '—'}</div>
		<span class="tag tag-blue">{battle.contenders.beta?.stance ?? 'En contra'}</span>
		{#if battle.final_winner === 'beta'}
			<div class="winner-crown">🏆 Ganador</div>
		{/if}
	</div>
</div>

<!-- FINAL WINNER BANNER -->
{#if battle.status === 'finished' && battle.final_winner}
	<div class="winner-banner" class:winner-draw={battle.final_winner === 'draw'}>
		<span class="wb-label">Resultado final</span>
		<span class="wb-winner">
			{battle.final_winner === 'draw' ? '🤝 Empate' : `🏆 ${winnerName(battle.final_winner)}`}
		</span>
	</div>
{/if}

<!-- ROUNDS HISTORY -->
{#if battle.rounds.length > 0}
<section class="rounds-section">
	<div class="section-label">Historial de rondas</div>
	{#each battle.rounds.filter(r => r.alpha_argument || r.beta_argument) as r}
		<div class="round-block">
			<div class="round-header">
				<span class="rnum font-mono">Ronda {r.round}</span>
				{#if r.winner}
					<span class="tag {r.winner === 'alpha' ? 'tag-red' : r.winner === 'beta' ? 'tag-blue' : 'tag-dim'}">
						{r.winner === 'draw' ? 'Empate' : `${winnerName(r.winner)} ganó`}
					</span>
				{/if}
			</div>

			<div class="args-grid">
				{#if r.alpha_argument}
					<div class="arg-box alpha">
						<div class="arg-label">Alpha</div>
						<p class="arg-text">{r.alpha_argument}</p>
					</div>
				{/if}
				{#if r.beta_argument}
					<div class="arg-box beta">
						<div class="arg-label">Beta</div>
						<p class="arg-text">{r.beta_argument}</p>
					</div>
				{:else if battle.status === 'active'}
					<div class="arg-box waiting">
						<div class="typing-dots">
							<span></span><span></span><span></span>
						</div>
						<span class="font-mono waiting-text">Beta elaborando respuesta...</span>
					</div>
				{/if}
			</div>

			{#if r.verdict}
				<div class="verdict-box">
					<div class="verdict-header">
						<span class="verdict-icon">⚖</span>
						<div>
							<div class="verdict-name">Árbitro · Claude Opus</div>
							{#if r.scores}
								<div class="criteria-row">
									{#each [
										['Coherencia', r.scores.alpha_coherence, r.scores.beta_coherence],
										['Evidencia',  r.scores.alpha_evidence,  r.scores.beta_evidence],
										['Retórica',   r.scores.alpha_rhetoric,  r.scores.beta_rhetoric],
									] as [label, a, b]}
										<div class="crit">
											<span class="crit-label font-mono">{label}</span>
											<div class="crit-track">
												<div class="crit-red" style="width:{a}%"></div>
												<div class="crit-blue" style="width:{b}%"></div>
											</div>
											<div class="crit-vals font-mono">
												<span style="color:var(--red)">{a}</span>
												<span style="color:var(--blue)">{b}</span>
											</div>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</div>
					<p class="verdict-text">{r.verdict}</p>
				</div>
			{:else if battle.status === 'judging'}
				<div class="verdict-box judging">
					<div class="verdict-icon">⚖</div>
					<span class="font-mono">Árbitro evaluando argumentos...</span>
					<div class="spinner-sm"></div>
				</div>
			{/if}
		</div>
	{/each}
</section>
{/if}

<!-- QR + SHARE -->
<div class="share-bar">
	<div class="share-left">
		<span class="share-label font-mono">Comparte esta batalla</span>
		<span class="share-url font-mono">{typeof window !== 'undefined' ? window.location.href : ''}</span>
	</div>
	<div class="qr-area">
		{#if qrUrl}
			<img src={qrUrl} alt="QR code" class="qr-img" width="80" height="80" />
		{/if}
		<div class="qr-info font-mono">
			<span>Escanea para ver</span>
			<span class="room-tag">#{battleId}</span>
		</div>
	</div>
</div>

{/if}

<style>
.center-state {
	display: flex; flex-direction: column; align-items: center;
	justify-content: center; min-height: 40vh; gap: 1rem;
	font-family: var(--font-mono); font-size: 0.85rem; color: var(--text-muted);
}
.center-state.error { color: var(--red); }
.err-icon { font-size: 2rem; }
.spinner-lg {
	width: 32px; height: 32px;
	border: 2px solid var(--border-bright); border-top-color: var(--red);
	border-radius: 50%; animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.back-link {
	font-family: var(--font-mono); font-size: 0.75rem;
	color: var(--text-muted); letter-spacing: 1px; transition: color 0.15s;
}
.back-link:hover { color: var(--text); }

.battle-header { margin-bottom: 2rem; animation: fadeUp 0.5s ease both; }
.header-top {
	display: flex; align-items: center; justify-content: space-between;
	margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;
}
.status-group { display: flex; align-items: center; gap: 0.75rem; }
.live-indicator {
	display: flex; align-items: center; gap: 5px;
	font-family: var(--font-mono); font-size: 0.7rem;
	color: var(--green); letter-spacing: 1px;
}
.live-dot {
	width: 6px; height: 6px; border-radius: 50%;
	background: var(--green); animation: pulse 1.2s ease infinite;
}
.room-id { font-size: 0.7rem; color: var(--text-dim); letter-spacing: 1px; }
.topic {
	font-family: var(--font-display); font-weight: 900;
	font-size: clamp(1.4rem, 3.5vw, 2.2rem);
	color: var(--text); margin-bottom: 0.5rem; font-style: italic;
}
.battle-meta {
	display: flex; gap: 1.5rem;
	font-size: 0.72rem; color: var(--text-muted); letter-spacing: 1px;
}

.fighters-row {
	display: grid; grid-template-columns: 1fr 140px 1fr;
	gap: 1rem; margin-bottom: 1.5rem; animation: fadeUp 0.5s 0.08s ease both;
}
.fighter-card {
	background: var(--surface); border: 1px solid var(--border);
	border-radius: 4px; padding: 1.25rem; position: relative;
	overflow: hidden; transition: border-color 0.3s, box-shadow 0.3s;
}
.fighter-card::before {
	content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
}
.fighter-card.red::before { background: var(--red); }
.fighter-card.blue::before { background: var(--blue); }
.fighter-card.active.red { border-color: var(--red); box-shadow: 0 0 18px rgba(255,49,49,0.08); }
.fighter-card.active.blue { border-color: var(--blue); box-shadow: 0 0 18px rgba(41,121,255,0.08); }
.fc-label {
	font-family: var(--font-display); font-weight: 700; font-size: 0.65rem;
	letter-spacing: 2px; text-transform: uppercase; color: var(--text-dim); margin-bottom: 0.4rem;
}
.fc-name {
	font-family: var(--font-display); font-weight: 900; font-size: 1.5rem;
	letter-spacing: 1px; text-transform: uppercase; color: var(--text); margin-bottom: 0.6rem;
}
.winner-crown { margin-top: 0.75rem; font-family: var(--font-display); font-weight: 700; font-size: 0.8rem; color: var(--gold); }

.vs-col { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.75rem; }
.vs-text { font-family: var(--font-display); font-weight: 900; font-size: 2.2rem; color: var(--text-dim); letter-spacing: 3px; }
.score-block { width: 100%; }
.score-nums {
	display: flex; justify-content: space-between; align-items: center;
	font-family: var(--font-display); font-weight: 900; font-size: 1.6rem; margin-bottom: 6px;
}
.score-sep { font-size: 0.8rem; color: var(--text-dim); }
.score-track { height: 6px; background: var(--surface2); border-radius: 3px; overflow: hidden; display: flex; }
.sf-red { height: 100%; background: var(--red); transition: width 0.8s ease; }
.sf-blue { height: 100%; background: var(--blue); transition: width 0.8s ease; margin-left: auto; }

.winner-banner {
	background: var(--gold-dim); border: 1px solid rgba(245,200,66,0.3);
	border-radius: 4px; padding: 1.25rem 1.5rem;
	display: flex; align-items: center; gap: 1.5rem;
	margin-bottom: 1.5rem; animation: fadeUp 0.5s ease both;
}
.winner-banner.winner-draw { background: var(--surface2); border-color: var(--border-bright); }
.wb-label { font-family: var(--font-mono); font-size: 0.65rem; color: var(--text-dim); letter-spacing: 1px; text-transform: uppercase; }
.wb-winner { font-family: var(--font-display); font-weight: 900; font-size: 1.5rem; letter-spacing: 1px; text-transform: uppercase; color: var(--gold); }

.rounds-section { margin-bottom: 2rem; animation: fadeUp 0.5s 0.15s ease both; }
.section-label {
	font-family: var(--font-display); font-weight: 700; font-size: 0.7rem;
	letter-spacing: 3px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 1rem;
}
.round-block { background: var(--surface); border: 1px solid var(--border); border-radius: 4px; padding: 1.25rem; margin-bottom: 0.75rem; }
.round-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; }
.rnum { font-size: 0.7rem; color: var(--text-dim); letter-spacing: 1px; }
.args-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem; }
.arg-box { background: var(--surface2); border-radius: 3px; padding: 0.75rem; }
.arg-box.waiting { display: flex; align-items: center; gap: 0.75rem; }
.waiting-text { font-size: 0.72rem; color: var(--text-dim); }
.arg-label { font-family: var(--font-display); font-weight: 700; font-size: 0.65rem; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 6px; }
.arg-box.alpha .arg-label { color: var(--red); }
.arg-box.beta .arg-label { color: var(--blue); }
.arg-text { font-size: 0.85rem; color: var(--text); line-height: 1.6; }

.typing-dots { display: flex; gap: 3px; align-items: center; }
.typing-dots span { width: 5px; height: 5px; border-radius: 50%; background: var(--text-dim); animation: bounce 1.2s infinite; }
.typing-dots span:nth-child(2) { animation-delay: 0.2s; }
.typing-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes bounce {
	0%,60%,100% { transform: translateY(0); opacity: 0.35; }
	30% { transform: translateY(-4px); opacity: 1; }
}

.verdict-box {
	background: var(--gold-dim); border: 1px solid rgba(245,200,66,0.2);
	border-left: 3px solid var(--gold); border-radius: 3px; padding: 1rem;
}
.verdict-box.judging { display: flex; align-items: center; gap: 1rem; font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted); }
.spinner-sm { width: 14px; height: 14px; border: 1.5px solid var(--border-bright); border-top-color: var(--gold); border-radius: 50%; animation: spin 0.8s linear infinite; }
.verdict-header { display: flex; gap: 0.75rem; align-items: flex-start; margin-bottom: 0.75rem; }
.verdict-icon { font-size: 1.1rem; padding-top: 2px; }
.verdict-name { font-family: var(--font-display); font-weight: 700; font-size: 0.8rem; letter-spacing: 1px; text-transform: uppercase; color: var(--gold); margin-bottom: 0.4rem; }
.criteria-row { display: flex; gap: 1rem; flex-wrap: wrap; }
.crit { display: flex; align-items: center; gap: 6px; }
.crit-label { font-size: 0.62rem; color: var(--text-dim); letter-spacing: 0.5px; }
.crit-track { width: 60px; height: 4px; background: var(--surface2); border-radius: 2px; overflow: hidden; display: flex; }
.crit-red { height: 100%; background: var(--red); }
.crit-blue { height: 100%; background: var(--blue); margin-left: auto; }
.crit-vals { display: flex; gap: 4px; font-size: 0.62rem; }
.verdict-text { font-size: 0.875rem; color: var(--text); line-height: 1.65; font-style: italic; }

.share-bar {
	background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
	padding: 1rem 1.25rem; display: flex; align-items: center; justify-content: space-between;
	gap: 1.5rem; flex-wrap: wrap; animation: fadeUp 0.5s 0.2s ease both;
}
.share-left { display: flex; flex-direction: column; gap: 4px; }
.share-label { font-size: 0.65rem; color: var(--text-dim); letter-spacing: 1px; text-transform: uppercase; }
.share-url { font-size: 0.72rem; color: var(--blue); letter-spacing: 0.5px; }
.qr-area { display: flex; align-items: center; gap: 0.75rem; }
.qr-img { border-radius: 3px; }
.qr-info { display: flex; flex-direction: column; gap: 2px; font-size: 0.65rem; color: var(--text-dim); }
.room-tag { color: var(--gold); }

@media (max-width: 640px) {
	.fighters-row { grid-template-columns: 1fr; }
	.vs-col { flex-direction: row; padding: 0.5rem 0; }
	.args-grid { grid-template-columns: 1fr; }
}
</style>
