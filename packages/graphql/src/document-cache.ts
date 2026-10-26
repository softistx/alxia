/**
 * The parse cache `graphql()` gives Yoga: a least-recently-used map bounded
 * by entries, by age and by estimated bytes, since a parsed document costs
 * by its tokens and no count of entries bounds that.
 */
import type { DocumentNode, Token } from 'graphql';

/** Yoga's `Cache` contract. */
export interface Cache<T> {
	get(key: string): T | undefined;
	set(key: string, value: T): void;
}

export interface BoundedCacheOptions<T> {
	/** The most entries kept. */
	readonly max: number;
	/** How long an entry lives, in milliseconds. */
	readonly ttl: number;
	/** The most estimated bytes kept, the sum of the weights. */
	readonly maxBytes: number;
	/** The estimated bytes an entry holds. */
	readonly weigh: (key: string, value: T) => number;
	/** The clock, in milliseconds; injectable for the specs. */
	readonly now?: () => number;
}

interface Entry<T> {
	readonly value: T;
	readonly weight: number;
	readonly expires: number;
}

/**
 * A least-recently-used cache that evicts by `max`, `ttl` and `maxBytes`.
 * An entry heavier than `maxBytes / 8` is not stored and evicts nothing.
 */
export function boundedCache<T>(options: BoundedCacheOptions<T>): Cache<T> {
	const { max, ttl, maxBytes, weigh, now = Date.now } = options;
	const entries = new Map<string, Entry<T>>();
	let total = 0;

	const drop = (key: string, entry: Entry<T>): void => {
		entries.delete(key);
		total -= entry.weight;
	};

	return {
		get(key) {
			const entry = entries.get(key);
			if (entry === undefined) return undefined;
			if (entry.expires <= now()) {
				drop(key, entry);
				return undefined;
			}
			// Map keeps insertion order: re-insert to mark it recent.
			entries.delete(key);
			entries.set(key, entry);
			return entry.value;
		},
		set(key, value) {
			const previous = entries.get(key);
			if (previous !== undefined) drop(key, previous);
			const weight = weigh(key, value);
			if (weight > maxBytes / 8) return;
			entries.set(key, { value, weight, expires: now() + ttl });
			total += weight;
			for (const [oldest, entry] of entries) {
				if (entries.size <= max && total <= maxBytes) break;
				drop(oldest, entry);
			}
		},
	};
}

/** The measured upper bound of a parsed token's heap cost, in bytes. */
const BYTES_PER_TOKEN = 512;

/** The bytes counted per source character: the source key, plus a token's value. */
const BYTES_PER_CHAR = 4;

/**
 * The tokens the lexer linked for a document, comments included: graphql's
 * `tokenCount` and `maxTokens` skip comments, yet `loc.startToken` keeps
 * the whole chain alive. Undefined when the document has no `loc`.
 */
function chainLength(document: DocumentNode): number | undefined {
	const first = document.loc?.startToken;
	if (first === undefined) return undefined;
	let count = 0;
	for (let token: Token | null = first; token !== null; token = token.next) {
		count++;
	}
	return count;
}

/**
 * A parsed document's estimated bytes: every token the lexer linked,
 * comments included, plus the source as the key and as token values. Without
 * `loc` (`noLocation`), `tokenCount` stands in; without that (older
 * graphql), the source's length does.
 */
export function documentWeight(source: string, document: DocumentNode): number {
	const tokens =
		chainLength(document) ?? (document as { tokenCount?: number }).tokenCount;
	if (typeof tokens !== 'number') return 256 * source.length;
	return BYTES_PER_TOKEN * tokens + BYTES_PER_CHAR * source.length;
}

/** A parse error's estimated bytes: its source as the key, and the error. */
export function errorWeight(source: string): number {
	return 2 * source.length + 1024;
}
