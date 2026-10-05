import { afterAll, describe, expect, setSystemTime, test } from 'bun:test';
import { JWKS_ALGORITHMS } from './jwk';
import {
	type Issuer,
	issuer,
	keyFor,
	signHmac,
	signWith,
	testKey,
} from './jwks-fixtures';
import { createJwt } from './jwt';

const keys = await Promise.all(JWKS_ALGORITHMS.map((alg) => testKey(alg)));
const first = keyFor(keys, 'RS256');
const live: Issuer[] = [];
const serve = (set = keys) => {
	const one = issuer(set);
	live.push(one);
	return one;
};
afterAll(() => {
	for (const one of live) one.stop();
});

describe('createJwt with a JWKS', () => {
	test.each(keys)('verifies a $alg token by its kid', async (key) => {
		const server = serve();
		const jwt = createJwt({ jwks: server.jwksUrl });
		const result = await jwt.verify(
			await signWith(key, { sub: 'ada', role: 'admin' }),
		);
		expect(result.ok && result.claims).toEqual({ sub: 'ada', role: 'admin' });
		expect(Object.keys(jwt).sort()).toEqual(['refresh', 'verify']);
	});

	test('a forged payload, a signature of another key and a crit header are refused', async () => {
		const jwt = createJwt({ jwks: serve().jwksUrl });
		const token = await signWith(first);
		const [head, , signature] = token.split('.');
		const forged = `${head}.${Buffer.from('{"sub":"eve"}').toString('base64url')}.${signature}`;
		expect(await jwt.verify(forged)).toEqual({
			ok: false,
			reason: 'signature',
		});
		const other = await testKey('RS256', first.kid);
		expect(await jwt.verify(await signWith(other))).toEqual({
			ok: false,
			reason: 'signature',
		});
		expect(
			await jwt.verify(await signWith(first, { sub: 'a' }, { crit: ['b64'] })),
		).toEqual({ ok: false, reason: 'malformed' });
	});

	test('a token without a kid is verified when exactly one key fits its algorithm', async () => {
		const jwt = createJwt({ jwks: serve().jwksUrl });
		const edKey = keyFor(keys, 'EdDSA');
		expect(
			(await jwt.verify(await signWith(edKey, {}, { kid: undefined }))).ok,
		).toBe(true);
		const rsKey = keyFor(keys, 'RS256');
		expect(
			await jwt.verify(await signWith(rsKey, {}, { kid: undefined })),
		).toEqual({ ok: false, reason: 'key' });
	});

	test('checks the times, the issuer and the audience', async () => {
		const server = serve();
		const key = keyFor(keys, 'ES256');
		const jwt = createJwt({
			jwks: server.jwksUrl,
			issuer: 'https://idp',
			audience: 'api',
		});
		const now = Math.floor(Date.now() / 1000);
		const claims = { iss: 'https://idp', aud: ['api', 'other'], exp: now + 60 };
		expect((await jwt.verify(await signWith(key, claims))).ok).toBe(true);
		expect(
			await jwt.verify(await signWith(key, { ...claims, iss: 'https://evil' })),
		).toEqual({ ok: false, reason: 'issuer' });
		expect(
			await jwt.verify(await signWith(key, { ...claims, aud: 'web' })),
		).toEqual({ ok: false, reason: 'audience' });
		expect(
			await jwt.verify(await signWith(key, { ...claims, exp: now - 60 })),
		).toEqual({ ok: false, reason: 'expired' });
		expect(
			await jwt.verify(await signWith(key, { ...claims, nbf: now + 600 })),
		).toEqual({ ok: false, reason: 'not_yet_valid' });
	});

	test('discovery reads jwks_uri from the issuer and checks the issuer by default', async () => {
		const server = serve();
		const key = keyFor(keys, 'PS256');
		const jwt = createJwt({ discovery: server.url });
		expect(
			(await jwt.verify(await signWith(key, { iss: server.url }))).ok,
		).toBe(true);
		expect(
			await jwt.verify(await signWith(key, { iss: 'https://evil' })),
		).toEqual({ ok: false, reason: 'issuer' });
		expect(server.hits['/.well-known/openid-configuration']).toBe(1);
		// A discovery document that names another issuer is refused.
		const liar = createJwt({ discovery: `${server.url}/` });
		expect(await liar.verify(await signWith(key))).toEqual({
			ok: false,
			reason: 'keys_unavailable',
		});
	});

	test('rotation: a new kid is found by a refetch, an old one stays until the set drops it', async () => {
		const server = serve([first]);
		const fresh = await testKey('RS256', 'rotated');
		const jwt = createJwt({ jwks: server.jwksUrl, refetchMs: 0 });
		expect((await jwt.verify(await signWith(first))).ok).toBe(true);
		expect(await jwt.verify(await signWith(fresh))).toEqual({
			ok: false,
			reason: 'key',
		});
		server.keys = [first.jwk, fresh.jwk];
		expect((await jwt.verify(await signWith(fresh))).ok).toBe(true);
		// A key the issuer dropped stays accepted until the cached set expires.
		server.keys = [fresh.jwk];
		expect((await jwt.verify(await signWith(first))).ok).toBe(true);
		setSystemTime(Date.now() + 601_000);
		try {
			expect(await jwt.verify(await signWith(first))).toEqual({
				ok: false,
				reason: 'key',
			});
		} finally {
			setSystemTime();
		}
	});
});

