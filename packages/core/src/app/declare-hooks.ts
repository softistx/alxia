/**
 * How each hook enters an app: a route hook into the scope in force for the
 * routes declared next, a global hook into the runtime.
 */
import type { BodyParser } from '../request/read';
import type { AppState } from './app-state';
import type { DeriveHook, ErrorHook, Globals, WrapHook } from './definition';
import { refusalHandler, refusalKind } from './refusal-handlers';
import type { RefusalSchema } from './types';

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
