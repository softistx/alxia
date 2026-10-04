import type { AnyReply } from '../reply/reply';
import type { RoutePath } from '../types/path';
import type {
	AroundMethod,
	ParserMethod,
	RequestHookMethod,
	ResponseHookMethod,
	StartHookMethod,
	StopHookMethod,
} from './app-hooks';
import { type AppState, createState } from './app-state';
import {
	type GroupArgs,
	group,
	pluginApp,
	pluginOf,
	usePlugin,
} from './compose';
import type { GroupMethod, UseMethod } from './compose-methods';
import * as hooks from './declare-hooks';
import * as declare from './declare-routes';
import type { RouteDefinition, SocketDefinition } from './definition';
import { serve } from './pipeline';
import type { PluginMethod } from './plugin-method';
import type { RouteMethod } from './route-method';
import type { OperationMethod } from './route-operation';
import type {
	BodyLimitMethod,
	DecorateMethod,
	DeriveMethod,
	ErrorMethod,
	WrapMethod,
} from './scope-methods';
import { startServer, stopServer } from './serving';
import type { ListenMethod, RequestMethod } from './serving-methods';
import type { AlxiaOptions, AnyAlxia, RefusalMethod } from './signatures';
import { type SocketData, websocketHandler } from './socket';
import type { SocketMethod } from './socket-method';
import type { FileMethod, PageMethod, StaticMethod } from './static-methods';
import type { Empty, Method } from './types';

/**
 * An app: its routes, and the hooks they run.
 *
 * Every method returns the app itself, typed with the context it added, so
 * declare it in one chain. A route adds nothing to the app's type: the
 * OpenAPI document is the contract, and a client is generated from it.
 *
 * ```ts
 * const app = alxia()
 *   .get('/users/:id', validate({ params: UserId }), responds({ 200: User, 404: NotFound }),
 *     ({ params, reply }) => { ... });
 * ```
 *
 * A middleware of `use`, or a route hook (`derive`, `onError`, …),
 * applies to the routes declared after it: the order of the chain is the
 * order of the request. A global hook (`onRequest`, `onStop`, …) applies
 * to the whole app. Each method is typed by an interface of its own —
 * `RouteMethod`, `UseMethod`, `PluginMethod`, … — holding its overloads.
 */
export class Alxia<
	Ctx extends object = Empty,
	Prefix extends string = '',
	Shortcuts extends AnyReply = never,
