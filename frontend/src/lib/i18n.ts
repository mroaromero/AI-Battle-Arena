import { register, init, getLocaleFromNavigator } from 'svelte-i18n';

register('es', () => import('./locales/es.json'));
register('en', () => import('./locales/en.json'));

// Detect language from localStorage or browser
function getInitialLocale(): string {
	if (typeof window !== 'undefined') {
		const saved = localStorage.getItem('arena_lang');
		if (saved && (saved === 'es' || saved === 'en')) return saved;
		const browser = getLocaleFromNavigator();
		if (browser?.startsWith('es')) return 'es';
	}
	return 'es';
}

init({
	fallbackLocale: 'es',
	initialLocale: getInitialLocale(),
});

// Persist language changes
export function setLocale(lang: string): void {
	if (typeof window !== 'undefined') {
		localStorage.setItem('arena_lang', lang);
	}
}

export function getCurrentLocale(): string {
	if (typeof window !== 'undefined') {
		return localStorage.getItem('arena_lang') || 'es';
	}
	return 'es';
}
