/** Where the server serves the manifest, and the document head links it. */
export const MANIFEST_PATH = '/manifest.webmanifest';

/**
 * Cacheable for an hour, like the icons; the language travels in `?lang=`.
 * Its own policy, which loads nothing: the pages' one carries a nonce, and
 * a nonce never goes in a response a cache may keep.
 */
export const MANIFEST_HEADERS = {
	'content-type': 'application/manifest+json; charset=utf-8',
	'cache-control': 'public, max-age=3600',
	vary: 'Accept-Language',
	'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
} as const;

/**
 * The manifest's URL for a page in `language`. A browser fetches the
 * manifest without cookies, so a `language` cookie would not reach it: the
 * page names its language in the query instead.
 */
export function manifestHref(
	language: string,
	path: string = MANIFEST_PATH,
): string {
	return `${path}?lang=${encodeURIComponent(language)}`;
}

/**
 * `?lang=` when it names one of `supported`, else `fallback`: the request's
 * Accept-Language, never its cookie, so `Vary: Accept-Language` holds.
 */
export function manifestLanguage<L extends string>(
	url: URL,
	supported: readonly L[],
	fallback: L,
): L {
	const requested = url.searchParams.get('lang');
	return supported.find((language) => language === requested) ?? fallback;
}

export type ManifestIcon = {
	src: string;
	sizes: string;
	type: string;
	purpose?: 'any' | 'maskable' | 'monochrome';
};

/**
 * The four icons `@vite-pwa/assets-generator`'s `minimal2023Preset` writes
 * to `public/`: 64, 192 and 512 pixels, and a maskable 512.
 */
export const MINIMAL_2023_ICONS: readonly ManifestIcon[] = Object.freeze(
	[
		{ src: '/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
		{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
		{ src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
		{
			src: '/maskable-icon-512x512.png',
			sizes: '512x512',
			type: 'image/png',
			purpose: 'maskable' as const,
		},
	].map((icon) => Object.freeze(icon)),
);

export interface WebAppManifestOptions {
	name: string;
	/** `name` by default. */
	shortName?: string;
	description: string;
	/** The language of `name` and `description`. */
	lang: string;
	/** `'ltr'` by default. */
	dir?: 'ltr' | 'rtl' | 'auto';
	themeColor: string;
	backgroundColor: string;
	categories?: readonly string[];
	/** `MINIMAL_2023_ICONS` by default. */
	icons?: readonly ManifestIcon[];
	/** `'/'` by default: the same in every language, so a language switch never makes a second app. */
	id?: string;
	/** `'/'` by default. */
	startUrl?: string;
	/** `'/'` by default. */
	scope?: string;
	/** `'standalone'` by default. */
	display?: 'standalone' | 'fullscreen' | 'minimal-ui' | 'browser';
}

/** The web app manifest's JSON, with its snake_case keys. */
export type WebAppManifest = {
	id: string;
	name: string;
	short_name: string;
	description: string;
	lang: string;
	dir: 'ltr' | 'rtl' | 'auto';
	start_url: string;
	scope: string;
	display: 'standalone' | 'fullscreen' | 'minimal-ui' | 'browser';
	theme_color: string;
	background_color: string;
	categories?: string[];
	icons: ManifestIcon[];
};

/**
 * A web app manifest from the app's own (translated) texts and colours.
 * `id`, `start_url` and `scope` default to `'/'` whatever the language.
 */
export function webAppManifest(options: WebAppManifestOptions): WebAppManifest {
	return {
		id: options.id ?? '/',
		name: options.name,
		short_name: options.shortName ?? options.name,
		description: options.description,
		lang: options.lang,
		dir: options.dir ?? 'ltr',
		start_url: options.startUrl ?? '/',
		scope: options.scope ?? '/',
		display: options.display ?? 'standalone',
		theme_color: options.themeColor,
		background_color: options.backgroundColor,
		...(options.categories && { categories: [...options.categories] }),
		icons: (options.icons ?? MINIMAL_2023_ICONS).map((icon) => ({ ...icon })),
	};
}
