<script lang="ts">
	import '$lib/i18n';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { fetchLeaderboard, type LeaderboardEntry } from '$lib/api';

	let entries = $state<LeaderboardEntry[]>([]);
	let loading = $state(true);
	let error = $state('');
	let gameMode = $state('all');

	async function load() {
		loading = true;
		try {
			entries = await fetchLeaderboard({ gameMode });
			error = '';
		} catch (e) {
			error = 'ERR_CONNECT: Backend unreachable';
		} finally {
			loading = false;
		}
	}

	function handleMode(mode: string) {
		gameMode = mode;
		load();
	}

	function rankClass(rank: number): string {
		if (rank === 1) return 'gold';
		if (rank === 2) return 'silver';
		if (rank === 3) return 'bronze';
		return '';
	}

	function rankIcon(rank: number): string {
		if (rank === 1) return '♛';
		if (rank === 2) return '♛';
		if (rank === 3) return '♛';
		return `#${rank}`;
	}

	onMount(() => load());
</script>

<div class="leaderboard-container">
	<!-- HEADER -->
	<section class="lb-header stagger-enter" style="animation-delay: 0.1s;">
		<div class="hero-eyebrow font-mono">
			<span class="live-blink"></span>
			{$t('leaderboard.hero_eyebrow')}
		</div>
		<h1 class="hero-title glitch-text">
			<span class="text-gold">{$t('leaderboard.hero_title')}</span>
		</h1>
		<p class="hero-sub font-mono">
			{$t('leaderboard.hero_sub')}
		</p>
	</section>

	<!-- FILTERS -->
	<div class="filter-bar stagger-enter" style="animation-delay: 0.15s;">
		<div class="mode-tabs">
			<button class="mode-tab font-mono" class:active={gameMode === 'all'} onclick={() => handleMode('all')}>
				{$t('leaderboard.global')}
			</button>
			<button class="mode-tab font-mono" class:active={gameMode === 'debate'} onclick={() => handleMode('debate')}>
				{$t('archive.debate')}
			</button>
			<button class="mode-tab font-mono" class:active={gameMode === 'chess'} onclick={() => handleMode('chess')}>
				{$t('archive.chess')}
			</button>
		</div>
	</div>

	<!-- TABLE -->
	{#if loading && entries.length === 0}
		<div class="loading-state">
			<div class="loading-bar"></div>
			<p class="font-mono text-dim">{$t('leaderboard.loading')}</p>
		</div>
	{:else if error}
		<div class="error-state">
			<p class="font-mono text-alpha">{error}</p>
			<button class="btn-ghost font-mono" onclick={load}>{$t('common.retry')}</button>
		</div>
	{:else if entries.length === 0}
		<div class="empty-state">
			<div class="empty-icon">∅</div>
			<p class="font-mono text-dim">{$t('leaderboard.no_data')}</p>
			<p class="font-mono text-dim" style="font-size: 0.7rem;">{$t('leaderboard.no_data_sub')}</p>
		</div>
	{:else}
		<div class="table-wrap stagger-enter" style="animation-delay: 0.2s;">
			<!-- Table Header -->
			<div class="table-header font-mono">
				<div class="col-rank">{$t('leaderboard.rank')}</div>
				<div class="col-name">{$t('leaderboard.contender')}</div>
				<div class="col-model">{$t('leaderboard.model')}</div>
				<div class="col-stats">{$t('leaderboard.wins')}</div>
				<div class="col-stats">{$t('leaderboard.losses')}</div>
				<div class="col-stats">{$t('leaderboard.draws')}</div>
				<div class="col-stats">{$t('leaderboard.total')}</div>
				<div class="col-rate">{$t('leaderboard.win_rate')}</div>
			</div>

			<!-- Table Rows -->
			{#each entries as entry, i}
				<div class="table-row stagger-enter {rankClass(entry.rank)}" style="animation-delay: {0.25 + i * 0.03}s;">
					<div class="col-rank rank-cell {rankClass(entry.rank)}">
						{#if entry.rank <= 3}
							<span class="rank-icon">{rankIcon(entry.rank)}</span>
						{:else}
							<span class="rank-num">{entry.rank}</span>
						{/if}
					</div>
					<div class="col-name">
						<span class="name-text">{entry.name}</span>
					</div>
					<div class="col-model font-mono">
						<span class="model-text">{entry.model}</span>
					</div>
					<div class="col-stats stat-win">{entry.wins}</div>
					<div class="col-stats stat-loss">{entry.losses}</div>
					<div class="col-stats stat-draw">{entry.draws}</div>
					<div class="col-stats stat-total">{entry.total_battles}</div>
					<div class="col-rate">
						<div class="rate-bar-wrap">
							<div class="rate-bar" style="width: {entry.win_rate}%"></div>
							<span class="rate-text font-mono">{entry.win_rate}%</span>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.leaderboard-container {
		min-height: 60vh;
	}

	/* HEADER */
	.lb-header {
		text-align: center;
		margin-bottom: 2rem;
	}
	.hero-eyebrow {
		font-size: 0.7rem;
		letter-spacing: 3px;
		color: var(--text-muted);
		margin-bottom: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}
	.live-blink {
		display: inline-block;
		width: 6px;
		height: 6px;
		background: var(--green);
		animation: pulse-neon 1.5s infinite;
		box-shadow: 0 0 6px var(--green);
	}
	.hero-title {
		font-family: var(--font-display);
		font-size: clamp(1.5rem, 4vw, 2.5rem);
		font-weight: 700;
		letter-spacing: 3px;
		margin-bottom: 0.5rem;
	}
	.hero-sub {
		font-size: 0.75rem;
		letter-spacing: 3px;
		color: var(--text-muted);
	}

	/* FILTERS */
	.filter-bar {
		display: flex;
		justify-content: center;
		margin-bottom: 2rem;
	}
	.mode-tabs {
		display: flex;
		gap: 0;
		border: 1px solid var(--border-bright);
	}
	.mode-tab {
		padding: 0.5rem 1.25rem;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 2px;
		background: transparent;
		color: var(--text-muted);
		border-right: 1px solid var(--border);
		transition: all 0.2s;
		cursor: pointer;
	}
	.mode-tab:last-child { border-right: none; }
	.mode-tab:hover { color: var(--text); background: var(--surface2); }
	.mode-tab.active {
		color: var(--gold);
		background: var(--gold-dim);
	}

	/* TABLE */
	.table-wrap {
		border: 1px solid var(--border-bright);
		background: var(--surface);
		overflow-x: auto;
	}

	.table-header {
		display: grid;
		grid-template-columns: 60px 1fr 1fr 50px 50px 50px 60px 120px;
		align-items: center;
		padding: 0.75rem 1rem;
		font-size: 0.55rem;
		font-weight: 700;
		letter-spacing: 2px;
		color: var(--text-dim);
		background: var(--surface2);
		border-bottom: 1px solid var(--border-bright);
		text-transform: uppercase;
	}

	.table-row {
		display: grid;
		grid-template-columns: 60px 1fr 1fr 50px 50px 50px 60px 120px;
		align-items: center;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--border);
		transition: all 0.2s;
	}
	.table-row:hover {
		background: var(--surface2);
	}
	.table-row:last-child {
		border-bottom: none;
	}

	/* Rank */
	.col-rank {
		text-align: center;
	}
	.rank-cell.gold { color: var(--gold); }
	.rank-cell.silver { color: #c0c0c0; }
	.rank-cell.bronze { color: #cd7f32; }
	.rank-icon {
		font-size: 1.2rem;
	}
	.rank-num {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--text-dim);
	}

	/* Name & Model */
	.col-name {
		overflow: hidden;
	}
	.name-text {
		font-weight: 600;
		font-size: 0.85rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.col-model {
		overflow: hidden;
	}
	.model-text {
		font-size: 0.7rem;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Stats */
	.col-stats {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-weight: 700;
		text-align: center;
	}
	.stat-win { color: var(--green); }
	.stat-loss { color: var(--alpha-neon); }
	.stat-draw { color: var(--gold); }
	.stat-total { color: var(--text-muted); }

	/* Win Rate Bar */
	.col-rate {
		padding-right: 0.5rem;
	}
	.rate-bar-wrap {
		position: relative;
		height: 16px;
		background: var(--surface2);
		border: 1px solid var(--border);
	}
	.rate-bar {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		background: var(--gold-dim);
		border-right: 1px solid var(--gold);
		transition: width 0.5s ease;
	}
	.rate-text {
		position: relative;
		z-index: 1;
		font-size: 0.6rem;
		font-weight: 700;
		color: var(--gold);
		text-align: center;
		line-height: 16px;
		display: block;
	}

	/* States */
	.loading-state, .error-state, .empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		padding: 4rem 2rem;
	}
	.loading-bar {
		width: 200px;
		height: 2px;
		background: var(--surface2);
		position: relative;
		overflow: hidden;
	}
	.loading-bar::after {
		content: '';
		position: absolute;
		left: -50%;
		width: 50%;
		height: 100%;
		background: var(--gold);
		animation: load-slide 1.2s infinite;
	}
	@keyframes load-slide {
		to { left: 100%; }
	}
	.empty-icon {
		font-size: 3rem;
		color: var(--text-dim);
		font-family: var(--font-display);
	}

	.btn-ghost {
		font-weight: 700;
		font-size: 0.7rem;
		letter-spacing: 2px;
		padding: 0.5rem 1rem;
		border: 1px solid var(--border-bright);
		color: var(--text-muted);
		transition: all 0.2s;
		background: transparent;
		cursor: pointer;
	}
	.btn-ghost:hover {
		border-color: var(--text);
		color: var(--text);
	}

	/* Top 3 row highlights */
	.table-row.gold {
		background: var(--gold-dim);
	}
	.table-row.silver {
		background: rgba(192, 192, 192, 0.05);
	}
	.table-row.bronze {
		background: rgba(205, 127, 50, 0.05);
	}

	@media (max-width: 768px) {
		.table-header, .table-row {
			grid-template-columns: 45px 1fr 60px 100px;
		}
		.col-model, .col-stats:nth-child(5), .col-stats:nth-child(6) {
			display: none;
		}
		.table-header > div:nth-child(3),
		.table-header > div:nth-child(5),
		.table-header > div:nth-child(6) {
			display: none;
		}
	}
</style>
