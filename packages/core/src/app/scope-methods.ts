/**
 * The types of the route hooks an app declares for the routes after them:
 * `decorate`, `derive`, `wrap`, `bodyLimit` and `onError`. `onRefusal`'s is
 * `RefusalMethod`, in signatures.ts.
 */
import type { AnyReply } from '../reply/reply';
import type { Alxia } from './alxia';
import type {
	BaseContext,
	BodyLimitShortcut,
	Empty,
	MaybePromise,
} from './types';

/** `app.decorate(values)`. */
export interface DecorateMethod<
	Ctx extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
> {
	/** Values every route after this reads from its context: a database, a logger. */
	// biome-ignore lint/style/useShorthandFunctionType: a call signature carries its JSDoc to hover and signature help; a function type does not
	<const Values extends object>(
		values: Values,
	): Alxia<Ctx & Values, Prefix, Shortcuts>;
}

/** `app.derive(hook)`. */
export interface DeriveMethod<
	Ctx extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
> {
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
		Prefix,
		Shortcuts | Extract<Result, AnyReply>
	>;
}

/** `app.wrap(hook)`. */
export interface WrapMethod<
	Ctx extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
> {
	/**
	 * A hook around every route declared after it: `next()` runs the rest —
	 * the hooks declared after this one, validation, the handler — and
	 * resolves to the response. The hook returns it, another `Response`, or
	 * a reply of its own, which is added to the type of every such route.
	 * An error the rest throws reaches it first. A socket's upgrade skips it.
	 *
	 * ```ts
	 * .wrap(async ({ request, reply }, next) =>
	 *   (await locks.tryRun(request, next)) ?? reply(409, { error: 'busy' as const }))
	 * ```
	 *
	 * @deprecated A middleware that awaits `next()`, given to `use`, does
	 * the same; a refusal reaches it thrown, where a `wrap`'s `next()`
	 * resolves to its 400. See the upgrading guide.
	 */
	// biome-ignore lint/style/useShorthandFunctionType: a call signature carries its JSDoc to hover and signature help; a function type does not
	<Result extends AnyReply | Response>(
		hook: (
			ctx: BaseContext & Ctx,
			next: () => Promise<Response>,
		) => MaybePromise<Result>,
	): Alxia<Ctx, Prefix, Shortcuts | Extract<Result, AnyReply>>;
}

/** `app.bodyLimit(bytes)`. */
export interface BodyLimitMethod<
	Ctx extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
> {
	/**
	 * The most bytes the request body of every route declared after it may
	 * hold, unless the route's own `bodyLimit` says otherwise. Inside a
	 * group, only the group's routes. A body past it is refused with a 413
	 * as soon as its `Content-Length` or the bytes counted pass the limit,
	 * which is added to the type of every such route.
	 *
	 * ```ts
	 * alxia()
	 *   .bodyLimit(64 * 1024) // every route below: 64 KiB
	 *   .post('/notes', { body: Note }, handler)
	 *   .post('/upload', { bodyLimit: 25 * 1024 * 1024 }, handler); // its own
	 * ```
	 */
	// biome-ignore lint/style/useShorthandFunctionType: a call signature carries its JSDoc to hover and signature help; a function type does not
	(bytes: number): Alxia<Ctx, Prefix, Shortcuts | BodyLimitShortcut>;
}

/** `app.onError(hook)`. */
export interface ErrorMethod<
	Ctx extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
> {
	/**
	 * A hook that turns an error thrown by a route declared after it into a
	 * reply. Returning nothing lets the next one try; past the last, an
	 * `HttpError` is answered as it says and anything else as a 500.
	 *
	 * @deprecated A middleware given to `use` catches what the rest
	 * throws: `try { return await next() } catch (error) { … }`, returning
	 * a reply or throwing it on. See the upgrading guide.
	 */
	// biome-ignore lint/style/useShorthandFunctionType: a call signature carries its JSDoc to hover and signature help; a function type does not
	<Result extends AnyReply | undefined | void>(
		hook: (
			error: unknown,
			ctx: BaseContext & Partial<Ctx>,
		) => MaybePromise<Result>,
	): Alxia<Ctx, Prefix, Shortcuts | Extract<Result, AnyReply>>;
}
