<script lang="ts">
	import '$lib/i18n';
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { fetchMe, updateProfile, deleteAccount, logout, type User } from '$lib/api';

	let user = $state<User | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let deleting = $state(false);
	let editName = $state('');
	let message = $state('');
	let error = $state('');
	let showDeleteConfirm = $state(false);

	onMount(async () => {
		const u = await fetchMe();
		if (!u) {
			goto('/login');
			return;
		}
		user = u;
		editName = u.display_name;
		loading = false;
	});

	async function handleSave() {
		if (!editName.trim()) return;
		saving = true;
		error = '';
		message = '';
		try {
			user = await updateProfile(editName.trim());
			message = $t('settings.saved');
		} catch (e) {
			error = (e as Error).message;
		} finally {
			saving = false;
		}
	}

	async function handleDelete() {
		deleting = true;
		error = '';
		try {
			await deleteAccount();
			await logout();
			goto('/');
		} catch (e) {
			error = (e as Error).message;
			deleting = false;
		}
	}

	async function handleLogout() {
		await logout();
		goto('/');
	}
</script>

<div class="settings-container">
	{#if loading}
		<div class="loading-state">
			<div class="loading-bar"></div>
			<p class="font-mono text-dim">{$t('common.loading')}</p>
		</div>
	{:else if user}
		<section class="settings-header stagger-enter" style="animation-delay: 0.1s;">
			<div class="hero-eyebrow font-mono">
				<span class="live-blink"></span>
				{$t('settings.user_settings')}
			</div>
			<h1 class="hero-title">
				<span class="text-beta">{$t('settings.title').split(' ')[0]}</span> {$t('settings.title').split(' ').slice(1).join(' ')}
			</h1>
		</section>

		<!-- Profile Card -->
		<div class="settings-card stagger-enter" style="animation-delay: 0.15s;">
			<div class="profile-row">
				<img src={user.avatar_url} alt={user.display_name} class="avatar" />
				<div class="profile-info">
					<span class="font-mono email">{user.email}</span>
					<span class="font-mono joined">{$t('settings.created')}: {new Date(user.created_at).toLocaleDateString()}</span>
				</div>
			</div>
		</div>

		<!-- Edit Name -->
		<div class="settings-card stagger-enter" style="animation-delay: 0.2s;">
			<h3 class="card-title font-mono">{$t('settings.display_name')}</h3>
			<div class="form-row">
				<input
					type="text"
					class="form-input font-mono"
					bind:value={editName}
					placeholder="Tu nombre"
					maxlength="100"
				/>
				<button
					class="btn-primary font-mono"
					onclick={handleSave}
					disabled={saving || editName.trim() === user.display_name}
				>
					{saving ? $t('settings.saving') : $t('settings.save')}
				</button>
			</div>
			{#if message}
				<p class="success-msg font-mono">{message}</p>
			{/if}
		</div>

		<!-- Account Actions -->
		<div class="settings-card stagger-enter" style="animation-delay: 0.25s;">
			<h3 class="card-title font-mono">{$t('settings.session')}</h3>
			<button class="btn-ghost font-mono" onclick={handleLogout}>
				{$t('settings.logout')}
			</button>
		</div>

		<!-- Danger Zone -->
		<div class="settings-card danger-zone stagger-enter" style="animation-delay: 0.3s;">
			<h3 class="card-title font-mono text-alpha">{$t('settings.danger_zone')}</h3>
			<p class="font-mono text-dim danger-desc">
				{$t('settings.danger_desc')}
			</p>
			{#if !showDeleteConfirm}
				<button class="btn-danger font-mono" onclick={() => showDeleteConfirm = true}>
					{$t('settings.delete_account')}
				</button>
			{:else}
				<div class="delete-confirm">
					<p class="font-mono text-alpha">{$t('settings.delete_confirm')}</p>
					<div class="confirm-actions">
						<button class="btn-danger font-mono" onclick={handleDelete} disabled={deleting}>
							{deleting ? $t('settings.delete_deleting') : $t('settings.delete_yes')}
						</button>
						<button class="btn-ghost font-mono" onclick={() => showDeleteConfirm = false}>
							{$t('settings.cancel')}
						</button>
					</div>
				</div>
			{/if}
		</div>

		{#if error}
			<p class="error-msg font-mono">{error}</p>
		{/if}
	{/if}
</div>

<style>
	.settings-container {
		min-height: 60vh;
		max-width: 600px;
		margin: 0 auto;
	}

	.settings-header {
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
		font-size: 1.5rem;
		font-weight: 700;
		letter-spacing: 3px;
	}

	/* Card */
	.settings-card {
		padding: 1.5rem;
		border: 1px solid var(--border);
		background: var(--surface);
		margin-bottom: 1rem;
	}
	.card-title {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 2px;
		color: var(--text-muted);
		margin-bottom: 1rem;
	}

	/* Profile */
	.profile-row {
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	.avatar {
		width: 48px;
		height: 48px;
		border-radius: 0;
		border: 1px solid var(--border-bright);
	}
	.profile-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.email {
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--text);
	}
	.joined {
		font-size: 0.65rem;
		color: var(--text-dim);
		letter-spacing: 1px;
	}

	/* Form */
	.form-row {
		display: flex;
		gap: 0.75rem;
	}
	.form-input {
		flex: 1;
		padding: 0.6rem 1rem;
		font-size: 0.8rem;
		background: var(--surface2);
		border: 1px solid var(--border);
		color: var(--text);
		outline: none;
		transition: border-color 0.2s;
	}
	.form-input:focus {
		border-color: var(--beta-neon);
	}

	/* Buttons */
	.btn-primary {
		padding: 0.6rem 1.25rem;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 2px;
		background: var(--beta-dim);
		border: 1px solid var(--beta-neon);
		color: var(--beta-neon);
		cursor: pointer;
		transition: all 0.2s;
		white-space: nowrap;
	}
	.btn-primary:hover:not(:disabled) {
		background: var(--beta-neon);
		color: #000;
	}
	.btn-primary:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.btn-ghost {
		padding: 0.5rem 1rem;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 2px;
		background: transparent;
		border: 1px solid var(--border-bright);
		color: var(--text-muted);
		cursor: pointer;
		transition: all 0.2s;
	}
	.btn-ghost:hover {
		border-color: var(--text);
		color: var(--text);
	}

	.btn-danger {
		padding: 0.5rem 1rem;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 2px;
		background: var(--alpha-dim);
		border: 1px solid var(--alpha-neon);
		color: var(--alpha-neon);
		cursor: pointer;
		transition: all 0.2s;
	}
	.btn-danger:hover:not(:disabled) {
		background: var(--alpha-neon);
		color: #000;
	}
	.btn-danger:disabled {
		opacity: 0.5;
	}

	/* Danger zone */
	.danger-zone {
		border-color: rgba(255, 15, 57, 0.3);
	}
	.danger-desc {
		font-size: 0.7rem;
		margin-bottom: 1rem;
	}

	.delete-confirm {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.confirm-actions {
		display: flex;
		gap: 0.75rem;
	}

	/* Messages */
	.success-msg {
		font-size: 0.7rem;
		color: var(--green);
		letter-spacing: 1px;
		margin-top: 0.75rem;
	}
	.error-msg {
		font-size: 0.7rem;
		color: var(--alpha-neon);
		letter-spacing: 1px;
		text-align: center;
		margin-top: 1rem;
	}

	/* Loading */
	.loading-state {
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
</style>
