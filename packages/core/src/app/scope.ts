/**
 * The route hooks in force where a route is declared: what `derive`,
 * `decorate`, `wrap`, `use(...middlewares)`, `onError`, `onRefusal` and
 * `bodyLimit` add for the routes declared after them, and what each
 * definition carries of them.
 */
import type { RefusalKind } from '../errors/errors';
import { checkLimit } from '../request/limit';
import type {
	ChainHook,
	ErrorHook,
	RefusalHandler,
	RouteDefinition,
	SocketDefinition,
} from './definition';
import { behind, byKind, type Refusals, then } from './refusal-handlers';
import { prefixPath, reach, rebase, type ScopePath } from './scope-path';
import type { RouteSchema } from './types';

/**
 * A hook of the chain in force, and the paths it runs on: all, without
 * one. `enclosed`: a group's or a prefixed plugin's, which runs on the
 * requests no route matches under its path, and on no route declared
 * after it.
 */
interface Scoped {
	readonly hook: ChainHook;
	readonly path?: ScopePath | undefined;
	readonly enclosed?: true;
}

/** The hooks a route or socket route declared now runs. */
export type ScopedHooks = Pick<
	RouteDefinition,
	'derive' | 'onError' | 'refusal' | 'refusalByKind'
>;

export class Scope {
	#derive: Scoped[] = [];
	#onError: ErrorHook[] = [];
	#refusals: Refusals = {};
	/** The `bodyLimit` of the routes declared next, unless theirs says otherwise. */
	#bodyLimit: number | undefined;
	/** What `unmatched` built, until a hook is added. */
	#unmatched: ScopedHooks | undefined;
	/** How many hooks of the chain a group's scope took from the app's: the rest are its own. */
	#inherited = 0;

	/**
	 * Adds a `derive`, a `wrap` or a middleware for the routes declared
	 * next: those `path` matches, given one.
	 */
	chain(hook: ChainHook, path?: ScopePath): void {
		this.#derive.push({ hook, path });
		this.#unmatched = undefined;
	}

	/** Adds an `onError` hook for the routes declared next. */
	onError(hook: ErrorHook): void {
		this.#onError.push(hook);
		this.#unmatched = undefined;
	}

	/** Sets the `onRefusal` handler in force for the routes declared next: of any kind, every other one replaced. */
	refuseWith(handler: RefusalHandler): void {
		this.#refusals = { refusal: handler };
		this.#unmatched = undefined;
	}

