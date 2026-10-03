import type { Refusal } from '../errors/errors';
import type { AnyReply, Reply } from '../reply/reply';
import type { BodyParser } from '../request/read';
import { joinPath } from '../router/paths';
import { fileHandler, staticHandler } from '../static/serve';
import type {
	FileOptions,
	FileSource,
	StaticOptions,
	StaticReply,
} from '../static/types';
import type { JoinPath, RoutePath } from '../types/path';
import type { ClientErrorStatus } from '../types/status';
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
import { addPage, refusePage, refuseShadowedPages } from './pages';
import { serve } from './pipeline';
import type { OperationMethod, RouteOperation } from './route-operation';
import { createRuntime, mergeGlobals } from './runtime';
import { refusalHandler, Scope } from './scope';
import { startServer, stopServer } from './serving';
import type {
	AlxiaOptions,
	AnyAlxia,
	ListenOptions,
	Plugin,
	RouteMethod,
} from './signatures';
import { type SocketData, websocketHandler } from './socket';
import type {
	BaseContext,
	BehindShortcuts,
	BodyLimitShortcut,
	DeclaredRefusal,
	DeclaredReply,
	Empty,
	MaybePromise,
	Method,
	Outcome,
	ProvidedBy,
	RefusalResponses,
	RefusalSchema,
	RefusalsOf,
	Refusing,
	RouteEntryOf,
	RouteRecord,
	RouteSchema,
	ThenShortcuts,
	TypedReplyFunction,
} from './types';

/** The route a static directory is served at: its path, then a wildcard. */
type StaticPath<Path extends string> = Path extends '/' ? '/*' : `${Path}/*`;

