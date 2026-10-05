import type { Jwk } from '../jwk';
import { jwksUri } from './discovery';
import { getJson } from './fetch';

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

const MAX_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * The clock the cache's lifetimes and rate limit are measured on:
 * monotonic, so a wall clock set back or forward neither keeps a set past
 * its lifetime nor lifts the refetch limit. A spec replaces `now`.
 */
export const clock = { now: (): number => performance.now() };

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

/** The members of a fetched set that are keys at all. */
function keysOf(body: unknown): readonly Jwk[] {
	const list = (body as { keys?: unknown }).keys;
	return Array.isArray(list)
		? list.filter(
				(k): k is Jwk =>
					k !== null && typeof k === 'object' && typeof k.kty === 'string',
			)
		: [];
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
		const keys = keysOf(body);
		if (keys.length === 0) throw new Error('the key set holds no keys');
		snapshot = {
			keys,
			expiresAt: clock.now() + lifetime(cacheControl, settings),
		};
	}

	function fetchKeys(): Promise<void> {
		if (inflight !== undefined) return inflight;
		if (clock.now() - lastAttempt < settings.refetchMs)
			return Promise.resolve();
		lastAttempt = clock.now();
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
		return clock.now() < snapshot.expiresAt + settings.staleMs
			? snapshot.keys
			: undefined;
	}

	return {
		async keys() {
			if (snapshot !== undefined && clock.now() < snapshot.expiresAt)
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
