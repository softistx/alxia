import { alxia, withHeaders } from '@alxia/core';
import { type Outcome, settled, watched } from './body';
import { ID, safeGenerate, safeSkip, safeWrite } from './guards';

/** One line of the log: a request answered, or a message logged during one. */
export interface LogEntry {
	readonly time: string;
	readonly level: 'info' | 'warn' | 'error';
	readonly requestId: string;
	readonly message: string;
	readonly method?: string;
	readonly path?: string;
	readonly status?: number;
	/**
	 * Milliseconds from the request to its response, or, for a streamed
	 * body, to the end of that body.
	 */
	readonly duration?: number;
	/** A streamed body's: milliseconds from the request to its response's headers. */
	readonly timeToHeaders?: number;
	/** A streamed body's: whether it was sent whole, left by its client, or failed. */
	readonly outcome?: 'completed' | 'aborted' | 'errored';
	readonly ip?: string;
	readonly [field: string]: unknown;
}

/** The log of one request: each entry carries its id. */
export interface RequestLog {
	info(message: string, fields?: Record<string, unknown>): void;
	warn(message: string, fields?: Record<string, unknown>): void;
	error(message: string, fields?: Record<string, unknown>): void;
}

export interface LoggerOptions {
	/**
	 * Writes an entry. One JSON line on stdout by default. A `write` that
	 * throws loses that entry, never the request: its error goes to
	 * `console.error`.
	 */
	readonly write?: (entry: LogEntry) => void;
	/** The header a request id is read from and sent back in. `x-request-id` by default. */
	readonly header?: string;
	/**
	 * Makes an id. `crypto.randomUUID` by default. An id that is not 1 to
	 * 128 letters, digits or `_.:@-` — what an incoming id must be — is
	 * replaced by a `crypto.randomUUID()`.
	 */
	readonly generateId?: () => string;
	/** Whether an incoming id is kept: behind a proxy that sets it. On by default. */
	readonly trustIncomingId?: boolean;
	/** Whether the response says how long it took, in `Server-Timing`. On by default. */
	readonly serverTiming?: boolean;
	/**
	 * Requests that are not logged: a health check. Their id is still set.
	 * A `skip` that throws logs the request.
	 */
	readonly skip?: (request: Request, url: URL) => boolean;
}

interface State {
	readonly id: string;
	readonly start: number;
}

/**
 * Logging, as a plugin: every request gets an id — kept from the incoming
 * header, or made — sent back on its response, and one entry once
 * answered. The routes declared after it read `requestId`, and `log`, whose
 * entries carry the id.
 *
 * ```ts
 * app.use(logger()).get('/', ({ log, reply }) => { log.info('home'); return reply(200); });
 * ```
 */
export function logger(options: LoggerOptions = {}) {
	const header = options.header ?? 'x-request-id';
	const write = safeWrite(
		options.write ?? ((entry: LogEntry) => console.log(JSON.stringify(entry))),
	);
	const generate = safeGenerate(options.generateId);
	const skipped = safeSkip(options.skip);
	const trust = options.trustIncomingId ?? true;
	const timing = options.serverTiming ?? true;
	const states = new WeakMap<Request, State>();

	const stateOf = (request: Request): State => {
		let state = states.get(request);
		if (state === undefined) {
			const incoming = request.headers.get(header);
			state = {
				id:
					trust && incoming !== null && ID.test(incoming)
						? incoming
						: generate(),
				start: performance.now(),
			};
			states.set(request, state);
		}
		return state;
	};

	const logOf = (id: string): RequestLog => {
		const entry =
			(level: LogEntry['level']) =>
			(message: string, fields: Record<string, unknown> = {}) =>
				write({
					...fields,
					time: new Date().toISOString(),
					level,
					requestId: id,
					message,
				});
		return { info: entry('info'), warn: entry('warn'), error: entry('error') };
	};

	return alxia()
		.onRequest(({ request }) => {
			stateOf(request);
		})
		.onResponse((response, { request, url, ip }) => {
			const state = stateOf(request);
			const duration = since(state.start);
			const sent = withHeaders(response, (headers) => {
				headers.set(header, state.id);
				if (timing) headers.append('server-timing', `total;dur=${duration}`);
			});
			if (skipped(request, url)) return sent;
			const entry = (
				duration: number,
				streamed?: { timeToHeaders: number; outcome: Outcome },
			): LogEntry => {
				const outcome =
					streamed === undefined || streamed.outcome === 'completed'
						? ''
						: ` ${streamed.outcome}`;
				return {
					time: new Date().toISOString(),
					level: levelOf(sent.status, streamed?.outcome),
					requestId: state.id,
					message: `${request.method} ${url.pathname} ${sent.status}${outcome}`,
					method: request.method,
					path: url.pathname,
					status: sent.status,
					duration,
					...streamed,
					...(ip === undefined ? {} : { ip }),
				};
			};
			if (settled(sent)) {
				write(entry(duration));
				return sent;
			}
			// A stream: logged once it has been sent, or has stopped.
			const body = watched(sent.body as ReadableStream<Uint8Array>, (outcome) =>
				write(entry(since(state.start), { timeToHeaders: duration, outcome })),
			);
			return new Response(body, {
				status: sent.status,
				statusText: sent.statusText,
				headers: sent.headers,
			});
		})
		.derive(({ request }) => {
			const { id } = stateOf(request);
			return { requestId: id, log: logOf(id) };
		});
}

/** Milliseconds since `start`, to two decimals. */
function since(start: number): number {
	return Math.round((performance.now() - start) * 100) / 100;
}

/** By the status, then raised by a body that did not end well. */
function levelOf(status: number, outcome?: Outcome): LogEntry['level'] {
	if (status >= 500 || outcome === 'errored') return 'error';
	if (status >= 400 || outcome === 'aborted') return 'warn';
	return 'info';
}
