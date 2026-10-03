/**
 * The `onRefusal` handlers a route is answered by: how a later declaration
 * and a using app layer theirs over a scope's and a plugin's route's, and
 * the handler each form of `onRefusal` declares.
 */
import type { RefusalKind } from '../errors/errors';
import type {
	RefusalHandler,
	RefusalHandlersByKind,
	RefusalHook,
	RouteDefinition,
} from './definition';
import type { RefusalSchema } from './types';

/** The `onRefusal` handlers in force: the general one, and those of each kind. */
export type Refusals = Pick<RouteDefinition, 'refusal' | 'refusalByKind'>;

/** `refusalByKind`, as a definition carries it: only when it holds a handler. */
export function byKind(
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
export function then(earlier: Refusals, later: Refusals): Refusals {
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
export function behind(own: Refusals, app: Refusals): Refusals {
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
export const REFUSAL_KINDS = Object.keys({
	validation: true,
	body_limit: true,
} satisfies Record<RefusalKind, true>) as readonly RefusalKind[];

/** `kind`, checked: a kind of refusal. */
export function refusalKind(kind: unknown): RefusalKind {
	if (!REFUSAL_KINDS.includes(kind as RefusalKind)) {
		throw new TypeError(
			`onRefusal(): ${JSON.stringify(kind)} is no kind of refusal; expected ${REFUSAL_KINDS.map((k) => `'${k}'`).join(' or ')}`,
		);
	}
	return kind as RefusalKind;
}

/** The handler of `onRefusal([kind,] hook)` or `onRefusal([kind,] schema, hook)`. */
export function refusalHandler(
	schemaOrHook:
		| RefusalSchema
		| ((refusal: never, ctx: never) => unknown)
		| undefined,
	maybeHook: ((refusal: never, ctx: never) => unknown) | undefined,
): RefusalHandler {
	if (typeof schemaOrHook === 'function') {
		return { hook: schemaOrHook as RefusalHook };
	}
	if (typeof maybeHook !== 'function') {
		throw new TypeError('onRefusal(): the hook is missing');
	}
	if (schemaOrHook === undefined) return { hook: maybeHook as RefusalHook };
	return {
		hook: maybeHook as RefusalHook,
		response: schemaOrHook.response,
		...(schemaOrHook.contentType === undefined
			? {}
			: { contentType: schemaOrHook.contentType }),
	};
}
