/**
 * The route hooks in force where a route is declared: what `derive`,
 * `decorate`, `wrap`, `onError`, `onRefusal` and `bodyLimit` add for the
 * routes declared after them, and what each definition carries of them.
 */
import { checkLimit } from '../request/limit';
import type {
	ChainHook,
	ErrorHook,
	RefusalHandler,
	RefusalHook,
	RouteDefinition,
	SocketDefinition,
} from './definition';
import type { RefusalSchema, RouteSchema } from './types';

/** The hooks a route or socket route declared now runs. */
type ScopedHooks = Pick<RouteDefinition, 'derive' | 'onError' | 'refusal'>;

export class Scope {
	#derive: ChainHook[] = [];
	#onError: ErrorHook[] = [];
	#refusal: RefusalHandler | undefined;
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

	/** Sets the `onRefusal` handler in force for the routes declared next. */
	refuseWith(handler: RefusalHandler): void {
		this.#refusal = handler;
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
		copy.#refusal = this.#refusal;
		copy.#bodyLimit = this.#bodyLimit;
		return copy;
	}

	/** The hooks of a route declared now. */
	hooks(): ScopedHooks {
		return {
			derive: [...this.#derive],
			onError: [...this.#onError],
			refusal: this.#refusal,
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
			refusal: definition.refusal ?? this.#refusal,
		};
	}

	/** Takes up the hooks of a plugin, for the routes declared after it. */
	absorb(plugin: Scope): void {
		this.#derive = [...this.#derive, ...plugin.#derive];
		this.#onError = [...plugin.#onError, ...this.#onError];
		this.#refusal = plugin.#refusal ?? this.#refusal;
		this.#bodyLimit = plugin.#bodyLimit ?? this.#bodyLimit;
	}
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
