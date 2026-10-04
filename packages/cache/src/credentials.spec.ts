import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { type CacheOptions, cache } from './cache';

/** A `/me` behind the cache, answering whoever the credential names, with `cacheControl` when given. */
function me(options: Partial<CacheOptions> = {}, cacheControl?: string) {
	let runs = 0;
	const app = alxia()
		.derive(({ request }) => ({
			user:
				request.headers.get('authorization')?.replace('Bearer ', '') ??
				request.headers.get('cookie')?.replace('session=', '') ??
				'anonymous',
		}))
		.use(cache({ ttl: 60, ...options }))
		.get('/me', ({ user, reply }) =>
			reply(200, `${user} ${++runs}`, {
				headers: cacheControl ? { 'cache-control': cacheControl } : {},
			}),
		);
	return { app, runs: () => runs };
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const cookie = (session: string) => ({ cookie: `session=${session}` });

describe('a request carrying credentials', () => {
	test("Authorization: Bob runs the route and gets his own body, never Alice's", async () => {
		const { app, runs } = me();
		const alice = await app.request('/me', { headers: bearer('alice') });
		expect(await alice.text()).toBe('alice 1');
		const bob = await app.request('/me', { headers: bearer('bob') });
		expect(bob.headers.get('x-cache')).toBeNull(); // not kept: no X-Cache
		expect(await bob.text()).toBe('bob 2');
		expect(runs()).toBe(2);
	});

	test('Authorization: a response that says public, s-maxage or must-revalidate is kept', async () => {
		for (const directive of ['public', 's-maxage=60', 'must-revalidate']) {
			const { app } = me({}, directive);
			await app.request('/me', { headers: bearer('alice') });
			const again = await app.request('/me', { headers: bearer('bob') });
			expect(again.headers.get('x-cache')).toBe('HIT');
			expect(await again.text()).toBe('alice 1');
		}
	});

	test('Authorization: vary naming it keys each token on its own', async () => {
		const { app } = me({ vary: ['Authorization'] });
		await app.request('/me', { headers: bearer('alice') });
		const bob = await app.request('/me', { headers: bearer('bob') });
		expect(await bob.text()).toBe('bob 2');
		const alice = await app.request('/me', { headers: bearer('alice') });
		expect(alice.headers.get('x-cache')).toBe('HIT');
		expect(await alice.text()).toBe('alice 1');
	});

	test('Authorization: a key of your own does not lift it', async () => {
		const { app } = me({ key: (ctx) => ctx.url.pathname });
		await app.request('/me', { headers: bearer('alice') });
		const bob = await app.request('/me', { headers: bearer('bob') });
		expect(await bob.text()).toBe('bob 2');
	});

	test('Cookie: not kept by default', async () => {
		const { app } = me();
		await app.request('/me', { headers: cookie('alice') });
		const bob = await app.request('/me', { headers: cookie('bob') });
		expect(bob.headers.get('x-cache')).toBeNull(); // not kept: no X-Cache
		expect(await bob.text()).toBe('bob 2');
	});

	test('Cookie: kept with a key of your own, which tells the users apart', async () => {
		const { app } = me({
			key: ({ url, request }) =>
				`${request.headers.get('cookie')}:${url.pathname}`,
		});
		await app.request('/me', { headers: cookie('alice') });
		expect(
			await (await app.request('/me', { headers: cookie('bob') })).text(),
		).toBe('bob 2');
		const alice = await app.request('/me', { headers: cookie('alice') });
		expect(alice.headers.get('x-cache')).toBe('HIT');
		expect(await alice.text()).toBe('alice 1');
	});

	test('Cookie: kept with vary naming it, or a response that says public', async () => {
		const varying = me({ vary: ['cookie'] });
		await varying.app.request('/me', { headers: cookie('alice') });
		const hit = await varying.app.request('/me', { headers: cookie('alice') });
		expect(hit.headers.get('x-cache')).toBe('HIT');

		const shared = me({}, 'public, max-age=60');
		await shared.app.request('/me', { headers: cookie('alice') });
		const again = await shared.app.request('/me', { headers: cookie('bob') });
		expect(again.headers.get('x-cache')).toBe('HIT');
	});

	test('no credential: kept as before', async () => {
		const { app } = me();
		await app.request('/me');
		expect((await app.request('/me')).headers.get('x-cache')).toBe('HIT');
	});
});
