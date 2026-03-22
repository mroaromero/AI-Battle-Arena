<script lang="ts">
	import '$lib/i18n';
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { fetchTournament, type TournamentData } from '$lib/api';

	const tournamentId = ($page.params.id || '').toUpperCase();

	let data = $state<TournamentData | null>(null);
	let loading = $state(true);
	let error = $state('');

	// Structured bracket rounds
	let bracketRounds = $derived.by(() => {
		if (!data) return [];
		const rounds = new Map<number, any[]>();
		for (const m of data.matches) {
			if (!rounds.has(m.round)) rounds.set(m.round, []);
			rounds.get(m.round)!.push(m);
		}
		return Array.from(rounds.entries())
			.sort(([a], [b]) => a - b)
			.map(([round, matches]) => {
				const totalRounds = Math.max(...rounds.keys());
				const name = round === totalRounds ? 'FINAL' : round === totalRounds - 1 ? 'SEMIFINAL' : round === totalRounds - 2 ? 'CUARTOS' : `RONDA ${round}`;
				return { round, name, matches: matches.sort((a, b) => a.position - b.position) };
			});
	});

	let champion = $derived(data?.tournament?.champion_participant_id
		? data.participants.find((p: any) => p.id === data?.tournament?.champion_participant_id)
		: null);

	function participantName(id: string | null): string {
		if (!id || !data) return '—';
		const p = data.participants.find((p: any) => p.id === id);
		return p ? `${p.name} · ${p.model}` : '—';
	}

	function matchLink(m: any): string {
		if (!m.battle_id) return '#';
		return data?.tournament?.game_mode === 'chess' ? `/chess/${m.battle_id}` : `/live/${m.battle_id}`;
	}

	onMount(async () => {
		try {
			data = await fetchTournament(tournamentId);
		} catch (e) {
			error = 'Torneo no encontrado';
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head>
	<title>Torneo #{tournamentId} — AI Battle Arena</title>
</svelte:head>

<div class="tournament-container">
	{#if loading}
		<div class="center-state">
			<div class="spinner-lg"></div>
			<span class="font-mono">CARGANDO TORNEO #{tournamentId}...</span>
		</div>
	{:else if error || !data}
		<div class="center-state error">
			<p class="font-mono text-alpha">{error}</p>
			<a href="/" class="btn-outline">← LOBBY</a>
		</div>
	{:else}
		<!-- Header -->
		<header class="t-header stagger-enter" style="animation-delay: 0.1s;">
			<a href="/" class="btn-outline">← LOBBY</a>
			<div class="t-info">
				<div class="font-mono text-gold text-[0.65rem] tracking-widest">
					{data.tournament.bracket_type === 'single_elimination' ? 'ELIMINACIÓN SIMPLE' : 'ROUND ROBIN'}
				</div>
				<h1 class="t-name glitch-text">{data.tournament.name}</h1>
				<p class="font-mono text-dim text-xs tracking-wider">"{data.tournament.topic}"</p>
			</div>
			{#if champion}
				<div class="champion-badge">
					<span class="font-display text-gold text-2xl">♛</span>
					<div>
						<div class="font-mono text-gold text-[0.55rem] tracking-widest">CAMPEÓN</div>
						<div class="font-mono text-sm">{champion.name}</div>
					</div>
				</div>
			{/if}
		</header>

		<!-- Bracket Grid -->
		<section class="bracket-grid stagger-enter" style="animation-delay: 0.2s;">
			{#each bracketRounds as round}
				<div class="bracket-round">
					<div class="round-header font-mono text-gold">{round.name}</div>
					<div class="round-matches">
						{#each round.matches as match}
							<div class="match-card">
								<div class="match-contender {match.winner === match.participant_a_id ? 'winner' : match.winner ? 'loser' : ''}">
									<span class="font-mono text-[0.65rem] {match.winner === match.participant_a_id ? 'text-green' : 'text-alpha'}">
										{participantName(match.participant_a_id)}
									</span>
								</div>
								<div class="match-vs font-mono text-dim">VS</div>
								<div class="match-contender {match.winner === match.participant_b_id ? 'winner' : match.winner ? 'loser' : ''}">
									<span class="font-mono text-[0.65rem] {match.winner === match.participant_b_id ? 'text-green' : 'text-beta'}">
										{participantName(match.participant_b_id)}
									</span>
								</div>
								{#if match.battle_id && match.status === 'active'}
									<a href={matchLink(match)} class="match-link font-mono">VER EN VIVO →</a>
								{:else if match.status === 'finished' && match.battle_id}
									<a href={matchLink(match)} class="match-link font-mono finished">RESULTADO →</a>
								{:else if match.status === 'pending'}
									<span class="font-mono text-dim text-[0.5rem] tracking-wider">PENDIENTE</span>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</section>

		<!-- Participants -->
		<section class="participants stagger-enter" style="animation-delay: 0.3s;">
			<div class="font-mono text-gold text-[0.6rem] tracking-widest mb-3">PARTICIPANTES ({data.participants.length})</div>
			<div class="participants-grid">
				{#each data.participants as p}
					<div class="participant-card" class:eliminated={p.eliminated}>
						<span class="font-mono text-xs">{p.name}</span>
						<span class="font-mono text-dim text-[0.55rem]">{p.model}</span>
						{#if p.eliminated}
							<span class="font-mono text-alpha text-[0.5rem]">ELIMINADO</span>
						{/if}
					</div>
				{/each}
			</div>
		</section>
	{/if}
</div>

<style>
	.tournament-container { min-height: 60vh; max-width: 1400px; margin: 0 auto; }
	.center-state { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 50vh; gap: 1.5rem; }
	.spinner-lg { width: 40px; height: 40px; border: 2px dashed var(--border-bright); border-top-color: var(--gold); border-radius: 50%; animation: spin 1s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }

	.btn-outline { font-family: var(--font-mono); font-weight: 700; font-size: 0.7rem; letter-spacing: 2px; text-transform: uppercase; padding: 0.5rem 1rem; border: 1px solid var(--border-bright); color: var(--text-muted); background: rgba(255,255,255,0.02); transition: all 0.2s; }
	.btn-outline:hover { color: var(--text); border-color: var(--text); }

	.t-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 1.5rem; margin-bottom: 2rem; padding-bottom: 2rem; border-bottom: 1px solid var(--border); }
	.t-info { flex: 1; }
	.t-name { font-family: var(--font-display); font-size: clamp(1.5rem, 4vw, 2.5rem); font-weight: 700; letter-spacing: 3px; margin-top: 0.5rem; }
	.champion-badge { display: flex; align-items: center; gap: 0.75rem; padding: 1rem; background: var(--gold-dim); border: 1px solid var(--gold); }

	.bracket-grid { display: flex; gap: 2rem; overflow-x: auto; padding-bottom: 1rem; }
	.bracket-round { min-width: 250px; flex: 1; }
	.round-header { font-size: 0.7rem; letter-spacing: 2px; margin-bottom: 1rem; text-align: center; padding: 0.5rem; background: var(--gold-dim); border: 1px solid rgba(255,190,11,0.2); }
	.round-matches { display: flex; flex-direction: column; gap: 1rem; }

	.match-card { border: 1px solid var(--border); background: var(--surface); display: flex; flex-direction: column; }
	.match-contender { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); }
	.match-contender:last-child { border-bottom: none; }
	.match-contender.winner { background: rgba(57,255,20,0.05); }
	.match-contender.loser { opacity: 0.5; }
	.match-vs { text-align: center; padding: 0.25rem; font-size: 0.5rem; letter-spacing: 2px; background: var(--surface2); border-bottom: 1px solid var(--border); }
	.match-link { display: block; text-align: center; padding: 0.5rem; font-size: 0.6rem; letter-spacing: 2px; color: var(--beta-neon); border-top: 1px solid var(--border); text-decoration: none; }
	.match-link:hover { background: var(--beta-dim); }
	.match-link.finished { color: var(--text-dim); }

	.participants { margin-top: 2rem; }
	.participants-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.75rem; }
	.participant-card { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.75rem 1rem; border: 1px solid var(--border); background: var(--surface); }
	.participant-card.eliminated { opacity: 0.5; border-color: var(--alpha-neon); }

	@media (max-width: 768px) {
		.bracket-grid { flex-direction: column; }
		.t-header { flex-direction: column; }
	}
</style>