describe('algorithm confusion', () => {
	const rsa = keyFor(keys, 'RS256');

	test('an HS256 token signed with the RSA public key as secret is refused', async () => {
		const jwt = createJwt({ jwks: serve().jwksUrl });
		const spki = new Uint8Array(
			await crypto.subtle.exportKey('spki', rsa.pair.publicKey),
		);
		const pem = new TextEncoder().encode(
			`-----BEGIN PUBLIC KEY-----\n${Buffer.from(spki).toString('base64')}\n-----END PUBLIC KEY-----\n`,
		);
		for (const secret of [
			spki,
			pem,
			new TextEncoder().encode(String(rsa.jwk.n)).slice(0, 64),
		]) {
			const token = await signHmac(secret, { alg: 'HS256', kid: rsa.kid });
			expect(await jwt.verify(token)).toEqual({
				ok: false,
				reason: 'algorithm',
			});
		}
	});

	test('none, an unknown algorithm and an algorithm outside `algorithms` are refused', async () => {
		const jwt = createJwt({ jwks: serve().jwksUrl, algorithms: ['ES256'] });
		const body = Buffer.from('{"sub":"eve"}').toString('base64url');
		for (const alg of ['none', 'None', 'HS256', 'ES512', 'RS256', 1, null]) {
			const head = Buffer.from(JSON.stringify({ alg, kid: rsa.kid })).toString(
				'base64url',
			);
			expect(await jwt.verify(`${head}.${body}.`)).toEqual({
				ok: false,
				reason: 'algorithm',
			});
		}
		expect(await jwt.verify(await signWith(rsa))).toEqual({
			ok: false,
			reason: 'algorithm',
		});
	});

	test('a token whose algorithm does not fit its key type is refused', async () => {
		const jwt = createJwt({ jwks: serve().jwksUrl });
		const ec = keyFor(keys, 'ES256');
		// Signed by the EC key, but claiming RS256 under its kid.
		expect(await jwt.verify(await signWith(ec, {}, { alg: 'RS256' }))).toEqual({
			ok: false,
			reason: 'algorithm',
		});
		// A key pinned to RS256 does not verify PS256.
		const pinned = serve([{ ...rsa, jwk: { ...rsa.jwk, alg: 'RS256' } }]);
		const ps = createJwt({ jwks: pinned.jwksUrl });
		expect(await ps.verify(await signWith(rsa, {}, { alg: 'PS256' }))).toEqual({
			ok: false,
			reason: 'algorithm',
		});
		expect((await ps.verify(await signWith(rsa))).ok).toBe(true);
	});

	test('a key meant for encryption is not used, and a weak RSA key is refused', async () => {
		const enc = serve([{ ...rsa, jwk: { ...rsa.jwk, use: 'enc' } }]);
		expect(
			await createJwt({ jwks: enc.jwksUrl }).verify(await signWith(rsa)),
		).toEqual({ ok: false, reason: 'algorithm' });
		const weak = (await crypto.subtle.generateKey(
			{
				name: 'RSASSA-PKCS1-v1_5',
				hash: 'SHA-256',
				modulusLength: 1024,
				publicExponent: new Uint8Array([1, 0, 1]),
			},
			true,
			['sign', 'verify'],
		)) as CryptoKeyPair;
		const jwk = {
			...(await crypto.subtle.exportKey('jwk', weak.publicKey)),
			kid: 'weak',
		};
		const small = { alg: 'RS256' as const, kid: 'weak', pair: weak, jwk };
		const weakServer = serve([small]);
		expect(
			await createJwt({ jwks: weakServer.jwksUrl }).verify(
				await signWith(small),
			),
		).toEqual({ ok: false, reason: 'key' });
	});
});

describe('options', () => {
	test('refuses a URL that is not https, except on this machine', () => {
		expect(() => createJwt({ jwks: 'http://idp.example/jwks.json' })).toThrow(
			'createJwt: jwks must be an https URL',
		);
		expect(() => createJwt({ discovery: 'ftp://idp.example' })).toThrow(
			'createJwt: discovery must be an https URL',
		);
		expect(() => createJwt({ jwks: 'not a url' })).toThrow(
			'createJwt: jwks is not a URL',
		);
		expect(() =>
			createJwt({ jwks: 'https://idp.example/jwks.json' }),
		).not.toThrow();
	});
});
