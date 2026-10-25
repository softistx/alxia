import { describe, expect, test } from 'bun:test';
import {
	MANIFEST_HEADERS,
	MANIFEST_PATH,
	MINIMAL_2023_ICONS,
	manifestHref,
	manifestLanguage,
	webAppManifest,
} from './manifest';

const base = {
	name: 'Demo',
	description: 'A demo app',
	lang: 'en',
	themeColor: '#112233',
	backgroundColor: '#ffffff',
};

describe('webAppManifest', () => {
	test('has the same identity in every language', () => {
		const en = webAppManifest(base);
		const fr = webAppManifest({
			...base,
			lang: 'fr',
			description: 'Une application',
		});
		expect(fr.lang).toBe('fr');
		expect(fr.description).not.toBe(en.description);
		for (const key of ['id', 'start_url', 'scope', 'display'] as const) {
			expect(fr[key]).toBe(en[key]);
		}
	});

	test('meets the installability criteria', () => {
		const manifest = webAppManifest(base);
		expect(manifest).toMatchObject({
			id: '/',
			start_url: '/',
			scope: '/',
			display: 'standalone',
			theme_color: '#112233',
			background_color: '#ffffff',
		});
		const sizes = manifest.icons.map((icon) => icon.sizes);
		expect(sizes).toContain('192x192');
		expect(sizes).toContain('512x512');
		expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(
			true,
		);
	});

	test('defaults', () => {
		const manifest = webAppManifest(base);
		expect(manifest.short_name).toBe('Demo');
		expect(manifest.dir).toBe('ltr');
		expect(manifest.icons).toEqual([...MINIMAL_2023_ICONS]);
		expect('categories' in manifest).toBe(false);
	});

	test('each option overrides its default', () => {
		const icons = [{ src: '/i.png', sizes: '96x96', type: 'image/png' }];
		const manifest = webAppManifest({
			...base,
			shortName: 'D',
			dir: 'rtl',
			categories: ['productivity'],
			icons,
			id: '/app',
			startUrl: '/app/home',
			scope: '/app/',
			display: 'minimal-ui',
		});
		expect(manifest).toMatchObject({
			short_name: 'D',
			dir: 'rtl',
			categories: ['productivity'],
			icons,
			id: '/app',
			start_url: '/app/home',
			scope: '/app/',
			display: 'minimal-ui',
		});
	});

	test('serialises to JSON the browser reads', () => {
		const parsed = JSON.parse(JSON.stringify(webAppManifest(base)));
		expect(parsed.theme_color).toBe('#112233');
	});
});

describe('manifestLanguage', () => {
	const supported = ['en', 'fr'] as const;
	const url = (query: string) =>
		new URL(`https://app.test${MANIFEST_PATH}${query}`);

	test('?lang= wins when supported', () => {
		expect(manifestLanguage(url('?lang=fr'), supported, 'en')).toBe('fr');
	});

	test("falls back to the request's language otherwise", () => {
		expect(manifestLanguage(url(''), supported, 'fr')).toBe('fr');
		expect(manifestLanguage(url('?lang=de'), supported, 'en')).toBe('en');
	});

	test('round-trips manifestHref', () => {
		const href = new URL(manifestHref('fr'), 'https://app.test');
		expect(manifestLanguage(href, supported, 'en')).toBe('fr');
	});
});

describe('manifestHref', () => {
	test('takes another path', () => {
		expect(manifestHref('en', '/app.webmanifest')).toBe(
			'/app.webmanifest?lang=en',
		);
	});
});

describe('MANIFEST_HEADERS', () => {
	test('is a manifest that varies on the language and loads nothing', () => {
		expect(MANIFEST_HEADERS['content-type']).toContain('manifest+json');
		expect(MANIFEST_HEADERS.vary).toBe('Accept-Language');
		expect(MANIFEST_HEADERS['content-security-policy']).toContain(
			"default-src 'none'",
		);
	});
});

describe('icons are copied', () => {
	test('mutating a manifest icon leaves the constant alone', () => {
		const manifest = webAppManifest(base);
		manifest.icons[0]!.src = '/changed.png';
		expect(MINIMAL_2023_ICONS[0]!.src).toBe('/pwa-64x64.png');
		expect(webAppManifest(base).icons[0]!.src).toBe('/pwa-64x64.png');
	});

	test('the constant is frozen, each icon too', () => {
		expect(Object.isFrozen(MINIMAL_2023_ICONS)).toBe(true);
		for (const icon of MINIMAL_2023_ICONS)
			expect(Object.isFrozen(icon)).toBe(true);
	});
});
