import { base64url } from '../src/base64url';
import type { JwksAlgorithm } from '../src/jwk';
import { clock } from '../src/jwks/cache';

const encoder = new TextEncoder();

/** The key pair each algorithm signs with, as Web Crypto generates it. */
const GENERATE: Record<JwksAlgorithm, () => Promise<CryptoKeyPair>> = {
	RS256: () => rsa('RSASSA-PKCS1-v1_5', 'SHA-256'),
	RS384: () => rsa('RSASSA-PKCS1-v1_5', 'SHA-384'),
	RS512: () => rsa('RSASSA-PKCS1-v1_5', 'SHA-512'),
	PS256: () => rsa('RSA-PSS', 'SHA-256'),
	PS384: () => rsa('RSA-PSS', 'SHA-384'),
	PS512: () => rsa('RSA-PSS', 'SHA-512'),
	ES256: () => ec('P-256'),
	ES384: () => ec('P-384'),
	ES512: () => ec('P-521'),
	EdDSA: () => generate({ name: 'Ed25519' }),
};

const generate = (
	algorithm: AlgorithmIdentifier | RsaHashedKeyGenParams | EcKeyGenParams,
) =>
	crypto.subtle.generateKey(algorithm, true, [
		'sign',
		'verify',
	]) as Promise<CryptoKeyPair>;

const rsa = (name: string, hash: string) =>
	generate({
		name,
		hash,
		modulusLength: 2048,
		publicExponent: new Uint8Array([1, 0, 1]),
	});
const ec = (namedCurve: string) => generate({ name: 'ECDSA', namedCurve });

const SIGN: Record<
	string,
	(alg: JwksAlgorithm) => AlgorithmIdentifier | EcdsaParams | RsaPssParams
> = {
	RS: () => ({ name: 'RSASSA-PKCS1-v1_5' }),
	PS: (alg) => ({ name: 'RSA-PSS', saltLength: Number(alg.slice(2)) / 8 }),
	ES: (alg) => ({ name: 'ECDSA', hash: `SHA-${alg.slice(2)}` }),
	Ed: () => ({ name: 'Ed25519' }),
};

export interface TestKey {
	readonly alg: JwksAlgorithm;
	readonly kid: string;
	readonly pair: CryptoKeyPair;
	/** The public key, as a JWKS publishes it. */
	readonly jwk: JsonWebKey & { kid: string };
}

export async function testKey(
	alg: JwksAlgorithm,
	kid = `${alg}-key`,
): Promise<TestKey> {
	const pair = await GENERATE[alg]();
	const jwk = {
		...(await crypto.subtle.exportKey('jwk', pair.publicKey)),
		kid,
	};
	delete jwk.alg;
	delete jwk.key_ops;
	delete jwk.ext;
	return { alg, kid, pair, jwk };
}

const part = (value: unknown) =>
	base64url(encoder.encode(JSON.stringify(value)));

/** A token of `claims` signed by `key`, its header `{ alg, kid, typ }` unless overridden. */
export async function signWith(
	key: TestKey,
	claims: Record<string, unknown> = { sub: 'ada' },
	header: Record<string, unknown> = {},
): Promise<string> {
	const head = part({ alg: key.alg, kid: key.kid, typ: 'JWT', ...header });
	const input = `${head}.${part(claims)}`;
	const signature = await crypto.subtle.sign(
		(SIGN[key.alg.slice(0, 2)] as (alg: JwksAlgorithm) => AlgorithmIdentifier)(
			key.alg,
		),
		key.pair.privateKey,
		encoder.encode(input),
	);
	return `${input}.${base64url(new Uint8Array(signature))}`;
}

/** A token signed with HMAC under `secret`, as an attacker who knows only a public key would. */
export async function signHmac(
	secret: Uint8Array<ArrayBuffer>,
	header: Record<string, unknown>,
	claims: Record<string, unknown> = { sub: 'eve' },
): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		secret,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const input = `${part({ typ: 'JWT', ...header })}.${part(claims)}`;
	const signature = await crypto.subtle.sign(
		'HMAC',
		key,
		encoder.encode(input),
	);
	return `${input}.${base64url(new Uint8Array(signature))}`;
}

export interface Issuer {
	url: string;
	jwksUrl: string;
	/** Requests answered, by path. */
	readonly hits: Record<string, number>;
	/** What the next JWKS answers: the keys, and the headers. */
	keys: object[];
	headers: Record<string, string>;
	/** Answer 500 on the JWKS while true. */
	failing: boolean;
	stop(): void;
}

/** A local issuer: its JWKS and its OpenID configuration, both changeable by a spec. */
export function issuer(keys: readonly TestKey[]): Issuer {
	const state: Issuer = {
		url: '',
		jwksUrl: '',
		hits: {},
		keys: keys.map((k) => k.jwk),
		headers: {},
		failing: false,
		stop: () => void server.stop(true),
	};
	const server: ReturnType<typeof Bun.serve> = Bun.serve({
		port: 0,
		hostname: '127.0.0.1',
		fetch(request) {
			const path = new URL(request.url).pathname;
			state.hits[path] = (state.hits[path] ?? 0) + 1;
			const origin = new URL(request.url).origin;
			if (path === '/.well-known/openid-configuration') {
				return Response.json({
					issuer: origin,
					jwks_uri: `${origin}/jwks.json`,
				});
			}
			if (path !== '/jwks.json' || state.failing) {
				return new Response('no', { status: 500 });
			}
			return Response.json({ keys: state.keys }, { headers: state.headers });
		},
	});
	return Object.assign(state, {
		url: `http://127.0.0.1:${server.port}`,
		jwksUrl: `http://127.0.0.1:${server.port}/jwks.json`,
	});
}

/** The key a spec generated for `alg`; throws when there is none. */
export function keyFor(keys: readonly TestKey[], alg: JwksAlgorithm): TestKey {
	const key = keys.find((k) => k.alg === alg);
	if (key === undefined) throw new Error(`no ${alg} key`);
	return key;
}

const monotonic = clock.now;
let offset = 0;

/** Moves the key cache's monotonic clock `ms` ahead: the wall clock it no longer reads would not. */
export function later(ms: number): void {
	offset += ms;
	clock.now = () => monotonic() + offset;
}

/** Puts the key cache back on its own clock. */
export function resetClock(): void {
	offset = 0;
	clock.now = monotonic;
}
