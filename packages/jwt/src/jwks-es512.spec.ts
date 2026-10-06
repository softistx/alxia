import { afterAll, describe, expect, test } from 'bun:test';
import {
	type Issuer,
	issuer,
	signHmac,
	signWith,
	type TestKey,
	testKey,
} from '../test/jwks-fixtures';
import { RFC7520_JWS, RFC7520_PUBLIC, rfc7520Pair } from '../test/rfc7520';
import { base64url, fromBase64url } from './base64url';
import {
	importKey,
	type Jwk,
	type JwksAlgorithm,
	selectKey,
	verifyParams,
} from './jwk';
import { ecFits } from './jwk-strength';
import { createJwt } from './jwt';
import { signatureFits } from './signature';
import type { Reason } from './token';

const es256 = await testKey('ES256');
const es384 = await testKey('ES384');
const es512 = await testKey('ES512');
const live: Issuer[] = [];
afterAll(() => {
	for (const one of live) one.stop();
});
const refused = (reason: Reason) => ({ ok: false as const, reason });

/** A verifier by a set holding `keys`. */
function verifierOf(keys: object[], algorithms?: readonly JwksAlgorithm[]) {
	const server = issuer([]);
	live.push(server);
	server.keys = keys;
	return createJwt({
		jwks: server.jwksUrl,
		...(algorithms === undefined ? {} : { algorithms }),
	});
}

/** `key`, published under `kid` with `members` changed. */
const published = (key: TestKey, members: object = {}, kid = key.kid) => ({
	...key.jwk,
	kid,
	...members,
});

