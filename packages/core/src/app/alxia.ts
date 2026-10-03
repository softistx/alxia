import type { AnyReply } from '../reply/reply';
import type { BodyParser } from '../request/read';
import { compilePath, Router } from '../router/router';
import {
	type FileOptions,
	type FileSource,
	fileHandler,
	type StaticOptions,
	type StaticReply,
	staticHandler,
} from '../static/serve';
import type { JoinPath, RoutePath } from '../types/path';
import type {
	SocketContext,
	SocketEntryOf,
	SocketHandlers,
	SocketMessage,
	SocketSchema,
	SocketSend,
} from '../ws/types';
import type {
	AroundHook,
	ChainHook,
	DeriveHook,
	ErrorHook,
	RequestHook,
	ResponseHook,
	RouteDefinition,
	Runtime,
	SocketDefinition,
	StartHook,
	StopHook,
	WrapHook,
} from './definition';
import { serve } from './pipeline';
import type { OperationMethod, RouteOperation } from './route-operation';
import { type SocketData, websocketHandler } from './socket';
import type {
	BaseContext,
	Context,
	Empty,
	HandlerResult,
	MaybePromise,
	Method,
	Outcome,
	OutcomeOf,
	RouteEntryOf,
	RouteRecord,
	RouteSchema,
	ValidSchema,
} from './types';

/** The route a static directory is served at: its path, then a wildcard. */
type StaticPath<Path extends string> = Path extends '/' ? '/*' : `${Path}/*`;

export interface AlxiaOptions<Prefix extends string> {
	/** Prepended to the path of every route declared on this app. */
	readonly prefix?: Prefix;
	/**
	 * Whether a reply is checked against the schema its route declares for
	 * its status, and sent as that schema's output: an unknown key the
	 * schema strips never leaves the server. On by default; a reply that
	 * fails is answered with a 500.
	 */
	readonly validateResponses?: boolean;
	/**
	 * Reads the client's address. By default, the address of the connection;
	 * behind a proxy you trust, read its header instead.
	 */
	readonly ip?: (
		request: Request,
		server: Bun.Server<unknown> | undefined,
	) => string | undefined;
}

export interface ListenOptions {
	readonly port?: number | string;
	readonly hostname?: string;
	readonly development?: boolean;
	readonly idleTimeout?: number;
	readonly maxRequestBodySize?: number;
	readonly tls?: Bun.TLSOptions;
}

/** A route method: `app.get(path, schema, handler)` or `app.get(path, handler)`. */
export interface RouteMethod<
	M extends Method,
	Ctx extends object,
	Routes extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
> {
	<
		const Path extends RoutePath,
		Schema extends RouteSchema,
		Result extends HandlerResult<Schema>,
	>(
		path: Path,
		schema: Schema & ValidSchema<JoinPath<Prefix, Path>, Schema>,
		handler: (
			ctx: Context<Ctx, JoinPath<Prefix, Path>, Schema>,
		) => MaybePromise<Result>,
	): Alxia<
		Ctx,
		Routes & RouteEntryOf<M, JoinPath<Prefix, Path>, Schema, Result, Shortcuts>,
		Prefix,
		Shortcuts
	>;
	<const Path extends RoutePath, Result extends AnyReply>(
		path: Path,
		handler: (
			ctx: Context<Ctx, JoinPath<Prefix, Path>, Empty>,
		) => MaybePromise<Result>,
	): Alxia<
		Ctx,
		Routes & RouteEntryOf<M, JoinPath<Prefix, Path>, Empty, Result, Shortcuts>,
		Prefix,
		Shortcuts
	>;
}

/** The routes of a plugin, under the prefix of the app it is used by. */
type Prefixed<Prefix extends string, Routes, Shortcuts> = {
	readonly [Path in keyof Routes as Path extends string
		? JoinPath<Prefix, Path>
		: never]: {
		readonly [M in keyof Routes[Path]]: Routes[Path][M] extends RouteRecord<
			infer Input,
			infer Output
		>
			? RouteRecord<Input, Output | OutcomeOf<Shortcuts>>
			: Routes[Path][M];
	};
};

/** Any app, whatever it holds. */
export type AnyAlxia = Alxia<any, any, any, any>;

/**
 * A plugin written as a function: it receives the app and returns it, with
 * global hooks added. A plugin that adds to the context or declares routes
 * is an app of its own, given to `use`.
 */
export type Plugin = <App extends AnyAlxia>(app: App) => App;

