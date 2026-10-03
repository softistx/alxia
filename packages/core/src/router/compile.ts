/**
 * A route path compiled into what matches it, and its rank in
 * `Bun.serve`'s router: segment by segment, a literal before a parameter
 * before a wildcard, with a trailing slash a segment of its own. A path
 * matches strictly, as Bun's router matches it, or forgivingly, a trailing
 * slash more or a wildcard's `/` less, as `listen`'s fallback does.
 *
 * A path is refused where `Bun.serve` would throw at `listen`, or would
 * read it otherwise than `fetch` does: a `:` or a `*` inside a segment, a
 * dot segment, or a literal a request's URL carries otherwise, such as
 * `/é` for `/%C3%A9`. Bun compares a literal with the request's target as
 * it came, and `fetch` with its URL's pathname: a literal in the form the
 * URL gives matches the same requests in both.
 */

/** A segment's rank in Bun's router: lower wins. */
const LITERAL = 0;
const PARAMETER = 1;
const WILDCARD = 2;

export interface CompiledPath {
	readonly path: string;
	/** The path with every parameter name erased: two paths with one shape collide. */
	readonly shape: string;
	readonly names: readonly string[];
	/** What matches it forgivingly: a trailing slash more, or a wildcard's `/` less. */
	readonly pattern: RegExp | undefined;
	/** What matches it as `Bun.serve` does: segment for segment. */
	readonly strict: RegExp | undefined;
	/** The rank of each segment, `LITERAL`, `PARAMETER` or `WILDCARD`. */
	readonly ranks: readonly number[];
}

export function compilePath(path: string): CompiledPath {
	if (!path.startsWith('/')) {
		throw new TypeError(`The route path "${path}" must start with "/"`);
	}
	const names: string[] = [];
	const segments = path.split('/').slice(1);
	const ranks: number[] = [];
	let source = '';
	let strict = '';
	let shape = '';
	// The path as a request's URL carries it, and whether `path` differs.
	let carriedPath = '';
	let uncarried = false;
	segments.forEach((segment, index) => {
		if (segment === '*') {
			if (index !== segments.length - 1) {
				throw new TypeError(`"${path}": "*" may only end a path`);
			}
			names.push('*');
			ranks.push(WILDCARD);
			source += '(?:/(.*))?';
			strict += '/(.*)';
			shape += '/*';
			carriedPath += '/*';
		} else if (segment.startsWith(':')) {
			const name = segment.slice(1);
			if (!/^[A-Za-z_$][\w$]*$/.test(name)) {
				throw new TypeError(`"${path}": ":${name}" is not a parameter name`);
			}
			if (names.includes(name)) {
				throw new TypeError(`"${path}" declares ":${name}" twice`);
			}
			names.push(name);
			ranks.push(PARAMETER);
			source += '/([^/]+)';
			strict += '/([^/]+)';
			shape += '/:';
			carriedPath += `/${segment}`;
		} else {
			const carried = carriedOf(path, segment);
			if (carried !== segment) uncarried = true;
			carriedPath += `/${carried}`;
			const literal = `/${segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
			ranks.push(LITERAL);
			source += literal;
			strict += literal;
			shape += `/${segment}`;
		}
	});
	const fixed = names.length === 0;
	if (uncarried) {
		throw new TypeError(
			`"${path}" is not encoded as a request's URL carries it: declare "${carriedPath}"`,
		);
	}
	return {
		path,
		shape,
		names,
		pattern: fixed ? undefined : new RegExp(`^${source}/?$`),
		strict: fixed ? undefined : new RegExp(`^${strict}$`),
		ranks,
	};
}

/**
 * `segment`, a literal of `path`, as a request's URL carries it: what the
 * URL percent-encodes — non-ASCII, spaces, `"`, `{` and the like — encoded
 * as it encodes them. Throws for a literal `Bun.serve`'s router reads as
 * something else, and for a dot segment, which no URL keeps.
 */
function carriedOf(path: string, segment: string): string {
	if (segment.includes(':')) {
		throw new TypeError(
			`"${path}": ":" may only start a segment, as a parameter`,
		);
	}
	if (segment.includes('*')) {
		throw new TypeError(
			`"${path}": "*" may only be a whole segment, as a wildcard`,
		);
	}
	// What a URL would cut (`?`, `#`), strip (tabs, newlines) or read as a
	// `/` (`\`) is encoded first, so that only its own encoding is left.
	let escaped = '';
	for (const character of segment) {
		const code = character.charCodeAt(0);
		escaped +=
			code <= 0x20 || code === 0x7f || '?#\\'.includes(character)
				? `%${code.toString(16).toUpperCase().padStart(2, '0')}`
				: character;
	}
	const carried = new URL(`http://x/${escaped}/`).pathname;
	if (carried === '/') {
		throw new TypeError(
			`"${path}": "${segment}" is a dot segment, which a request's URL never keeps`,
		);
	}
	return carried.slice(1, -1);
}

/**
 * Below zero when `a` ranks before `b` in Bun's router: the first segment
 * where their ranks differ decides, and a shorter path goes first when one
 * is the other's start. Two paths that both match one request always
 * differ somewhere, since the router refuses two of one shape.
 */
export function compareRanks(a: CompiledPath, b: CompiledPath): number {
	const length = Math.min(a.ranks.length, b.ranks.length);
	for (let index = 0; index < length; index++) {
		const difference = (a.ranks[index] as number) - (b.ranks[index] as number);
		if (difference !== 0) return difference;
	}
	return a.ranks.length - b.ranks.length;
}

/** The parameters `pathname` gives `compiled`, or `undefined` if it does not match it. */
export function matchPath(
	compiled: CompiledPath,
	pathname: string,
): Record<string, string> | undefined {
	if (compiled.pattern === undefined) {
		return pathname === compiled.path ||
			(pathname.length > 1 && pathname === `${compiled.path}/`)
			? {}
			: undefined;
	}
	return paramsOf(compiled, compiled.pattern.exec(pathname));
}

/** The parameters `pathname` gives `compiled` when it matches as `Bun.serve` matches it. */
export function matchStrictly(
	compiled: CompiledPath,
	pathname: string,
): Record<string, string> | undefined {
	if (compiled.strict === undefined) {
		return pathname === compiled.path ? {} : undefined;
	}
	return paramsOf(compiled, compiled.strict.exec(pathname));
}

function paramsOf(
	compiled: CompiledPath,
	match: RegExpExecArray | null,
): Record<string, string> | undefined {
	if (match === null) return undefined;
	const params: Record<string, string> = {};
	for (let index = 0; index < compiled.names.length; index++) {
		const raw = match[index + 1] ?? '';
		let value: string;
		try {
			value = decodeURIComponent(raw);
		} catch {
			value = raw;
		}
		params[compiled.names[index] as string] = value;
	}
	return params;
}
