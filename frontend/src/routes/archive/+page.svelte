<script lang="ts">
	import '$lib/i18n';
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { fetchArchive } from '$lib/api';

	interface ArchivedBattle {
		id: string;
		topic: string;
		game_mode: string;
		created_at: string;
		finished_at: string | null;
		final_winner: string | null;
		max_rounds: number;
		current_round: number;
		spectator_count: number;
		alpha_name: string | null;
		beta_name: string | null;
		total_rounds: number;
	}

	let battles = $state<ArchivedBattle[]>([]);
	let loading = $state(true);
	let error = $state('');
	let page = $state(1);
	let totalPages = $state(1);
	let total = $state(0);
	let gameMode = $state('all');
	let search = $state('');
	let searchTimeout: ReturnType<typeof setTimeout>;

	async function loadArchive() {
		loading = true;
		try {
			const result = await fetchArchive({ page, gameMode, search: search || undefined });
			battles = result.battles;
			totalPages = result.pagination.totalPages;
			total = result.pagination.total;
			error = '';
		} catch (e) {
			error = 'ERR_CONNECT: Backend unreachable';
		} finally {
			loading = false;
		}
	}

	function handleSearch(e: Event) {
		const value = (e.target as HTMLInputElement).value;
		search = value;
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			page = 1;
			loadArchive();
		}, 300);
	}

	function handleMode(mode: string) {
		gameMode = mode;
		page = 1;
		loadArchive();
	}

	function prevPage() {
		if (page > 1) {
			page--;
			loadArchive();
		}
	}

	function nextPage() {
		if (page < totalPages) {
			page++;
			loadArchive();
		}
	}

	function battleLink(b: ArchivedBattle): string {
		return b.game_mode === 'chess' ? `/chess/${b.id}` : `/live/${b.id}`;
	}

	function winnerLabel(w: string | null): string {
		if (!w) return 'TERMINATED';
		if (w === 'draw') return 'EMPATE';
		return `${w.toUpperCase()} WIN`;
	}

	function winnerClass(w: string | null): string {
		if (!w) return 'tag-dim';
		if (w === 'draw') return 'tag-gold';
		return w === 'alpha' ? 'tag-red' : 'tag-blue';
	}

	function modeLabel(m: string): string {
		return m === 'chess' ? 'CHESS' : 'DEBATE';
	}

	function modeClass(m: string): string {
		return m === 'chess' ? 'tag-blue' : 'tag-red';
	}

	function formatDate(iso: string | null): string {
		if (!iso) return '—';
		const d = new Date(iso);
		return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
	}

	onMount(() => loadArchive());
</script>

