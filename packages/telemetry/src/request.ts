/**
 * What the server span of one request records: what is known before
 * routing, the route once matched, the operation its endpoint reported,
 * the status and the failure; a socket's upgrade also opens a span for
 * each operation the socket runs.
 */
import {
	type BaseContext,
	type Next,
	onOperation,
	operationOf,
	settle,
} from '@alxia/core';
import type { SpanScope, Telemetry } from '@nxgt/telemetry';
import { HTTP_ROUTE, operationSpan, requestAttributes } from './attributes';
import { operationSpans } from './socket';
import { handOver, record } from './span';
import type { TelemetryContext } from './telemetry';

/** What the request's span is traced with. */
export interface Tracing {
	readonly instance: Telemetry;
	readonly traceResponse: boolean | undefined;
	/** Hands the response over as soon as there is one. */
	readonly answer: (response: Response) => void;
}

/**
 * Runs the rest of the request inside `scope`, and records it there. The
 * span ends with the response, or once a streamed body has been sent.
 */
export async function traceRequest(
	scope: SpanScope,
	ctx: BaseContext,
	next: (added: TelemetryContext) => Promise<Next<TelemetryContext>>,
	tracing: Tracing,
): Promise<Response> {
	const { request, url, ip } = ctx;
	// The span's own, not `SpanOptions.attributes`: those every span and log
	// inside inherits, and a database call is not the request.
	scope.attributes(requestAttributes(url, request.method, ip));
	if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
		onOperation(ctx, operationSpans(tracing.instance, scope.traceparent()));
	}
	const added: TelemetryContext = { span: scope, telemetry: tracing.instance };
	const response = await settle(ctx, next(added));
	named(scope, ctx);
	record(scope, response.status, ctx.error);
	if (tracing.traceResponse) {
		try {
			response.headers.set('traceparent', scope.traceparent());
		} catch {
			// An immutable response keeps its headers; the span is what matters.
		}
	}
	return handOver(scope, response, tracing.answer);
}

/** The span named for the route, then for the operation it ran, if any. */
function named(scope: SpanScope, ctx: BaseContext): void {
	if (ctx.route !== undefined) {
		scope.name = `${ctx.request.method} ${ctx.route}`;
		scope.attribute(HTTP_ROUTE, ctx.route);
	}
	const operation = operationOf(ctx);
	if (operation !== undefined) {
		const { name, attributes } = operationSpan(operation);
		scope.name = name;
		scope.attributes(attributes);
	}
}
