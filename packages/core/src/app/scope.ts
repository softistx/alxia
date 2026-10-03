/**
 * The route hooks in force where a route is declared: what `derive`,
 * `decorate`, `wrap`, `onError`, `onRefusal` and `bodyLimit` add for the
 * routes declared after them, and what each definition carries of them.
 */
import type { RefusalKind } from '../errors/errors';
import { checkLimit } from '../request/limit';
import type {
	ChainHook,
	ErrorHook,
	RefusalHandler,
	RefusalHandlersByKind,
	RefusalHook,
	RouteDefinition,
	SocketDefinition,
} from './definition';
import type { RefusalSchema, RouteSchema } from './types';

/** The hooks a route or socket route declared now runs. */
type ScopedHooks = Pick<
	RouteDefinition,
	'derive' | 'onError' | 'refusal' | 'refusalByKind'
>;

/** The `onRefusal` handlers in force: the general one, and those of each kind. */
type Refusals = Pick<RouteDefinition, 'refusal' | 'refusalByKind'>;

export class Scope {
	#derive: ChainHook[] = [];
	#onError: ErrorHook[] = [];
	#refusals: Refusals = {};
	/** The `bodyLimit` of the routes declared next, unless theirs says otherwise. */
	#bodyLimit: number | undefined;

	/** Adds a `derive` or `wrap` hook for the routes declared next. */
	chain(hook: ChainHook): void {
		this.#derive.push(hook);
	}

	/** Adds an `onError` hook for the routes declared next. */
	onError(hook: ErrorHook): void {
		this.#onError.push(hook);
	}

	/** Sets the `onRefusal` handler in force for the routes declared next: of any kind, every other one replaced. */
	refuseWith(handler: RefusalHandler): void {
		this.#refusals = { refusal: handler };
	}

	/** Sets the `onRefusal(kind, hook)` handler of `kind` for the routes declared next. */
	refuseKindWith(kind: RefusalKind, handler: RefusalHandler): void {
		this.#refusals = then(this.#refusals, {
			refusalByKind: { [kind]: [handler] },
		});
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
		return copy;
	}

	/** The hooks of a route declared now. */
	hooks(): ScopedHooks {
		return {
			derive: [...this.#derive],
			onError: [...this.#onError],
			refusal: this.#refusals.refusal,
			...byKind(this.#refusals.refusalByKind),
		};
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
	 * A plugin's route behind this scope: this scope's `derive` hooks before
	 * its own, its `onError` hooks before this scope's, its `onRefusal`
	 * handler unless it has none.
	 */
	behind<Definition extends RouteDefinition | SocketDefinition>(
		definition: Definition,
		path: string,
	): Definition {
		return {
			...definition,
			path,
			derive: [...this.#derive, ...definition.derive],
			onError: [...definition.onError, ...this.#onError],
			...behind(definition, this.#refusals),
		};
	}

	/** Takes up the hooks of a plugin, for the routes declared after it. */
	absorb(plugin: Scope): void {
		this.#derive = [...this.#derive, ...plugin.#derive];
		this.#onError = [...plugin.#onError, ...this.#onError];
		this.#refusals = then(this.#refusals, plugin.#refusals);
		this.#bodyLimit = plugin.#bodyLimit ?? this.#bodyLimit;
	}
}

/** `refusalByKind`, as a definition carries it: only when it holds a handler. */
function byKind(
	handlers: RefusalHandlersByKind | undefined,
): Pick<Refusals, 'refusalByKind'> {
	return handlers === undefined || Object.keys(handlers).length === 0
		? {}
		: { refusalByKind: handlers };
}

/**
 * `earlier`'s handlers, then `later`'s in the same scope: a general one
 * replaces every one of `earlier`, one of a kind that kind's alone.
 */
function then(earlier: Refusals, later: Refusals): Refusals {
	if (later.refusal !== undefined) return later;
	return {
		refusal: earlier.refusal,
		...byKind({ ...earlier.refusalByKind, ...later.refusalByKind }),
	};
}

/**
 * A plugin's route's handlers, `own`, in front of the using app's: with a
 * general one, the route's own answer every refusal; without, the app's
 * answer each kind after the route's own of that kind, as its type says.
 */
function behind(own: Refusals, app: Refusals): Refusals {
	if (own.refusal !== undefined) {
		return { refusal: own.refusal, ...byKind(own.refusalByKind) };
	}
	const handlers: { [Kind in RefusalKind]?: readonly RefusalHandler[] } = {};
	for (const kind of REFUSAL_KINDS) {
		const listed = [
			...(own.refusalByKind?.[kind] ?? []),
			...(app.refusalByKind?.[kind] ?? []),
		];
		if (listed.length > 0) handlers[kind] = listed;
	}
	return { refusal: app.refusal, ...byKind(handlers) };
}

/** Every kind of refusal, which `onRefusal(kind, hook)` accepts. */
export const REFUSAL_KINDS: readonly RefusalKind[] = [
	'validation',
	'body_limit',
];

/** `kind`, checked: a kind of refusal. */
export function refusalKind(kind: unknown): RefusalKind {
	if (!REFUSAL_KINDS.includes(kind as RefusalKind)) {
		throw new TypeError(
			`onRefusal(): ${JSON.stringify(kind)} is no kind of refusal; expected ${REFUSAL_KINDS.map((k) => `'${k}'`).join(' or ')}`,
		);
	}
	return kind as RefusalKind;
}

/** The handler of `onRefusal(hook)` or `onRefusal(schema, hook)`. */
export function refusalHandler(
	schemaOrHook: RefusalSchema | ((refusal: never, ctx: never) => unknown),
	maybeHook: ((refusal: never, ctx: never) => unknown) | undefined,
): RefusalHandler {
	if (typeof schemaOrHook === 'function') {
		return { hook: schemaOrHook as RefusalHook };
	}
	if (typeof maybeHook !== 'function') {
		throw new TypeError('onRefusal(): the hook is missing');
	}
	return {
		hook: maybeHook as RefusalHook,
		response: schemaOrHook.response,
		...(schemaOrHook.contentType === undefined
			? {}
			: { contentType: schemaOrHook.contentType }),
	};
}
