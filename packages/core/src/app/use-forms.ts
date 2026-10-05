/**
 * The middleware forms of `use`: `app.use(...middlewares)`, up to 8, each
 * reading what the ones before it added, for every route declared after
 * it; and `app.use(path, ...middlewares)`, for the routes under `path`,
 * which may add nothing to the context.
 */
import type { AnyReply } from '../reply/reply';
import type { PathAt, RoutePath } from '../types/path';
import type { Alxia } from './alxia';
import type { FormSlots } from './forms';
import type { Ladder } from './ladder';
import type { AppTypes } from './route-forms';
import type {
	AddedOf,
	BaseContext,
	MadeByDefineMiddleware,
	MiddlewareReturn,
	NextFunction,
	ThreadContext,
} from './types';

/**
 * A middleware `use` takes, after the ones that returned `Before`: made by
 * `defineMiddleware`, it reads the context they built on `Ctx`.
 */
export type ScopeMiddleware<
	Ctx extends object,
	Before extends readonly unknown[],
	Result,
> = ((
	ctx: BaseContext & ThreadContext<Ctx, Before>,
	next: NextFunction,
) => Result) &
	MadeByDefineMiddleware;

/** The app after `use` took the middlewares that returned `Results`. */
export type AppAfterUse<
	Ctx extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
	Results extends readonly unknown[],
> = Alxia<
	ThreadContext<Ctx, Results>,
	Prefix,
	Shortcuts | Extract<Awaited<Results[number]>, AnyReply>
>;

/**
 * Each middleware of `Middlewares` when it adds nothing to the context, as
 * `use(path, …)` requires; else why not, as `Invalid middleware: …`,
 * which it is not assignable to.
 */
export type AddingNothing<Middlewares extends readonly unknown[]> = {
	readonly [Index in keyof Middlewares]: Middlewares[Index] extends (
		...args: never[]
	) => infer Result
		? [keyof AddedOf<Result>] extends [never]
			? Middlewares[Index]
			: `Invalid middleware: a middleware given a path may add nothing to the context, and this one passes "${Extract<keyof AddedOf<Result>, string>}" to next(): give it to the routes of a group instead, app.group(path, (group) => group.use(middleware))`
		: Middlewares[Index];
};

/**
 * `Path` when `use` may be given it under `Prefix`: a route's path, with
 * no trailing `/`, which no route's segments would ever match; else why
 * not, as `Invalid path: …`.
 */
export type ScopePathAt<
	Prefix extends string,
	Path extends string,
> = Path extends `${string}/`
	? Path extends '/'
		? PathAt<Prefix, Path>
		: NoInfer<`Invalid path: "${Path}": a path given to use() does not end with "/"`>
	: PathAt<Prefix, Path>;

/** A middleware `use(path, …)` takes: made by `defineMiddleware`, reading `Ctx`. */
export type PathMiddleware<Ctx extends object> = ((
	ctx: BaseContext & Ctx,
	next: NextFunction,
) => MiddlewareReturn) &
	MadeByDefineMiddleware;

declare module './forms' {
	interface Forms<
		App extends AppTypes,
		A,
		B,
		Results extends readonly unknown[],
		Result,
		Handled,
	> {
		readonly use: UseForm<App, Results, Result>;
	}
}

/** The app `use` is called on: a route's `AppTypes`, whose method it does not read. */
export interface UseApp<
	Ctx extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
> extends AppTypes {
	readonly ctx: Ctx;
	readonly prefix: Prefix;
	readonly shortcuts: Shortcuts;
}

/** `app.use(...middlewares)`: no head, no tail, the app after them its result. */
export interface UseForm<
	App extends AppTypes,
	Results extends readonly unknown[],
	Result,
> extends FormSlots {
	readonly head: [];
	readonly step: ScopeMiddleware<App['ctx'], Results, Result>;
	readonly tail: [];
	readonly out: AppAfterUse<
		App['ctx'],
		App['prefix'],
		App['shortcuts'],
		Results
	>;
}

/**
 * `app.use(...middlewares)`: middlewares made by `defineMiddleware`, run
 * on every route declared after this — not before — in this app or group,
 * before the route's own middlewares, in the order given; on the app, on
 * every request no route matches too — a 404, a 405, a preflight —
 * wherever declared. What each passes `next` is added to the context of
 * the routes after it, typed; a reply it returns ends the request. And
 * `app.use(path, ...middlewares)`, see `UsePathForm`.
 *
 * ```ts
 * app.use(auth).get('/me', ({ user, reply }) => reply(200, user));
 * ```
 */
export interface UseForms<
	Ctx extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
> extends Ladder<'use', UseApp<Ctx, Prefix, Shortcuts>>,
		UsePathForm<Ctx, Prefix, Shortcuts> {}

/** `app.use(path, ...middlewares)`. */
export interface UsePathForm<
	Ctx extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
> {
	/**
	 * Middlewares made by `defineMiddleware`, run on the requests under
	 * `path` that reach a route declared after this — and, on the app, on
	 * those no route matches. The request's path is matched, compiled once
	 * here: `/admin` is `/admin` and every path under it, `/admin/*` the
	 * paths under it alone, and `:name` any one segment; a route
	 * `/users/:id` requested as `/users/admin` runs `use('/users/admin', …)`.
	 * They may add nothing to the context — `next()`, a reply or a
	 * `Response` — since the routes they run on are not typed apart: to
	 * add to a subtree's, `use` them in a group.
	 *
	 * ```ts
	 * app.use('/admin', requireAdmin).get('/admin/stats', handler);
	 * app.group('/admin', (admin) => admin.use(auth).get('/me', ({ user, reply }) => reply(200, user)));
	 * ```
	 */
	// biome-ignore lint/style/useShorthandFunctionType: a call signature carries its JSDoc to hover and signature help; a function type does not
	<
		const Path extends RoutePath,
		const Middlewares extends readonly [
			PathMiddleware<Ctx>,
			...PathMiddleware<Ctx>[],
		],
	>(
		path: ScopePathAt<Prefix, Path>,
		...middlewares: Middlewares & AddingNothing<Middlewares>
	): Alxia<
		Ctx,
		Prefix,
		| Shortcuts
		| Extract<
				Awaited<
					ReturnType<Middlewares[number] & ((...args: never[]) => unknown)>
				>,
				AnyReply
		  >
	>;
}
