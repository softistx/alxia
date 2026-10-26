/**
 * What `graphql()` bounds about parsing: the tokens a document may hold,
 * and the cache of what was parsed.
 */
import { type DocumentNode, Source, syntaxError } from 'graphql';
import type { Plugin, YogaServerOptions } from 'graphql-yoga';
import {
	boundedCache,
	type Cache,
	documentWeight,
	errorWeight,
} from './document-cache';
import type { YogaContext } from './handler';
import { depthLimit, tooDeepAt } from './nesting';

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

/** A `RangeError` is the stack overflowing, which parsing a nested document can cause. */
const overflowed = (error: unknown): boolean => error instanceof RangeError;

/**
 * A Yoga plugin bounding what the parser is given: the tokens of every
 * document (`maxTokens`) and the levels it nests (`maxDepth`, a scan of the
 * source before any recursion). A document the parser still overflows the
 * stack on is refused the same way, never a 500. It wraps the parse function
 * Envelop already holds, never graphql's own `parse`: a second copy of
 * graphql would throw errors Yoga does not recognise, masked as a 500.
 */
export function limitsParsing(
	maxTokens: number | false,
	maxDepth: number | false,
): Plugin {
	return {
		onParse({ parseFn, setParseFn }) {
			setParseFn((source, options) => {
				const body = typeof source === 'string' ? source : source.body;
				const refuse = (position: number, why: string) =>
					syntaxError(
						typeof source === 'string' ? new Source(source) : source,
						position,
						why,
					);
				if (maxDepth !== false) {
					const at = tooDeepAt(body, maxDepth);
					if (at >= 0) {
						throw refuse(
							at,
							`Document is nested more than ${maxDepth} levels deep. Parsing aborted.`,
						);
					}
				}
				try {
					return parseFn(
						source,
						maxTokens === false ? options : { ...options, maxTokens },
					);
				} catch (error) {
					if (!overflowed(error)) throw error;
					throw refuse(0, 'Document is nested too deeply to parse.');
				}
			});
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
 * cap and the nesting limit, resolved, and the parse cache, which cannot be given beside Yoga's
 * own. Each endpoint's Yoga builds its caches from the same options.
 */
export function resolveLimits(
	maxTokens: number | false | undefined,
	maxDepth: number | false | undefined,
	parseCache: false | ParseCacheOptions | undefined,
	yogaOptions: Pick<
		YogaServerOptions<YogaContext, YogaContext>,
		'parserAndValidationCache'
	>,
): { readonly tokens: number | false; readonly depth: number | false } {
	const tokens = tokenLimit(maxTokens);
	const depth = depthLimit(maxDepth);
	if (
		parseCache !== undefined &&
		yogaOptions.parserAndValidationCache !== undefined
	) {
		throw new TypeError(
			"graphql(app, { parseCache, parserAndValidationCache }): give one: parseCache sizes alxia's bounded cache, parserAndValidationCache replaces it",
		);
	}
	cacheSizes(parseCache);
	return { tokens, depth };
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
