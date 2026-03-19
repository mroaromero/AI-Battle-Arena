<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { api } from '$lib/api';
	import type { Battle, ChessState } from '$lib/types';

	const battleId = ($page.params.id || '').toUpperCase();

	let battle = $state<Battle | null>(null);
	let loading = $state(true);
	let error = $state('');
	let qrUrl = $state('');
	let interval: ReturnType<typeof setInterval> | null = null;

	// ── Fetch battle state ────────────────────────────────────────────────────
	async function fetchBattle() {
		try {
			battle = await api.watchBattle(battleId);
			error = '';
			// Stop polling once the chess match is finished
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

	onMount(async () => {
		await fetchBattle();
		if (battle?.status !== 'finished') {
			interval = setInterval(fetchBattle, 3000);
		}
		qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(window.location.href)}&bgcolor=ffffff&color=111111&margin=2`;
	});
	onDestroy(() => { if (interval) clearInterval(interval); });

	// ── Chess board rendering ─────────────────────────────────────────────────
	// We render the board from FEN directly in SVG/HTML — no external lib needed.
	const FILES = ['a','b','c','d','e','f','g','h'];
	const RANKS = ['8','7','6','5','4','3','2','1'];

	// Piece unicode symbols
	const PIECES: Record<string, string> = {
		K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
		k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
	};

	function parseFen(fen: string): (string | null)[][] {
		const board: (string | null)[][] = Array(8).fill(null).map(() => Array(8).fill(null));
		const rows = fen.split(' ')[0].split('/');
		for (let r = 0; r < 8; r++) {
			let c = 0;
			for (const ch of rows[r]) {
				if (/\d/.test(ch)) { c += parseInt(ch); }
				else { board[r][c] = ch; c++; }
			}
		}
		return board;
	}

	let boardData = $derived(battle?.chess ? parseFen(battle.chess.fen) : null);

	function squareColor(r: number, c: number): 'light' | 'dark' {
		return (r + c) % 2 === 0 ? 'light' : 'dark';
	}

	function isWhitePiece(p: string) { return p === p.toUpperCase() && /[KQRBNP]/.test(p); }

	function statusLabel(s: string) {
		return s === 'waiting'  ? 'AWAITING_OPPONENT' :
			   s === 'active'   ? 'SYS_ACTIVE' :
			   s === 'judging'  ? 'EVALUATING' : 'TERMINATED';
	}

	function winnerName(w: string | null) {
		if (!w) return '';
		if (w === 'draw') return 'DRAW';
		if (w === 'alpha') return battle?.contenders.alpha?.name ?? 'ALPHA';
		return battle?.contenders.beta?.name ?? 'BETA';
	}
</script>

<svelte:head>
	<title>#{battleId} — AI Battle Arena Chess</title>
</svelte:head>

<div class="chess-container">
	{#if loading}
		<div class="center-state">
			<div class="spinner-lg"></div>
			<span class="font-mono">CONNECTING TO CHESS ROOM #{battleId}...</span>
		</div>
	{:else if error || !battle}
		<div class="center-state error">
			<span class="err-icon glow-red">!</span>
			<p class="font-mono text-alpha">{error || 'ROOM NOT FOUND'}</p>
			<a href="/" class="btn-outline">← BACK TO LOBBY</a>
		</div>
	{:else}

	<!-- HEADER -->
	<header class="battle-header stagger-enter" style="animation-delay: 0.1s;">
		<div class="header-top">
			<a href="/" class="btn-outline">← LOBBY</a>
			<div class="status-group">
				{#if battle.status !== 'finished'}
					<span class="live-indicator"><span class="live-blink"></span> LIVE</span>
				{/if}
				<span class="tag {battle.status === 'active' ? 'tag-green' : battle.status === 'judging' ? 'tag-gold' : 'tag-dim'}">
					{statusLabel(battle.status)}
				</span>
				<span class="tag tag-dim border-white">♟ CHESS_MODE</span>
				<span class="room-id font-mono">#{battleId}</span>
			</div>
		</div>
		
		<h1 class="topic glitch-text">"AI CHESS ARENA"</h1>
		
		<div class="battle-meta font-mono">
			<span class="meta-item">TOPIC: {battle.topic}</span>
			<span class="meta-separator">||</span>
			<span class="meta-item">👁 {battle.spectator_count} SPECS</span>
		</div>
	</header>

	<!-- PLAYERS HUD -->
	<section class="players-hud stagger-enter" style="animation-delay: 0.2s;">
		<!-- ALPHA / WHITE -->
		<div class="player-panel panel-alpha" class:is-turn={battle.chess?.turn === 'white' && battle.status === 'active'}>
			<div class="panel-header font-mono text-alpha">[WHITE_PIECES]</div>
			<div class="piece-avatar">♔</div>
			<div class="f-name font-display">{battle.contenders.alpha?.name ?? '—'}</div>
			<div class="f-device font-mono text-dim">{battle.contenders.alpha?.device ?? 'SYS_UNKNOWN'}</div>
			{#if battle.final_winner === 'alpha'}
				<div class="winner-tag font-mono text-gold">>> WINNER</div>
			{/if}
		</div>

		<!-- CENTER VS / STATUS -->
		<div class="center-status">
			<div class="vs-text font-display">VS</div>
			
			{#if battle.chess}
				<div class="move-count font-mono">MOVES: {battle.chess.move_count}</div>
				
				<div class="alerts-container">
					{#if battle.chess.is_check && !battle.chess.is_checkmate}
						<div class="alert-box tag-gold font-mono glitch-text-sm">⚠ CHECK_DETECTED</div>
					{/if}
					{#if battle.chess.is_checkmate}
						<div class="alert-box tag-red font-mono glitch-text-sm">🛑 CHECKMATE</div>
					{/if}
					{#if battle.chess.is_draw}
						<div class="alert-box tag-dim font-mono">= DRAW_DECLARED</div>
					{/if}
				</div>
			{/if}
			
			<div class="turn-indicator font-mono">
				{#if battle.status === 'active' && battle.chess}
					[ACTIVE_TURN]: 
					<span class="turn-highlight {battle.chess.turn === 'white' ? 'text-alpha' : 'text-beta'}">
						{battle.chess.turn === 'white' ? 'ALPHA_WHITE ♔' : 'BETA_BLACK ♚'}
					</span>
				{:else if battle.status === 'waiting'}
					<span class="typing-indicator">
						<span class="block text-dim"></span>
						<span class="block text-dim"></span>
						AWAITING_OPPONENT...
					</span>
				{:else if battle.status === 'finished'}
					[MATCH_TERMINATED]
				{/if}
			</div>
		</div>

		<!-- BETA / BLACK -->
		<div class="player-panel panel-beta" class:is-turn={battle.chess?.turn === 'black' && battle.status === 'active'}>
			<div class="panel-header font-mono text-beta align-right">[BLACK_PIECES]</div>
			<div class="piece-avatar beta-avatar">♚</div>
			<div class="f-name font-display text-right">{battle.contenders.beta?.name ?? (battle.status === 'waiting' ? '...' : '—')}</div>
			<div class="f-device font-mono text-dim text-right">{battle.contenders.beta?.device ?? 'SYS_UNKNOWN'}</div>
			{#if battle.final_winner === 'beta'}
				<div class="winner-tag font-mono text-gold align-right">WINNER &lt;&lt;</div>
			{/if}
		</div>
	</section>

	<!-- WINNER BANNER -->
	{#if battle.status === 'finished' && battle.final_winner}
		<div class="winner-hud font-display stagger-enter" style="animation-delay: 0.25s;">
			<span class="wb-label text-muted">FINAL STATUS: </span>
			<span class="wb-winner {battle.final_winner === 'alpha' ? 'text-alpha' : battle.final_winner === 'beta' ? 'text-beta' : 'text-muted'}">
				{battle.final_winner === 'draw' ? 'DRAW' : `VICTORY -> ${winnerName(battle.final_winner)}`}
			</span>
		</div>
	{/if}

	<!-- CHESS AREA (BOARD + MOVES) -->
	<section class="chess-main stagger-enter" style="animation-delay: 0.3s;">
		
		<!-- BOARD -->
		<div class="board-wrapper">
			<div class="board-ranks font-mono text-dim">
				{#each RANKS as rank}
					<div class="b-coord">{rank}</div>
				{/each}
			</div>

			<div class="board-grid">
				{#if boardData}
					{#each RANKS as rank, r}
						{#each FILES as file, c}
							{@const piece = boardData[r][c]}
							<div class="b-square {squareColor(r, c)}" title="{file}{rank}">
								{#if piece}
									<span class="b-piece" class:white-piece={isWhitePiece(piece)} class:black-piece={!isWhitePiece(piece)}>
										{PIECES[piece] ?? piece}
									</span>
								{/if}
							</div>
						{/each}
					{/each}
				{:else}
					{#each RANKS as _r, r}
						{#each FILES as _f, c}
							<div class="b-square {squareColor(r, c)}"></div>
						{/each}
					{/each}
				{/if}
			</div>

			<div class="board-files font-mono text-dim">
				<div class="b-coord empty-corner"></div>
				{#each FILES as file}
					<div class="b-coord-file">{file}</div>
				{/each}
			</div>
		</div>

		<!-- MOVES & PGN TERMINAL -->
		<div class="terminal-panel">
			<div class="terminal-header font-mono text-muted">
				├── MOVEMENT_LOG
			</div>
			
			<div class="terminal-content">
				{#if battle.chess && battle.chess.moves.length > 0}
					<div class="move-history font-mono">
						{#each battle.chess.moves as m, i}
							{#if i % 2 === 0}
								<div class="move-row">
									<span class="m-num text-dim">{(i/2 + 1).toString().padStart(3, '0')}.</span>
									<span class="m-san m-white">{battle.chess.moves[i]?.san}</span>
									{#if battle.chess.moves[i + 1]}
										<span class="m-san m-black">{battle.chess.moves[i + 1]?.san}</span>
									{:else}
										<span class="m-san m-pending blink">_</span>
									{/if}
								</div>
							{/if}
						{/each}
					</div>

					{#if battle.chess.pgn}
						<div class="pgn-section">
							<div class="pgn-title font-mono text-gold">>> RAW_PGN_DATA</div>
							<div class="pgn-box font-mono text-muted">{battle.chess.pgn}</div>
						</div>
					{/if}
				{:else}
					<div class="empty-terminal font-mono text-dim">SYS: NO MOVES RECORDED YET.</div>
				{/if}
			</div>

			<!-- LEGAL MOVES -->
			{#if battle.chess && battle.status === 'active' && battle.chess.legal_moves.length > 0}
				<div class="legal-moves-panel">
					<div class="legal-header font-mono text-green">>> COMPUTED_LEGAL_VECTORS ({battle.chess.legal_moves.length})</div>
					<div class="legal-grid font-mono">
						{#each battle.chess.legal_moves.slice(0, 24) as m}
							<span class="l-move">{m}</span>
						{/each}
						{#if battle.chess.legal_moves.length > 24}
							<span class="l-more text-dim">+{battle.chess.legal_moves.length - 24} ...</span>
						{/if}
					</div>
				</div>
			{/if}
		</div>

	</section>

	<!-- SHARE FOOTER -->
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
.chess-container {
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
.text-green { color: var(--green); }
.bg-gold { background-color: var(--gold); }
.bg-beta { background-color: var(--beta-neon); }
.align-right { text-align: right; }
.text-right { text-align: right; }
.border-white { border-color: #fff !important; color: #fff !important; }
.blink { animation: blinker 1s linear infinite; }
@keyframes blinker { 50% { opacity: 0; } }

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

/* ── PLAYERS HUD ── */
.players-hud {
	display: grid;
	grid-template-columns: 1fr auto 1fr;
	gap: 2rem;
	align-items: center;
	background: rgba(255,255,255,0.01);
	border: 1px solid var(--border);
	padding: 1.5rem;
}
.player-panel {
	display: flex; flex-direction: column; gap: 8px;
	padding: 1rem; border: 1px solid transparent;
	transition: all 0.3s;
	position: relative;
}
.panel-alpha.is-turn { border-color: var(--alpha-neon); background: rgba(255,49,49,0.05); box-shadow: 0 0 20px rgba(255,49,49,0.1); }
.panel-beta.is-turn { border-color: var(--beta-neon); background: rgba(41,121,255,0.05); box-shadow: 0 0 20px rgba(41,121,255,0.1); }

.panel-header { font-size: 0.7rem; letter-spacing: 2px; margin-bottom: 0.5rem; }
.piece-avatar { font-size: 3rem; line-height: 1; text-shadow: 0 0 10px rgba(255,255,255,0.2); }
.beta-avatar { text-align: right; }
.f-name { font-size: 1.8rem; letter-spacing: 1px; color: var(--text); text-transform: uppercase; }
.f-device { font-size: 0.75rem; letter-spacing: 2px; }
.winner-tag { position: absolute; bottom: 1rem; font-size: 0.8rem; font-weight: 700; letter-spacing: 2px; }

.center-status { display: flex; flex-direction: column; align-items: center; gap: 1rem; text-align: center; }
.vs-text { font-size: 2.5rem; color: var(--border-bright); font-weight: 900; }
.move-count { font-size: 0.85rem; letter-spacing: 2px; color: var(--text-muted); }
.alerts-container { display: flex; flex-direction: column; gap: 0.5rem; }
.alert-box { padding: 4px 10px; border-radius: 2px; letter-spacing: 1px; }

.turn-indicator { font-size: 0.85rem; letter-spacing: 1px; color: var(--text-dim); margin-top: 0.5rem; }
.turn-highlight { font-weight: 700; text-shadow: 0 0 8px currentColor; }

.typing-indicator { display: flex; align-items: center; gap: 6px; }
.typing-indicator .block { width: 8px; height: 14px; animation: blink 1s step-end infinite; }
.typing-indicator .block:nth-child(2) { animation-delay: 0.2s; }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

/* WINNER HUD */
.winner-hud {
	margin-top: -1rem; margin-bottom: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--border-bright);
	text-align: center; font-size: 1.25rem; letter-spacing: 4px;
}

/* ── CHESS MAIN ── */
.chess-main {
	display: grid;
	grid-template-columns: auto 1fr;
	gap: 3rem;
	align-items: start;
}

/* Board */
.board-wrapper {
	display: flex;
	flex-direction: column;
}
.board-ranks { display: flex; flex-direction: column; align-self: flex-start; justify-content: space-around; }
.b-coord { font-size: 0.75rem; height: 56px; display: flex; align-items: center; justify-content: center; width: 1.5rem; }
.board-files { display: flex; flex-direction: row; }
.b-coord-file { font-size: 0.75rem; width: 56px; height: 1.5rem; display: flex; align-items: center; justify-content: center; }
.empty-corner { width: 1.5rem; height: 1.5rem; }

.board-grid {
	display: grid; grid-template-columns: repeat(8, 56px); grid-template-rows: repeat(8, 56px);
	border: 2px solid var(--border-bright);
	box-shadow: 0 0 20px rgba(0,0,0,0.5), inset 0 0 20px rgba(0,0,0,0.5);
}
.b-square {
	width: 56px; height: 56px;
	display: flex; align-items: center; justify-content: center;
}
/* Cyber-Chess Palette */
.b-square.light { background: #E8D8C0; }
.b-square.dark  { background: #1C2230; }

.b-piece {
	font-size: 2.4rem; line-height: 1;
	user-select: none; cursor: default;
	transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.b-piece:hover { transform: scale(1.1); }

.b-piece.white-piece {
	color: #fff;
	text-shadow: 0 2px 4px rgba(0,0,0,0.6), 0 0 10px rgba(255,255,255,0.4);
}
.b-piece.black-piece {
	color: #0A0A0A;
	text-shadow: 0 2px 4px rgba(255,255,255,0.3), 0 0 10px rgba(0,0,0,0.8);
}

/* Terminal / Moves */
.terminal-panel {
	background: rgba(0,0,0,0.4);
	border: 1px solid var(--border);
	display: flex; flex-direction: column;
	height: 100%;
	max-height: 600px;
}
.terminal-header {
	padding: 1rem; border-bottom: 1px solid var(--border-bright);
	letter-spacing: 2px; font-size: 0.8rem;
}
.terminal-content {
	flex: 1; overflow-y: auto; padding: 1rem;
	display: flex; flex-direction: column; gap: 1.5rem;
}

.move-history { display: flex; flex-direction: column; gap: 4px; }
.move-row { display: flex; gap: 1rem; align-items: center; padding: 4px 8px; border-bottom: 1px dotted var(--border-bright); }
.move-row:hover { background: rgba(255,255,255,0.02); }
.m-num { min-width: 3rem; }
.m-san { padding: 2px 8px; border-radius: 2px; min-width: 4rem; text-align: left; }
.m-white { color: var(--alpha-neon); background: rgba(255,49,49,0.05); }
.m-black { color: var(--beta-neon); background: rgba(41,121,255,0.05); }

.pgn-section { margin-top: 1rem; padding-top: 1rem; border-top: 1px dashed var(--border-bright); }
.pgn-title { font-size: 0.7rem; margin-bottom: 0.75rem; letter-spacing: 1px; }
.pgn-box {
	background: #000; border: 1px solid #333; padding: 1rem;
	font-size: 0.75rem; line-height: 1.6; word-break: break-all;
	max-height: 150px; overflow-y: auto;
}

.empty-terminal { padding: 2rem; text-align: center; letter-spacing: 1px; }

.legal-moves-panel {
	border-top: 1px solid var(--border); padding: 1rem;
	background: rgba(0,255,170,0.02);
}
.legal-header { font-size: 0.7rem; margin-bottom: 0.75rem; letter-spacing: 1px; }
.legal-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.l-move { font-size: 0.7rem; padding: 2px 6px; border: 1px solid var(--border-bright); color: var(--text-dim); }

/* ── SHARE ── */
.share-footer {
	margin-top: 2rem; padding: 2rem;
	background: var(--surface); border: 1px dashed var(--border-bright);
	display: flex; justify-content: space-between; align-items: center;
}
.share-info { display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.8rem; }
.qr-img { border: 2px solid var(--border-bright); padding: 4px; background: #fff;}

/* ── RESPONSIVE ── */
@media (max-width: 900px) {
	.chess-main { grid-template-columns: 1fr; gap: 2rem; }
	.terminal-panel { max-height: 400px; }
	.board-wrapper { margin: 0 auto; }
}

@media (max-width: 600px) {
	.players-hud { grid-template-columns: 1fr; text-align: center; gap: 1.5rem; }
	.panel-beta .panel-header, .panel-beta .f-device, .panel-beta .winner-tag { text-align: center; }
	.piece-avatar { text-align: center; }
	.f-name { text-align: center !important; }
	
	.board-grid { grid-template-columns: repeat(8, 40px); grid-template-rows: repeat(8, 40px); }
	.b-square { width: 40px; height: 40px; }
	.b-piece { font-size: 1.8rem; }
	.b-coord-file { width: 40px; }
	.b-coord { height: 40px; }
	.topic { font-size: 2.2rem; }
}
</style>
