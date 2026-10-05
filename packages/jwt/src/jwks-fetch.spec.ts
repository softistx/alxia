import { afterAll, describe, expect, test } from 'bun:test';
import { base64url } from './base64url';
import { keyUrl } from './jwks';
import { issuer, signWith, testKey } from './jwks-fixtures';
import { createJwt } from './jwt';

const key = await testKey('RS256');
const token = await signWith(key);
const unavailable = { ok: false, reason: 'keys_unavailable' } as const;
const servers: { stop(close?: boolean): unknown }[] = [];

/** A server answering `handler`, for the hostile answers the fixture issuer never gives. */
function hostile(handler: (request: Request) => Response) {
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
		expect(await createJwt({ jwks: streamed }).verify(token)).toEqual(
			unavailable,
		);
	});

	test('a discovery document that names another issuer, or no jwks_uri, fails closed', async () => {
		const document = (body: unknown) => hostile(() => Response.json(body));
		const liar = document({
			issuer: 'https://evil.example',
			jwks_uri: 'http://127.0.0.1/jwks',
		});
		expect(await createJwt({ discovery: liar }).verify(token)).toEqual(
			unavailable,
		);
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
