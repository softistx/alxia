import { describe, expect, test } from 'bun:test';
import { browserManifestFile, revisionOf, workerPrecache } from './precache';

const manifestSource = `window.__reactRouterManifest=${JSON.stringify({
	url: '/assets/manifest-abcd1234.js',
	entry: {
		module: '/assets/entry-aaaaaaaa.js',
		imports: ['/assets/chunk-bbbbbbbb.js'],
	},
	routes: {
		home: {
			module: '/assets/home-cccccccc.js',
			css: ['/assets/home-dddddddd.css'],
		},
	},
})};`;

describe('browserManifestFile', () => {
	test('returns the one manifest', () => {
		expect(browserManifestFile(['a-aaaaaaaa.js', 'manifest-abcd1234.js'])).toBe(
			'manifest-abcd1234.js',
		);
	});

	test('throws for none and for two', () => {
		expect(() => browserManifestFile(['a.js'])).toThrow(
			'expected one React Router browser manifest, build/client/assets/manifest-*.js, found 0. Run react-router build first.',
		);
		expect(() =>
			browserManifestFile(['manifest-aaaa1111.js', 'manifest-bbbb2222.js']),
		).toThrow('found 2');
	});
});

describe('revisionOf', () => {
	test('is 16 hex characters, stable, and follows the content', () => {
		const a = revisionOf(new TextEncoder().encode('a'));
		expect(a).toMatch(/^[0-9a-f]{16}$/);
		expect(revisionOf(new TextEncoder().encode('a'))).toBe(a);
		expect(revisionOf(new TextEncoder().encode('b'))).not.toBe(a);
	});
});

describe('workerPrecache', () => {
	const offline = { url: '/offline.html', revision: 'r' };

	test('lists the offline page, the routes code, then the included assets', () => {
		const list = workerPrecache({
			manifestSource,
			assetFiles: ['font-b-aaaaaaaa.woff2', 'font-a-aaaaaaaa.woff2', 'x.js'],
			offline,
			include: /^font-.*\.woff2$/,
		});
		expect(list.map(({ url }) => url)).toEqual([
			'/offline.html',
			'/assets/manifest-abcd1234.js',
			'/assets/entry-aaaaaaaa.js',
			'/assets/chunk-bbbbbbbb.js',
			'/assets/home-cccccccc.js',
			'/assets/home-dddddddd.css',
			'/assets/font-a-aaaaaaaa.woff2',
			'/assets/font-b-aaaaaaaa.woff2',
		]);
		expect(list[0]).toEqual(offline);
	});

	test('has no offline page when none is given', () => {
		const list = workerPrecache({ manifestSource, assetFiles: [] });
		expect(list[0]?.url).toBe('/assets/manifest-abcd1234.js');
	});

	test('keeps the first of a duplicate url', () => {
		const list = workerPrecache({
			manifestSource,
			assetFiles: ['entry-aaaaaaaa.js'],
			include: /entry/,
		});
		expect(
			list.filter(({ url }) => url === '/assets/entry-aaaaaaaa.js'),
		).toHaveLength(1);
	});
});
