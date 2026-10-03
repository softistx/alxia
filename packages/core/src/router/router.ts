/**
 * The paths an app declares, and the one a request reaches. `app.listen`
 * hands the same paths to `Bun.serve`'s own router instead, and comes back
 * here only for what it leaves unmatched; `match` ranks as Bun does.
 */

import {
	type CompiledPath,
	compareRanks,
	compilePath,
	matchPath,
	matchStrictly,
} from './compile';

interface Entry<Value> {
	readonly compiled: CompiledPath;
	readonly methods: Map<string, Value>;
}

type Found<Value> = [Entry<Value>, Record<string, string>];

/** What `match` found: the route, or the methods its path allows instead. */
export type Match<Value> =
	| {
			readonly path: string;
			readonly value: Value;
			readonly params: Record<string, string>;
	  }
	| { readonly path: string; readonly allowed: readonly string[] };

export class Router<Value> {
	readonly #paths = new Map<string, Entry<Value>>();
	readonly #shapes = new Map<string, string>();
	/** The paths with parameters, in Bun's order; rebuilt after an `add`. */
	#ranked: Entry<Value>[] | undefined;
	/** The paths given to `match` as `served`, compiled once. */
	readonly #served = new Map<string, CompiledPath>();

	add(method: string, path: string, value: Value): void {
		const compiled = compilePath(path);
		const existing = this.#shapes.get(compiled.shape);
		if (existing !== undefined && existing !== path) {
			throw new TypeError(
				`"${path}" has the shape of "${existing}" with other parameter names. ` +
					'Use the same names: the two would match the same requests.',
			);
		}
		this.#shapes.set(compiled.shape, path);
		let entry = this.#paths.get(path);
		if (entry === undefined) {
			entry = { compiled, methods: new Map() };
			this.#paths.set(path, entry);
			this.#ranked = undefined;
		}
		if (entry.methods.has(method)) {
			throw new TypeError(`${method} ${path} is declared twice`);
		}
		entry.methods.set(method, value);
	}

	/** The paths declared, each with its methods. */
	paths(): IterableIterator<[string, ReadonlyMap<string, Value>]> {
		const entries = this.#paths.entries();
		return (function* () {
			for (const [path, entry] of entries) yield [path, entry.methods];
		})();
	}

	/** Whether a path of the same shape as `path` is declared: one matching the same requests. */
	hasShape(path: string): boolean {
		return this.#shapes.has(compilePath(path).shape);
	}

	/** The methods declared at `path`, exactly as it was declared. */
	methodsAt(path: string): ReadonlyMap<string, Value> | undefined {
		return this.#paths.get(path)?.methods;
	}

	paramsAt(path: string, pathname: string): Record<string, string> {
		const entry = this.#paths.get(path);
		return (entry && matchPath(entry.compiled, pathname)) ?? {};
	}

	/**
	 * The route `pathname` reaches by `method`; the methods its path allows
	 * when that path has no route for `method`; nothing when it reaches no
	 * path. The path is the one `Bun.serve` would choose under `listen`:
	 * segment by segment, a literal wins over a parameter, which wins over a
	 * wildcard, whatever the order of declaration. So `/api/*` wins over
	 * `/*`, and `/users/me` over `/users/:id`, even for a method only
	 * `/users/:id` has: `Bun.serve` picks the path before the method.
	 *
	 * `served` are paths `Bun.serve` answers itself, the app's pages: when
	 * one of them ranks first, nothing matches, as `fetch` cannot serve it.
	 *
	 * Where no path matches as Bun's does, one matching but for a trailing
	 * slash — `/users/` for `/users`, `/files` for `/files/*` — is taken, in
	 * the same order: what `listen`'s fallback answers too.
	 */
	match(
		method: string,
		pathname: string,
		served?: Iterable<string>,
	): Match<Value> | undefined {
		let found = this.#strictly(pathname);
		if (served !== undefined && this.#servedFirst(pathname, found, served)) {
			return undefined;
		}
		found ??= this.#forgivingly(pathname);
		if (found === undefined) return undefined;
		const [entry, params] = found;
		const path = entry.compiled.path;
		const value = entry.methods.get(method);
		if (value !== undefined) return { path, value, params };
		return { path, allowed: [...entry.methods.keys()] };
	}

	/** The path Bun's router chooses for `pathname`. */
	#strictly(pathname: string): Found<Value> | undefined {
		// A path without parameters ranks before any other that matches.
		const exact = this.#paths.get(pathname);
		if (exact !== undefined && exact.compiled.pattern === undefined) {
			return [exact, {}];
		}
		return this.#first(pathname, matchStrictly);
	}

	/** The path `pathname` reaches but for a trailing slash, in the same order. */
	#forgivingly(pathname: string): Found<Value> | undefined {
		if (pathname.length > 1 && pathname.endsWith('/')) {
			const exact = this.#paths.get(pathname.slice(0, -1));
			if (exact !== undefined && exact.compiled.pattern === undefined) {
				return [exact, {}];
			}
		}
		return this.#first(pathname, matchPath);
	}

	/** The first path with parameters `matches` accepts, in Bun's order. */
	#first(
		pathname: string,
		matches: (
			compiled: CompiledPath,
			pathname: string,
		) => Record<string, string> | undefined,
	): Found<Value> | undefined {
		this.#ranked ??= [...this.#paths.values()]
			.filter((entry) => entry.compiled.pattern !== undefined)
			.sort((a, b) => compareRanks(a.compiled, b.compiled));
		for (const entry of this.#ranked) {
			const params = matches(entry.compiled, pathname);
			if (params !== undefined) return [entry, params];
		}
		return undefined;
	}

	/** Whether one of `served` matches `pathname` and ranks before `found`. */
	#servedFirst(
		pathname: string,
		found: Found<Value> | undefined,
		served: Iterable<string>,
	): boolean {
		for (const path of served) {
			let compiled = this.#served.get(path);
			if (compiled === undefined) {
				compiled = compilePath(path);
				this.#served.set(path, compiled);
			}
			if (
				matchStrictly(compiled, pathname) !== undefined &&
				(found === undefined || compareRanks(compiled, found[0].compiled) < 0)
			) {
				return true;
			}
		}
		return false;
	}
}
