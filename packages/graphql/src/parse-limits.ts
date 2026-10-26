/**
 * What `graphql()` bounds about parsing: the tokens a document may hold,
 * and the cache of what was parsed.
 */
import type { DocumentNode } from 'graphql';
import type { Plugin, YogaServerOptions } from 'graphql-yoga';
import {
	boundedCache,
	type Cache,
	documentWeight,
	errorWeight,
} from './document-cache';
import type { YogaContext } from './handler';

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

function positive(
	name: string,
	value: unknown,
	what: string,
	alternative = '',
): number {
	if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
		return value;
	}
	throw new TypeError(
		`graphql(app, { ${name} }): ${what}, a positive whole number${alternative}; got ${String(value)}`,
	);
}

/** `maxTokens` checked where `graphql()` is declared. */
export function tokenLimit(
	maxTokens: number | false | undefined,
): number | false {
	if (maxTokens === undefined) return DEFAULT_MAX_TOKENS;
	if (maxTokens === false) return false;
	return positive(
		'maxTokens',
		maxTokens,
		'maxTokens is the most tokens a document may hold',
		', or false for none',
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

/** The sizes of a parse cache, checked. */
interface CacheSizes {
	readonly maxBytes: number;
	readonly max: number;
	readonly ttl: number;
}

/** `parseCache` checked where `graphql()` is declared; allocates nothing. */
function cacheSizes(
	parseCache: false | ParseCacheOptions | undefined,
): CacheSizes | false {
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
	return {
		maxBytes: positive(
			'parseCache.maxBytes',
			given.maxBytes ?? DEFAULT_BYTES,
			'maxBytes is the most estimated bytes of documents kept',
		),
		max: positive(
			'parseCache.max',
			given.max ?? 1024,
			'max is the most documents kept',
		),
		ttl: positive(
			'parseCache.ttl',
			given.ttl ?? 3_600_000,
			'ttl is the milliseconds a document is kept',
		),
	};
}

/**
 * The limits `graphql()` was given, checked once at declaration: the token
 * cap, resolved, and the parse cache, which cannot be given beside Yoga's
 * own. Each endpoint's Yoga builds its caches from the same options.
 */
export function resolveLimits(
	maxTokens: number | false | undefined,
	parseCache: false | ParseCacheOptions | undefined,
	yogaOptions: Pick<
		YogaServerOptions<YogaContext, YogaContext>,
		'parserAndValidationCache'
	>,
): number | false {
	const tokens = tokenLimit(maxTokens);
	if (
		parseCache !== undefined &&
		yogaOptions.parserAndValidationCache !== undefined
	) {
		throw new TypeError(
			"graphql(app, { parseCache, parserAndValidationCache }): give one: parseCache sizes alxia's bounded cache, parserAndValidationCache replaces it",
		);
	}
	cacheSizes(parseCache);
	return tokens;
}

/**
 * The `parserAndValidationCache` of one Yoga: a pair of bounded caches,
 * created per call so each endpoint has its own. `false` gives none.
 */
export function parseCaches(
	parseCache: false | ParseCacheOptions | undefined,
): ParseCaches {
	const sizes = cacheSizes(parseCache);
	if (sizes === false) return false;
	const { maxBytes, max, ttl } = sizes;
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
