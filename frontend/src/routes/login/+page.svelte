<script lang="ts">
	import '../lib/i18n';
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { fetchMe, loginWithGoogle } from '$lib/api';

	let loading = $state(true);

	onMount(async () => {
		const user = await fetchMe();
		if (user) {
			goto('/');
			return;
		}
		loading = false;
	});
</script>

<div class="login-container">
	<section class="login-card stagger-enter" style="animation-delay: 0.1s;">
		<div class="login-logo">
			<span class="text-alpha">AI</span> || BATTLE ARENA
		</div>

		<div class="login-eyebrow font-mono">
			<span class="live-blink"></span>
			{$t('login.auth_required')}
		</div>

		<h1 class="login-title glitch-text">
			{$t('login.title')}
		</h1>

		<p class="login-sub font-mono">
			{$t('login.subtitle')}
		</p>

		{#if loading}
			<div class="loading-bar"></div>
		{:else}
			<button class="google-btn" onclick={loginWithGoogle}>
				<svg width="18" height="18" viewBox="0 0 18 18">
					<path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
					<path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
					<path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
					<path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
				</svg>
				<span class="font-mono">{$t('login.google_btn')}</span>
			</button>

			<p class="login-note font-mono">
				{$t('login.note')}
			</p>
		{/if}
	</section>
</div>

<style>
	.login-container {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 70vh;
	}

	.login-card {
		text-align: center;
		padding: 3rem;
		border: 1px solid var(--border-bright);
		background: var(--surface);
		max-width: 420px;
		width: 100%;
	}

	.login-logo {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1rem;
		letter-spacing: 3px;
		margin-bottom: 2rem;
		color: var(--text);
	}

	.login-eyebrow {
		font-size: 0.7rem;
		letter-spacing: 3px;
		color: var(--text-muted);
		margin-bottom: 1rem;
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

	.login-title {
		font-family: var(--font-display);
		font-size: 1.8rem;
		font-weight: 700;
		letter-spacing: 3px;
		margin-bottom: 0.75rem;
	}

	.login-sub {
		font-size: 0.7rem;
		letter-spacing: 2px;
		color: var(--text-muted);
		margin-bottom: 2rem;
		line-height: 1.6;
	}

	.google-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		width: 100%;
		padding: 0.85rem 1.5rem;
		border: 1px solid var(--border-bright);
		background: var(--surface2);
		color: var(--text);
		cursor: pointer;
		transition: all 0.2s;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 2px;
	}

	.google-btn:hover {
		border-color: var(--beta-neon);
		box-shadow: 0 0 20px var(--beta-dim);
	}

	.google-btn svg {
		flex-shrink: 0;
	}

	.login-note {
		font-size: 0.65rem;
		letter-spacing: 1px;
		color: var(--text-dim);
		margin-top: 1.5rem;
	}

	.loading-bar {
		width: 200px;
		height: 2px;
		background: var(--surface2);
		margin: 2rem auto 0;
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
</style>