/**
 * An app: its routes, and the hooks they run.
 *
 * Every method returns the app itself, typed with what it added, so declare
 * it in one chain and export its type for the client:
 *
 * ```ts
 * const app = alxia()
 *   .get('/users/:id', { params: UserId, response: { 200: User, 404: NotFound } },
 *     ({ params, reply }) => { ... });
 * export type App = typeof app;
 * ```
 *
 * A route hook (`derive`, `decorate`, `onError`) applies to the routes
 * declared after it, never before: the order of the chain is the order of
 * the request. A global hook (`onRequest`, `onResponse`, `onStart`,
 * `onStop`, `parser`) applies to the whole app, wherever it is declared.
 */
export class Alxia<
	Ctx extends object = Empty,
	Routes extends object = Empty,
	Prefix extends string = '',
	Shortcuts extends AnyReply = never,
> {
	/** Never set: carries the route table to `typeof app`, which the client reads. */
	declare readonly '~routes': Routes;
	/** Never set: carries what a route declared next reads, for `ContextOf`. */
	declare readonly '~context': Ctx;

	readonly #prefix: string;
	/** The routes, the global hooks and the options a request is served with. */
	#runtime: Runtime;
	readonly #routes: RouteDefinition[] = [];
	readonly #sockets: SocketDefinition[] = [];
	#derive: ChainHook[] = [];
	#onError: ErrorHook[] = [];
	#server: Bun.Server<unknown> | undefined;

	constructor(options: AlxiaOptions<Prefix> = {}) {
		this.#prefix = options.prefix ?? '';
		this.#runtime = {
			router: new Router(),
			globals: {
				around: [],
				onRequest: [],
				onResponse: [],
				onStart: [],
				onStop: [],
				parsers: [],
				pages: new Map(),
			},
			validateResponses: options.validateResponses ?? true,
			ip:
				options.ip ??
				((request, server) => server?.requestIP(request)?.address ?? undefined),
		};
		if (this.#prefix !== '' && !/^\/.*[^/]$/.test(this.#prefix)) {
			throw new TypeError(
				`The prefix "${this.#prefix}" must start with "/" and not end with one`,
			);
		}
	}

	readonly get = this.#method('GET') as RouteMethod<
		'GET',
		Ctx,
		Routes,
		Prefix,
		Shortcuts
	>;
	readonly post = this.#method('POST') as RouteMethod<
		'POST',
		Ctx,
		Routes,
		Prefix,
		Shortcuts
	>;
	readonly put = this.#method('PUT') as RouteMethod<
		'PUT',
		Ctx,
		Routes,
		Prefix,
		Shortcuts
	>;
	readonly patch = this.#method('PATCH') as RouteMethod<
		'PATCH',
		Ctx,
		Routes,
		Prefix,
		Shortcuts
	>;
	readonly delete = this.#method('DELETE') as RouteMethod<
		'DELETE',
		Ctx,
		Routes,
		Prefix,
		Shortcuts
	>;
	readonly options = this.#method('OPTIONS') as RouteMethod<
		'OPTIONS',
		Ctx,
		Routes,
		Prefix,
		Shortcuts
	>;
	readonly head = this.#method('HEAD') as RouteMethod<
		'HEAD',
		Ctx,
		Routes,
		Prefix,
		Shortcuts
	>;
	/**
	 * A route declared as data — `{ method, path, schema? }`, as an OpenAPI
	 * code generator writes it — and its handler: the same route as
	 * `app[method](path, schema, handler)`.
	 */
	readonly route: OperationMethod<Ctx, Routes, Prefix, Shortcuts> = ((
		operation: RouteOperation,
		handler: RouteDefinition['handler'],
	) =>
		this.#method(operation.method)(
			operation.path,
			operation.schema ?? {},
			handler,
		)) as never;

	/**
	 * A `QUERY` route: a safe, idempotent read whose criteria travel in the
	 * body, validated like a `POST`'s.
	 */
	readonly query = this.#method('QUERY') as RouteMethod<
		'QUERY',
		Ctx,
		Routes,
		Prefix,
		Shortcuts
	>;

	/**
	 * A directory of files — or any `FileSource` — served under `path`: a
	 * `GET` route at `path/*`, typed and documented like any other, every
	 * hook around it.
	 *
	 * ```ts
	 * app.static('/assets', './public', {
	 *   cacheControl: (path) => /\.[0-9a-f]{8}\./.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache',
	 *   precompressed: ['br', 'gzip'],
	 * });
	 * app.static('/', './dist', { fallback: 'index.html' }); // a single-page app
	 * ```
	 *
	 * A path that leaves the source, a dotfile, or no file is a 404. ETags
	 * and `Last-Modified` answer 304s; a `Range` a 206.
	 */
	static<const Path extends RoutePath>(
		path: Path,
		source: FileSource,
		options: StaticOptions = {},
	): Alxia<
		Ctx,
		Routes &
			RouteEntryOf<
				'GET',
				JoinPath<Prefix, StaticPath<Path>>,
				Empty,
				StaticReply,
				Shortcuts
			>,
		Prefix,
		Shortcuts
	> {
		const route = (path as string) === '/' ? '/*' : `${path}/*`;
		(this.get as unknown as (path: string, handler: unknown) => unknown)(
			route,
			staticHandler(source, options),
		);
		return this as never;
	}

	/**
	 * One file at `path`: a path on disk, read anew on each request, a `Blob`,
	 * or a function answering one — `null` a 404. `/favicon.ico`,
	 * `/robots.txt`, a generated sitemap.
	 */
	file<const Path extends RoutePath>(
		path: Path,
		file:
			| string
			| Blob
			| ((ctx: BaseContext & Ctx) => MaybePromise<Blob | null | undefined>),
		options: FileOptions = {},
	): Alxia<
		Ctx,
		Routes &
			RouteEntryOf<
				'GET',
				JoinPath<Prefix, Path>,
				Empty,
				StaticReply,
				Shortcuts
			>,
		Prefix,
		Shortcuts
	> {
		(this.get as unknown as (path: string, handler: unknown) => unknown)(
			path,
			fileHandler(file as Parameters<typeof fileHandler>[0], options),
		);
		return this as never;
	}

	/**
	 * A page of Bun's full-stack bundling: `import index from './index.html'`,
	 * its scripts and styles bundled by Bun — with hot reloading under
	 * `development` — and served by `Bun.serve` itself. So it needs `listen`,
	 * and the app's hooks do not run around it; `app.fetch` answers it 404.
	 */
	page<const Path extends RoutePath>(path: Path, bundle: Bun.HTMLBundle): this {
		this.#page(this.#join(path), bundle);
		return this;
	}

	#page(path: string, bundle: Bun.HTMLBundle): void {
		if (
			this.#pageAt(path) !== undefined ||
			this.#runtime.router.hasShape(path)
		) {
			throw new TypeError(`page(): ${path} is already served`);
		}
		this.#runtime.globals.pages.set(path, bundle);
	}

	/**
	 * A WebSocket route. The upgrade request runs the hooks before it and is
	 * validated as a route's; each message is then checked by `message`, and
	 * each one sent by `send`. Open through `listen`: a socket needs a server.
	 *
	 * ```ts
	 * app.ws('/rooms/:room', { message: Chat, send: Chat }, {
	 *   open: (socket) => socket.subscribe(socket.data.params.room),
	 *   message: (socket, chat) => socket.publish(socket.data.params.room, chat),
	 * });
	 * ```
	 */
	ws<const Path extends RoutePath, Schema extends SocketSchema = Empty>(
		path: Path,
		schema: Schema,
		handlers: SocketHandlers<
			SocketContext<Ctx, JoinPath<Prefix, Path>, Schema>,
			SocketSend<Schema>,
			SocketMessage<Schema>
		>,
	): Alxia<
		Ctx,
		Routes & SocketEntryOf<JoinPath<Prefix, Path>, Schema>,
		Prefix,
		Shortcuts
	> {
		const definition: SocketDefinition = {
			path: this.#join(path),
			schema,
			handlers: handlers as SocketDefinition['handlers'],
			derive: [...this.#derive],
			onError: [...this.#onError],
		};
		this.#mount(definition);
		return this as never;
	}

	/** Values every route after this reads from its context: a database, a logger. */
	decorate<const Values extends object>(
		values: Values,
	): Alxia<Ctx & Values, Routes, Prefix, Shortcuts> {
		this.#derive.push({ kind: 'derive', run: () => values });
		return this as never;
	}

	/**
	 * A hook run on every request to a route declared after it, before the
	 * request is validated. What it returns is added to the context; a reply
	 * it returns ends the request, and is added to the type of every such
	 * route, so the client reads it:
	 *
	 * ```ts
	 * .derive(async ({ request, reply }) => {
	 *   const user = await authenticate(request);
	 *   return user ? { user } : reply(401, { error: 'unauthenticated' as const });
	 * })
	 * ```
	 */
	derive<Result>(
		hook: (ctx: BaseContext & Ctx) => MaybePromise<Result>,
	): Alxia<
		Ctx &
			(Exclude<Result, AnyReply> extends infer Added extends object
				? Added
				: Empty),
		Routes,
		Prefix,
		Shortcuts | Extract<Result, AnyReply>
	> {
		this.#derive.push({ kind: 'derive', run: hook as DeriveHook });
		return this as never;
	}

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
	 */
	wrap<Result extends AnyReply | Response>(
		hook: (
			ctx: BaseContext & Ctx,
			next: () => Promise<Response>,
		) => MaybePromise<Result>,
	): Alxia<Ctx, Routes, Prefix, Shortcuts | Extract<Result, AnyReply>> {
		this.#derive.push({ kind: 'wrap', run: hook as unknown as WrapHook });
		return this as never;
	}

	/**
	 * A hook that turns an error thrown by a route declared after it into a
	 * reply. Returning nothing lets the next one try; past the last, an
	 * `HttpError` is answered as it says and anything else as a 500.
	 */
	onError<Result extends AnyReply | undefined | void>(
		hook: (
			error: unknown,
			ctx: BaseContext & Partial<Ctx>,
		) => MaybePromise<Result>,
	): Alxia<Ctx, Routes, Prefix, Shortcuts | Extract<Result, AnyReply>> {
		this.#onError.push(hook as unknown as ErrorHook);
		return this as never;
	}

	/**
	 * A global hook run on every request, before routing: a 404 included. A
	 * `Response` it returns is sent as it is, and is no part of any route's
	 * type: use it for what a typed client never asks — a CORS preflight, a
	 * redirect to HTTPS. What a client must read belongs in `derive`.
	 */
	onRequest(hook: RequestHook): this {
		this.#runtime.globals.onRequest.push(hook);
		return this;
	}

	/**
	 * A global hook run on every response, in the order declared: headers,
	 * compression, logging. A `Response` it returns replaces the one sent;
	 * keep its status, which the client's types promise.
	 */
	onResponse(hook: ResponseHook): this {
		this.#runtime.globals.onResponse.push(hook);
		return this;
	}

	/**
	 * A global hook around every request, the first declared outermost.
	 * `next()` runs everything else and resolves to the response; the hook
	 * returns it, or another. A socket's upgrade runs outside it: there is no
	 * response to wrap.
	 *
	 * ```ts
	 * app.around(async (ctx, next) => {
	 *   const started = performance.now();
	 *   const response = await next();
	 *   console.log(ctx.route, performance.now() - started);
	 *   return response;
	 * });
	 * ```
	 */
	around(hook: AroundHook): this {
		this.#runtime.globals.around.push(hook);
		return this;
	}

	/** Runs once `listen` has started the server. */
	onStart(hook: StartHook): this {
		this.#runtime.globals.onStart.push(hook);
		return this;
	}

	/** Runs when `stop` stops the server: close a pool, flush a log. */
	onStop(hook: StopHook): this {
		this.#runtime.globals.onStop.push(hook);
		return this;
	}

	/**
	 * Reads a body of `type` — a `content-type` prefix, or a pattern — for
	 * every route with a `body` schema, before the built-in JSON, form and
	 * text parsers.
	 */
	parser(type: string | RegExp, parse: BodyParser['parse']): this {
		this.#runtime.globals.parsers.push({ type, parse });
		return this;
	}

	/**
	 * Routes declared in a scope: the hooks `build` adds apply only to them.
	 * The routes keep every hook declared on this app before the group.
	 *
	 * ```ts
	 * app.group('/admin', (admin) => admin.derive(requireAdmin).get('/stats', ...));
	 * ```
	 */
	group<
		const Path extends RoutePath,
		GroupRoutes extends object,
		GroupCtx extends object,
		GroupShortcuts extends AnyReply,
	>(
		prefix: Path,
		build: (
			group: Alxia<Ctx, Empty, JoinPath<Prefix, Path>, Shortcuts>,
		) => Alxia<GroupCtx, GroupRoutes, JoinPath<Prefix, Path>, GroupShortcuts>,
	): Alxia<Ctx, Routes & GroupRoutes, Prefix, Shortcuts>;
	group<
		GroupRoutes extends object,
		GroupCtx extends object,
		GroupShortcuts extends AnyReply,
	>(
		build: (
			group: Alxia<Ctx, Empty, Prefix, Shortcuts>,
		) => Alxia<GroupCtx, GroupRoutes, Prefix, GroupShortcuts>,
	): Alxia<Ctx, Routes & GroupRoutes, Prefix, Shortcuts>;
	group(
		prefixOrBuild: string | ((group: AnyAlxia) => AnyAlxia),
		maybeBuild?: (group: AnyAlxia) => AnyAlxia,
	): AnyAlxia {
		const [prefix, build] =
			typeof prefixOrBuild === 'string'
				? [this.#join(prefixOrBuild), maybeBuild]
				: [this.#prefix, prefixOrBuild];
		if (build === undefined) throw new TypeError('group(): build is missing');
		const child = new Alxia({
			prefix,
			validateResponses: this.#runtime.validateResponses,
		});
		child.#derive = [...this.#derive];
		child.#onError = [...this.#onError];
		child.#runtime = { ...child.#runtime, globals: this.#runtime.globals };
		const before = new Set(this.#runtime.globals.pages.keys());
		const built = build(child);
		// The child checks its pages against its own routes only.
		for (const path of this.#runtime.globals.pages.keys()) {
			if (!before.has(path) && this.#runtime.router.hasShape(path)) {
				throw new TypeError(`page(): ${path} is already served`);
			}
		}
		for (const route of built.routes) this.#register(route);
		for (const socket of built.sockets) this.#mount(socket);
		return this;
	}

	/**
	 * A plugin. An app: its routes, under this app's prefix and behind this
	 * app's hooks, and its hooks, which then apply to the routes declared on
	 * this app after it — a plugin can be an `auth` that only derives a
	 * `user`. Its global hooks become this app's. It is read once, here:
	 * declare it completely before using it.
	 *
	 * Or a function, given this app, that returns it: a `Plugin`.
	 */
	use<Result extends AnyAlxia>(plugin: (app: this) => Result): Result;
	use<
		PluginCtx extends object,
		PluginRoutes extends object,
		PluginPrefix extends string,
		PluginShortcuts extends AnyReply,
	>(
		plugin: Alxia<PluginCtx, PluginRoutes, PluginPrefix, PluginShortcuts>,
	): Alxia<
		Ctx & PluginCtx,
		Routes & Prefixed<Prefix, PluginRoutes, Shortcuts>,
		Prefix,
		Shortcuts | PluginShortcuts
	>;
	use(plugin: AnyAlxia | ((app: any) => AnyAlxia)): AnyAlxia {
		if (!(plugin instanceof Alxia)) return plugin(this);
		for (const route of plugin.routes) {
			this.#register({
				...route,
				path: this.#join(route.path),
				derive: [...this.#derive, ...route.derive],
				onError: [...route.onError, ...this.#onError],
			});
		}
		for (const socket of plugin.sockets) {
			this.#mount({
				...socket,
				path: this.#join(socket.path),
				derive: [...this.#derive, ...socket.derive],
				onError: [...socket.onError, ...this.#onError],
			});
		}
		this.#derive = [...this.#derive, ...plugin.#derive];
		this.#onError = [...plugin.#onError, ...this.#onError];
		if (plugin.#runtime.globals !== this.#runtime.globals) {
			const globals = plugin.#runtime.globals;
			this.#runtime.globals.around.push(...globals.around);
			this.#runtime.globals.onRequest.push(...globals.onRequest);
			this.#runtime.globals.onResponse.push(...globals.onResponse);
			this.#runtime.globals.onStart.push(...globals.onStart);
			this.#runtime.globals.onStop.push(...globals.onStop);
			this.#runtime.globals.parsers.push(...globals.parsers);
			for (const [path, bundle] of globals.pages) {
				this.#page(this.#join(path), bundle);
			}
		}
		return this;
	}

	/** Every route, in the order declared: what `@alxia/openapi` documents. */
	get routes(): readonly RouteDefinition[] {
		return this.#routes;
	}

	/** Every socket route, in the order declared. */
	get sockets(): readonly SocketDefinition[] {
		return this.#sockets;
	}

	/** The server `listen` started, until `stop`. */
	get server(): Bun.Server<unknown> | undefined {
		return this.#server;
	}

	/**
	 * The app as a fetch handler: what `Bun.serve`, a test, or another
	 * runtime calls. Bound, so `export default { fetch: app.fetch }` works.
	 * Given the server, as `Bun.serve` gives it, it can open a socket.
	 */
	readonly fetch = (
		request: Request,
		server?: Bun.Server<unknown>,
	): Promise<Response> => serve(this.#runtime, request, server, undefined);

	/** A request to the app, in process: `app.request('/users/1')`. */
	request(path: string, init?: RequestInit): Promise<Response> {
		return this.fetch(new Request(new URL(path, 'http://localhost'), init));
	}

	/**
	 * `Bun.serve` with this app: its paths go to Bun's own router, and what
	 * none of them matches to `fetch`, which answers 404 or 405.
	 */
	listen(options: ListenOptions | number = {}): Bun.Server<unknown> {
		const settings = typeof options === 'number' ? { port: options } : options;
		const routes: Record<
			string,
			| Bun.HTMLBundle
			| ((request: Request, server: Bun.Server<unknown>) => Promise<Response>)
		> = {};
		for (const [path] of this.#runtime.router.paths()) {
			routes[path] = (request, server) =>
				serve(this.#runtime, request, server, path);
		}
		for (const [path, bundle] of this.#runtime.globals.pages) {
			routes[path] = bundle;
		}
		const server = Bun.serve({
			...settings,
			routes,
			fetch: (request: Request, server: Bun.Server<unknown>) =>
				serve(this.#runtime, request, server, undefined),
			websocket: websocketHandler(this.#runtime.validateResponses),
		} as Bun.Serve.Options<SocketData>) as Bun.Server<unknown>;
		this.#server = server;
		for (const hook of this.#runtime.globals.onStart) {
			Promise.resolve()
				.then(() => hook(server))
				.catch((error) => console.error(error));
		}
		return server;
	}

	/** Stops the server `listen` started, then runs every `onStop` hook. */
	async stop(closeActiveConnections = false): Promise<void> {
		const server = this.#server;
		this.#server = undefined;
		if (server !== undefined) await server.stop(closeActiveConnections);
		for (const hook of this.#runtime.globals.onStop) await hook();
	}

	#join(path: string): string {
		if (this.#prefix === '') return path;
		return path === '/' ? this.#prefix : `${this.#prefix}${path}`;
	}

	#method(method: Method) {
		return (
			path: string,
			schemaOrHandler: RouteSchema | RouteDefinition['handler'],
			maybeHandler?: RouteDefinition['handler'],
		) => {
			const [schema, handler] =
				typeof schemaOrHandler === 'function'
					? [{}, schemaOrHandler]
					: [schemaOrHandler, maybeHandler];
			if (typeof handler !== 'function') {
				throw new TypeError(`${method} ${path}: the handler is missing`);
			}
			this.#register({
				method,
				path: this.#join(path),
				schema,
				handler,
				derive: [...this.#derive],
				onError: [...this.#onError],
			});
			return this;
		};
	}

	#register(route: RouteDefinition): void {
		this.#refusePage(route.method, route.path);
		this.#runtime.router.add(route.method, route.path, {
			kind: 'http',
			...route,
		});
		this.#routes.push(route);
	}

	/** `listen` serves a page before any route at its path: refuse the route. */
	#refusePage(method: string, path: string): void {
		if (this.#pageAt(path) !== undefined) {
			throw new TypeError(`${method} ${path} is already served by a page`);
		}
	}

	/** The page declared at a path of the same shape as `path`. */
	#pageAt(path: string): string | undefined {
		const shape = compilePath(path).shape;
		for (const page of this.#runtime.globals.pages.keys()) {
			if (compilePath(page).shape === shape) return page;
		}
		return undefined;
	}

	#mount(socket: SocketDefinition): void {
		this.#refusePage('WS', socket.path);
		this.#runtime.router.add('WS', socket.path, { kind: 'ws', ...socket });
		this.#sockets.push(socket);
	}
}

/** A new app. */
export function alxia<const Prefix extends '' | RoutePath = ''>(
	options: AlxiaOptions<Prefix> = {},
): Alxia<Empty, Empty, Prefix, never> {
	return new Alxia(options);
}

/** The route table of an app, as the client reads it. */
export type RoutesOf<App> = App extends { readonly '~routes': infer Routes }
	? Routes
	: never;

/**
 * What a route declared next on `App` reads: the context its hooks build —
 * `decorate`, `derive`, every plugin's — on top of the base context. A
 * GraphQL schema, a service, types its own context with it.
 */
export type ContextOf<App> = App extends { readonly '~context': infer Ctx }
	? BaseContext & Ctx
	: never;

export type { Outcome };
