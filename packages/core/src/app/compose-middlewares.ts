/**
 * `compose(...middlewares)`: several middlewares given as one — past the
 * 8 a call types, or to name a group of them once. Spliced into the chain
 * where it is given, so a request runs its members as if each were
 * written there.
 */
import type { Composable, Composed } from './types/composed';

/** Where a composed middleware keeps its members, shared by every copy of core. */
const COMPOSED: unique symbol = Symbol.for('alxia.composed');

/**
 * One middleware standing for `middlewares`, run in the order given,
 * each reading what the ones before it added; given to a route, `use` or
 * `ws` where a middleware stands, and to another `compose`. Typed for any
 * number of them: what its members read is checked against the context
 * where it is given, what they add is passed on.
 *
 * ```ts
 * const guarded = compose(session, csrf, auth, audit);
 * app.post('/orders', guarded, validate({ body: Order }), ({ user, body, reply }) => …);
 * ```
 *
 * A member written inline reads the base context: one that reads what
 * another adds is a `defineMiddleware<Requires>()`.
 */
export function compose<const Middlewares extends readonly Composable[]>(
	...middlewares: Middlewares
): Composed<Middlewares> {
	if (middlewares.length === 0) {
		throw new TypeError('compose(): no middleware is given');
	}
	middlewares.forEach((middleware, index) => {
		if (typeof middleware !== 'function') {
			throw new TypeError(
				`compose(): argument ${index + 1} is not a function: a middleware is (ctx, next) => …`,
			);
		}
	});
	const composed = () => {
		throw new TypeError(
			"compose() runs among a route's middlewares or in use(), not called on its own",
		);
	};
	const members = middlewares.flatMap((middleware) => membersOf([middleware]));
	return Object.defineProperty(composed, COMPOSED, {
		value: members,
	}) as never;
}

/** `middlewares`, each `compose(...)` among them replaced by its members, in order. */
export function membersOf(middlewares: readonly unknown[]): unknown[] {
	return middlewares.flatMap(
		(middleware) =>
			(middleware as { [COMPOSED]?: readonly unknown[] } | null | undefined)?.[
				COMPOSED
			] ?? [middleware],
	);
}
