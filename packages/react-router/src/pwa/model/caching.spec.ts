import { describe, expect, test } from 'bun:test';
import { type CachingOptions, cachingFor, type RequestFacts } from './caching';

const ORIGIN = 'https://app.test';

function request(
	path: string,
	init: Partial<Omit<RequestFacts, 'url' | 'headers'>> & {
		headers?: Record<string, string>;
	} = {},
): RequestFacts {
	return {
		method: init.method ?? 'GET',
		url: path.startsWith('http') ? path : `${ORIGIN}${path}`,
		mode: init.mode ?? 'cors',
		destination: init.destination ?? '',
		headers: new Headers(init.headers),
	};
}

const caching = (
	path: string,
	init: Parameters<typeof request>[1] = {},
	options?: CachingOptions,
) => cachingFor(request(path, init), ORIGIN, options);

describe('cachingFor: never cached', () => {
	test('a page load is a navigation, which is never stored', () => {
		for (const path of ['/', '/teams/demo/members', '/offline.html']) {
			expect(caching(path, { mode: 'navigate', destination: 'document' })).toBe(
				'navigation',
			);
		}
	});

	test('a document fetched otherwise (iframe, fetch of HTML) is not cached', () => {
		expect(caching('/teams/demo', { destination: 'iframe' })).toBe('none');
		expect(caching('/teams/demo/members')).toBe('none');
	});

	test('a generated PDF, a navigation or a fetch, is never cached; its response is not storable', () => {
		const path = '/teams/demo/members/m1/export/pdf';
		expect(caching(path, { mode: 'navigate', destination: 'document' })).toBe(
			'navigation',
		);
		expect(caching(path)).toBe('none');
	});

	test("React Router's .data and /__manifest are not cached", () => {
		for (const path of [
			'/_root.data',
			'/teams/demo/members.data',
			'/teams/demo/members.data?_routes=routes%2Fteams%2Fmembers',
			'/__manifest?p=%2Fteams%2Fdemo&version=abc',
		]) {
			expect(caching(path)).toBe('none');
		}
	});

	test('POST and every other method are not cached, assets included', () => {
		for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
			expect(caching('/teams/demo/members', { method })).toBe('none');
			expect(caching('/assets/root-abc123.js', { method })).toBe('none');
		}
		expect(caching('/', { method: 'POST', mode: 'navigate' })).toBe('none');
	});

	test('the worker and the manifest are not cached', () => {
		for (const path of ['/service-worker.js', '/manifest.webmanifest']) {
			expect(caching(path, { destination: 'script' })).toBe('none');
		}
	});

	test('another origin is not cached (fonts, an API on another origin)', () => {
		expect(
			caching('https://cdn.example.test/font.woff2', { destination: 'font' }),
		).toBe('none');
		expect(caching('https://api.app.test/graphql')).toBe('none');
	});

	test('a request carrying credentials or a query is not cached', () => {
		expect(
			caching('/assets/root-abc123.js', {
				headers: { authorization: 'Bearer x' },
			}),
		).toBe('none');
		expect(caching('/logo.svg?user=42')).toBe('none');
	});
});

describe('cachingFor: cached', () => {
	test('hashed bundles under /assets/ are immutable', () => {
		expect(caching('/assets/root-B1x2c3.js', { destination: 'script' })).toBe(
			'immutable',
		);
		expect(caching('/assets/root-Dk3.css', { destination: 'style' })).toBe(
			'immutable',
		);
	});

	test('icons, sprites and the logo outside /assets/ are static', () => {
		for (const path of ['/logo.svg', '/favicon.ico', '/pwa-192x192.png']) {
			expect(caching(path, { destination: 'image' })).toBe('static');
		}
	});

	test('everything under /assets/ is immutable by default, an icon included', () => {
		expect(caching('/assets/icons/x.svg', { destination: 'image' })).toBe(
			'immutable',
		);
	});
});

describe('cachingFor: options', () => {
	test("never adds the app's own paths", () => {
		const never = (path: string) => path.startsWith('/x/');
		expect(caching('/x/logo.svg', {}, { never })).toBe('none');
		expect(caching('/logo.svg', {}, { never })).toBe('static');
	});

	test('immutable replaces the default rule', () => {
		const immutable = (path: string) =>
			path.startsWith('/assets/') && !path.startsWith('/assets/icons/');
		expect(caching('/assets/icons/x.svg', {}, { immutable })).toBe('static');
		expect(caching('/assets/root-B1x2c3.js', {}, { immutable })).toBe(
			'immutable',
		);
		expect(caching('/static/y.js', {}, { immutable: () => true })).toBe(
			'immutable',
		);
	});

	test('serviceWorkerUrl and manifestPath name the files never cached', () => {
		const options = { serviceWorkerUrl: '/sw.js', manifestPath: '/app.json' };
		expect(caching('/sw.js', {}, options)).toBe('none');
		expect(caching('/app.json', {}, options)).toBe('none');
		// A custom path replaces the default, it does not add to it.
		expect(caching('/service-worker.js', {}, options)).toBe('static');
	});
});
