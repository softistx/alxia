import { AsyncLocalStorage } from 'node:async_hooks';
import {
	type BaseContext,
	type ContextOf,
	defineMiddleware,
	type Empty,
	type Middleware,
	type MiddlewareMark,
	type Mounted,
	type RegisteredBase,
	type RequestContext,
	type RequiresOf,
	settle,
} from '@alxia/core';

/** Why there is no context to read. */
export type ContextStorageErrorCode =
	/** Called outside any request: at startup, in a job, after the response. */
	| 'OUTSIDE_REQUEST'
	/** In a request `contextStorage()` ran on, but that reached no route: a 404, a 405. A route it did not run on is `OUTSIDE_REQUEST`. */
	| 'NOT_ROUTED';

export class ContextStorageError extends Error {
	override readonly name = 'ContextStorageError';
	readonly code: ContextStorageErrorCode;

	constructor(code: ContextStorageErrorCode) {
		super(
			code === 'OUTSIDE_REQUEST'
				? 'getContext(): called outside a request — use tryGetContext(), or runWithContext() in a job or a test'
				: 'getContext(): this request reached no route declared after contextStorage() — use it earlier, or getRequestContext()',
		);
		this.code = code;
	}
}

interface Holder {
	readonly request: RequestContext;
	ctx: BaseContext | undefined;
}

/**
 * One store for the process: every `contextStorage()` writes to it, and
 * `getContext()` reads it wherever it is called — the way `hono/context-storage`
 * works, so code written against one ports to the other.
 */
const storage = new AsyncLocalStorage<Holder>();

/**
 * The context of the route the current request reached: what its handler
 * reads — the request, `set`, `reply`, and what every hook before it added.
 * Throws a `ContextStorageError` outside a route declared after
 * `contextStorage()`.
 *
 * `Ctx` types what the hooks added; prefer the typed `context()` of the middleware
 * itself, typed by the app.
 */
export function getContext<Ctx extends object = Empty>(): BaseContext & Ctx {
	const holder = storage.getStore();
	if (holder === undefined) throw new ContextStorageError('OUTSIDE_REQUEST');
	if (holder.ctx === undefined) throw new ContextStorageError('NOT_ROUTED');
	return holder.ctx as BaseContext & Ctx;
}

/** `getContext()`, or `undefined` where it would throw: code that runs in and out of requests. */
export function tryGetContext<Ctx extends object = Empty>():
	| (BaseContext & Ctx)
	| undefined {
	return storage.getStore()?.ctx as (BaseContext & Ctx) | undefined;
}

/**
 * The request as a middleware sees it — in a 404 too — with the route it
 * reached and the error it failed with.
 */
export function getRequestContext(): RequestContext {
	const holder = storage.getStore();
	if (holder === undefined) throw new ContextStorageError('OUTSIDE_REQUEST');
	return holder.request;
}

/** `getRequestContext()`, or `undefined` outside a request. */
export function tryGetRequestContext(): RequestContext | undefined {
	return storage.getStore()?.request;
}

/**
 * Runs `work` with `ctx` as the current context: a job, a queue consumer,
 * a test calling a service that reads `getContext()`.
 */
export function runWithContext<T>(ctx: BaseContext, work: () => T): T {
	return storage.run({ request: ctx, ctx }, work);
}

/**
 * The middleware, and its context typed by the app it follows. It
 * requires that context of the app that uses it, beyond the base context:
 * `app.use` on an app that does not give it is a compile error.
 */
export type ContextStoragePlugin<App> = Middleware<
	RequiresOf<StoredContext<App>, 'context'>,
	Promise<Response>
> &
	MiddlewareMark & {
		/** `getContext()`, typed by `App`. */
		context(): StoredContext<App>;
		/** `tryGetContext()`, typed by `App`. */
		tryContext(): StoredContext<App> | undefined;
	};

/** What `context()` reads: the context of `App`, or the base context when `App` is no app. */
export type StoredContext<App> = [ContextOf<App>] extends [never]
	? BaseContext
	: Mounted<ContextOf<App>>;

/**
 * The request's context, anywhere it runs, as a middleware: from the
 * routes declared after it, every function their handlers call — however
 * deep, through every `await` and timer — reads it with `getContext()`,
 * without it being passed down; the answer to an error too, an `onError`
 * hook's included. Give it to `use` before the middlewares whose errors
 * your own middleware answers: what the rest throws is answered inside
 * it, as the route would.
 *
 * Typed by the app it is used on: give the plugin that app's type, and its
 * `context()` returns what its routes read — the `user` a session derived, the
 * `db` decorated. Given none, the app `Register` names in `@alxia/core`
 * (`BaseContext` when nothing is registered). Either way the app that uses
 * it must give that context: using it before is a compile error.
 *
 * ```ts
 * const base = alxia().decorate({ db }).use(session(auth, { required: true }));
 * export const requestContext = contextStorage<typeof base>();
 * const app = base.use(requestContext).get('/orders', ({ reply }) => reply(200, listOrders()));
 *
 * // orders.ts — no context passed
 * export const listOrders = () => {
 *   const { db, user } = requestContext.context();
 *   return db.orders.forUser(user.id);
 * };
 * ```
 */
export function contextStorage<App = RegisteredBase>(
	...uncalled: readonly never[]
): ContextStoragePlugin<App> {
	if (uncalled.length > 0) {
		// `use(contextStorage)`: the app is handed to the factory, and what
		// follows would be declared on a plugin nobody serves.
		throw new TypeError(
			'contextStorage is a factory: use(contextStorage()), not use(contextStorage)',
		);
	}
	const middleware = defineMiddleware((ctx, next) => {
		// A route's context; none for a request no route matches.
		const routed = ctx.route === undefined ? undefined : ctx;
		const current = storage.getStore();
		// A second one, on the same request: the context it reaches is the route's.
		if (current !== undefined && current.request.url === ctx.url) {
			current.ctx = routed ?? current.ctx;
			return settle(ctx, next());
		}
		return storage.run({ request: ctx, ctx: routed }, () =>
			settle(ctx, next()),
		);
	});
	return Object.assign(middleware, {
		context: () => getContext(),
		tryContext: () => tryGetContext(),
	}) as unknown as ContextStoragePlugin<App>;
}
