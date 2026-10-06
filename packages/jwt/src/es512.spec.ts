import { describe, expect, spyOn, test } from 'bun:test';
import { createPrivateKey, sign as signDer } from 'node:crypto';
import { signHmac } from '../test/jwks-fixtures';
import { RFC7520_PUBLIC, rfc7520Pair } from '../test/rfc7520';
import { base64url } from './base64url';
import { createJwt } from './jwt';
import { signatureFits } from './signature';
import type { Reason } from './token';

const pair = (namedCurve: string) =>
	crypto.subtle.generateKey({ name: 'ECDSA', namedCurve }, true, [
		'sign',
		'verify',
	]) as Promise<CryptoKeyPair>;

const p521 = await pair('P-521');
const p256 = await pair('P-256');
const jwt = createJwt({ algorithm: 'ES512', ...p521 });
const refused = (reason: Reason) => ({ ok: false as const, reason });
const part = (value: unknown) =>
	base64url(new TextEncoder().encode(JSON.stringify(value)));

/** `token` with its signature replaced by `bytes`. */
const resigned = (token: string, bytes: Uint8Array) =>
	`${token.split('.').slice(0, 2).join('.')}.${base64url(bytes)}`;

describe('ES512 with a key pair', () => {
	test('signs a 132-byte signature, r and s of 66 bytes, and verifies it', async () => {
		const token = await jwt.sign({ sub: 'ada' });
		const [head, , signature] = token.split('.') as [string, string, string];
		expect(JSON.parse(Buffer.from(head, 'base64url').toString())).toEqual({
			alg: 'ES512',
			typ: 'JWT',
		});
		expect(Buffer.from(signature, 'base64url').length).toBe(132);
		const verifier = createJwt({
			algorithm: 'ES512',
			publicKey: p521.publicKey,
		});
		const verified = await verifier.verify(token);
		expect(verified.ok && verified.claims.sub).toBe('ada');
		expect(verifier.sign({})).rejects.toThrow('private key');
	});

	test('the RFC 7520 key, imported from its JWK, signs and verifies', async () => {
		const rfc = createJwt({ algorithm: 'ES512', ...(await rfc7520Pair()) });
		const verified = await rfc.verify(await rfc.sign({ sub: 'bilbo' }));
		expect(verified.ok && verified.claims.sub).toBe('bilbo');
		expect(await rfc.verify(await jwt.sign({ sub: 'eve' }))).toEqual(
			refused('signature'),
		);
	});

	test('a signature of any length but 132 is refused before Web Crypto reads it', async () => {
		const token = await jwt.sign({ sub: 'ada' });
		const raw = Buffer.from(token.split('.')[2] as string, 'base64url');
		const verify = spyOn(crypto.subtle, 'verify');
		try {
			const padded = new Uint8Array(133);
			padded.set(raw, 1);
			for (const bytes of [
				new Uint8Array(0),
				raw.subarray(0, 64),
				raw.subarray(0, 96),
				raw.subarray(0, 131),
				padded,
				new Uint8Array(264),
			]) {
				expect(await jwt.verify(resigned(token, bytes))).toEqual(
					refused('signature'),
				);
			}
			expect(verify).not.toHaveBeenCalled();
		} finally {
			verify.mockRestore();
		}
	});

	test('a signature spelled any way but its one canonical base64url is malformed', async () => {
		const token = await jwt.sign({ sub: 'ada' });
		// 132 bytes are exactly 176 characters: a 177th would be dropped by a lenient decoder.
		for (const extra of ['A', 'B', '_']) {
			expect(await jwt.verify(`${token}${extra}`)).toEqual(
				refused('malformed'),
			);
		}
		// 64 bytes leave 4 unused bits in the last of 86 characters.
		const es256 = createJwt({ algorithm: 'ES256', ...p256 });
		const short = await es256.sign({ sub: 'ada' });
		const alphabet =
			'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
		const last = alphabet.indexOf(short.at(-1) as string);
		const respelled = `${short.slice(0, -1)}${alphabet[last ^ 1]}`;
		const bytes = (t: string) =>
			Buffer.from(t.split('.')[2] as string, 'base64url');
		expect(bytes(respelled)).toEqual(bytes(short));
		expect(await es256.verify(respelled)).toEqual(refused('malformed'));
		expect((await es256.verify(short)).ok).toBe(true);
		expect((await jwt.verify(token)).ok).toBe(true);
	});

	test('a DER signature by the same key is refused', async () => {
		const token = await jwt.sign({ sub: 'ada' });
		const input = token.split('.').slice(0, 2).join('.');
		const der = signDer(
			'sha512',
			Buffer.from(input),
			createPrivateKey({
				key: (await crypto.subtle.exportKey('jwk', p521.privateKey)) as never,
				format: 'jwk',
			}),
		);
		expect(der[0]).toBe(0x30);
		expect(await jwt.verify(resigned(token, der))).toEqual(
			refused('signature'),
		);
	});

	test('alg none, another ECDSA algorithm and an HMAC under the public key are refused', async () => {
		const body = part({ sub: 'eve' });
		expect(await jwt.verify(`${part({ alg: 'none' })}.${body}.`)).toEqual(
			refused('algorithm'),
		);
		const es256 = createJwt({ algorithm: 'ES256', ...p256 });
		expect(await jwt.verify(await es256.sign({ sub: 'eve' }))).toEqual(
			refused('algorithm'),
		);
		const spki = new Uint8Array(
			await crypto.subtle.exportKey('spki', p521.publicKey),
		);
		for (const alg of ['HS256', 'HS512']) {
			expect(await jwt.verify(await signHmac(spki, { alg }))).toEqual(
				refused('algorithm'),
			);
		}
	});

	test('an ES256 or ES384 signature length is checked as well', () => {
		expect(signatureFits('ES256', new Uint8Array(64))).toBe(true);
		expect(signatureFits('ES256', new Uint8Array(132))).toBe(false);
		expect(signatureFits('ES384', new Uint8Array(96))).toBe(true);
		expect(signatureFits('ES384', new Uint8Array(64))).toBe(false);
		expect(signatureFits('ES512', new Uint8Array(132))).toBe(true);
		expect(signatureFits('RS256', new Uint8Array(7))).toBe(true);
		expect(signatureFits('toString', new Uint8Array(7))).toBe(true);
	});
});