> {
	/** Never set: carries what a route declared next reads, for `ContextOf`. */
	declare readonly '~context': Ctx;

	/** Its prefix, its runtime, its routes, the route hooks in force. */
	readonly #state: AppState;
	#server: Bun.Server<unknown> | undefined;
	#websocket: Bun.WebSocketHandler<SocketData> | undefined;

	constructor(options: AlxiaOptions<Prefix> = {}) {
		this.#state = createState(options);
	}

	readonly get = this.#method('GET');
	readonly post = this.#method('POST');
	readonly put = this.#method('PUT');
	readonly patch = this.#method('PATCH');
	readonly delete = this.#method('DELETE');
	readonly options = this.#method('OPTIONS');
	readonly head = this.#method('HEAD');
	/**
	 * A `QUERY` route: a safe, idempotent read whose criteria travel in the
	 * body, validated like a `POST`'s.
	 */
	readonly query = this.#method('QUERY');
	readonly route: OperationMethod<Ctx, Prefix, Shortcuts> = this.#do(
		declare.addOperation,
	);
	readonly static: StaticMethod<Ctx, Prefix, Shortcuts> = this.#do(
		declare.addStatic,
	);
	readonly file: FileMethod<Ctx, Prefix, Shortcuts> = this.#do(declare.addFile);
	readonly page: PageMethod<Prefix, this> = this.#do(declare.addPageAt);
	readonly ws: SocketMethod<Ctx, Prefix, Shortcuts> = this.#do(
		declare.addSocket,
	);

	readonly decorate: DecorateMethod<Ctx, Prefix, Shortcuts> = this.#do(
		hooks.decorate,
	);
	readonly derive: DeriveMethod<Ctx, Prefix, Shortcuts> = this.#do(
		hooks.derive,
	);
	readonly wrap: WrapMethod<Ctx, Prefix, Shortcuts> = this.#do(hooks.wrap);
	readonly bodyLimit: BodyLimitMethod<Ctx, Prefix, Shortcuts> = this.#do(
		hooks.bodyLimit,
	);
	readonly onError: ErrorMethod<Ctx, Prefix, Shortcuts> = this.#do(
		hooks.onError,
	);
	readonly onRefusal: RefusalMethod<Ctx, Prefix, Shortcuts> = this.#do(
		hooks.onRefusal,
	);

	readonly onRequest: RequestHookMethod<this> = this.#do(
		hooks.globalHook('onRequest'),
	);
	readonly onResponse: ResponseHookMethod<this> = this.#do(
		hooks.globalHook('onResponse'),
	);
	readonly around: AroundMethod<this> = this.#do(hooks.globalHook('around'));
	readonly onStart: StartHookMethod<this> = this.#do(
		hooks.globalHook('onStart'),
	);
	readonly onStop: StopHookMethod<this> = this.#do(hooks.globalHook('onStop'));
	readonly parser: ParserMethod<this> = this.#do(hooks.parser);

	readonly group: GroupMethod<Ctx, Prefix, Shortcuts> = this.#do(
		(state, ...args: GroupArgs) =>
			group(state, args, (prefix) => {
				const { validateResponses } = state.runtime;
				const child = new Alxia({ prefix, validateResponses });
				return [child, child.#state];
			}),
	);
	readonly use: UseMethod<this, Ctx, Prefix, Shortcuts> = ((
		...args: unknown[]
	) =>
		// Anything but middlewares is the plugin form of 0.3, deprecated.
		hooks.useMiddlewares(this.#state, args)
			? this
			: this.#plugin('use()', args)) as never;
	readonly plugin: PluginMethod<this, Ctx, Prefix, Shortcuts> = ((
		...args: unknown[]
	) => this.#plugin('plugin()', args)) as never;

	/** Every route, in the order declared: what `@alxia/openapi`'s `matchesSpec` checks against the document. */
	get routes(): readonly RouteDefinition[] {
		return this.#state.routes;
	}

	/** Every socket route, in the order declared. */
	get sockets(): readonly SocketDefinition[] {
		return this.#state.sockets;
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
	): Promise<Response> =>
		serve(this.#state.runtime, request, server, undefined);

	/**
	 * The `websocket` handler `Bun.serve` opens this app's sockets with, beside
	 * `fetch`: what `listen` passes, for a server started otherwise.
	 *
	 * ```ts
	 * Bun.serve({ fetch: app.fetch, websocket: app.websocket });
	 * ```
	 */
	get websocket(): Bun.WebSocketHandler<SocketData> {
		this.#websocket ??= websocketHandler(this.#state.runtime.validateResponses);
		return this.#websocket;
	}

	readonly request: RequestMethod = (path, init) =>
		this.fetch(new Request(new URL(path, 'http://localhost'), init));

	readonly listen: ListenMethod = (options = {}) => {
		this.#server = startServer(this.#state.runtime, options, this.websocket);
		return this.#server;
	};

	/** Stops the server `listen` started, then runs every `onStop` hook. */
	async stop(closeActiveConnections = false): Promise<void> {
		const server = this.#server;
		this.#server = undefined;
		await stopServer(this.#state.runtime, server, closeActiveConnections);
	}

	/** Mounts the plugin `args` hold: an app taken in, or a function's app. */
	#plugin(label: string, args: readonly unknown[]): AnyAlxia {
		const plugin = pluginOf(label, args);
		const app = pluginApp(label, plugin, this, (v) => v instanceof Alxia);
		if (app !== plugin) return app;
		usePlugin(this.#state, (plugin as Alxia).#state);
		return this;
	}

	/** A route method: its arguments read when it is called, see `RouteMethod`. */
	#method<M extends Method>(method: M): RouteMethod<M, Ctx, Prefix, Shortcuts> {
		return this.#do((state, path: string, ...rest: unknown[]) =>
			declare.addRoute(state, method, path, ...rest),
		);
	}

	/**
	 * A method that declares on this app's state, then returns the app. The
	 * `never` is deliberate: its interface types it, whose generic overloads
	 * the implementation does not repeat, so the specs check that they agree.
	 */
	#do<Args extends unknown[]>(
		run: (state: AppState, ...args: Args) => void,
	): never {
		return ((...args: Args) => {
			run(this.#state, ...args);
			return this;
		}) as never;
	}
}

/** A new app. */
export function alxia<const Prefix extends '' | RoutePath = ''>(
	options: AlxiaOptions<Prefix> = {},
): Alxia<Empty, Prefix, never> {
	return new Alxia(options);
}

export type {
	AlxiaOptions,
	AnyAlxia,
	ContextOf,
	ListenOptions,
	Plugin,
} from './signatures';
