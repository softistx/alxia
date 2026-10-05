import { afterAll, describe, expect, test } from 'bun:test';
import { issuer, signWith, testKey } from '../test/jwks-fixtures';
import { base64url } from './base64url';
import { jwksUri } from './jwks/discovery';
import { keyUrl } from './jwks/url';
import { createJwt } from './jwt';

const key = await testKey('RS256');
const token = await signWith(key);
const unavailable = { ok: false, reason: 'keys_unavailable' } as const;
const servers: { stop(close?: boolean): unknown }[] = [];

/** A server answering `handler`, for the hostile answers the fixture issuer never gives. */
function hostile(handler: (request: Request) => Response | Promise<Response>) {
	const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: handler });
	servers.push(server);
	return `http://127.0.0.1:${server.port}`;
}
afterAll(() => {
	for (const server of servers) server.stop(true);
});

describe('what is fetched', () => {
	test('a redirect is not followed', async () => {
		const real = issuer([key]);
		servers.push({ stop: () => real.stop() });
		const url = hostile(() => Response.redirect(real.jwksUrl, 302));
		expect(await createJwt({ jwks: url }).verify(token)).toEqual(unavailable);
		expect(real.hits['/jwks.json']).toBeUndefined();
	});

	test('a response over 256 KiB is refused, declared or streamed', async () => {
		const big = JSON.stringify({
			keys: [{ ...key.jwk, pad: 'x'.repeat(300_000) }],
		});
		const declared = hostile(() => new Response(big));
		expect(await createJwt({ jwks: declared }).verify(token)).toEqual(
			unavailable,
		);
		const streamed = hostile(
			() =>
				new Response(
					new ReadableStream({
						pull: (controller) =>
							controller.enqueue(new TextEncoder().encode('x'.repeat(65_536))),
					}),
				),
		);
		// Without the cap, an endless body would be read until the timeout, a minute here.
		const started = performance.now();
		expect(
			await createJwt({ jwks: streamed, timeoutMs: 60_000 }).verify(token),
		).toEqual(unavailable);
		expect(performance.now() - started).toBeLessThan(2_000);
	});

	test('an issuer that never answers is given up on after timeoutMs', async () => {
		const stalled = hostile(() => new Promise<Response>(() => {}));
		const started = performance.now();
		expect(
			await createJwt({ jwks: stalled, timeoutMs: 200 }).verify(token),
		).toEqual(unavailable);
		expect(performance.now() - started).toBeLessThan(2_000);
	});

	test('a discovery document that names another issuer, or no jwks_uri, fails closed', async () => {
		const real = issuer([key]);
		servers.push({ stop: () => real.stop() });
		// The keys it names are live and valid: only the issuer check refuses them.
		const liar = hostile(() =>
			Response.json({ issuer: 'https://evil.example', jwks_uri: real.jwksUrl }),
		);
		expect(await createJwt({ discovery: liar }).verify(token)).toEqual(
			unavailable,
		);
		expect(real.hits['/jwks.json']).toBeUndefined();
		const base = hostile((request) =>
			Response.json({ issuer: new URL(request.url).origin }),
		);
		expect(await createJwt({ discovery: base }).verify(token)).toEqual(
			unavailable,
		);
	});

	test('a jwks_uri read from a document is https, however the configured URL is', () => {
		expect(keyUrl('http://127.0.0.1:1/jwks', 'jwks').protocol).toBe('http:');
		expect(() => keyUrl('http://127.0.0.1/jwks', 'jwks_uri', false)).toThrow(
			'jwks_uri must be an https URL',
		);
		expect(keyUrl('https://idp.example/jwks', 'jwks_uri', false).protocol).toBe(
			'https:',
		);
	});

	test("a remote issuer's document naming an http jwks_uri is refused", async () => {
		const naming = (jwks_uri: string) => async () => ({
			body: { issuer: 'https://idp.example', jwks_uri },
			cacheControl: null,
		});
		for (const uri of ['http://idp.example/jwks', 'http://127.0.0.1/jwks']) {
			await expect(
				jwksUri('https://idp.example', 1_000, naming(uri)),
			).rejects.toThrow('jwks_uri must be an https URL');
		}
		const https = await jwksUri(
			'https://idp.example',
			1_000,
			naming('https://idp.example/jwks'),
		);
		expect(https.href).toBe('https://idp.example/jwks');
	});

	test('an all-zero modulus and a trivial exponent are refused', async () => {
		const server = issuer([key]);
		servers.push({ stop: () => server.stop() });
		const n = base64url(new Uint8Array(256));
		const real = String(key.jwk.n);
		server.keys = [
			{ kty: 'RSA', kid: 'zero', n, e: 'AQAB' },
			{ kty: 'RSA', kid: 'one', n: real, e: 'AQ' },
		];
		const jwt = createJwt({ jwks: server.jwksUrl, refetchMs: 0 });
		for (const kid of ['zero', 'one']) {
			expect(await jwt.verify(await signWith(key, {}, { kid }))).toEqual({
				ok: false,
				reason: 'key',
			});
		}
	});

	test('an Ed25519 key of small order is refused, so a token anyone can forge is not accepted', async () => {
		const server = issuer([key]);
		servers.push({ stop: () => server.stop() });
		const identity = new Uint8Array(32);
		identity[0] = 1;
		const pPlusOne = new Uint8Array(32).fill(0xff);
		pPlusOne[0] = 0xee;
		pPlusOne[31] = 0x7f;
		expect(base64url(identity)).toBe(
			'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
		);
		server.keys = [
			{ kty: 'OKP', crv: 'Ed25519', kid: 'identity', x: base64url(identity) },
			{
				kty: 'OKP',
				crv: 'Ed25519',
				kid: 'zero',
				x: base64url(new Uint8Array(32)),
			},
			// p + 1, a second spelling of the identity.
			{ kty: 'OKP', crv: 'Ed25519', kid: 'p+1', x: base64url(pPlusOne) },
		];
		const jwt = createJwt({ jwks: server.jwksUrl, refetchMs: 0 });
		// R = the identity, S = 0: valid under the identity key for any message.
		const signature = new Uint8Array(64);
		signature[0] = 1;
		for (const kid of ['identity', 'zero', 'p+1']) {
			const part = (value: unknown) =>
				base64url(new TextEncoder().encode(JSON.stringify(value)));
			const forged = `${part({ alg: 'EdDSA', kid })}.${part({ sub: 'eve' })}.${base64url(signature)}`;
			expect(await jwt.verify(forged)).toEqual({ ok: false, reason: 'key' });
		}
	});

	test('jwks and discovery together are refused', () => {
		expect(() =>
			createJwt({
				jwks: 'https://a.example/jwks',
				discovery: 'https://a.example',
			} as never),
		).toThrow('createJwt: give jwks or discovery, not both');
	});

	test('an RSA modulus padded with a zero byte does not pass the size floor', async () => {
		const modulus = new Uint8Array(256);
		modulus.fill(0xff, 1);
		const weak = {
			kty: 'RSA',
			kid: 'padded',
			n: base64url(modulus),
			e: 'AQAB',
		};
		const server = issuer([key]);
		servers.push({ stop: () => server.stop() });
		server.keys = [weak];
		const padded = await signWith(key, {}, { kid: 'padded' });
		expect(await createJwt({ jwks: server.jwksUrl }).verify(padded)).toEqual({
			ok: false,
			reason: 'key',
		});
	});
});
