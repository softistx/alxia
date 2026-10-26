/**
 * What `graphql()` bounds about parsing: the tokens a document may hold,
 * and the cache of what was parsed.
 */
import type { DocumentNode } from 'graphql';
import type { Plugin } from 'graphql-yoga';
import {
	boundedCache,
	type Cache,
	documentWeight,
	errorWeight,
} from './document-cache';

/** The most tokens a document may hold, unless `maxTokens` says otherwise. */
export const DEFAULT_MAX_TOKENS = 15_000;

/** The sizes of the parse cache, of each endpoint. */
export interface ParseCacheOptions {
	/** The most estimated bytes of parsed documents kept. 64 MiB by default. */
	readonly maxBytes?: number;
	/** The most documents kept. 1 024 by default. */
	readonly max?: number;
	/** How long a document is kept, in milliseconds. One hour by default. */
	readonly ttl?: number;
}

const DEFAULT_BYTES = 64 * 1024 * 1024;

function positive(name: string, value: unknown, what: string): number {
	if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
		return value;
	}
	throw new TypeError(
		`graphql(app, { ${name} }): ${what}, a positive whole number; got ${String(value)}`,
	);
}

/** `maxTokens` checked where `graphql()` is declared. */
export function tokenLimit(
	maxTokens: number | false | undefined,
): number | false {
	if (maxTokens === undefined) return DEFAULT_MAX_TOKENS;
	if (maxTokens === false) return false;
	if (
		typeof maxTokens === 'number' &&
		Number.isSafeInteger(maxTokens) &&
		maxTokens > 0
	) {
		return maxTokens;
	}
	throw new TypeError(
		`graphql(app, { maxTokens }): maxTokens is the most tokens a document may hold, a positive whole number, or false for none; got ${String(maxTokens)}`,
	);
}

/**
 * A Yoga plugin capping the tokens of every document Yoga parses. It wraps
 * the parse function Envelop already holds, never graphql's own `parse`: a
 * second copy of graphql would throw errors Yoga does not recognise, masked
 * as a 500.
 */
export function limitsTokens(maxTokens: number): Plugin {
	return {
		onParse({ parseFn, setParseFn }) {
			setParseFn((source, options) =>
				parseFn(source, { ...options, maxTokens }),
			);
		},
	};
}

/** What Yoga's `parserAndValidationCache` takes from alxia. */
export type ParseCaches =
	| false
	| {
			documentCache: Cache<DocumentNode>;
			errorCache: Cache<unknown>;
	  };

/**
 * The `parserAndValidationCache` of one Yoga: a pair of bounded caches,
 * created per call so each endpoint has its own. `false` gives none.
 */
export function parseCaches(
	parseCache: false | ParseCacheOptions | undefined,
): ParseCaches {
	if (parseCache === false) return false;
	if (
		parseCache !== undefined &&
		(typeof parseCache !== 'object' || parseCache === null)
	) {
		throw new TypeError(
			`graphql(app, { parseCache }): parseCache is an object of cache sizes, or false for none; got ${String(parseCache)}`,
		);
	}
	const given = parseCache ?? {};
	const maxBytes = positive(
		'parseCache.maxBytes',
		given.maxBytes ?? DEFAULT_BYTES,
		'maxBytes is the most estimated bytes of documents kept',
	);
	const max = positive(
		'parseCache.max',
		given.max ?? 1024,
		'max is the most documents kept',
	);
	const ttl = positive(
		'parseCache.ttl',
		given.ttl ?? 3_600_000,
		'ttl is the milliseconds a document is kept',
	);
	const documentCache = boundedCache<DocumentNode>({
		max,
		ttl,
		maxBytes,
		weigh: (source, document) => documentWeight(source, document),
	});
	const errorCache = boundedCache<unknown>({
		max,
		ttl,
		maxBytes: Math.floor(maxBytes / 8),
		weigh: (source) => errorWeight(source),
	});
	return { documentCache, errorCache };
}
