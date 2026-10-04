import { fileURLToPath } from 'node:url';
import type {
	Alxia,
	AnyAlxia,
	AnyReply,
	BaseContext,
	MaybePromise,
	RouteDefinition,
	StatusCode,
} from '@alxia/core';
import {
	createRequestHandler,
	type RequestHandler,
	RouterContextProvider,
	type ServerBuild,
} from 'react-router';
import { serveClient } from './assets';
import { alxiaContext } from './context';

export interface ReactRouterOptions<Ctx> {
	/**
	 * React Router's server build: the module itself, or a function that
	 * returns it — `() => import('virtual:react-router/server-build')` in a
	 * server entry Vite builds, `() => import('./build/server/index.js')`
	 * beside a build. A function is called on every request in
	 * `development`, so an edit is picked up, and once in `production`.
	 */
	readonly build: ServerBuild | (() => MaybePromise<ServerBuild>);
	/** React Router's server mode: `production` by default. */
	readonly mode?: 'development' | 'production';
	/**
	 * Sets the app's own keys on React Router's context provider, from the
	 * context alxia's hooks built. `ctx` is typed by the app at the point of
	 * `use`: reading what no hook before it derives is a compile error.
	 * `alxiaContext` is always set, whether or not this is given.
	 */
	readonly getLoadContext?: (
		ctx: BaseContext & Ctx,
		context: RouterContextProvider,
	) => MaybePromise<void>;
	/**
	 * The client build's folder, `build/client`: a path or a `file:` URL.
	 * Its `assets/` is served immutable, and every other top-level file or
	 * folder — the copies of `public/` — with an hour's cache, before the
	 * catch-all. Ignored in `development`, where Vite serves them.
	 */
	readonly client?: string | URL;
}

/** The methods the catch-all takes. A `HEAD` reaches its `GET`. */
const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

/** The handlers `reactRouter()` declared: the catch-all's and the client build's. */
const declared = new WeakSet<RouteDefinition['handler']>();

/**
 * Whether `reactRouter()` declared this route: the catch-all, or one of the
 * client build's files. For `@alxia/openapi`'s `matchesSpec`, whose
 * `exclude` leaves them out, so the app's routes are checked against the
 * operations of its OpenAPI document and its pages are not.
 *
 * ```ts
 * matchesSpec(app, operations, { exclude: isReactRouterRoute });
 * ```
 */
export function isReactRouterRoute(route: RouteDefinition): boolean {
	return declared.has(route.handler);
}

/**
 * A React Router framework app, server rendered on `app`: `GET`, `POST`,
 * `PUT`, `PATCH` and `DELETE` at `/*`, behind every hook declared on `app`
 * before it. Each loader, action and middleware reads what those hooks
 * built through `alxiaOf<App>(context)`. The app's own routes — an `/api`
 * — answer their paths, declared before it or after; the client build's
 * files are served when `client` is given.
 *
 * ```ts
 * const app = base.use((app) =>
 *   reactRouter(app, { build: () => import('./build/server/index.js'), client: 'build/client' }),
 * );
 * ```
 */
export function reactRouter<
	Ctx extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
>(
	app: Alxia<Ctx, Prefix, Shortcuts>,
	options: ReactRouterOptions<Ctx>,
): Alxia<Ctx, Prefix, Shortcuts> {
	const mode = options.mode ?? 'production';
	const handle = requestHandler(options.build, mode);
	const getLoadContext = options.getLoadContext;
	const handler = async (ctx: BaseContext & Ctx) => {
		const context = new RouterContextProvider();
		context.set(alxiaContext, ctx);
		await getLoadContext?.(ctx, context);
		// React Router answers a HEAD with no headers at all: hand it the GET,
		// and the core drops the body.
		const request =
			ctx.request.method === 'HEAD'
				? new Request(ctx.request, { method: 'GET' })
				: ctx.request;
		const response = await handle(request, context);
		return ctx.reply(
			response.status as StatusCode,
			response.body ?? undefined,
			{ headers: response.headers },
		);
	};

	const routes = asRoutes(app);
	declaring(app, () => {
		if (options.client !== undefined && mode === 'production') {
			serveClient(routes, pathOf(options.client));
		}
		for (const method of METHODS) routes[method]('/*', handler);
	});
	return app;
}

/**
 * Declares the client build's files on `app`, marked for
 * `isReactRouterRoute`: what `reactRouter()` does with `client`, apart, so
 * that `createServer()` serves them before the hooks of `configure`.
 */
export function declareClient(app: AnyAlxia, client: string | URL): void {
	declaring(app, () => serveClient(asRoutes(app), pathOf(client)));
}

/** Runs `declare`, and marks every route it added to `app` as ours. */
function declaring(app: AnyAlxia, declare: () => void): void {
	const before = new Set(app.routes);
	declare();
	for (const route of app.routes) {
		if (!before.has(route)) declared.add(route.handler);
	}
}

/** The app's route methods, untyped: the catch-all's handler is not one a route type admits. */
function asRoutes(app: AnyAlxia) {
	return app as unknown as {
		static(path: string, source: string, options: object): unknown;
		file(path: string, file: string, options: object): unknown;
	} & Record<
		(typeof METHODS)[number],
		(path: string, handler: unknown) => unknown
	>;
}

/** A handler that resolves a function build once in production, on every request in development. */
function requestHandler(
	build: ReactRouterOptions<never>['build'],
	mode: 'development' | 'production',
): RequestHandler {
	if (typeof build !== 'function' || mode === 'development') {
		return createRequestHandler(build, mode);
	}
	let resolved: Promise<RequestHandler> | undefined;
	return async (request, context) => {
		resolved ??= Promise.resolve(build()).then(
			(server) => createRequestHandler(server, mode),
			(error: unknown) => {
				resolved = undefined;
				throw error;
			},
		);
		return (await resolved)(request, context);
	};
}

function pathOf(client: string | URL): string {
	return client instanceof URL ? fileURLToPath(client) : client;
}
