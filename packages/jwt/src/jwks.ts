import type { Jwk } from './jwk';

/** What a key set source needs, with its defaults filled in. */
export interface JwksSettings {
	/** The set's URL, or the issuer whose discovery document names it. */
	readonly url: URL;
	/** The issuer as given, which its discovery document must name. */
	readonly discovery: string | undefined;
	readonly cacheMs: number;
	readonly staleMs: number;
	readonly refetchMs: number;
	readonly timeoutMs: number;
}

/** The most a response may weigh: a key set is a few kilobytes. */
const MAX_BYTES = 256 * 1024;
const MAX_TTL_MS = 24 * 60 * 60 * 1000;

const local = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Parses a URL that keys may be fetched from: `https`, or `http` on the machine itself. */
export function keyUrl(
	value: string | URL,
	option: string,
	allowLocal = true,
): URL {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new TypeError(`createJwt: ${option} is not a URL: ${String(value)}`);
	}
	if (
		url.protocol !== 'https:' &&
		!(allowLocal && url.protocol === 'http:' && local.has(url.hostname))
	) {
		throw new TypeError(`createJwt: ${option} must be an https URL`);
	}
	return url;
}

/** The body as text, cancelled once it passes `MAX_BYTES`: a hostile endpoint cannot make the server buffer it. */
async function readLimited(response: Response): Promise<string> {
	const declared = Number(response.headers.get('content-length'));
	if (declared > MAX_BYTES) throw new Error('the response is too large');
	const chunks: Uint8Array[] = [];
	let size = 0;
	const reader = response.body?.getReader();
	for (;;) {
		const part = await reader?.read();
		if (part === undefined || part.done) break;
		size += part.value.byteLength;
		if (size > MAX_BYTES) {
			await reader?.cancel();
			throw new Error('the response is too large');
		}
		chunks.push(part.value);
	}
	return new TextDecoder().decode(Buffer.concat(chunks));
}

async function getJson(
	url: URL,
	timeoutMs: number,
): Promise<{ body: unknown; cacheControl: string | null }> {
	const response = await fetch(url, {
		headers: { accept: 'application/json' },
		redirect: 'error',
		signal: AbortSignal.timeout(timeoutMs),
	});
	if (!response.ok)
		throw new Error(`${url.origin}${url.pathname} answered ${response.status}`);
	const text = await readLimited(response);
	return {
		body: JSON.parse(text),
		cacheControl: response.headers.get('cache-control'),
	};
}

/** The `jwks_uri` of an issuer's OpenID configuration, which must name that issuer. */
async function jwksUri(issuer: string, timeoutMs: number): Promise<URL> {
	const base = issuer.replace(/\/$/, '');
	const { body } = await getJson(
		new URL(`${base}/.well-known/openid-configuration`),
		timeoutMs,
	);
	const document = body as { issuer?: unknown; jwks_uri?: unknown };
	if (document.issuer !== issuer) {
		throw new Error(
			`the discovery document names the issuer ${String(document.issuer)}`,
		);
	}
	if (typeof document.jwks_uri !== 'string')
		throw new Error('the discovery document has no jwks_uri');
	// Read from a remote document, so never a URL on this machine, unless the issuer is.
	return keyUrl(
		document.jwks_uri,
		'jwks_uri',
		local.has(new URL(issuer).hostname),
	);
}

/** The cache lifetime a response asks for, kept between the refetch floor and a day. */
function lifetime(cacheControl: string | null, settings: JwksSettings): number {
	const maxAge = cacheControl?.match(/(?:^|[\s,])max-age=(\d+)/i)?.[1];
	const wanted =
		maxAge === undefined ? settings.cacheMs : Number(maxAge) * 1000;
	return Math.min(Math.max(wanted, settings.refetchMs), MAX_TTL_MS);
}

interface Snapshot {
	readonly keys: readonly Jwk[];
	readonly expiresAt: number;
}

export interface KeySource {
	/** The current keys; `undefined` when none can be had and none is cached within the grace period. */
	keys(): Promise<readonly Jwk[] | undefined>;
	/** Fetches again unless one was tried less than `refetchMs` ago; the new keys, or `undefined` if nothing came of it. */
	refresh(): Promise<readonly Jwk[] | undefined>;
}

/**
 * A JWKS cached in memory. Requests share one fetch in flight; a fetch is
 * attempted at most once per `refetchMs`, failures included, so neither a
 * flood of unknown `kid`s nor an unreachable issuer is hammered. A set past
 * its lifetime is used for `staleMs` more while the issuer cannot be
 * reached, then nothing is: the guard fails closed.
 */
export function keySource(settings: JwksSettings): KeySource {
	let snapshot: Snapshot | undefined;
	let target: URL | undefined =
		settings.discovery === undefined ? settings.url : undefined;
	let lastAttempt = Number.NEGATIVE_INFINITY;
	let inflight: Promise<void> | undefined;

	async function load(): Promise<void> {
		target ??= await jwksUri(settings.discovery as string, settings.timeoutMs);
		const { body, cacheControl } = await getJson(target, settings.timeoutMs);
		const list = (body as { keys?: unknown }).keys;
		const keys = Array.isArray(list)
			? list.filter(
					(k): k is Jwk =>
						k !== null && typeof k === 'object' && typeof k.kty === 'string',
				)
			: [];
		if (keys.length === 0) throw new Error('the key set holds no keys');
		snapshot = {
			keys,
			expiresAt: Date.now() + lifetime(cacheControl, settings),
		};
	}

	function fetchKeys(): Promise<void> {
		if (inflight !== undefined) return inflight;
		if (Date.now() - lastAttempt < settings.refetchMs) return Promise.resolve();
		lastAttempt = Date.now();
		inflight = load()
			.catch(() => undefined)
			.finally(() => {
				inflight = undefined;
			});
		return inflight;
	}

	/** The keys within their lifetime plus the grace period, if any. */
	function usable(): readonly Jwk[] | undefined {
		if (snapshot === undefined) return undefined;
		return Date.now() < snapshot.expiresAt + settings.staleMs
			? snapshot.keys
			: undefined;
	}

	return {
		async keys() {
			if (snapshot !== undefined && Date.now() < snapshot.expiresAt)
				return snapshot.keys;
			await fetchKeys();
			return usable();
		},
		async refresh() {
			await fetchKeys();
			return usable();
		},
	};
}
