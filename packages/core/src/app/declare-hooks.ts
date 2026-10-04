/**
 * How each hook enters an app: a route hook into the scope in force for the
 * routes declared next, a global hook into the runtime.
 */
import type { BodyParser } from '../request/read';
import type { AppState } from './app-state';
import { isMiddleware } from './define-middleware';
import type { DeriveHook, ErrorHook, Globals, WrapHook } from './definition';
import { refusalHandler, refusalKind } from './refusal-handlers';
import { scopePath } from './scope-path';
import type { RefusalSchema } from './types';
import { builtinOf } from './validate';

type AnyRefusalHook = (refusal: never, ctx: never) => unknown;

/** `app.decorate(values)`: a `derive` hook that returns them. */
export function decorate(state: AppState, values: object): void {
	state.scope.chain({ kind: 'derive', run: () => values });
}

/** `app.derive(hook)`. */
export function derive(state: AppState, hook: DeriveHook): void {
	state.scope.chain({ kind: 'derive', run: hook });
}

/** `app.wrap(hook)`. */
export function wrap(state: AppState, hook: WrapHook): void {
	state.scope.chain({ kind: 'wrap', run: hook });
}

/**
 * `app.use(...middlewares)` or `app.use(path, ...middlewares)`, when its
 * arguments are these: each a middleware `defineMiddleware` made, for the
 * routes declared next — those under `path`, given one. Whether they
 * were: anything else is a plugin, which `use` takes alone.
 */
export function useMiddlewares(
	state: AppState,
	args: readonly unknown[],
): boolean {
	const [first, ...rest] = args;
	const scoped = typeof first === 'string';
	if (!scoped && !isMiddleware(first) && builtinOf(first) === undefined) {
		return false;
	}
	const label = scoped ? `use("${first}")` : 'use()';
	const middlewares = scoped ? rest : args;
	if (middlewares.length === 0) {
		throw new TypeError(`${label}: no middleware is given`);
	}
	middlewares.forEach((middleware, index) => {
		if (builtinOf(middleware) !== undefined) {
			throw new TypeError(
				`${label}: middleware ${index + 1} is a validate() or responds(), which belongs to a route`,
			);
		}
		if (!isMiddleware(middleware)) {
			throw new TypeError(
				`${label}: middleware ${index + 1} was not made by defineMiddleware()`,
			);
		}
	});
	const path = scoped ? scopePath(state.prefix, first) : undefined;
	for (const middleware of middlewares) {
		state.scope.chain({ kind: 'middleware', run: middleware as never }, path);
	}
	return true;
}

/** `app.bodyLimit(bytes)`. */
export function bodyLimit(state: AppState, bytes: number): void {
	state.scope.limit(bytes);
}

/** `app.onError(hook)`. */
export function onError(state: AppState, hook: ErrorHook): void {
	state.scope.onError(hook);
}

/** `app.onRefusal(kind?, schema?, hook)`: for one kind when given one first. */
export function onRefusal(
	state: AppState,
	first: unknown,
	second?: RefusalSchema | AnyRefusalHook,
	third?: AnyRefusalHook,
): void {
	if (typeof first === 'string') {
		state.scope.refuseKindWith(
			refusalKind(first),
			refusalHandler(second, third),
		);
	} else {
		state.scope.refuseWith(
			refusalHandler(
				first as RefusalSchema | undefined,
				second as AnyRefusalHook | undefined,
			),
		);
	}
}

/** The global hooks a hook method adds to, by name. */
type GlobalHooks = Exclude<keyof Globals, 'pages' | 'parsers'>;

/** `app.onRequest(hook)`, `app.around(hook)`, …: a global hook, in the order declared. */
export function globalHook<Name extends GlobalHooks>(name: Name) {
	return (state: AppState, hook: Globals[Name][number]): void => {
		(state.runtime.globals[name] as Globals[Name][number][]).push(hook);
	};
}

/** `app.parser(type, parse)`: a body parser, before the built-in ones. */
export function parser(
	state: AppState,
	type: string | RegExp,
	parse: BodyParser['parse'],
): void {
	state.runtime.globals.parsers.push({ type, parse });
}
