<script lang="ts">
	import '$lib/i18n';
	import { t } from 'svelte-i18n';
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { api, subscribeToBattle } from '$lib/api';
	import type { Battle } from '$lib/types';

	const battleId = ($page.params.id || '').toUpperCase();

	let battle = $state<Battle | null>(null);
	let loading = $state(true);
	let error = $state('');
	let qrUrl = $state('');
	// 'sse' = connected via Server-Sent Events, 'polling' = fallback interval
	let connectionMode = $state<'sse' | 'polling'>('sse');

	let interval: ReturnType<typeof setInterval> | null = null;
	let unsubscribeSSE: (() => void) | null = null;

	async function fetchBattle() {
		try {
			battle = await api.watchBattle(battleId);
			error = '';
			// Stop polling once the battle is finished
			if (battle?.status === 'finished' && interval) {
				clearInterval(interval);
				interval = null;
			}
		} catch (e) {
			const msg = (e as Error).message ?? '';
			if (msg.startsWith('ERR_CONNECT') || msg.startsWith('TIMEOUT')) {
				error = msg;
			} else {
				error = `Sala #${battleId} no encontrada o error al cargar.`;
			}
		} finally {
			loading = false;
		}
	}

	function startPollingFallback() {
		connectionMode = 'polling';
		if (!interval && battle?.status !== 'finished') {
			interval = setInterval(fetchBattle, 3000);
		}
	}

	onMount(async () => {
		// Initial fetch to render immediately
		await fetchBattle();

		qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(window.location.href)}&bgcolor=ffffff&color=111111&margin=2`;

		// Don't subscribe if battle is already finished
		if (battle?.status === 'finished') return;

		// Subscribe via SSE for real-time updates
		unsubscribeSSE = subscribeToBattle(
			battleId,
			(data) => {
				// SSE message received — update battle state reactively
				battle = data as Battle;
				error = '';
				loading = false;
				connectionMode = 'sse';
				// If battle finished, stop everything
				if ((data as Battle)?.status === 'finished') {
					if (interval) { clearInterval(interval); interval = null; }
					unsubscribeSSE?.();
					unsubscribeSSE = null;
				}
			},
			() => {
				// SSE error — fall back to polling
				startPollingFallback();
			}
		);
	});

	onDestroy(() => {
		if (interval) clearInterval(interval);
		if (unsubscribeSSE) unsubscribeSSE();
	});

	// ── Derived ──────────────────────────────────────────────────────────────
	let totalAlpha = $derived(battle?.rounds.reduce((s, r) => s + (r.scores?.alpha_total ?? 0), 0) ?? 0);
	let totalBeta  = $derived(battle?.rounds.reduce((s, r) => s + (r.scores?.beta_total ?? 0), 0) ?? 0);
	let totalMax   = $derived(Math.max(totalAlpha + totalBeta, 1));
	let pctAlpha   = $derived(Math.round((totalAlpha / totalMax) * 100));
	let pctBeta    = $derived(Math.round((totalBeta  / totalMax) * 100));

	// New debate system detection
	let isDebateMode = $derived(!!battle?.ejes);
	let currentEje = $derived(battle?.current_eje ?? 1);
	let currentPhase = $derived(battle?.current_phase ?? 'waiting');
	let phaseLabel = $derived(battle?.phase_label ?? 'ESPERANDO');
	let currentEjeData = $derived(battle?.ejes?.find(e => e.number === currentEje));
	let totalEjes = $derived(battle?.config?.max_ejes ?? battle?.ejes?.length ?? 5);

	// Timer
	let timerInterval: ReturnType<typeof setInterval> | null = null;
	let secondsRemaining = $state(0);

	function getPhaseTimeLimit(phase: string): number {
		if (!battle?.config) return 0;
		const t = battle.config.timers;
		switch (phase) {
			case 'presenting': return t.present_seconds;
			case 'opening_alpha': case 'opening_beta': return t.opening_seconds;
			case 'cross_alpha': case 'cross_beta': return t.cross_seconds;
			case 'synthesis': return t.synthesis_seconds;
			default: return 0;
		}
	}

	function startTimer() {
		if (timerInterval) clearInterval(timerInterval);
		secondsRemaining = getPhaseTimeLimit(currentPhase);
		timerInterval = setInterval(() => {
			if (secondsRemaining > 0) secondsRemaining--;
			else if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
		}, 1000);
	}

	let currentRound = $derived(
		battle?.rounds.find(r => r.round === battle?.rounds.length && !r.winner) ?? null
	);

	function winnerName(w: string | null) {
		if (!w) return '';
		if (w === 'draw') return 'DRAW';
		if (w === 'alpha') return battle?.contenders.alpha?.name ?? 'ALPHA';
		return battle?.contenders.beta?.name ?? 'BETA';
	}

	function statusLabel(s: string) {
		return s === 'waiting'  ? 'AWAITING_OPPONENT' :
			   s === 'active'   ? 'SYS_ACTIVE' :
			   s === 'judging'  ? 'JUDGING_PHASE' : 'TERMINATED';
	}
</script>

<svelte:head>
	<title>#{battleId} — AI Battle Arena</title>
</svelte:head>

<div class="debate-container">
	{#if loading}
		<div class="center-state">
			<div class="spinner-lg"></div>
			<span class="font-mono">CONNECTING TO ROOM #{battleId}...</span>
		</div>
	{:else if error || !battle}
		<div class="center-state error">
			<span class="err-icon glow-red">!</span>
			<p class="font-mono text-alpha">{error || 'ROOM NOT FOUND'}</p>
			<a href="/" class="btn-outline">← BACK TO LOBBY</a>
		</div>
	{:else}

	<!-- BATTLE HEADER -->
	<header class="battle-header stagger-enter" style="animation-delay: 0.1s;">
		<div class="header-top">
			<a href="/" class="btn-outline">← LOBBY</a>
		<div class="status-group">
			{#if battle.status !== 'finished'}
				<span class="live-indicator"><span class="live-blink"></span> LIVE</span>
			{/if}
			{#if battle.status !== 'finished'}
				<span class="conn-badge font-mono {connectionMode === 'sse' ? 'conn-sse' : 'conn-poll'}">
					<span class="conn-dot"></span>{connectionMode === 'sse' ? 'SSE' : 'POLLING'}
				</span>
			{/if}
			<span class="tag {battle.status === 'active' ? 'tag-green' : battle.status === 'judging' ? 'tag-gold' : 'tag-dim'}">
				{statusLabel(battle.status)}
			</span>
			<span class="room-id font-mono">#{battleId}</span>
		</div>
		</div>
		
		<h1 class="topic glitch-text">"{battle.topic}"</h1>
		
		<div class="battle-meta font-mono">
			{#if isDebateMode}
				<span class="meta-item text-gold">EJE {currentEje}/{totalEjes}</span>
				<span class="meta-separator">||</span>
				<span class="meta-item">{phaseLabel}</span>
				<span class="meta-separator">||</span>
				<span class="meta-item text-beta">{secondsRemaining}s</span>
			{:else}
				<span class="meta-item">ROUND {battle.rounds.filter(r => r.winner).length}/{battle.rounds.length}</span>
			{/if}
			<span class="meta-separator">||</span>
			<span class="meta-item">👁 {battle.spectator_count} SPECS</span>
		</div>
	</header>

	<!-- SCOREBOARD (HUD Style) -->
	<section class="scoreboard stagger-enter" style="animation-delay: 0.2s;">
		<div class="score-top">
			<div class="fighter-info text-alpha" class:active={battle.status === 'active' && currentRound && !currentRound.alpha_argument}>
				<div class="f-name">{battle.contenders.alpha?.name ?? '—'}</div>
				<div class="f-stance font-mono">{battle.contenders.alpha?.stance ?? 'PRO'}</div>
			</div>
			
			<div class="score-center font-display">
				<span class="score-num text-alpha">{totalAlpha}</span>
				<span class="vs-slash">/</span>
				<span class="score-num text-beta">{totalBeta}</span>
			</div>

			<div class="fighter-info text-beta align-right" class:active={battle.status === 'active' && currentRound?.alpha_argument && !currentRound?.beta_argument}>
				<div class="f-name">{battle.contenders.beta?.name ?? '—'}</div>
				<div class="f-stance font-mono">{battle.contenders.beta?.stance ?? 'CON'}</div>
			</div>
		</div>
		
		<div class="score-track">
			<div class="sf-red" style="width:{pctAlpha}%"></div>
			<div class="sf-blue" style="width:{pctBeta}%"></div>
		</div>

		{#if battle.status === 'finished' && battle.final_winner}
			<div class="winner-hud font-display">
				<span class="wb-label text-muted">FINAL STATUS: </span>
				<span class="wb-winner {battle.final_winner === 'alpha' ? 'text-alpha' : battle.final_winner === 'beta' ? 'text-beta' : 'text-muted'}">
					{battle.final_winner === 'draw' ? 'DRAW' : `VICTORY -> ${winnerName(battle.final_winner)}`}
				</span>
			</div>
		{/if}
	</section>

	<!-- DEBATE SYSTEM: EJES DISPLAY -->
	{#if isDebateMode && battle.ejes}
	<section class="ejes-feed stagger-enter" style="animation-delay: 0.3s;">
		<div class="feed-header font-mono text-muted">>> DEBATE_TRANSMISSION</div>

		<!-- Current Eje Header -->
		{#if currentEjeData}
		<div class="current-eje-card">
			<div class="eje-header">
				<span class="eje-number font-display text-gold">EJE_{currentEje}</span>
				<span class="eje-phase tag {currentPhase === 'presenting' ? 'tag-gold' : currentPhase.includes('opening') ? 'tag-red' : currentPhase.includes('cross') ? 'tag-blue' : currentPhase === 'synthesis' ? 'tag-green' : 'tag-dim'}">
					{phaseLabel}
				</span>
				{#if secondsRemaining > 0 && battle.status !== 'finished'}
					<span class="eje-timer font-mono" class:timer-warning={secondsRemaining < 10}>
						{secondsRemaining}s
					</span>
				{/if}
			</div>
			<div class="eje-question font-mono">
				"{currentEjeData.question}"
			</div>
		</div>
		{/if}

		<!-- Completed Ejes -->
		{#each battle.ejes.filter(e => e.phases.length > 0) as eje}
			<article class="eje-card">
				<div class="eje-card-header font-display">
					EJE_{eje.number} — "{eje.question}"
				</div>

				<!-- Phases -->
				{#each eje.phases.filter(p => p.argument) as phase}
					<div class="phase-block">
						<div class="phase-label font-mono {phase.side === 'alpha' ? 'text-alpha' : 'text-beta'}">
							{phase.type === 'opening_alpha' ? '[APERTURA_ALPHA]' :
							 phase.type === 'opening_beta' ? '[APERTURA_BETA]' :
							 phase.type === 'cross_alpha' ? '[CRUCE_ALPHA]' :
							 phase.type === 'cross_beta' ? '[CRUCE_BETA]' :
							 `[${phase.type.toUpperCase()}]`}
						</div>
						<div class="phase-argument">{phase.argument}</div>
					</div>
				{/each}

				<!-- Moderator Synthesis -->
				{#each eje.phases.filter(p => p.synthesis) as syn}
					<div class="synthesis-panel">
						<div class="synthesis-header font-mono text-green">[MODERATOR_SYNTHESIS]</div>
						<div class="synthesis-body">{syn.synthesis}</div>
					</div>
				{/each}

				<!-- Panel Scores -->
				{#if eje.scores.length > 0}
				<div class="panel-scores">
					<div class="panel-header font-mono text-gold">[JUDGE_PANEL]</div>
					{#each eje.scores as score}
						<div class="score-row font-mono">
							<span class="text-dim">{score.judge}</span>
							<span class="{score.winner === 'alpha' ? 'text-alpha' : score.winner === 'beta' ? 'text-beta' : 'text-gold'}">
								{score.winner === 'draw' ? 'EMPATE' : `${score.winner.toUpperCase()} WIN`}
							</span>
							<span class="text-alpha">{score.alpha}</span>
							<span class="text-dim">/</span>
							<span class="text-beta">{score.beta}</span>
						</div>
					{/each}
				</div>
				{/if}
			</article>
		{/each}
	</section>
	{/if}

	<!-- ROUNDS LOG (old system) -->
	{#if !isDebateMode && battle.rounds.length > 0}
	<section class="rounds-feed stagger-enter" style="animation-delay: 0.3s;">
		<div class="feed-header font-mono text-muted">>> TRANSMISSION_LOG</div>
		
		{#each battle.rounds.filter(r => r.alpha_argument || r.beta_argument) as r}
			<article class="round-card">
				<div class="round-number font-display">RND_{r.round}</div>
				
				<div class="split-args">
					<!-- ALPHA ARGUMENT -->
					{#if r.alpha_argument}
						<div class="arg-column alpha-col">
							<div class="arg-header text-alpha font-mono">[ALPHA_PAYLOAD]</div>
							<div class="arg-body">{r.alpha_argument}</div>
						</div>
					{/if}
					
					<!-- BETA ARGUMENT -->
					{#if r.beta_argument}
						<div class="arg-column beta-col">
							<div class="arg-header text-beta font-mono align-right">[BETA_PAYLOAD]</div>
							<div class="arg-body">{r.beta_argument}</div>
						</div>
					{:else if battle.status === 'active'}
						<div class="arg-column beta-col waiting-col">
							<div class="arg-header text-beta font-mono align-right">[BETA_PAYLOAD]</div>
							<div class="typing-indicator">
								<span class="block bg-beta"></span>
								<span class="block bg-beta"></span>
								<span class="block bg-beta"></span>
								<span class="font-mono text-dim ml-2">AWAITING_INPUT...</span>
							</div>
						</div>
					{/if}
				</div>

				<!-- JUDGE VERDICT -->
				{#if r.verdict}
					<div class="verdict-panel">
						<div class="verdict-top">
							<span class="v-title font-mono text-gold">[JUDGE_EVALUATION]</span>
							{#if r.winner}
								<span class="tag {r.winner === 'alpha' ? 'tag-red' : r.winner === 'beta' ? 'tag-blue' : 'tag-dim'}">
									{r.winner === 'draw' ? 'DRAW' : `WINNER: ${winnerName(r.winner)}`}
								</span>
							{/if}
						</div>
						
						<div class="verdict-body font-mono text-muted">
							{r.verdict}
						</div>

						{#if r.scores}
							<div class="criteria-grid">
								{#each [
									{ label: 'COHERENCE', a: r.scores.alpha_coherence, b: r.scores.beta_coherence },
									{ label: 'EVIDENCE',  a: r.scores.alpha_evidence,  b: r.scores.beta_evidence },
									{ label: 'RHETORIC',  a: r.scores.alpha_rhetoric,  b: r.scores.beta_rhetoric }
								] as { label, a, b }}
									<div class="crit-row">
										<!-- Alpha Score -->
										<span class="crit-val font-mono text-alpha">{a}</span>
										<!-- Progress bar -->
										<div class="crit-bar-wrapper">
											<div class="crit-label font-mono">{label}</div>
											<div class="crit-bar">
												<div class="cb-alpha" style="width:{(a/(a+b))*100}%"></div>
												<div class="cb-beta" style="width:{(b/(a+b))*100}%"></div>
											</div>
										</div>
										<!-- Beta Score -->
										<span class="crit-val font-mono text-beta">{b}</span>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{:else if battle.status === 'judging'}
					<div class="verdict-panel judging-panel">
						<span class="v-title font-mono text-gold">[JUDGE_EVALUATION]</span>
						<div class="typing-indicator">
							<span class="block bg-gold"></span>
							<span class="font-mono text-gold ml-2">PROCESSING_VERDICT...</span>
						</div>
					</div>
				{/if}
			</article>
		{/each}
	</section>
	{/if}

	<!-- QR + SHARE -->
	<footer class="share-footer stagger-enter" style="animation-delay: 0.4s;">
		<div class="share-info">
			<span class="font-mono text-dim">> SHARE_LINK:</span>
			<a href={typeof window !== 'undefined' ? window.location.href : '#'} class="font-mono text-beta">{typeof window !== 'undefined' ? window.location.href : ''}</a>
		</div>
		{#if qrUrl}
			<div class="qr-wrapper">
				<img src={qrUrl} alt="QR" class="qr-img" width="60" height="60" />
			</div>
		{/if}
	</footer>

	{/if}
</div>

<style>
/* ── CONTAINERS ── */
.debate-container {
	animation: fadeUp 0.5s ease both;
	max-width: 1200px;
	margin: 0 auto;
	display: flex;
	flex-direction: column;
	gap: 3rem;
}

.center-state {
	display: flex; flex-direction: column; align-items: center; justify-content: center;
	min-height: 50vh; gap: 1.5rem; letter-spacing: 2px;
}
.spinner-lg {
	width: 40px; height: 40px;
	border: 2px dashed var(--border-bright); border-top-color: var(--beta-neon);
	border-radius: 50%; animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── BUTTONS & UTILS ── */
.btn-outline {
	font-family: var(--font-mono); font-weight: 700; font-size: 0.7rem;
	letter-spacing: 2px; text-transform: uppercase; padding: 0.5rem 1rem;
	border: 1px solid var(--border-bright); color: var(--text-muted);
	background: rgba(255,255,255,0.02); transition: all 0.2s;
}
.btn-outline:hover { color: var(--text); border-color: var(--text); background: var(--surface2); }
.text-gold { color: var(--gold); }
.bg-gold { background-color: var(--gold); }
.bg-beta { background-color: var(--beta-neon); }
.align-right { text-align: right; }
.ml-2 { margin-left: 0.5rem; }

/* ── HEADER ── */
.battle-header {
	border-bottom: 1px solid var(--border);
	padding-bottom: 2rem;
}
.header-top {
	display: flex; align-items: center; justify-content: space-between;
	margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem;
}
.status-group { display: flex; align-items: center; gap: 1rem; }
.live-indicator {
	display: flex; align-items: center; gap: 8px;
	font-family: var(--font-mono); font-weight: 700; font-size: 0.75rem;
	color: var(--green); letter-spacing: 2px;
}
.live-blink {
	width: 8px; height: 8px; background: var(--green);
	box-shadow: 0 0 10px var(--green); animation: pulse-neon 1s infinite alternate;
}
.conn-badge {
	display: flex; align-items: center; gap: 5px;
	font-size: 0.65rem; letter-spacing: 1.5px;
	padding: 2px 8px; border-radius: 2px;
}
.conn-sse { color: var(--green); border: 1px solid rgba(0,255,136,0.3); background: rgba(0,255,136,0.05); }
.conn-poll { color: var(--gold); border: 1px solid rgba(255,190,11,0.3); background: rgba(255,190,11,0.05); }
.conn-dot {
	width: 5px; height: 5px; border-radius: 50%;
}
.conn-sse .conn-dot { background: var(--green); box-shadow: 0 0 6px var(--green); animation: pulse-neon 1s infinite alternate; }
.conn-poll .conn-dot { background: var(--gold); }
.topic {
	font-family: var(--font-display); font-weight: 700;
	font-size: clamp(2rem, 5vw, 4rem); line-height: 1.1;
	color: var(--text); margin-bottom: 1.5rem; text-transform: uppercase;
}
.battle-meta {
	display: flex; align-items: center; gap: 1rem;
	font-size: 0.8rem; color: var(--text-muted); letter-spacing: 2px;
}
.meta-separator { color: var(--border-bright); }

/* ── SCOREBOARD (HUD) ── */
.scoreboard {
	background: rgba(255,255,255,0.02);
	border: 1px solid var(--border);
	padding: 2rem;
	position: relative;
}
.score-top {
	display: grid;
	grid-template-columns: 1fr auto 1fr;
	align-items: center;
	gap: 2rem;
	margin-bottom: 1.5rem;
}
.fighter-info { display: flex; flex-direction: column; gap: 4px; transition: all 0.3s; opacity: 0.6; }
.fighter-info.active { opacity: 1; filter: drop-shadow(0 0 10px currentColor); }
.fighter-info .f-name { font-family: var(--font-display); font-size: 1.5rem; letter-spacing: 1px; }
.fighter-info .f-stance { font-size: 0.75rem; letter-spacing: 2px; }

.score-center {
	display: flex; align-items: center; gap: 1rem;
	font-size: 4rem; line-height: 1;
}
.vs-slash { font-family: var(--font-mono); font-size: 2rem; color: var(--border-bright); font-weight: 400; }

.score-track { height: 8px; background: var(--surface2); display: flex; box-shadow: inset 0 0 5px #000; }
.sf-red { height: 100%; background: var(--alpha-neon); transition: width 0.8s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: 0 0 15px var(--alpha-dim); }
.sf-blue { height: 100%; background: var(--beta-neon); transition: width 0.8s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: 0 0 15px var(--beta-dim); margin-left: auto; }

.winner-hud {
	margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--border-bright);
	text-align: center; font-size: 1.25rem; letter-spacing: 4px;
}

/* ── ROUNDS FEED ── */
.rounds-feed { display: flex; flex-direction: column; gap: 3rem; }
.feed-header { letter-spacing: 4px; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; margin-bottom: -1rem;}

.round-card {
	position: relative;
	border-left: 2px solid var(--border);
	padding-left: 2rem;
}
.round-number {
	position: absolute; left: -2rem; top: 0;
	background: var(--bg); padding-right: 1rem;
	font-size: 1.2rem; color: var(--text); font-weight: 700;
}

/* Split Args */
.split-args {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 2rem;
	margin-top: 2rem;
	margin-bottom: 2rem;
}
.arg-column {
	background: rgba(255,255,255,0.01);
	border: 1px solid var(--border);
	padding: 1.5rem;
}
.alpha-col { border-top: 2px solid var(--alpha-neon); }
.beta-col { border-top: 2px solid var(--beta-neon); }
.arg-header { font-size: 0.7rem; letter-spacing: 2px; margin-bottom: 1rem; opacity: 0.8; }
.arg-body { font-size: 0.95rem; line-height: 1.7; color: var(--text); }
.waiting-col { display: flex; flex-direction: column; justify-content: space-between; min-height: 150px;}

.typing-indicator { display: flex; align-items: center; gap: 6px; }
.typing-indicator .block {
	width: 8px; height: 14px;
	animation: blink 1s step-end infinite;
}
.typing-indicator .block:nth-child(2) { animation-delay: 0.2s; }
.typing-indicator .block:nth-child(3) { animation-delay: 0.4s; }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

/* Verdict Panel */
.verdict-panel {
	background: rgba(255, 190, 11, 0.05); /* gold dim */
	border: 1px solid rgba(255, 190, 11, 0.2);
	border-left: 4px solid var(--gold);
	padding: 1.5rem;
}
.judging-panel { display: flex; flex-direction: column; gap: 1rem; }
.verdict-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
.v-title { font-size: 0.8rem; letter-spacing: 2px; }
.verdict-body { font-size: 0.85rem; line-height: 1.8; margin-bottom: 1.5rem; color: #ccc; }

.criteria-grid { display: flex; flex-direction: column; gap: 1rem; max-width: 600px; margin: 0 auto; }
.crit-row { display: flex; align-items: center; gap: 1rem; }
.crit-val { font-size: 0.9rem; font-weight: 700; width: 30px; text-align: center;}
.crit-bar-wrapper { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.crit-label { text-align: center; font-size: 0.65rem; color: var(--text-dim); letter-spacing: 2px; }
.crit-bar { height: 4px; display: flex; background: var(--surface2); }
.cb-alpha { background: var(--alpha-neon); height: 100%; box-shadow: 0 0 5px var(--alpha-dim);}
.cb-beta { background: var(--beta-neon); height: 100%; box-shadow: 0 0 5px var(--beta-dim);}

/* ── EJES FEED (new debate system) ── */
.ejes-feed { display: flex; flex-direction: column; gap: 2rem; }
.current-eje-card {
	background: rgba(255, 190, 11, 0.05);
	border: 1px solid rgba(255, 190, 11, 0.3);
	border-left: 4px solid var(--gold);
	padding: 1.5rem;
}
.eje-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
.eje-number { font-size: 1.5rem; letter-spacing: 2px; }
.eje-phase { font-size: 0.65rem; }
.eje-timer {
	font-size: 1.2rem; font-weight: 700; color: var(--beta-neon);
	padding: 2px 10px; border: 1px solid var(--beta-neon); background: var(--beta-dim);
}
.timer-warning { color: var(--alpha-neon); border-color: var(--alpha-neon); background: var(--alpha-dim); animation: pulse-neon 0.5s infinite alternate; }
.eje-question { font-size: 1rem; color: var(--text); line-height: 1.5; }
.eje-card { border-left: 2px solid var(--border); padding-left: 2rem; }
.eje-card-header {
	font-size: 1rem; letter-spacing: 2px; margin-bottom: 1.5rem;
	color: var(--text-muted); padding-bottom: 0.5rem; border-bottom: 1px solid var(--border);
}
.phase-block { margin-bottom: 1rem; padding: 1rem; border: 1px solid var(--border); background: rgba(255,255,255,0.01); }
.phase-label { font-size: 0.7rem; letter-spacing: 2px; margin-bottom: 0.5rem; }
.phase-argument { font-size: 0.9rem; line-height: 1.7; color: var(--text); }
.synthesis-panel {
	background: rgba(57, 255, 20, 0.05); border: 1px solid rgba(57, 255, 20, 0.2);
	border-left: 4px solid var(--green); padding: 1.5rem; margin-top: 1rem;
}
.synthesis-header { font-size: 0.75rem; letter-spacing: 2px; margin-bottom: 0.75rem; }
.synthesis-body { font-size: 0.85rem; line-height: 1.8; color: var(--text); }
.panel-scores { background: rgba(255, 190, 11, 0.03); border: 1px solid rgba(255, 190, 11, 0.15); padding: 1rem; margin-top: 1rem; }
.panel-header { font-size: 0.7rem; letter-spacing: 2px; margin-bottom: 0.75rem; }
.score-row { display: flex; gap: 1.5rem; font-size: 0.75rem; padding: 0.25rem 0; border-bottom: 1px solid var(--border); }
.score-row:last-child { border-bottom: none; }

/* ── SHARE ── */
.share-footer {
	margin-top: 2rem; padding: 2rem;
	background: var(--surface); border: 1px dashed var(--border-bright);
	display: flex; justify-content: space-between; align-items: center;
}
.share-info { display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.8rem; }
.qr-img { border: 2px solid var(--border-bright); padding: 4px; background: #fff;}

/* ── RESPONSIVE ── */
@media (max-width: 768px) {
	.score-top { grid-template-columns: 1fr; text-align: center; gap: 1rem; }
	.fighter-info .f-name { font-size: 1.25rem; }
	.align-right { text-align: center; }
	.split-args { grid-template-columns: 1fr; gap: 1rem; }
	.share-footer { flex-direction: column; gap: 2rem; text-align: center; }
	.topic { font-size: 2.5rem; }
	.eje-header { flex-wrap: wrap; }
	.score-row { flex-wrap: wrap; gap: 0.5rem; }
}
</style>
