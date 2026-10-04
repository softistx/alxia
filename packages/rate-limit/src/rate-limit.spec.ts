import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { rateLimit } from './rate-limit';
import { MemoryStore } from './store';

const app = alxia({ ip: (request) => request.headers.get('x-ip') ?? undefined })
	.get('/free', ({ reply }) => reply(200, 'free'))
	.use(rateLimit({ limit: 2, windowMs: 60_000 }))
	.get('/limited', ({ rateLimit, reply }) =>
		reply(200, rateLimit?.remaining ?? -1),
	);

describe('rateLimit', () => {
	test('counts by key, answers 429 past the limit, with its headers', async () => {
		const from = (ip: string) =>
			app.request('/limited', { headers: { 'x-ip': ip } });
		const first = await from('1.1.1.1');
		expect(await first.json()).toBe(1);
		expect(first.headers.get('ratelimit-remaining')).toBe('1');
		await from('1.1.1.1');
		const third = await from('1.1.1.1');
		expect(third.status).toBe(429);
		expect(await third.json()).toMatchObject({ error: 'rate_limited' });
		expect(third.headers.get('retry-after')).not.toBeNull();
		expect((await from('2.2.2.2')).status).toBe(200);
	});

	test('routes before it are not limited', async () => {
		for (let i = 0; i < 3; i++) {
			const free = await app.request('/free', {
				headers: { 'x-ip': '3.3.3.3' },
			});
			expect(free.status).toBe(200);
		}
	});

	test('the memory store decides, forgets a key, and a window', async () => {
		const store = new MemoryStore();
		const policy = { limit: 2, windowMs: 20 };
		expect(store.consume('a', policy)).toMatchObject({
			allowed: true,
			remaining: 1,
		});
		expect(store.consume('a', policy)).toMatchObject({
			allowed: true,
			remaining: 0,
		});
		const refused = store.consume('a', policy);
		expect(refused.allowed).toBe(false);
		expect(refused.retryAfter).toBeGreaterThan(0);
		store.reset('a');
		expect(store.consume('a', policy).remaining).toBe(1);
		await Bun.sleep(30);
		expect(store.consume('a', policy).remaining).toBe(1);
	});

	test('a limit or a window that cannot work is refused at once', () => {
		expect(() => rateLimit({ limit: 0, windowMs: 1000 })).toThrow(
			'rateLimit: limit must be a whole number of 1 or more, not 0',
		);
		expect(() => rateLimit({ limit: 10, windowMs: -5 })).toThrow(
			'rateLimit: windowMs must be a whole number of 1 or more, not -5',
		);
		expect(() => rateLimit({ limit: 1.5, windowMs: 1000 })).toThrow(TypeError);
		expect(() => rateLimit({ limit: 10, windowMs: Number.NaN })).toThrow(
			TypeError,
		);
		expect(() => rateLimit({ limit: 1, windowMs: 1 })).not.toThrow();
	});

	test('a key that reads what an earlier plugin added is typed with it', async () => {
		const session = alxia().derive(({ request }) => ({
			user: { id: request.headers.get('x-user') ?? 'anonymous' },
		}));
		const perUser = rateLimit<{ user: { id: string } }>({
			limit: 1,
			windowMs: 60_000,
			key: ({ user }) => user.id,
			skip: ({ user }) => user.id === 'admin',
		});
		const limited = alxia()
			.plugin(session)
			.use(perUser)
			.get('/', ({ reply }) => reply(200, 'ok'));
		const as = (user: string) =>
			limited.request('/', { headers: { 'x-user': user } });
		expect((await as('ada')).status).toBe(200);
		expect((await as('ada')).status).toBe(429);
		expect((await as('bob')).status).toBe(200);
		expect((await as('admin')).status).toBe(200);
		expect((await as('admin')).status).toBe(200);
		const _refused = () => {
			// @ts-expect-error the plugin reads "user", which this app's context does not give
			alxia().use(perUser);
		};
		expect(_refused).toBeFunction();
	});
});
