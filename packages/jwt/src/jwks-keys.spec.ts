import { afterAll, describe, expect, spyOn, test } from 'bun:test';
import { type Issuer, issuer, signWith, testKey } from '../test/jwks-fixtures';
import { base64url } from './base64url';
import { okpFits } from './jwk-strength';
import { createJwt } from './jwt';
import type { Reason } from './token';

const rsa = await testKey('RS256');
const ed = await testKey('EdDSA');
const ec = await testKey('ES256');
const live: Issuer[] = [];
afterAll(() => {
	for (const one of live) one.stop();
});

/** The answer to a token `key` signs under `kid`, from a set holding `published` alone. */
async function verifyAgainst(
	published: object,
	key = rsa,
	kid = 'published',
): Promise<unknown> {
	const server = issuer([]);
	live.push(server);
	server.keys = [{ ...published, kid }];
	const jwt = createJwt({ jwks: server.jwksUrl });
	return jwt.verify(await signWith(key, {}, { kid }));
}

/** A modulus of `bytes` bytes whose first is `first`, the rest set. */
function modulus(bytes: number, first: number): string {
	const n = new Uint8Array(bytes).fill(0xff);
	n[0] = first;
	return base64url(n);
}

const refused = (reason: Reason) => ({ ok: false as const, reason });

describe('the RSA and EC keys a set may hold', () => {
	test('the modulus is counted in bits: 2047 is refused, 2048 and 8192 are not, 8193 is', async () => {
		const rsaKey = (n: string) => ({ kty: 'RSA', n, e: 'AQAB' });
		// A key that passes the size check is imported, and the forged signature fails.
		expect(await verifyAgainst(rsaKey(modulus(256, 0x7f)))).toEqual(
			refused('key'),
		);
		expect(await verifyAgainst(rsaKey(modulus(256, 0x80)))).toEqual(
			refused('signature'),
		);
		expect(await verifyAgainst(rsaKey(modulus(1024, 0x80)))).toEqual(
			refused('signature'),
		);
		expect(await verifyAgainst(rsaKey(modulus(1025, 0x01)))).toEqual(
			refused('key'),
		);
	});

	test('an even exponent, and 1 spelled with leading zeros, are refused', async () => {
		for (const e of ['AQAA', 'AAAB', 'Ag']) {
			expect(await verifyAgainst({ ...rsa.jwk, e })).toEqual(refused('key'));
		}
		expect((await verifyAgainst({ ...rsa.jwk })) as object).toHaveProperty(
			'ok',
			true,
		);
	});

	test('a member spelled other than strict base64url is refused, though Web Crypto would read it', async () => {
		const n = String(rsa.jwk.n);
		expect(await verifyAgainst({ ...rsa.jwk, n: `${n}=` })).toEqual(
			refused('key'),
		);
		// The same bytes with an unused trailing bit set: a second spelling of one key.
		const alphabet =
			'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
		const last = alphabet[alphabet.indexOf(n.at(-1) as string) ^ 1];
		const respelled = `${n.slice(0, -1)}${last}`;
		expect(Buffer.from(respelled, 'base64url')).toEqual(
			Buffer.from(n, 'base64url'),
		);
		expect(await verifyAgainst({ ...rsa.jwk, n: respelled })).toEqual(
			refused('key'),
		);
	});

	test('an EC coordinate padded, respelled or of the wrong size is refused', async () => {
		const alphabet =
			'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
		for (const member of ['x', 'y'] as const) {
			const value = String(ec.jwk[member]);
			const respelled = `${value.slice(0, -1)}${alphabet[alphabet.indexOf(value.at(-1) as string) ^ 1]}`;
			for (const bad of [`${value}=`, respelled, value.slice(0, -2)]) {
				expect(await verifyAgainst({ ...ec.jwk, [member]: bad }, ec)).toEqual(
					refused('key'),
				);
			}
		}
		expect((await verifyAgainst({ ...ec.jwk }, ec)) as object).toHaveProperty(
			'ok',
			true,
		);
	});

	test('only the public members reach Web Crypto: a set leaking the private key still verifies', async () => {
		const exported = await crypto.subtle.exportKey('jwk', rsa.pair.privateKey);
		const { alg: _alg, key_ops: _ops, ext: _ext, ...leaked } = exported;
		expect(leaked.d).toBeString();
		expect((await verifyAgainst(leaked)) as object).toHaveProperty('ok', true);
	});
});

describe('which key a token may use', () => {
	test('key_ops must be an array naming verify', async () => {
		for (const key_ops of [['sign'], 'verify', null]) {
			expect(await verifyAgainst({ ...rsa.jwk, key_ops })).toEqual(
				refused('algorithm'),
			);
		}
		expect(
			(await verifyAgainst({ ...rsa.jwk, key_ops: ['verify'] })) as object,
		).toHaveProperty('ok', true);
	});

	test('an EC key on another curve does not verify an ES256 token', async () => {
		expect(await verifyAgainst({ ...ec.jwk, crv: 'P-384' }, ec)).toEqual(
			refused('algorithm'),
		);
	});

	test('Web Crypto rejecting the verification is a bad signature, not a 500', async () => {
		const server = issuer([ec]);
		live.push(server);
		const jwt = createJwt({ jwks: server.jwksUrl });
		const token = await signWith(ec);
		expect((await jwt.verify(token)).ok).toBe(true);
		const verify = spyOn(crypto.subtle, 'verify').mockRejectedValueOnce(
			new DOMException('unreadable', 'OperationError'),
		);
		try {
			expect(await jwt.verify(token)).toEqual(refused('signature'));
		} finally {
			verify.mockRestore();
		}
	});
});

describe('the Ed25519 keys a set may hold', () => {
	const okp = (x: string) => okpFits({ kty: 'OKP', crv: 'Ed25519', x });
	const point = (head: number[], fill: number, last: number) => {
		const bytes = new Uint8Array(32).fill(fill);
		bytes.set(head);
		bytes[31] = last;
		return bytes;
	};
	const SMALL_ORDER = [
		point([], 0, 0),
		point([1], 0, 0),
		Buffer.from(
			'26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05',
			'hex',
		),
		Buffer.from(
			'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a',
			'hex',
		),
		point([0xec], 0xff, 0x7f),
		point([0xed], 0xff, 0x7f),
		point([0xee], 0xff, 0x7f),
	];

	test("every point of libsodium's small-order list is refused, sign bit set or not", () => {
		for (const bytes of SMALL_ORDER) {
			expect(okp(base64url(bytes))).toBe(false);
			const signed = Uint8Array.from(bytes);
			signed[31] = (signed[31] as number) | 0x80;
			expect(okp(base64url(signed))).toBe(false);
		}
	});

	test('a real key passes; one of another length, or spelled loosely, does not', () => {
		const x = String(ed.jwk.x);
		expect(okp(x)).toBe(true);
		expect(okp(x.slice(0, -2))).toBe(false);
		expect(okp(`${x}AA`)).toBe(false);
		expect(okp(`${x}=`)).toBe(false);
		expect(okpFits({ kty: 'OKP', crv: 'Ed25519' })).toBe(false);
	});
});
