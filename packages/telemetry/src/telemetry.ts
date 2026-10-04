import {
	defineMiddleware,
	type Next,
	type RequestContext,
	settle,
} from '@alxia/core';
import {
	continuing,
	createTelemetry,
	type SpanScope,
	type Telemetry,
	type TelemetryOptions,
	withTelemetry,
} from '@nxgt/telemetry';
import {
	HTTP_ROUTE,
	HTTP_STATUS,
	requestAttributes,
	serverFailed,
} from './attributes';
import { type Outcome, settled, watched } from './body';

interface Hooks {
	/**
	 * Whether a request gets a span. Every one does by default: a library
	 * that decides which requests do not matter hides the one that did.
	 */
	readonly traced?: (ctx: RequestContext) => boolean;
	/** The span's name before routing. `"<METHOD> <path>"` by default, then `"<METHOD> <route>"`. */
	readonly spanName?: (ctx: RequestContext) => string;
	/** Whether the response says `traceparent` back, so a caller can find the trace. Off by default. */
	readonly traceResponse?: boolean;
}

/**
 * A telemetry built from `service` and `@nxgt/telemetry`'s options, and
 * installed; or one handed over as `instance`, adopted and not closed.
 */
export type TelemetryPluginOptions =
	| (Hooks &
			TelemetryOptions & {
				/** The service name: everything groups by it. */
				readonly service: string;
				readonly instance?: undefined;
			})
	| (Hooks & {
			readonly instance: Telemetry;
			readonly service?: undefined;
	  });

/** What the routes after `telemetry()` read. */
export interface TelemetryContext {
	/** The server span around this request; `undefined` when `traced` said no. */
	readonly span: SpanScope | undefined;
	readonly telemetry: Telemetry;
}

/**
 * One server span per request, with [`@nxgt/telemetry`](https://www.npmjs.com/package/@nxgt/telemetry),
 * as a middleware.
 *
 * Give it to `use` first: the span then holds everything the request
 * runs after it — the middlewares, the handler, what they await, the
 * answer to an error — and every log written with `createLogger` inside
 * it carries its trace id. A request no route matches gets one too. An
 * inbound `traceparent` continues its trace; an unusable one starts a
 * fresh trace. The span is named for the route, `GET /users/:id`, once
 * routing has matched. Only a 5xx marks it an error. A WebSocket upgrade
 * gets no span: there is no response to time.
 *
 * A streamed body (a page rendered as it goes, an event stream) keeps the
 * span open until it has been sent: a body that fails midway marks it an
 * error, and a client that leaves midway adds an `http.response.aborted`
 * event. A body of known length, or none, ends the span with the response.
 *
 * Routes declared after it read the span as `span`, and the telemetry as
 * `telemetry`.
 *
 * ```ts
 * const tracing = telemetry({ service: 'checkout', exporters: [otlpExporter({ endpoint })] });
 * const app = alxia().use(tracing).get(...);
 * app.onStop(() => tracing.telemetry.close());
 * ```
 */
export function telemetry(options: TelemetryPluginOptions) {
	const instance =
		options.instance ?? createTelemetry(options.service, options).install();
	const traced = guarded(options.traced ?? (() => true), () => true);
	const spanName = guarded(options.spanName ?? defaultName, defaultName);

	const middleware = defineMiddleware(async (ctx, next) => {
		const untraced: TelemetryContext = { span: undefined, telemetry: instance };
		const upgrade =
			ctx.request.headers.get('upgrade')?.toLowerCase() === 'websocket';
		if (upgrade || !traced(ctx)) return next(untraced);
		// Resolved with the response as soon as there is one; the span itself
		// stays open until a streamed body has been sent, or has stopped.
		const { promise, resolve, reject } =
			Promise.withResolvers<Next<TelemetryContext>>();
		const answer = (response: Response) =>
			resolve(response as Next<TelemetryContext>);
		withTelemetry(instance, () =>
			continuing(
				ctx.request.headers.get('traceparent'),
				spanName(ctx),
				{ kind: 'server' },
				async (scope) => {
					// The span's own, not `SpanOptions.attributes`: those every span
					// and log inside inherits, and a database call is not the request.
					scope.attributes(
						requestAttributes(ctx.url, ctx.request.method, ctx.ip),
					);
					const added: TelemetryContext = { span: scope, telemetry: instance };
					const response = await settle(ctx, next(added));
					if (ctx.route !== undefined) {
						scope.name = `${ctx.request.method} ${ctx.route}`;
						scope.attribute(HTTP_ROUTE, ctx.route);
					}
					record(scope, response.status, ctx.error);
					if (options.traceResponse) {
						try {
							response.headers.set('traceparent', scope.traceparent());
						} catch {
							// An immutable response keeps its headers; the span is what matters.
						}
					}
					return handOver(scope, response, answer);
				},
			),
		).then(answer, reject);
		return promise;
	});

	return Object.assign(middleware, { telemetry: instance });
}

/**
 * The status, and the failure. A route's error is recorded as the span's
 * exception, but only a 5xx makes it an error: a 401 a guard answered is
 * the server working.
 */
function record(scope: SpanScope, status: number, error: unknown): void {
	if (error !== undefined) {
		const before = scope.status;
		scope.fail(error);
		if (!serverFailed(status)) scope.status = before;
	}
	scope.attribute(HTTP_STATUS, status);
	if (serverFailed(status) && scope.status === 'ok') scope.status = 'error';
}

/**
 * The response the span ends with. A body with nothing left to time, or a
 * span never exported, is returned as it is: the span ends, then the
 * response is handed over. A streamed body is handed over at once through
 * `resolve`, watched, and returned once it has ended, so the span ends then.
 */
async function handOver(
	scope: SpanScope,
	response: Response,
	resolve: (response: Response) => void,
): Promise<Response> {
	if (settled(response) || !scope.context.sampled) return response;
	const { promise: sent, resolve: end } = Promise.withResolvers<void>();
	const body = watched(
		response.body as ReadableStream<Uint8Array>,
		(outcome, error) => {
			try {
				ended(scope, outcome, error);
			} finally {
				end();
			}
		},
	);
	const streamed = new Response(body, {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
	});
	resolve(streamed);
	await sent;
	return streamed;
}

/**
 * How a streamed body ended, on its span: a body that failed fails the
 * span, as a 5xx does; a client that left is an event, the server having
 * done nothing wrong.
 */
function ended(scope: SpanScope, outcome: Outcome, error: unknown): void {
	if (outcome === 'errored') {
		scope.fail(error);
		// `fail` keeps a failure recorded before, and its status with it.
		scope.status = 'error';
	} else if (outcome === 'aborted') scope.event(RESPONSE_ABORTED);
}

/** The event of a server span whose client left before the body was sent. */
const RESPONSE_ABORTED = 'http.response.aborted';

function defaultName(ctx: RequestContext): string {
	return `${ctx.request.method} ${ctx.url.pathname}`;
}

/** A hook, and what to answer when it throws: observability never costs the request. */
function guarded<T>(
	hook: (ctx: RequestContext) => T,
	fallback: (ctx: RequestContext) => T,
): (ctx: RequestContext) => T {
	return (ctx) => {
		try {
			return hook(ctx);
		} catch {
			return fallback(ctx);
		}
	};
}
