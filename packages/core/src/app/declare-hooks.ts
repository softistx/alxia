/**
 * How each hook enters an app: `decorate`, `derive`, `use` and `bodyLimit`
 * into the scope in force for the routes declared next, the lifecycle
 * hooks and parsers into the runtime.
 */
import type { BodyParser } from '../request/read';
import type { AppState } from './app-state';
import { membersOf, placesOf } from './compose-middlewares';
import type { DeriveHook, Globals } from './definition';
import { uncalledFactory } from './factory';
import { warnLate } from './late-use';
import { scopePath } from './scope-path';
import { builtinOf } from './validate';

/** `app.decorate(values)`: a `derive` hook that returns them. */
export function decorate(state: AppState, values: object): void {
	state.scope.chain({ kind: 'derive', run: () => values });
}

/** `app.derive(hook)`. */
export function derive(state: AppState, hook: DeriveHook): void {
	state.scope.chain({ kind: 'derive', run: hook });
}

/**
 * `app.use(...middlewares)` or `app.use(path, ...middlewares)`: each a
 * `(ctx, next)` function, for the routes declared next — those under
 * `path`, given one — and for every request no route matches. `isApp`
 * tells an app, which is a plugin: `app.plugin(app)`.
 */
export function useMiddlewares(
	state: AppState,
	args: readonly unknown[],
	isApp: (value: unknown) => boolean,
): void {
	const [first, ...rest] = args;
	const scoped = typeof first === 'string';
	const label = scoped ? `use("${first}")` : 'use()';
	const given = scoped ? rest : args;
	const middlewares = membersOf(given);
	if (middlewares.length === 0) {
		throw new TypeError(`${label}: no middleware is given`);
	}
	const places = placesOf(given, 'argument');
	middlewares.forEach((middleware, index) => {
		checkMiddleware(`${label}: ${places[index]}`, middleware, isApp);
	});
	const path = scoped ? scopePath(state.prefix, first) : undefined;
	warnLate(state, label, path);
	for (const middleware of middlewares) {
		state.scope.chain({ kind: 'middleware', run: middleware as never }, path);
	}
}

/** A `(ctx, next)` function: not an app, nor a `validate` or a `responds`. */
function checkMiddleware(
	at: string,
	middleware: unknown,
	isApp: (value: unknown) => boolean,
): void {
	if (isApp(middleware)) {
		throw new TypeError(
			`${at} is an app: a plugin is given to app.plugin(), use() takes middlewares`,
		);
	}
	if (typeof middleware !== 'function') {
		throw new TypeError(
			`${at} is not a function: a middleware is (ctx, next) => …`,
		);
	}
	const uncalled = uncalledFactory(middleware, at, 'use');
	if (uncalled !== undefined) throw new TypeError(uncalled);
	if (builtinOf(middleware) !== undefined) {
		throw new TypeError(
			`${at} is a validate() or responds(), which belongs to a route`,
		);
	}
}

/** `app.bodyLimit(bytes)`. */
export function bodyLimit(state: AppState, bytes: number): void {
	state.scope.limit(bytes);
}

/** `app.onStart(hook)` or `app.onStop(hook)`: a lifecycle hook, in the order declared. */
export function lifecycleHook<Name extends 'onStart' | 'onStop'>(name: Name) {
	return (state: AppState, hook: Globals[Name][number]): void => {
		(state.runtime.globals[name] as Globals[Name][number][]).push(hook);
	};
}

export const onStart = lifecycleHook('onStart');
export const onStop = lifecycleHook('onStop');

/** `app.parser(type, parse)`: a body parser, before the built-in ones. */
export function parser(
	state: AppState,
	type: string | RegExp,
	parse: BodyParser['parse'],
): void {
	state.runtime.globals.parsers.push({ type, parse });
}
