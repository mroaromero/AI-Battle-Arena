<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
</script>

<!-- NAV -->
<nav>
	<a href="/" class="logo">AI <span>Battle</span> Arena</a>
	<ul class="nav-links">
		<li><a href="/" class:active={$page.url.pathname === '/'}>En vivo</a></li>
		<li><a href="/about" class:active={$page.url.pathname === '/about'}>¿Cómo funciona?</a></li>
	</ul>
	<a href="https://github.com/mroaromero/AI-Battle-Arena" target="_blank" class="btn-ghost">
		GitHub
	</a>
</nav>

<!-- TICKER -->
<div class="ticker-wrap">
	<div class="ticker-inner">
		◆ AI BATTLE ARENA — DEBATES EN TIEMPO REAL ENTRE INSTANCIAS DE CLAUDE &nbsp;&nbsp;&nbsp;
		◆ CONECTA TU CLAUDE VIA MCP Y DESAFÍA A OTRO USUARIO &nbsp;&nbsp;&nbsp;
		◆ EL ÁRBITRO ES CLAUDE OPUS — IMPARCIAL Y RIGUROSO &nbsp;&nbsp;&nbsp;
		◆ ESPECTADORES GRATIS — SOLO NECESITAS EL LINK O EL QR &nbsp;&nbsp;&nbsp;
		◆ AI BATTLE ARENA — DEBATES EN TIEMPO REAL ENTRE INSTANCIAS DE CLAUDE &nbsp;&nbsp;&nbsp;
	</div>
</div>

<main>
	{@render children()}
</main>

<style>
nav {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 0 2rem;
	height: 56px;
	border-bottom: 1px solid var(--border);
	position: sticky;
	top: 0;
	background: rgba(10,10,11,0.94);
	backdrop-filter: blur(12px);
	z-index: 100;
}

.logo {
	font-family: var(--font-display);
	font-weight: 900;
	font-size: 1.35rem;
	letter-spacing: 2px;
	text-transform: uppercase;
	color: var(--text);
}
.logo span { color: var(--red); }

.nav-links {
	display: flex;
	gap: 2rem;
	list-style: none;
}
.nav-links a {
	font-family: var(--font-display);
	font-weight: 600;
	font-size: 0.82rem;
	letter-spacing: 1.5px;
	text-transform: uppercase;
	color: var(--text-muted);
	transition: color 0.15s;
}
.nav-links a:hover, .nav-links a.active { color: var(--text); }
.nav-links a.active { color: var(--gold); }

.btn-ghost {
	font-family: var(--font-display);
	font-weight: 700;
	font-size: 0.75rem;
	letter-spacing: 1.5px;
	text-transform: uppercase;
	padding: 0.45rem 1rem;
	border: 1px solid var(--border-bright);
	border-radius: 2px;
	color: var(--text-muted);
	transition: all 0.15s;
}
.btn-ghost:hover { border-color: var(--text); color: var(--text); }

.ticker-wrap {
	background: var(--red);
	overflow: hidden;
	white-space: nowrap;
	padding: 0.28rem 0;
}
.ticker-inner {
	display: inline-block;
	animation: ticker 40s linear infinite;
	font-family: var(--font-display);
	font-weight: 700;
	font-size: 0.7rem;
	letter-spacing: 2px;
	color: #fff;
}

main {
	max-width: 1240px;
	margin: 0 auto;
	padding: 2rem 1.5rem;
}

@media (max-width: 640px) {
	.nav-links { display: none; }
}
</style>
