/**
 * The types of what an app declares for the routes after it: `decorate`,
 * `derive` and `bodyLimit`.
 */
import type { AnyReply } from '../reply/reply';
import type { Alxia } from './alxia';
import type { BaseContext, Empty, MaybePromise } from './types';

/** `app.decorate(values)`. */
export interface DecorateMethod<Ctx extends object, Prefix extends string> {
	/** Values every route after this reads from its context: a database, a logger. */
	// biome-ignore lint/style/useShorthandFunctionType: a call signature carries its JSDoc to hover and signature help; a function type does not
	<const Values extends object>(values: Values): Alxia<Ctx & Values, Prefix>;
}

/** `app.derive(hook)`. */
export interface DeriveMethod<Ctx extends object, Prefix extends string> {
	/**
	 * A hook run on every request to a route declared after it, before the
	 * request is validated. What it returns is added to the context; a reply
	 * it returns ends the request:
	 *
	 * ```ts
	 * .derive(async ({ request, reply }) => {
	 *   const user = await authenticate(request);
	 *   return user ? { user } : reply(401, { error: 'unauthenticated' as const });
	 * })
	 * ```
	 */
	// biome-ignore lint/style/useShorthandFunctionType: a call signature carries its JSDoc to hover and signature help; a function type does not
	<Result>(
		hook: (ctx: BaseContext & Ctx) => MaybePromise<Result>,
	): Alxia<
		Ctx &
			(Exclude<Result, AnyReply> extends infer Added extends object
				? Added
				: Empty),
		Prefix
	>;
}

/** `app.bodyLimit(bytes)`. */
export interface BodyLimitMethod<Ctx extends object, Prefix extends string> {
	/**
	 * The most bytes the request body of every route declared after it may
	 * hold, unless the route's own `bodyLimit` says otherwise. Inside a
	 * group, only the group's routes. A body past it is refused with a 413
	 * as soon as its `Content-Length` or the bytes counted pass the limit: a
	 * `ContentTooLargeError`, which a middleware before the read may answer.
	 *
	 * ```ts
	 * alxia()
	 *   .bodyLimit(64 * 1024) // every route below: 64 KiB
	 *   .post('/notes', validate({ body: Note }), handler)
	 *   .post('/upload', { bodyLimit: 25 * 1024 * 1024 }, handler); // its own
	 * ```
	 */
	// biome-ignore lint/style/useShorthandFunctionType: a call signature carries its JSDoc to hover and signature help; a function type does not
	(bytes: number): Alxia<Ctx, Prefix>;
}
