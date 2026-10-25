import { describe, expect, test } from 'bun:test';
import {
	assetPrecache,
	parseBrowserManifest,
	precacheList,
} from './precache-list';

const manifest = {
	url: '/assets/manifest-1b32458e.js',
	version: '1b32458e',
	entry: {
		module: '/assets/entry.client-C6tFBwru.js',
		imports: [
			'/assets/components-pAxSvuNu.js',
			'/assets/jsx-runtime-Bf2OMTa7.js',
		],
		css: [],
	},
	routes: {
		root: {
			module: '/assets/root-DsihIong.js',
			imports: ['/assets/components-pAxSvuNu.js'],
			css: ['/assets/root-D7Kccl1i.css'],
		},
		'routes/home': {
			module: '/assets/home-AbCdEf12.js',
			imports: ['/assets/jsx-runtime-Bf2OMTa7.js'],
		},
		'routes/odd': {
			// Not a hashed bundle: never precached.
			module: '/assets/icons/sprites/solid.svg',
			imports: ['/elsewhere/x-AbCdEf12.js', '/assets/plain.js'],
		},
	},
};

describe('precacheList', () => {
	test("the manifest, the entry and every route's module, imports and CSS, once each", () => {
		expect(precacheList(manifest)).toEqual(
			[
				'/assets/manifest-1b32458e.js',
				'/assets/entry.client-C6tFBwru.js',
				'/assets/components-pAxSvuNu.js',
				'/assets/jsx-runtime-Bf2OMTa7.js',
				'/assets/root-DsihIong.js',
				'/assets/root-D7Kccl1i.css',
				'/assets/home-AbCdEf12.js',
			].map((url) => ({ url, revision: null })),
		);
	});

	test('only hashed scripts and stylesheets under /assets/', () => {
		const urls = precacheList(manifest).map(({ url }) => url);
		expect(urls).not.toContain('/assets/icons/sprites/solid.svg');
		expect(urls).not.toContain('/elsewhere/x-AbCdEf12.js');
		expect(urls).not.toContain('/assets/plain.js');
	});
});

describe('parseBrowserManifest', () => {
	test("reads the manifest's script as the build writes it", () => {
		const source = `window.__reactRouterManifest=${JSON.stringify(manifest)};`;
		expect(parseBrowserManifest(source)).toEqual(manifest);
	});

	test('refuses anything else, naming what it expected', () => {
		expect(() => parseBrowserManifest('console.log(1)')).toThrow(
			"parseBrowserManifest(): not React Router's browser manifest",
		);
	});
});

describe('assetPrecache', () => {
	const FONT = /^(?:body-latin(?:-ext)?|display-latin)-[\w-]{8}\.woff2$/;

	test('the files the regex matches, sorted, under /assets/', () => {
		expect(
			assetPrecache(
				[
					'body-latin-ext-Cd_9-ab2.woff2',
					'body-latin-BzX6eJ1a.woff2',
					'display-latin-Mn34Op56.woff2',
					'body-cyrillic-Ij90Kl12.woff2',
					'body-latin.woff2',
					'root-D7Kccl1i.css',
				],
				FONT,
			),
		).toEqual([
			{ url: '/assets/body-latin-BzX6eJ1a.woff2', revision: null },
			{ url: '/assets/body-latin-ext-Cd_9-ab2.woff2', revision: null },
			{ url: '/assets/display-latin-Mn34Op56.woff2', revision: null },
		]);
	});

	test('takes another base', () => {
		expect(assetPrecache(['a-12345678.woff2'], /\.woff2$/, '/static/')).toEqual(
			[{ url: '/static/a-12345678.woff2', revision: null }],
		);
	});
});

describe('assetPrecache with a global regex', () => {
	test('keeps every match: lastIndex does not carry over between files', () => {
		const files = ['a-12345678.woff2', 'b-12345678.woff2', 'c-12345678.woff2'];
		expect(assetPrecache(files, /\.woff2$/g).map((e) => e.url)).toEqual([
			'/assets/a-12345678.woff2',
			'/assets/b-12345678.woff2',
			'/assets/c-12345678.woff2',
		]);
		expect(assetPrecache(files, /\.woff2$/y)).toHaveLength(0);
	});
});