/** The routes of a plugin, under the prefix of the app it is used by. */
type Prefixed<Prefix extends string, Routes, Shortcuts> = {
	readonly [Path in keyof Routes as Path extends string
		? JoinPath<Prefix, Path>
		: never]: {
		readonly [M in keyof Routes[Path]]: Routes[Path][M] extends RouteRecord<
			infer Input,
			infer Output
		>
			? RouteRecord<Input, BehindShortcuts<Output, Shortcuts>>
			: Routes[Path][M];
	};
};

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
 * A route hook (`derive`, `decorate`, `onError`, `onRefusal`) applies to the routes
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
	/** The route hooks in force for the routes declared next. */
	#scope = new Scope();
	#server: Bun.Server<unknown> | undefined;
	#websocket: Bun.WebSocketHandler<SocketData> | undefined;

	constructor(options: AlxiaOptions<Prefix> = {}) {
		this.#prefix = options.prefix ?? '';
		this.#runtime = createRuntime(options);
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
		addPage(this.#runtime, joinPath(this.#prefix, path), bundle);
		return this;
	}

	/**
	 * A WebSocket route. The upgrade request runs the hooks before it and is
	 * validated as a route's; each message is then checked by `message`, and
	 * each one sent by `send`. Open through `listen`, or a `Bun.serve` given
	 * `fetch` and `websocket`: a socket needs a server.
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
		this.#mount({
			path: joinPath(this.#prefix, path),
			schema,
			handlers: handlers as SocketDefinition['handlers'],
			...this.#scope.hooks(),
		});
		return this as never;
	}

	/** Values every route after this reads from its context: a database, a logger. */
	decorate<const Values extends object>(
		values: Values,
	): Alxia<Ctx & Values, Routes, Prefix, Shortcuts> {
		this.#scope.chain({ kind: 'derive', run: () => values });
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
		this.#scope.chain({ kind: 'derive', run: hook as DeriveHook });
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
		this.#scope.chain({ kind: 'wrap', run: hook as unknown as WrapHook });
		return this as never;
	}

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
	bodyLimit(
		bytes: number,
	): Alxia<Ctx, Routes, Prefix, Shortcuts | BodyLimitShortcut> {
		this.#scope.limit(bytes);
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
		this.#scope.onError(hook as unknown as ErrorHook);
		return this as never;
	}

	/**
	 * A hook that answers a request a route declared after it refuses
	 * before its handler runs: one its schemas refuse, the default of which
	 * is `400 { error: 'validation', issues }`, or one whose body passes its
	 * `bodyLimit`, the default of which is
	 * `413 { error: 'content_too_large', limit }`. The hook reads
	 * the refusal — its `kind`: `validation`, with the `part` that failed
	 * and the `issues`, or `body_limit`, with the route's `limit` — and
	 * returns a reply with a 4xx status, or nothing for that kind's default.
	 * The last one declared before a route is the one in force; a group's
	 * stays inside it. Its reply replaces the default 400 in the type of
	 * every such route that validates, so the client reads it:
	 *
	 * ```ts
	 * .onRefusal((refusal) => refusal.kind === 'validation'
	 *   ? problem({ type: 'urn:example:invalid', status: 400, detail: `the ${refusal.part} is invalid` })
	 *   : problem({ type: 'urn:example:limit', status: 413, limit: refusal.limit }))
	 * ```
	 *
	 * Given schemas first, its `reply` is typed by them, its reply is
	 * checked and sent as their output, and `@alxia/openapi` documents it:
	 *
	 * ```ts
	 * .onRefusal({ response: { 400: Problem }, contentType: 'application/problem+json' },
	 *   (refusal, { reply }) => reply(400, { type: 'urn:example:invalid', status: 400, detail: refusal.kind }))
	 * ```
	 */
	onRefusal<Result extends Reply<ClientErrorStatus, any> | undefined | void>(
		hook: (refusal: Refusal, ctx: BaseContext & Ctx) => MaybePromise<Result>,
	): Alxia<
		Ctx,
		Routes,
		Prefix,
		Exclude<Shortcuts, Refusing> | RefusalsOf<Extract<Result, AnyReply>, Result>
	>;
	onRefusal<
		Responses extends RefusalResponses,
		Result extends DeclaredReply<Responses> | undefined | void,
	>(
		schema: RefusalSchema<Responses>,
		hook: (
			refusal: Refusal,
			ctx: Omit<BaseContext, 'reply'> &
				Ctx & { readonly reply: TypedReplyFunction<Responses> },
		) => MaybePromise<Result>,
	): Alxia<
		Ctx,
		Routes,
		Prefix,
		| Exclude<Shortcuts, Refusing>
		| RefusalsOf<DeclaredRefusal<Responses>, Result>
	>;
	onRefusal(
		schemaOrHook: RefusalSchema | ((refusal: Refusal, ctx: never) => unknown),
		maybeHook?: (refusal: Refusal, ctx: never) => unknown,
	): AnyAlxia {
		this.#scope.refuseWith(refusalHandler(schemaOrHook, maybeHook));
		return this;
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
				? [joinPath(this.#prefix, prefixOrBuild), maybeBuild]
				: [this.#prefix, prefixOrBuild];
		if (build === undefined) throw new TypeError('group(): build is missing');
		const child = new Alxia({
			prefix,
			validateResponses: this.#runtime.validateResponses,
		});
		child.#scope = this.#scope.copy();
		child.#runtime = { ...child.#runtime, globals: this.#runtime.globals };
		const before = new Set(this.#runtime.globals.pages.keys());
		const built = build(child);
		refuseShadowedPages(this.#runtime, before);
		for (const route of built.routes) this.#register(route);
		for (const socket of built.sockets) this.#mount(socket);
		return this;
	}

	/**
	 * A plugin. An app: its routes, under this app's prefix and behind this
	 * app's hooks, and its hooks, which then apply to the routes declared on
	 * this app after it — a plugin can be an `auth` that only derives a
	 * `user`. Its global hooks become this app's. It is read once, here:
	 * declare it completely before using it. A plugin made by `definePlugin`
	 * names what it reads from this app's context: using it on an app that
	 * does not give it is a compile error.
	 *
	 * Or a function, given this app, that returns it: a `Plugin`.
	 */
	use<Result extends AnyAlxia>(plugin: (app: this) => Result): Result;
	use<
		PluginCtx extends object,
		PluginRoutes extends object,
		PluginPrefix extends string,
		PluginShortcuts extends AnyReply,
		PluginRequires = Empty,
	>(
		plugin: Alxia<PluginCtx, PluginRoutes, PluginPrefix, PluginShortcuts> & {
			readonly '~requires'?: PluginRequires;
		} & ProvidedBy<Ctx, PluginRequires>,
	): Alxia<
		Ctx & PluginCtx,
		Routes & Prefixed<Prefix, PluginRoutes, Shortcuts>,
		Prefix,
		ThenShortcuts<Shortcuts, PluginShortcuts>
	>;
	use(plugin: AnyAlxia | ((app: any) => AnyAlxia)): AnyAlxia {
		if (!(plugin instanceof Alxia)) return plugin(this);
		for (const route of plugin.routes) {
			this.#register(
				this.#scope.behind(route, joinPath(this.#prefix, route.path)),
			);
		}
		for (const socket of plugin.sockets) {
			this.#mount(
				this.#scope.behind(socket, joinPath(this.#prefix, socket.path)),
			);
		}
		this.#scope.absorb(plugin.#scope);
		mergeGlobals(this.#runtime, plugin.#runtime.globals, this.#prefix);
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

	/**
	 * The `websocket` handler `Bun.serve` opens this app's sockets with, beside
	 * `fetch`: what `listen` passes, for a server started otherwise.
	 *
	 * ```ts
	 * Bun.serve({ fetch: app.fetch, websocket: app.websocket });
	 * ```
	 */
	get websocket(): Bun.WebSocketHandler<SocketData> {
		this.#websocket ??= websocketHandler(this.#runtime.validateResponses);
		return this.#websocket;
	}

	/** A request to the app, in process: `app.request('/users/1')`. */
	request(path: string, init?: RequestInit): Promise<Response> {
		return this.fetch(new Request(new URL(path, 'http://localhost'), init));
	}

	/**
	 * `Bun.serve` with this app: its paths go to Bun's own router, and what
	 * none of them matches to `fetch`, which answers 404 or 405.
	 *
	 * Bun matches the request's target as it came, `/f/../a` and all, where
	 * `fetch` reads its URL's pathname, `/a`. A path without parameters is
	 * matched by Bun only by a target already in that form, so its route
	 * answers; a request Bun gives to a path with parameters or a wildcard
	 * is routed again as `fetch` routes it, so both choose alike, at the
	 * cost of `fetch`'s routing on each such request.
	 */
	listen(options: ListenOptions | number = {}): Bun.Server<unknown> {
		this.#server = startServer(this.#runtime, options, this.websocket);
		return this.#server;
	}

	/** Stops the server `listen` started, then runs every `onStop` hook. */
	async stop(closeActiveConnections = false): Promise<void> {
		const server = this.#server;
		this.#server = undefined;
		await stopServer(this.#runtime, server, closeActiveConnections);
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
			const full = joinPath(this.#prefix, path);
			const bodyLimit = this.#scope.bodyLimitOf(schema, `${method} ${full}`);
			this.#register({
				method,
				path: full,
				schema,
				...(bodyLimit === undefined ? {} : { bodyLimit }),
				handler,
				...this.#scope.hooks(),
			});
			return this;
		};
	}

	#register(route: RouteDefinition): void {
		refusePage(this.#runtime, route.method, route.path);
		this.#runtime.router.add(route.method, route.path, {
			kind: 'http',
			...route,
		});
		this.#routes.push(route);
	}

	#mount(socket: SocketDefinition): void {
		refusePage(this.#runtime, 'WS', socket.path);
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

export type {
	AlxiaOptions,
	AnyAlxia,
	ListenOptions,
	Outcome,
	Plugin,
	RouteMethod,
};