	/** Sets the `onRefusal(kind, hook)` handler of `kind` for the routes declared next. */
	refuseKindWith(kind: RefusalKind, handler: RefusalHandler): void {
		this.#refusals = then(this.#refusals, {
			refusalByKind: { [kind]: [handler] },
		});
		this.#unmatched = undefined;
	}

	/** Sets the `bodyLimit` of the routes declared next. */
	limit(bytes: number): void {
		this.#bodyLimit = checkLimit(bytes, 'bodyLimit()');
	}

	/** A group's scope: every hook of this one, which the group adds to apart. */
	copy(): Scope {
		const copy = new Scope();
		copy.#derive = [...this.#derive];
		copy.#onError = [...this.#onError];
		copy.#refusals = this.#refusals;
		copy.#bodyLimit = this.#bodyLimit;
		copy.#inherited = this.#derive.length;
		return copy;
	}

	/**
	 * The hooks of a route declared now at `path`, its full path: those in
	 * force that run on it, in the order declared, then its own.
	 */
	hooks(path: string, own: readonly ChainHook[] = []): ScopedHooks {
		return {
			derive: [...this.#chainAt(path), ...own],
			onError: [...this.#onError],
			refusal: this.#refusals.refusal,
			...byKind(this.#refusals.refusalByKind),
		};
	}

	/**
	 * What a request no route matches runs: every hook of the chain, in the
	 * order declared — those declared after the last route included — each
	 * middleware given a path when the request is under it; then the 404,
	 * 405 or 426. Its errors are answered by the `onError` and `onRefusal`
	 * hooks in force at the end. Built once, until a hook is added.
	 */
	unmatched(): ScopedHooks {
		this.#unmatched ??= {
			// A `wrap`, deprecated, keeps 0.3's rule: it never runs on a 404.
			derive: this.#derive
				.filter(({ hook }) => hook.kind !== 'wrap')
				.map(({ hook, path }) =>
					path === undefined ||
					(hook.kind !== 'middleware' && hook.kind !== 'derive')
						? hook
						: { ...hook, when: path },
				),
			onError: [...this.#onError],
			refusal: this.#refusals.refusal,
			...byKind(this.#refusals.refusalByKind),
		};
		return this.#unmatched;
	}

	/**
	 * The `bodyLimit` of a route declared now with `schema`: its own,
	 * checked, else the one in force.
	 */
	bodyLimitOf(schema: RouteSchema, label: string): number | undefined {
		return schema.bodyLimit === undefined
			? this.#bodyLimit
			: checkLimit(schema.bodyLimit, label);
	}

	/**
	 * A plugin's route behind this scope, mounted at `path` under `prefix`:
	 * this scope's `derive` hooks before its own, whose paths move under
	 * `prefix` with it, its `onError` hooks before this scope's, its
	 * `onRefusal` handler unless it has none.
	 */
	behind<Definition extends RouteDefinition | SocketDefinition>(
		definition: Definition,
		path: string,
		prefix: string,
	): Definition {
		const own =
			prefix === ''
				? definition.derive
				: definition.derive.map((hook) =>
						'when' in hook && hook.when !== undefined
							? { ...hook, when: rebase(hook.when, prefix) }
							: hook,
					);
		return {
			...definition,
			path,
			derive: [...this.#chainAt(path), ...own],
			onError: [...definition.onError, ...this.#onError],
			...behind(definition, this.#refusals),
		};
	}

	/**
	 * Takes up the hooks of a plugin mounted under `prefix`, its scoped
	 * middlewares' paths under it as its routes are. A plugin without a
	 * prefix of its own gives its chain to the routes declared after it; one
	 * with `own`, its prefix, keeps it to its routes, as a group does: its
	 * hooks run on the requests no route matches under that prefix alone.
	 */
	absorb(plugin: Scope, prefix: string, own = ''): void {
		const at = own === '' ? undefined : prefixPath(own);
		const taken = plugin.#derive.map(({ hook, path, enclosed }) => {
			const scoped = path ?? at;
			return {
				hook,
				path: scoped === undefined ? undefined : rebase(scoped, prefix),
				...(enclosed || at !== undefined ? { enclosed: true as const } : {}),
			};
		});
		this.#derive = [...this.#derive, ...taken];
		this.#onError = [...plugin.#onError, ...this.#onError];
		this.#refusals = then(this.#refusals, plugin.#refusals);
		this.#bodyLimit = plugin.#bodyLimit ?? this.#bodyLimit;
		this.#unmatched = undefined;
	}

	/**
	 * Takes up the chain a group at `prefix` added to its copy of this
	 * scope, for the requests no route matches under it: the group's routes
	 * have it, and no route declared after the group does.
	 */
	enclose(group: Scope, prefix: string): void {
		const at = prefixPath(prefix);
		for (const { hook, path } of group.#derive.slice(group.#inherited)) {
			if (hook.kind === 'wrap') continue;
			this.#derive.push({ hook, path: path ?? at, enclosed: true });
		}
		this.#unmatched = undefined;
	}

	/**
	 * The chain in force that runs on a route at `path`: a middleware given
	 * a path, if the route always serves requests under it; checked against
	 * each request's path when its parameters or wildcard decide.
	 */
	#chainAt(path: string): ChainHook[] {
		const chain: ChainHook[] = [];
		for (const { hook, path: scoped, enclosed } of this.#derive) {
			if (enclosed) continue;
			if (scoped === undefined || hook.kind !== 'middleware') {
				chain.push(hook);
				continue;
			}
			const reached = reach(scoped, path);
			if (reached === 'always') chain.push(hook);
			else if (reached === 'maybe') chain.push({ ...hook, when: scoped });
		}
		return chain;
	}
}