describe('ES512 from a JWKS', () => {
	test('the RFC 7520 vector verifies under the key its JWK imports to', async () => {
		const [head, body, signature] = RFC7520_JWS.split('.') as [
			string,
			string,
			string,
		];
		const bytes = fromBase64url(signature);
		expect(bytes.length).toBe(132);
		expect(signatureFits('ES512', bytes)).toBe(true);
		const jwk = RFC7520_PUBLIC as Jwk;
		expect(ecFits(jwk)).toBe(true);
		expect(selectKey([jwk], 'ES512', jwk.kid)).toBe(jwk);
		const key = await importKey(jwk, 'ES512');
		const input = new TextEncoder().encode(`${head}.${body}`);
		const verify = (sig: Uint8Array<ArrayBuffer>) =>
			crypto.subtle.verify(verifyParams('ES512'), key, sig, input);
		expect(await verify(bytes)).toBe(true);
		const flipped = bytes.slice();
		flipped[131] = (flipped[131] as number) ^ 1;
		expect(await verify(flipped)).toBe(false);
	});

	test('a token signed by the RFC 7520 key verifies by its published kid and use', async () => {
		const { privateKey } = await rfc7520Pair();
		const key = { alg: 'ES512', kid: RFC7520_PUBLIC.kid, pair: { privateKey } };
		const jwt = verifierOf([RFC7520_PUBLIC]);
		const result = await jwt.verify(await signWith(key as TestKey));
		expect(result.ok && result.claims.sub).toBe('ada');
	});

	test('a set of mixed curves: each token finds the key of its curve, with or without a kid', async () => {
		const jwt = verifierOf([es256.jwk, es384.jwk, es512.jwk]);
		for (const key of [es256, es384, es512]) {
			expect((await jwt.verify(await signWith(key))).ok).toBe(true);
			const noKid = await signWith(key, { sub: 'ada' }, { kid: undefined });
			expect((await jwt.verify(noKid)).ok).toBe(true);
		}
	});

	test('a curve that does not match the alg is refused, in both directions', async () => {
		const jwt = verifierOf([
			published(es256, {}, 'shared-256'),
			published(es512, {}, 'shared-521'),
		]);
		// An ES512 header naming the P-256 key, and an ES256 one naming the P-521 key.
		const es512OnP256 = { ...es512, kid: 'shared-256' };
		const es256OnP521 = { ...es256, kid: 'shared-521' };
		expect(await jwt.verify(await signWith(es512OnP256))).toEqual(
			refused('algorithm'),
		);
		expect(await jwt.verify(await signWith(es256OnP521))).toEqual(
			refused('algorithm'),
		);
		// A P-521 key that claims P-256 is refused as a key, not imported on the wrong curve.
		const lying = verifierOf([published(es512, { crv: 'P-256' })]);
		expect(await lying.verify(await signWith(es512))).toEqual(
			refused('algorithm'),
		);
		expect(
			await lying.verify(await signWith({ ...es256, kid: es512.kid })),
		).toEqual(refused('key'));
	});

	test('x or y of any length but 66 bytes is refused', async () => {
		const x = fromBase64url(String(es512.jwk.x));
		const unpadded = base64url(x.subarray(1));
		const longer = base64url(new Uint8Array([0, ...x]));
		for (const members of [
			{ x: unpadded },
			{ x: longer },
			{ y: unpadded },
			{ x: base64url(new Uint8Array(48)) },
		]) {
			const jwk = published(es512, members);
			expect(ecFits(jwk as Jwk)).toBe(false);
			expect(await verifierOf([jwk]).verify(await signWith(es512))).toEqual(
				refused('key'),
			);
		}
		// A curve named after an inherited member has no size, not Object's.
		for (const crv of ['constructor', '__proto__', 'toString']) {
			expect(ecFits(published(es512, { crv }) as Jwk)).toBe(false);
		}
	});

	test('use and key_ops are honoured as for the other EC keys', async () => {
		const token = await signWith(es512);
		for (const members of [
			{ use: 'enc' },
			{ key_ops: ['encrypt'] },
			{ key_ops: 'verify' },
			{ alg: 'ES256' },
		]) {
			expect(
				await verifierOf([published(es512, members)]).verify(token),
			).toEqual(refused('algorithm'));
		}
		for (const members of [
			{ use: 'sig' },
			{ key_ops: ['verify'] },
			{ alg: 'ES512' },
		]) {
			const result = await verifierOf([published(es512, members)]).verify(
				token,
			);
			expect(result.ok).toBe(true);
		}
	});

	test('a signature of another length, a DER one included, is refused', async () => {
		const jwt = verifierOf([es512.jwk]);
		const token = await signWith(es512);
		const [input, signature] = [
			token.slice(0, token.lastIndexOf('.')),
			fromBase64url(token.slice(token.lastIndexOf('.') + 1)),
		];
		const der = new Uint8Array([0x30, 0x81, 0x88, ...new Uint8Array(136)]);
		for (const bytes of [signature.subarray(0, 131), der, new Uint8Array(64)]) {
			expect(await jwt.verify(`${input}.${base64url(bytes)}`)).toEqual(
				refused('signature'),
			);
		}
	});

	test('alg none, an HMAC under the public key, and an ES512 not allowed are refused', async () => {
		const jwt = verifierOf([es512.jwk]);
		const none = await signWith(es512, {}, { alg: 'none' });
		expect(
			await jwt.verify(`${none.slice(0, none.lastIndexOf('.'))}.`),
		).toEqual(refused('algorithm'));
		const secret = new TextEncoder().encode(JSON.stringify(es512.jwk));
		for (const alg of ['HS256', 'HS512']) {
			expect(
				await jwt.verify(await signHmac(secret, { alg, kid: es512.kid })),
			).toEqual(refused('algorithm'));
		}
		const only = verifierOf([es512.jwk], ['ES256']);
		expect(await only.verify(await signWith(es512))).toEqual(
			refused('algorithm'),
		);
		const allowed = verifierOf([es512.jwk], ['ES512']);
		expect((await allowed.verify(await signWith(es512))).ok).toBe(true);
		expect(await allowed.verify(await signWith(es256))).toEqual(
			refused('algorithm'),
		);
	});
});
