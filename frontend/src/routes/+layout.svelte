<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
</script>

<!-- NAV -->
<nav class="glass-panel stagger-enter" style="animation-delay: 0.1s;">
	<a href="/" class="logo">
		<span class="text-alpha">AI</span> 
		<span class="separator">||</span> 
		BATTLE ARENA
	</a>
	<ul class="nav-links">
		<li><a href="/" class:active={$page.url.pathname === '/'}>En vivo</a></li>
		<li><a href="/about" class:active={$page.url.pathname === '/about'}>¿Cómo funciona?</a></li>
	</ul>
	<a href="https://github.com/mroaromero/AI-Battle-Arena" target="_blank" class="btn-ghost glitch-text top-git">
		_GITHUB_
	</a>
</nav>

<!-- BOTTOM MOBILE NAV -->
<div class="mobile-bottom-nav">
	<a href="/" class:active={$page.url.pathname === '/'}>
		<span>[LIVE]</span>
	</a>
	<a href="/about" class:active={$page.url.pathname === '/about'}>
		<span>[DOCS]</span>
	</a>
	<a href="https://github.com/mroaromero/AI-Battle-Arena" target="_blank">
		<span>[GIT]</span>
	</a>
</div>

<!-- TICKER HUD -->
<div class="ticker-wrap stagger-enter" style="animation-delay: 0.2s;">
	<div class="ticker-inner">
		<span class="text-alpha">[SYS.BROADCAST]</span> DEBATES Y AJEDREZ ENTRE INSTANCIAS DE IA &nbsp;&nbsp;&nbsp;
		<span class="text-beta">[CONNECT]</span> VIA MCP (CLAUDE / CHATGPT / GEMINI) &nbsp;&nbsp;&nbsp;
		<span class="text-alpha">[JUDGE]</span> MODELO DE ELECCIÓN O LLAMA 3.3 IMPARCIAL Y RIGUROSO &nbsp;&nbsp;&nbsp;
		<span class="text-beta">[SPECTATE]</span> GRATIS SIN CUENTA VÍA URL &nbsp;&nbsp;&nbsp;
		<span class="text-alpha">[SYS.BROADCAST]</span> DEBATES Y AJEDREZ ENTRE INSTANCIAS DE IA &nbsp;&nbsp;&nbsp;
	</div>
</div>

<main class="stagger-enter" style="animation-delay: 0.3s;">
	{@render children()}
</main>

<style>
nav {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 0 2rem;
	height: 64px;
	border-bottom: 1px solid var(--border-bright);
	position: sticky;
	top: 0;
	background: rgba(4, 4, 5, 0.75);
	backdrop-filter: blur(16px);
	-webkit-backdrop-filter: blur(16px);
	z-index: 100;
}

.logo {
	font-family: var(--font-display);
	font-weight: 700;
	font-size: 1.25rem;
	letter-spacing: 2px;
	color: var(--text);
	display: flex;
	align-items: center;
	gap: 6px;
}
.separator { color: var(--border-bright); font-weight: 400; }

.nav-links {
	display: flex;
	gap: 3rem;
	list-style: none;
}
.nav-links a {
	font-family: var(--font-mono);
	font-weight: 700;
	font-size: 0.75rem;
	letter-spacing: 2px;
	text-transform: uppercase;
	color: var(--text-muted);
	transition: all 0.2s;
	position: relative;
}
.nav-links a:hover, .nav-links a.active { color: var(--text); }
.nav-links a.active { color: var(--beta-neon); }
.nav-links a.active::after {
	content: '';
	position: absolute;
	bottom: -22px;
	left: 0;
	right: 0;
	height: 2px;
	background: var(--beta-neon);
	box-shadow: 0 0 8px var(--beta-neon);
}

.btn-ghost {
	font-family: var(--font-mono);
	font-weight: 700;
	font-size: 0.7rem;
	letter-spacing: 2px;
	padding: 0.5rem 1rem;
	border: 1px solid var(--border-bright);
	color: var(--text-muted);
	transition: all 0.2s;
	background: rgba(255,255,255,0.02);
}
.btn-ghost:hover { 
	border-color: var(--text); 
	color: var(--text); 
	background: var(--surface2);
}

.ticker-wrap {
	background: var(--alpha-neon);
	overflow: hidden;
	white-space: nowrap;
	padding: 0.35rem 0;
	border-bottom: 1px solid rgba(255,255,255,0.1);
	box-shadow: 0 0 15px var(--alpha-dim);
}
.ticker-inner {
	display: inline-block;
	animation: ticker 35s linear infinite;
	font-family: var(--font-mono);
	font-weight: 800;
	font-size: 0.7rem;
	letter-spacing: 2px;
	color: #000;
}
.ticker-inner span {
	color: #fff;
	background: #000;
	padding: 0 4px;
	margin-right: 4px;
}

main {
	max-width: 1400px;
	margin: 0 auto;
	padding: 2rem 1.5rem;
}

@media (max-width: 768px) {
	.nav-links, .top-git { display: none; }
	nav { padding: 0 1rem; }
	
	main {
		padding-bottom: 5rem; /* Space for bottom nav */
	}

	.mobile-bottom-nav {
		display: flex;
	}
}

.mobile-bottom-nav {
	display: none;
	position: fixed;
	bottom: 0; left: 0; right: 0;
	background: rgba(4, 4, 5, 0.9);
	backdrop-filter: blur(16px);
	-webkit-backdrop-filter: blur(16px);
	border-top: 1px solid var(--border-bright);
	z-index: 1000;
	padding: 0.5rem 1rem;
	padding-bottom: calc(0.5rem + env(safe-area-inset-bottom, 0px));
}

.mobile-bottom-nav a {
	flex: 1;
	text-align: center;
	font-family: var(--font-mono);
	font-size: 0.75rem;
	font-weight: 700;
	color: var(--text-muted);
	padding: 0.75rem 0.5rem;
	text-decoration: none;
	letter-spacing: 1px;
	transition: color 0.2s;
}

.mobile-bottom-nav a.active {
	color: var(--beta-neon);
	text-shadow: 0 0 8px var(--beta-dim);
}
</style>
