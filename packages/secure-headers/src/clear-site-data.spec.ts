import { describe, expect, spyOn, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { clearSiteData } from './clear-site-data';

/** An app answering `status` on `/sign-out` and `/sign-out.data`. */
function app(status: number, middleware = clearSiteData(['cache'])) {
	const answer = ({ reply }: { reply: (s: number, b?: string) => Response }) =>
		reply(status, 'x');
	return alxia()
		.use('/sign-out', middleware)
		.use('/sign-out.data', middleware)
		.all('/sign-out', answer as never)
		.all('/sign-out.data', answer as never)
		.all('/sign-outs', answer as never);
}

async function cleared(method: string, path: string, status = 302) {
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
		for (const status of [400, 403, 415, 500]) {
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
});
