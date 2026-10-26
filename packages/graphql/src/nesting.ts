/**
 * How deep a document may nest. graphql-js parses by recursion, one set of
 * frames per `{`, `(` or `[`, so a document a few thousand levels deep
 * overflows the stack (a `RangeError`) long before `maxTokens` stops it,
 * and Yoga answers that with a 500. A linear scan of the source counts the
 * nesting first, without recursing.
 */

/** The most levels of `{`, `(` and `[` a document may nest, unless `maxDepth` says otherwise. */
export const DEFAULT_MAX_DEPTH = 1000;

/** `maxDepth` checked where `graphql()` is declared. */
export function depthLimit(
	maxDepth: number | false | undefined,
): number | false {
	if (maxDepth === undefined) return DEFAULT_MAX_DEPTH;
	if (maxDepth === false) return false;
	if (typeof maxDepth === 'number' && Number.isSafeInteger(maxDepth)) {
		if (maxDepth > 0) return maxDepth;
	}
	throw new TypeError(
		`graphql(app, { maxDepth }): maxDepth is the most levels of { ( [ a document may nest, a positive whole number, or false for none; got ${String(maxDepth)}`,
	);
}

const QUOTE = 34; // "
const BACKSLASH = 92;
const HASH = 35; // #
const LF = 10;
const CR = 13;

/**
 * The offset of the first bracket that nests `body` deeper than `max`
 * levels, or -1. Brackets inside strings, block strings and comments are
 * text, not nesting; an unbalanced closing bracket is left to the parser.
 */
export function tooDeepAt(body: string, max: number): number {
	let depth = 0;
	const end = body.length;
	for (let i = 0; i < end; i++) {
		const code = body.charCodeAt(i);
		if (code === 123 || code === 40 || code === 91) {
			// { ( [
			if (++depth > max) return i;
		} else if (code === 125 || code === 41 || code === 93) {
			// } ) ]
			if (depth > 0) depth--;
		} else if (code === HASH) {
			while (i + 1 < end) {
				const next = body.charCodeAt(i + 1);
				if (next === LF || next === CR) break;
				i++;
			}
		} else if (code === QUOTE) {
			if (body.startsWith('"""', i)) {
				i += 3;
				while (i < end) {
					if (body.startsWith('\\"""', i)) i += 4;
					else if (body.startsWith('"""', i)) break;
					else i++;
				}
				i += 2;
			} else {
				i++;
				while (i < end) {
					const inString = body.charCodeAt(i);
					if (inString === BACKSLASH) i += 2;
					else if (inString === QUOTE || inString === LF || inString === CR) {
						break;
					} else i++;
				}
			}
		}
	}
	return -1;
}
