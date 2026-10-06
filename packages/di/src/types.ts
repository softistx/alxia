import type {
	BaseContext,
	Empty,
	Middleware,
	MiddlewareContext,
	Next,
	Plugin,
} from '@alxia/core';
import type { AnyToken, Scope, ScopeResolvable, TokenValue } from '@nxgt/di';

/** What `di` adds to the context: the request's Scope. */
export interface ScopeContext<Singletons, Scoped> {
	/** The request's Scope, created on its first `resolve`. */
	readonly scope: Scope<Singletons, Scoped>;
}

/**
 * Computes a request's Slot values from its context. `Reads` is what it
 * reads beyond the base context, from its annotated parameter: the `user`
 * an earlier middleware adds, which every `use` of the middleware is then
 * checked for.
 */
export type SlotsFn<Slots, Reads> = (
	ctx: MiddlewareContext<Reads>,
) => Readonly<Slots> | PromiseLike<Readonly<Slots>>;

/** What every `di` call takes, Slots or not. */
interface CommonOptions {
	/**
	 * Called when disposing of a request's Scope fails, after its response
	 * is decided: the error never replaces the response, nor the error the
	 * route threw. Defaults to `console.error`. What it throws is ignored.
	 */
	readonly onDisposeError?: (error: unknown, ctx: BaseContext) => void;
}

/**
 * `di`'s options. `slots` is required exactly when the Container has Slots,
 * and refused when it has none.
 */
export type DiOptions<Slots, Reads = Empty> = [keyof Slots] extends [never]
	? CommonOptions & { readonly slots?: never }
	: CommonOptions & {
			/**
			 * The request's Slot values. Called once, on the Scope's first
			 * `resolve`: never on a request that resolves nothing.
			 */
			readonly slots: SlotsFn<Slots, Reads>;
		};

/** `di`'s parameters: the options are optional when there is no Slot. */
export type DiArgs<Slots, Reads> = [keyof Slots] extends [never]
	? [options?: DiOptions<Slots, Reads>]
	: [options: DiOptions<Slots, Reads>];

/** A key `expose` may not set: the Scope's own, or the base context's. */
type Reserved = 'scope' | keyof BaseContext;

/**
 * `unknown` when `expose` may take `Tokens`, else a refusal: every Token
 * one a Scope of the Container resolves, and no key the context already
 * holds (`scope`, `reply`, `request`...).
 */
export type Exposable<Tokens, Singletons, Scoped> = {
	[K in keyof Tokens]: K extends Reserved
		? {
				readonly [M in `'${K & string}' is a key of the context: expose under another name`]: never;
			}
		: ScopeResolvable<Tokens[K], Singletons, Scoped>;
};

/** What `expose(tokens)` adds to the context: each key, typed by its Token. */
export type Exposed<Tokens> = {
	readonly [K in keyof Tokens]: TokenValue<Tokens[K]>;
};

/**
 * The middleware `di` makes: given to `use`, it adds `scope` to the context
 * of what follows. `expose` builds the middleware that resolves Tokens in
 * it, and `lifecycle` the plugin that disposes of the Container when the
 * last app serving it stops.
 */
export type DiMiddleware<Singletons, Scoped, Reads = Empty> = Middleware<
	Reads,
	Promise<Next<ScopeContext<Singletons, Scoped>>>
> & {
	/**
	 * A middleware that resolves each Token in the request's Scope and adds
	 * it to the context under its key. It stands after this `di`: one with
	 * no `scope` in its context fails to compile.
	 */
	expose<const Tokens extends Readonly<Record<string, AnyToken>>>(
		tokens: Tokens & Exposable<Tokens, Singletons, Scoped>,
	): Middleware<
		ScopeContext<Singletons, Scoped>,
		Promise<Next<Exposed<Tokens>>>
	>;

	/**
	 * A plugin: `app.plugin(deps.lifecycle)`. Disposes of the Container when
	 * the last app it was given to that started stops, so forks of one base
	 * share it safely. Without it, the Container is the application's to
	 * dispose of.
	 */
	readonly lifecycle: Plugin;
};

/**
 * What `di` returns when `slots` reads its context as `any`: not a
 * middleware, so `use` refuses it. `any` would let it stand where what it
 * reads is not given.
 */
export interface SlotsReadAny {
	readonly '~any': 'slots reads its context as any: annotate what it reads, or leave it unannotated';
}

/** What `di` returns: its middleware, unless `slots` reads `any`. */
export type DiReturn<Singletons, Scoped, Reads> = 0 extends 1 & Reads
	? SlotsReadAny
	: DiMiddleware<Singletons, Scoped, Reads>;