<div class="archive-container">
	<!-- HEADER -->
	<section class="archive-header stagger-enter" style="animation-delay: 0.1s;">
		<div class="hero-eyebrow font-mono">
			<span class="live-blink"></span>
			{$t('archive.hero_eyebrow')}
		</div>
		<h1 class="hero-title glitch-text">
			<span class="text-alpha">{$t('archive.hero_title').split(' ')[0]}</span> {$t('archive.hero_title').split(' ').slice(1).join(' ')}
		</h1>
		<p class="hero-sub font-mono">
			{$t('archive.hero_sub')}
		</p>
	</section>

	<!-- FILTERS -->
	<div class="filter-bar stagger-enter" style="animation-delay: 0.15s;">
		<div class="mode-tabs">
			<button class="mode-tab font-mono" class:active={gameMode === 'all'} onclick={() => handleMode('all')}>
				{$t('archive.all')}
			</button>
			<button class="mode-tab font-mono" class:active={gameMode === 'debate'} onclick={() => handleMode('debate')}>
				{$t('archive.debate')}
			</button>
			<button class="mode-tab font-mono" class:active={gameMode === 'chess'} onclick={() => handleMode('chess')}>
				{$t('archive.chess')}
			</button>
		</div>
		<div class="search-wrap">
			<input
				type="text"
				placeholder={$t('archive.search_placeholder')}
				class="search-input font-mono"
				oninput={handleSearch}
				value={search}
			/>
		</div>
	</div>

	<!-- TOTAL -->
	<div class="archive-meta font-mono stagger-enter" style="animation-delay: 0.2s;">
		{#if !loading}
			<span class="text-dim">{total} {$t('archive.total_battles')}</span>
			<span class="text-dim">{$t('archive.page_info')} {page}/{totalPages}</span>
		{/if}
	</div>

	<!-- BATTLE LIST -->
	{#if loading && battles.length === 0}
		<div class="loading-state stagger-enter">
			<div class="loading-bar"></div>
			<p class="font-mono text-dim">{$t('archive.loading')}</p>
		</div>
	{:else if error}
		<div class="error-state">
			<p class="font-mono text-alpha">{error}</p>
			<button class="btn-ghost font-mono" onclick={loadArchive}>{$t('archive.retry')}</button>
		</div>
	{:else if battles.length === 0}
		<div class="empty-state stagger-enter">
			<div class="empty-icon">∅</div>
			<p class="font-mono text-dim">{$t('archive.no_battles')}</p>
			<p class="font-mono text-dim" style="font-size: 0.7rem;">{$t('archive.no_battles_sub')}</p>
		</div>
	{:else}
		<div class="battle-grid">
			{#each battles as b, i}
				<a
					href={battleLink(b)}
					class="battle-card stagger-enter"
					style="animation-delay: {0.2 + i * 0.05}s;"
				>
					<div class="card-header">
						<span class="tag {modeClass(b.game_mode)} font-mono">{modeLabel(b.game_mode)}</span>
						<span class="tag {winnerClass(b.final_winner)} font-mono">{winnerLabel(b.final_winner)}</span>
					</div>
					<h3 class="card-topic">{b.topic}</h3>
					<div class="card-contenders font-mono">
						<span class="text-alpha">{b.alpha_name ?? 'Alpha'}</span>
						<span class="vs">VS</span>
						<span class="text-beta">{b.beta_name ?? 'Beta'}</span>
					</div>
					<div class="card-stats font-mono">
						<span>RONDAS: {b.total_rounds}</span>
						<span>👁 {b.spectator_count}</span>
						<span>{formatDate(b.finished_at)}</span>
					</div>
				</a>
			{/each}
		</div>

		<!-- PAGINATION -->
		{#if totalPages > 1}
			<div class="pagination stagger-enter" style="animation-delay: 0.3s;">
				<button class="btn-ghost font-mono" onclick={prevPage} disabled={page <= 1}>{$t('archive.prev')}</button>
				<span class="font-mono text-dim">{$t('archive.page_info')} {page} / {totalPages}</span>
				<button class="btn-ghost font-mono" onclick={nextPage} disabled={page >= totalPages}>{$t('archive.next')}</button>
			</div>
		{/if}
	{/if}
</div>

<style>
	.archive-container {
		min-height: 60vh;
	}

	/* HEADER */
	.archive-header {
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
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}
	.mode-tabs {
		display: flex;
		gap: 0;
		border: 1px solid var(--border-bright);
	}
	.mode-tab {
		padding: 0.5rem 1rem;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 2px;
		background: transparent;
		color: var(--text-muted);
		border-right: 1px solid var(--border);
		transition: all 0.2s;
	}
	.mode-tab:last-child { border-right: none; }
	.mode-tab:hover { color: var(--text); background: var(--surface2); }
	.mode-tab.active {
		color: var(--beta-neon);
		background: var(--beta-dim);
	}
	.search-wrap {
		flex: 1;
		max-width: 300px;
	}
	.search-input {
		width: 100%;
		padding: 0.5rem 1rem;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 1px;
		background: var(--surface2);
		border: 1px solid var(--border);
		color: var(--text);
		outline: none;
		transition: border-color 0.2s;
	}
	.search-input:focus {
		border-color: var(--beta-neon);
	}
	.search-input::placeholder {
		color: var(--text-dim);
	}

	/* META */
	.archive-meta {
		display: flex;
		justify-content: space-between;
		font-size: 0.7rem;
		letter-spacing: 1px;
		margin-bottom: 1.5rem;
	}

	/* BATTLE GRID */
	.battle-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 1rem;
	}

	/* BATTLE CARD */
	.battle-card {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1.25rem;
		background: var(--surface);
		border: 1px solid var(--border);
		transition: all 0.2s;
		cursor: pointer;
		text-decoration: none;
	}
	.battle-card:hover {
		border-color: var(--beta-neon);
		box-shadow: 0 0 20px var(--beta-dim);
		transform: translateY(-2px);
	}
	.card-header {
		display: flex;
		justify-content: space-between;
	}
	.card-topic {
		font-family: var(--font-body);
		font-size: 1rem;
		font-weight: 600;
		line-height: 1.4;
		color: var(--text);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.card-contenders {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		letter-spacing: 1px;
		font-weight: 700;
	}
	.vs {
		color: var(--text-dim);
		font-size: 0.65rem;
	}
	.card-stats {
		display: flex;
		justify-content: space-between;
		font-size: 0.65rem;
		letter-spacing: 1px;
		color: var(--text-muted);
		padding-top: 0.5rem;
		border-top: 1px solid var(--border);
	}

	/* PAGINATION */
	.pagination {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 1.5rem;
		margin-top: 2rem;
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
	.btn-ghost:hover:not(:disabled) {
		border-color: var(--text);
		color: var(--text);
	}
	.btn-ghost:disabled {
		opacity: 0.3;
		cursor: default;
	}

	/* STATES */
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
		background: var(--beta-neon);
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

	@media (max-width: 768px) {
		.filter-bar {
			flex-direction: column;
		}
		.search-wrap {
			max-width: 100%;
		}
		.battle-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
