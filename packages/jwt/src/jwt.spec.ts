import { describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { z } from 'zod';
import { bearer } from './bearer';
import { createJwt } from './jwt';

const secret = 'a-secret-of-at-least-thirty-two-bytes!';

describe('createJwt', () => {
	test('signs and verifies with HS256, checking issuer and audience', async () => {
		const jwt = createJwt({
			secret,
			issuer: 'api',
			audience: 'web',
			expiresIn: 60,
		});
		const token = await jwt.sign({ sub: 'ada' });
		const verified = await jwt.verify(token);
		expect(verified.ok && verified.claims.sub).toBe('ada');
		expect(verified.ok && verified.claims.iss).toBe('api');
		const other = createJwt({ secret, issuer: 'other' });
		expect(await other.verify(token)).toEqual({ ok: false, reason: 'issuer' });
	});

	test('refuses a forged, an expired, a malformed token, and alg none', async () => {
		const jwt = createJwt({ secret });
		const token = await jwt.sign({ sub: 'ada' });
		const [head, body] = token.split('.');
		const forged = `${head}.${Buffer.from('{"sub":"eve"}').toString('base64url')}.${token.split('.')[2]}`;
		expect(await jwt.verify(forged)).toEqual({
			ok: false,
			reason: 'signature',
		});
		const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${body}.`;
		expect(await jwt.verify(none)).toEqual({ ok: false, reason: 'algorithm' });
		const expired = await jwt.sign({ exp: Math.floor(Date.now() / 1000) - 60 });
		expect(await jwt.verify(expired)).toEqual({ ok: false, reason: 'expired' });
		expect(await jwt.verify('a.b')).toEqual({ ok: false, reason: 'malformed' });
	});

	test('ES256 with a key pair; a verifier without the private key cannot sign', async () => {
		const pair = (await crypto.subtle.generateKey(
			{ name: 'ECDSA', namedCurve: 'P-256' },
			true,
			['sign', 'verify'],
		)) as CryptoKeyPair;
		const signer = createJwt({
			algorithm: 'ES256',
			privateKey: pair.privateKey,
			publicKey: pair.publicKey,
		});
		const verifier = createJwt({
			algorithm: 'ES256',
			publicKey: pair.publicKey,
		});
		const token = await signer.sign({ sub: 'ada' });
		expect((await verifier.verify(token)).ok).toBe(true);
		expect(verifier.sign({})).rejects.toThrow('private key');
	});

	test('refuses a short secret', () => {
		expect(() => createJwt({ secret: 'short' })).toThrow('32 bytes');
	});
});

describe('createJwt keys', () => {
	const pair = (
		algorithm: EcKeyGenParams | RsaHashedKeyGenParams | Algorithm,
	) =>
		crypto.subtle.generateKey(algorithm, true, [
			'sign',
			'verify',
		]) as Promise<CryptoKeyPair>;

	test('a key the algorithm cannot use is refused at once', async () => {
		const p384 = await pair({ name: 'ECDSA', namedCurve: 'P-384' });
		expect(() =>
			createJwt({ algorithm: 'ES256', publicKey: p384.publicKey }),
		).toThrow(
			'createJwt: ES256 needs an ECDSA P-256 key; the publicKey is ECDSA P-384',
		);
		const ed = await pair({ name: 'Ed25519' });
		expect(() =>
			createJwt({
				algorithm: 'RS256',
				publicKey: ed.publicKey,
				privateKey: ed.privateKey,
			}),
		).toThrow(
			'createJwt: RS256 needs an RSASSA-PKCS1-v1_5 SHA-256 key; the publicKey is Ed25519',
		);
		expect(() =>
			createJwt({ algorithm: 'EdDSA', publicKey: ed.privateKey }),
		).toThrow(
			'createJwt: the publicKey must be a public key that can verify; it is a private key that can sign',
		);
		const p256 = await pair({ name: 'ECDSA', namedCurve: 'P-256' });
		const jwt = createJwt({ algorithm: 'ES256', ...p256 });
		expect((await jwt.verify(await jwt.sign({ sub: 'ada' }))).ok).toBe(true);
	});

	test('verify answers for any token, never throws', async () => {
		const p256 = await pair({ name: 'ECDSA', namedCurve: 'P-256' });
		const jwt = createJwt({ algorithm: 'ES256', ...p256 });
		const [head, body] = (await jwt.sign({ sub: 'ada' })).split('.');
		const nullHeader = `${Buffer.from('null').toString('base64url')}.${body}.`;
		expect(await jwt.verify(nullHeader)).toEqual({
			ok: false,
			reason: 'malformed',
		});
		const arrayHeader = `${Buffer.from('[]').toString('base64url')}.${body}.`;
		expect(await jwt.verify(arrayHeader)).toEqual({
			ok: false,
			reason: 'malformed',
		});
		expect(await jwt.verify(`${head}.${body}.AAAA`)).toEqual({
			ok: false,
			reason: 'signature',
		});
	});
});

describe('bearer', () => {
	const jwt = createJwt({ secret });
	const app = alxia()
		.plugin(
			bearer({
				jwt,
				schema: z.object({ sub: z.string(), role: z.enum(['admin', 'user']) }),
			}),
		)
		.get('/me', ({ user, reply }) => {
			expectTypeOf(user).toEqualTypeOf<{
				sub: string;
				role: 'admin' | 'user';
			}>();
			return reply(200, user);
		});

	test('a valid token: the claims, checked, as user', async () => {
		const token = await jwt.sign({ sub: 'ada', role: 'admin' });
		const result = await app.request('/me', {
			headers: { authorization: `Bearer ${token}` },
		});
		expect(result.status).toBe(200);
		expect(await result.json()).toEqual({ sub: 'ada', role: 'admin' });
	});

	test('a 401 for a missing token or refused claims', async () => {
		const missing = await app.request('/me');
		expect(missing.status).toBe(401);
		expect((await missing.json()).reason).toBe('missing');
		expect(missing.headers.get('www-authenticate')).toBe('Bearer');
		const token = await jwt.sign({ sub: 'ada', role: 'root' });
		const claims = await app.request('/me', {
			headers: { authorization: `Bearer ${token}` },
		});
		expect((await claims.json()).reason).toBe('claims');
	});

	test('a token read from a cookie', async () => {
		const fromCookie = alxia()
			.plugin(bearer({ jwt, cookie: 'token' }))
			.get('/me', ({ user, reply }) => reply(200, user.sub ?? ''));
		const token = await jwt.sign({ sub: 'ada' });
		const response = await fromCookie.request('/me', {
			headers: { cookie: `token=${token}` },
		});
		expect(await response.text()).toBe('ada');
	});

	test('claims read from a cookie are refused as the cookies', async () => {
		const fromCookie = alxia()
			.plugin(
				bearer({
					jwt,
					cookie: 'token',
					schema: z.object({ role: z.literal('admin') }),
				}),
			)
			.get('/me', ({ reply }) => reply(200, 'in'));
		const token = await jwt.sign({ role: 'user' });
		const response = await fromCookie.request('/me', {
			headers: { cookie: `token=${token}` },
		});
		const refused = await response.json();
		expect(refused.reason).toBe('claims');
		expect(refused.issues[0].target).toBe('cookies');
	});
});