describe('ES512 keys', () => {
	test('a key of another curve is refused at once, in both directions', async () => {
		const p384 = await pair('P-384');
		for (const [curve, keys] of [
			['P-256', p256],
			['P-384', p384],
		] as const) {
			expect(() =>
				createJwt({ algorithm: 'ES512', publicKey: keys.publicKey }),
			).toThrow(
				`createJwt: ES512 needs an ECDSA P-521 key; the publicKey is ECDSA ${curve}`,
			);
		}
		expect(() =>
			createJwt({
				algorithm: 'ES512',
				publicKey: p521.publicKey,
				privateKey: p256.privateKey,
			}),
		).toThrow(
			'createJwt: ES512 needs an ECDSA P-521 key; the privateKey is ECDSA P-256',
		);
		for (const alg of ['ES256', 'ES384'] as const) {
			expect(() => createJwt({ algorithm: alg, ...p521 })).toThrow(
				'the publicKey is ECDSA P-521',
			);
		}
	});

	test('a key without its usage, or the two swapped, is refused', async () => {
		const { kty, crv, x, y } = RFC7520_PUBLIC;
		const unusable = await crypto.subtle.importKey(
			'jwk',
			{ kty, crv, x, y },
			{ name: 'ECDSA', namedCurve: 'P-521' },
			false,
			[],
		);
		expect(() =>
			createJwt({ algorithm: 'ES512', publicKey: unusable }),
		).toThrow(
			'createJwt: the publicKey must be a public key that can verify; it is a public key that can do nothing',
		);
		expect(() =>
			createJwt({
				algorithm: 'ES512',
				publicKey: p521.privateKey,
				privateKey: p521.publicKey,
			}),
		).toThrow(
			'createJwt: the publicKey must be a public key that can verify; it is a private key that can sign',
		);
	});
});
