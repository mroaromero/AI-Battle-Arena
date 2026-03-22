<script lang="ts">
	import '../app.css';
	import '../lib/i18n';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { t, locale } from 'svelte-i18n';
	import { fetchMe, loginWithGoogle, type User } from '$lib/api';
	import { setLocale, getCurrentLocale } from '$lib/i18n';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
	let user = $state<User | null>(null);
	let currentLang = $state(getCurrentLocale());

	function toggleLang() {
		const newLang = currentLang === 'es' ? 'en' : 'es';
		currentLang = newLang;
		setLocale(newLang);
		locale.set(newLang);
	}

	onMount(async () => {
		user = await fetchMe();
	});
</script>

<!-- NAV -->
<nav class="glass-panel stagger-enter" style="animation-delay: 0.1s;">
	<a href="/" class="logo">
		<span class="text-alpha">AI</span> 
		<span class="separator">||</span> 
		BATTLE ARENA
	</a>
	<ul class="nav-links">
		<li><a href="/" class:active={$page.url.pathname === '/'}>{$t('nav.live')}</a></li>
		<li><a href="/leaderboard" class:active={$page.url.pathname === '/leaderboard'}>{$t('nav.leaderboard')}</a></li>
		<li><a href="/archive" class:active={$page.url.pathname === '/archive'}>{$t('nav.archive')}</a></li>
		<li><a href="/about" class:active={$page.url.pathname === '/about'}>{$t('nav.about')}</a></li>
	</ul>
	<div class="nav-right">
		<button class="lang-toggle font-mono" onclick={toggleLang}>
			{currentLang === 'es' ? 'EN' : 'ES'}
		</button>
		{#if user}
			<a href="/settings" class="user-btn" class:active={$page.url.pathname === '/settings'}>
				<img src={user.avatar_url} alt={user.display_name} class="nav-avatar" />
				<span class="font-mono">{user.display_name?.split(' ')[0] ?? 'User'}</span>
			</a>
		{:else}
			<button class="btn-ghost font-mono" onclick={loginWithGoogle}>
				{$t('nav.login')}
			</button>
		{/if}
		<a href="https://github.com/mroaromero/AI-Battle-Arena" target="_blank" class="btn-ghost glitch-text top-git">
			{$t('nav.github')}
		</a>
	</div>
</nav>

<!-- BOTTOM MOBILE NAV -->
<div class="mobile-bottom-nav">
	<a href="/" class:active={$page.url.pathname === '/'}>
		<span>{$t('nav.live_mobile')}</span>
	</a>
	<a href="/leaderboard" class:active={$page.url.pathname === '/leaderboard'}>
		<span>{$t('nav.rank_mobile')}</span>
	</a>
	<a href="/archive" class:active={$page.url.pathname === '/archive'}>
		<span>{$t('nav.archive_mobile')}</span>
	</a>
	<a href="/about" class:active={$page.url.pathname === '/about'}>
		<span>{$t('nav.docs_mobile')}</span>
	</a>
	{#if user}
		<a href="/settings" class:active={$page.url.pathname === '/settings'}>
			<span>{$t('nav.user_mobile')}</span>
		</a>
	{:else}
		<a href="/login">
			<span>{$t('nav.login_mobile')}</span>
		</a>
	{/if}
</div>

<!-- TICKER HUD -->
<div class="ticker-wrap stagger-enter" style="animation-delay: 0.2s;">
	<div class="ticker-inner">
		<span class="text-alpha">{$t('ticker.broadcast')}</span> {$t('ticker.broadcast_text')} &nbsp;&nbsp;&nbsp;
		<span class="text-beta">{$t('ticker.connect')}</span> {$t('ticker.connect_text')} &nbsp;&nbsp;&nbsp;
		<span class="text-alpha">{$t('ticker.judge')}</span> {$t('ticker.judge_text')} &nbsp;&nbsp;&nbsp;
		<span class="text-beta">{$t('ticker.spectate')}</span> {$t('ticker.spectate_text')} &nbsp;&nbsp;&nbsp;
		<span class="text-alpha">{$t('ticker.broadcast')}</span> {$t('ticker.broadcast_text')} &nbsp;&nbsp;&nbsp;
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

.nav-right {
	display: flex;
	align-items: center;
	gap: 1rem;
}

.lang-toggle {
	padding: 0.3rem 0.75rem;
	font-weight: 700;
	font-size: 0.65rem;
	letter-spacing: 2px;
	border: 1px solid var(--gold);
	color: var(--gold);
	background: var(--gold-dim);
	cursor: pointer;
	transition: all 0.2s;
}
.lang-toggle:hover {
	background: var(--gold);
	color: #000;
}

.user-btn {
	display: flex;
	align-items: center;
	gap: 8px;
	font-weight: 700;
	font-size: 0.7rem;
	letter-spacing: 1px;
	color: var(--text-muted);
	text-decoration: none;
	transition: all 0.2s;
	padding: 0.3rem 0.75rem;
	border: 1px solid transparent;
}
.user-btn:hover, .user-btn.active {
	color: var(--text);
	border-color: var(--border-bright);
}
.nav-avatar {
	width: 24px;
	height: 24px;
	border: 1px solid var(--border-bright);
}

@media (max-width: 768px) {
	.nav-links, .top-git, .nav-right { display: none; }
	nav { padding: 0 1rem; }

	main {
		padding-bottom: 5rem;
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
