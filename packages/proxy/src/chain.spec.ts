/**
 * The proxy is the end of a chain: what is declared before it runs first —
 * a guard, a rate limit — and what it adds is typed in the `headers`
 * callbacks.
 */
import { describe, expect, test } from 'bun:test';
import { alxia, type BaseContext } from '@alxia/core';
import { bearer, createJwt, type JwtClaims } from '@alxia/jwt';
import { rateLimit } from '@alxia/rate-limit';
import { upstream } from '../test/upstream';
import { proxy } from './index';

const jwt = createJwt({ secret: 'a-secret-of-at-least-thirty-two-bytes!' });

type Echo = { headers: Record<string, string> };

describe('behind the middlewares before it', () => {
	test('a bearer guard refuses before the upstream is called', async () => {
		const up = upstream();
		const app = alxia()
			.use(bearer({ jwt }))
			.use('/api', proxy(up.url, { rewrite: '/api' }));
		const refused = await app.request('/api/users');
		expect(refused.status).toBe(401);
		expect(up.seen).toHaveLength(0);
		const token = await jwt.sign({ sub: 'u1' });
		const allowed = await app.request('/api/users', {
			headers: { authorization: `Bearer ${token}` },
		});
		expect(allowed.status).toBe(200);
		expect(up.seen).toHaveLength(1);
	});

	test('a rate limit answers its 429 before the upstream is called', async () => {
		const up = upstream();
		const app = alxia({ ip: () => '192.0.2.1' })
			.use(rateLimit({ limit: 2, windowMs: 60_000 }))
			.use(proxy(up.url));
		const statuses: number[] = [];
		for (let i = 0; i < 3; i++) statuses.push((await app.request('/')).status);
		expect(statuses).toEqual([200, 200, 429]);
		expect(up.seen).toHaveLength(2);
	});

	test('a route declared before it is answered by the app, not the upstream', async () => {
		const up = upstream();
		const app = alxia()
			.get('/api/health', ({ reply }) => reply(200, 'local'))
			.use('/api', proxy(up.url));
		expect(await (await app.request('/api/health')).text()).toBe('local');
		expect(up.seen).toHaveLength(0);
	});
});

describe('the headers callbacks read the typed context', () => {
	test('a user the guard added is forwarded', async () => {
		const up = upstream();
		const app = alxia()
			.use(bearer({ jwt }))
			.use(
				proxy(up.url, {
					headers: {
						request: {
							authorization: null,
							'x-user-id': (ctx: BaseContext & { user: JwtClaims }) =>
								ctx.user.sub,
						},
					},
				}),
			);
		const token = await jwt.sign({ sub: 'u42' });
		const response = await app.request('/', {
			headers: { authorization: `Bearer ${token}` },
		});
		const { headers } = (await response.json()) as Echo;
		expect(headers['x-user-id']).toBe('u42');
		expect(headers['authorization']).toBeUndefined();
	});

	test('a type argument names what the callbacks read', async () => {
		const up = upstream();
		const app = alxia()
			.use(async (_ctx, next) => next({ tenant: 'acme' }))
			.use(
				proxy<{ tenant: string }>(up.url, {
					headers: {
						request: (headers, ctx) => headers.set('x-tenant', ctx.tenant),
					},
				}),
			);
		const { headers } = (await (await app.request('/')).json()) as Echo;
		expect(headers['x-tenant']).toBe('acme');
	});

	test('a proxy reading what the context does not give is a compile error', () => {
		const headers = {
			request: { 'x-user-id': (ctx: { user: JwtClaims }) => ctx.user.sub },
		};
		const forwardUser = proxy('http://up.internal', { headers });
		const mounted = proxy.mount('/m', 'http://up.internal', { headers });
		// @ts-expect-error -- no middleware before it gives `user`
		alxia().use(forwardUser);
		// @ts-expect-error -- nor before a mount reading it
		alxia().plugin(mounted);
		alxia().use(bearer({ jwt })).use(forwardUser);
		alxia().use(bearer({ jwt })).plugin(mounted);
	});
});
