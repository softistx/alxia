import { afterAll, describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { z } from 'zod';
import { issuer, signWith, testKey } from '../test/jwks-fixtures';
import { bearer } from './bearer';
import { createJwt } from './jwt';

const key = await testKey('RS256', 'kc-1');
const server = issuer([key]);
afterAll(() => server.stop());

const Claims = z.object({
	sub: z.string(),
	realm_access: z.object({ roles: z.array(z.string()) }),
});
const jwt = createJwt({
	jwks: server.jwksUrl,
	issuer: 'https://idp',
	audience: 'api',
});

const app = alxia()
	.use(bearer({ jwt, schema: Claims }))
	.get('/me', ({ user, reply }) => {
		expectTypeOf(user).toEqualTypeOf<{
			sub: string;
			realm_access: { roles: string[] };
		}>();
		return reply(200, { sub: user.sub, roles: user.realm_access.roles });
	});

const claims = (extra: Record<string, unknown> = {}) => ({
	sub: 'ada',
	iss: 'https://idp',
	aud: 'api',
	exp: Math.floor(Date.now() / 1000) + 60,
	realm_access: { roles: ['admin'] },
	...extra,
});
const get = async (token?: string) =>
	app.request('/me', {
		headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
	});

describe('bearer() with a JWKS key', () => {
	test('types the verified claims into ctx', async () => {
		const response = await get(await signWith(key, claims()));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ sub: 'ada', roles: ['admin'] });
	});

	test('answers 401 with the reason for a wrong audience, an unknown kid and claims the schema refuses', async () => {
		const reason = async (token?: string) =>
			((await (await get(token)).json()) as { reason: string }).reason;
		expect(await reason(await signWith(key, claims({ aud: 'web' })))).toBe(
			'audience',
		);
		expect(
			await reason(await signWith(await testKey('RS256', 'other'), claims())),
		).toBe('key');
		expect(await reason(await signWith(key, claims({ realm_access: 1 })))).toBe(
			'claims',
		);
		expect(await reason()).toBe('missing');
		const refused = await get(await signWith(key, claims({ aud: 'web' })));
		expect(refused.status).toBe(401);
		expect(refused.headers.get('www-authenticate')).toBe('Bearer');
	});

	test('answers 401 keys_unavailable, never 200, when the issuer cannot be reached', async () => {
		const gone = issuer([key]);
		const url = gone.jwksUrl;
		gone.stop();
		const guarded = alxia()
			.use(bearer({ jwt: createJwt({ jwks: url }) }))
			.get('/me', ({ reply }) => reply(200, { ok: true }));
		const response = await guarded.request('/me', {
			headers: { authorization: `Bearer ${await signWith(key)}` },
		});
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: 'unauthorized',
			reason: 'keys_unavailable',
		});
	});
});
