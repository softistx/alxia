/**
 * One request through the proxy: its URL and headers made for the
 * upstream, its body streamed to it, the upstream's response streamed
 * back with its headers made for the client. Nothing is buffered either
 * way. The upstream fetch is aborted with the client's request — a client
 * that leaves, or a shutdown that closes what the drain left — and, until
 * the upstream's headers arrive, by the `timeout`: the most the upstream
 * may stay silent, counted again from each chunk of the request body sent.
 */
import { HttpError, shutdownSignal } from '@alxia/core';
import { type WatchedBody, watchBody } from './body';
import { badGateway, gatewayTimeout } from './failures';
import { applyEdit, requestHeaders, stripHopByHop } from './headers';
import type { Plan, ProxyContext } from './options';
import { rebaseResponse } from './rebase';
import { acrossUpstreams, neverReached, Unreached } from './retry';
import { upstreamUrl } from './upstream-url';
import type { Pool } from './upstreams';

/**
 * Forwards `ctx`'s request to an upstream of `pool`, and answers with its
 * response: to the next one when the first never received it
 * (`retry.ts`), the body read once, by the upstream that asks for it.
 */
export async function forward<Ctx>(
	pool: Pool<Ctx>,
	ctx: ProxyContext<Ctx>,
): Promise<Response> {
	const { request } = ctx;
	const first = pool.plans[0] as Plan<Ctx>;
	// The timer of the attempt in flight: each chunk of the body sent re-arms it.
	let onChunk = () => {};
	const body =
		request.body === null ||
		request.method === 'GET' ||
		request.method === 'HEAD'
			? undefined
			: watchBody(
					request.body,
					first.bodyLimit,
					request.headers.get('content-length'),
					() => onChunk(),
				);
	const replayable = () =>
		body === undefined || !(body.started() || body.stream.locked);
	return acrossUpstreams(pool, request.signal, replayable, async (plan) => {
		const attempt = attemptOf(plan, ctx, body);
		onChunk = attempt.arm;
		return respond(plan, ctx, await attempt.sent);
	});
}

interface Attempt {
	readonly plan: Plan<never>;
	readonly url: URL;
	readonly body: WatchedBody | undefined;
	readonly request: Request;
	readonly timer: AbortController;
}

/**
 * One fetch to `plan`'s upstream: `sent` resolves to its response, or
 * rejects with what the request answers — `Unreached` around the 502 when
 * the connect failed before a byte left. Until the headers arrive, the
 * `timeout` runs, re-armed by `arm`; after, never again.
 */
function attemptOf<Ctx>(
	plan: Plan<Ctx>,
	ctx: ProxyContext<Ctx>,
	body: WatchedBody | undefined,
): { readonly arm: () => void; readonly sent: Promise<Response> } {
	const { request } = ctx;
	const url = upstreamUrl(plan as Plan, ctx.url);
	const headers = requestHeaders(plan as Plan, ctx, request);
	applyEdit(headers, plan.headers.request, ctx);
	const timer = new AbortController();
	let timeout: ReturnType<typeof setTimeout> | undefined;
	let answered = false;
	const arm = () => {
		clearTimeout(timeout);
		if (answered) return;
		timeout = setTimeout(() => timer.abort(), plan.timeout);
	};
	arm();
	const sent = (async () => {
		try {
			return await fetch(url, {
				method: request.method,
				headers,
				body: body?.stream ?? null,
				duplex: 'half',
				redirect: 'manual',
				decompress: false,
				signal: AbortSignal.any([request.signal, timer.signal]),
			} as RequestInit);
		} catch (error) {
			const failure = failureOf(error, { plan, url, body, request, timer });
			const unreached =
				neverReached(error) &&
				failure instanceof HttpError &&
				failure.status === 502;
			throw unreached ? new Unreached(failure) : failure;
		} finally {
			answered = true;
			clearTimeout(timeout);
		}
	})();
	return { arm, sent };
}

/**
 * What a failed fetch answers: the error that cut the request body (a
 * 413), the client's own abort (core answers a client gone with nothing),
 * a 504 past the timeout, a 502 otherwise.
 */
function failureOf(error: unknown, attempt: Attempt): unknown {
	const cut = attempt.body?.failure();
	if (cut instanceof HttpError) return cut;
	const { signal } = attempt.request;
	if (signal.aborted) return signal.reason ?? error;
	if (attempt.timer.signal.aborted) {
		return gatewayTimeout(attempt.url, attempt.plan.timeout);
	}
	return badGateway(attempt.url, error);
}

/** The upstream's response for the client: its status, its headers made for the client, its body streamed. */
function respond<Ctx>(
	plan: Plan<Ctx>,
	ctx: ProxyContext<Ctx>,
	upstream: Response,
): Response {
	const headers = new Headers(upstream.headers);
	stripHopByHop(headers);
	rebaseResponse(plan as Plan, headers);
	applyEdit(headers, plan.headers.response, ctx);
	const empty =
		ctx.request.method === 'HEAD' ||
		upstream.status === 204 ||
		upstream.status === 304 ||
		upstream.body === null;
	let body: ReadableStream<Uint8Array> | null = empty ? null : upstream.body;
	if (body !== null && isEventStream(headers)) {
		body = endingOn(body, shutdownSignal(ctx));
	}
	return new Response(body, {
		status: upstream.status,
		statusText: upstream.statusText,
		headers,
	});
}

function isEventStream(headers: Headers): boolean {
	return (headers.get('content-type') ?? '')
		.toLowerCase()
		.startsWith('text/event-stream');
}

/**
 * `source`, ended cleanly once `signal` aborts: a stream of server-sent
 * events, which never ends on its own, closed when the app starts shutting
 * down — as core ends its own — so the drain does not wait for it.
 */
function endingOn(
	source: ReadableStream<Uint8Array>,
	signal: AbortSignal,
): ReadableStream<Uint8Array> {
	const reader = source.getReader();
	let end: (() => void) | undefined;
	return new ReadableStream<Uint8Array>({
		start(controller) {
			end = () => {
				reader.cancel().catch(() => {});
				try {
					controller.close();
				} catch {
					// Closed already.
				}
			};
			if (signal.aborted) end();
			else signal.addEventListener('abort', end, { once: true });
		},
		async pull(controller) {
			try {
				const { done, value } = await reader.read();
				if (done) {
					signal.removeEventListener('abort', end as () => void);
					controller.close();
				} else controller.enqueue(value);
			} catch (error) {
				signal.removeEventListener('abort', end as () => void);
				if (!signal.aborted) controller.error(error);
			}
		},
		cancel(reason) {
			signal.removeEventListener('abort', end as () => void);
			return reader.cancel(reason);
		},
	});
}
