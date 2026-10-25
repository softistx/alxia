import { describe, expect, spyOn, test } from 'bun:test';
import { alxia, type StatusCode } from '@alxia/core';
import { clearSiteData } from './clear-site-data';

/** An app answering `status` on `/sign-out` and `/sign-out.data`. */
function app(status: StatusCode, middleware = clearSiteData(['cache'])) {
	return alxia()
		.use('/sign-out', middleware)
		.use('/sign-out.data', middleware)
		.all('/sign-out', ({ reply }) => reply(status, 'x'))
		.all('/sign-out.data', ({ reply }) => reply(status, 'x'))
		.all('/sign-outs', ({ reply }) => reply(status, 'x'));
}

/** The `Clear-Site-Data` of a POST to `/sign-out` sent with `headers`. */
async function postedWith(
	headers: Record<string, string>,
	middleware = clearSiteData(['cache']),
) {
	const response = await app(302, middleware).request('/sign-out', {
		method: 'POST',
		redirect: 'manual',
		headers,
	});
	return response.headers.get('clear-site-data');
}

async function cleared(method: string, path: string, status: StatusCode = 302) {
	const response = await app(status).request(path, {
		method,
		redirect: 'manual',
	});
	return response.headers.get('clear-site-data');
}

describe('clearSiteData', () => {
	test('a posted sign-out clears the cache, from a form or a client', async () => {
		expect(await cleared('POST', '/sign-out')).toBe('"cache"');
		expect(await cleared('POST', '/sign-out.data', 202)).toBe('"cache"');
		expect(await cleared('POST', '/sign-out.data', 200)).toBe('"cache"');
	});

	test('a GET clears nothing', async () => {
		expect(await cleared('GET', '/sign-out')).toBeNull();
	});

	test('a refused sign-out clears nothing', async () => {
		for (const status of [400, 403, 415, 500] as const) {
			expect(await cleared('POST', '/sign-out', status)).toBeNull();
			expect(await cleared('POST', '/sign-out.data', status)).toBeNull();
		}
	});

	test('only the paths it is mounted on', async () => {
		expect(await cleared('POST', '/sign-outs')).toBeNull();
	});

	test('methods widens the rule', async () => {
		const wide = app(
			302,
			clearSiteData(['cache'], { methods: ['POST', 'DELETE'] }),
		);
		const del = await wide.request('/sign-out', { method: 'DELETE' });
		expect(del.headers.get('clear-site-data')).toBe('"cache"');
		const get = await wide.request('/sign-out');
		expect(get.headers.get('clear-site-data')).toBeNull();
	});

	test("a route's own header wins", async () => {
		const own = alxia()
			.use('/sign-out', clearSiteData(['cache']))
			.post('/sign-out', ({ reply }) =>
				reply(200, 'x', { headers: { 'Clear-Site-Data': '"cookies"' } }),
			);
		const response = await own.request('/sign-out', { method: 'POST' });
		expect(response.headers.get('clear-site-data')).toBe('"cookies"');
	});

	test('a POST to a route that throws clears nothing', async () => {
		const failing = alxia()
			.use('/sign-out', clearSiteData(['cache']))
			.post('/sign-out', () => {
				throw new Error('kaboom');
			});
		const error = spyOn(console, 'error').mockImplementation(() => {});
		try {
			const response = await failing.request('/sign-out', { method: 'POST' });
			expect(response.status).toBe(500);
			expect(response.headers.get('clear-site-data')).toBeNull();
		} finally {
			error.mockRestore();
		}
	});

	test('a lowercase method in methods works', async () => {
		const lower = app(302, clearSiteData(['cache'], { methods: ['post'] }));
		const response = await lower.request('/sign-out', { method: 'POST' });
		expect(response.headers.get('clear-site-data')).toBe('"cache"');
	});

	test('several types are quoted and comma-separated', async () => {
		const several = app(302, clearSiteData(['cache', 'cookies']));
		const response = await several.request('/sign-out', {
			method: 'POST',
			redirect: 'manual',
		});
		expect(response.headers.get('clear-site-data')).toBe('"cache", "cookies"');
	});

	test('an empty list is refused', () => {
		expect(() => clearSiteData([])).toThrow(
			'clearSiteData(): no type is given: write at least one, such as ["cache"]',
		);
	});

	test('an unknown type is refused', () => {
		expect(() => clearSiteData(['cash' as never])).toThrow(
			'clearSiteData(): "cash" is not a type: write one of "cache", "cookies", "storage", "executionContexts", "clientHints", "prefetchCache", "prerenderCache", "*"',
		);
	});

	test('a request from another site clears nothing', async () => {
		expect(await postedWith({ 'sec-fetch-site': 'cross-site' })).toBeNull();
		expect(await postedWith({ 'sec-fetch-site': 'same-site' })).toBeNull();
		expect(await postedWith({ 'sec-fetch-site': 'same-origin' })).toBe(
			'"cache"',
		);
		expect(await postedWith({ 'sec-fetch-site': 'none' })).toBe('"cache"');
	});

	test('a foreign Origin clears nothing, the same origin does', async () => {
		expect(await postedWith({ origin: 'https://evil.example' })).toBeNull();
		expect(await postedWith({ origin: 'null' })).toBeNull();
		expect(await postedWith({ origin: 'http://localhost' })).toBe('"cache"');
	});

	test('a request with neither header is cleared, as curl or an old browser', async () => {
		expect(await postedWith({})).toBe('"cache"');
	});

	test('crossSite: true clears for another site too', async () => {
		const open = clearSiteData(['cache'], { crossSite: true });
		expect(await postedWith({ 'sec-fetch-site': 'cross-site' }, open)).toBe(
			'"cache"',
		);
		expect(await postedWith({ origin: 'https://evil.example' }, open)).toBe(
			'"cache"',
		);
	});

	test('an empty methods, or an empty method, is refused', () => {
		const message =
			'clearSiteData(): methods is empty or holds an empty method: write at least one, such as ["POST"], or leave methods out';
		expect(() => clearSiteData(['cache'], { methods: [] })).toThrow(message);
		expect(() => clearSiteData(['cache'], { methods: [''] })).toThrow(message);
	});
});

describe('types', () => {
	test('a type is one of ClearSiteDataType, in a list', () => {
		// @ts-expect-error "cash" is not a type
		expect(() => clearSiteData(['cash'])).toThrow();
		// @ts-expect-error types is a list, not a string
		expect(() => clearSiteData('cache')).toThrow();
	});
});
