import {
	defineMiddleware,
	type Empty,
	type Middleware,
	markFactory,
	type Next,
	onOperation,
	operationOf,
	settle,
	withHeaders,
} from '@alxia/core';
import { settled, watched } from './body';
import { type Answered, entryOf, since } from './entry';
import { ID, safeGenerate, safeSkip, safeWrite } from './guards';
import { operationLines, upgrading } from './socket';

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
	/**
	 * A streamed body's: whether it was sent whole, left by its client, or
	 * failed. An operation over a socket's: `ok`, or `errors` when it was
	 * answered with errors.
	 */
	readonly outcome?: 'completed' | 'aborted' | 'errored' | 'ok' | 'errors';
	readonly ip?: string;
	/**
	 * The GraphQL operation's name, when `@alxia/graphql` served it and it has
	 * one; a batched body's names, joined by commas.
	 */
	readonly operationName?: string;
	/** `query`, `mutation`, `subscription`, or `batch` for a batched body. */
	readonly operationType?: string;
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

/** What `logger()` makes: a middleware that gives `requestId` and `log`. */
export type LoggerMiddleware = Middleware<Empty, Promise<Next<LoggerContext>>>;

/**
 * Logging, as a middleware: every request gets an id — kept from the
 * incoming header, or made — sent back on its response, and one entry once
 * answered. The routes declared after it read `requestId`, and `log`,
 * whose entries carry the id. Give it to `use` first: its timing then
 * holds everything after it, and a request no route matches — a 404, a
 * 405 — is logged too, wherever it stands. A socket's upgrade is logged
 * as a request, then each operation its plugin reports with core's
 * `startOperation` (`@alxia/graphql` over `ws` does) gets a line of its
 * own once it ended, carrying the upgrade's id.
 *
 * ```ts
 * app.use(logger()).get('/', ({ log, reply }) => { log.info('home'); return reply(200); });
 * ```
 */
export function logger(options: LoggerOptions = {}): LoggerMiddleware {
	const header = options.header ?? 'x-request-id';
	const write = safeWrite(
		options.write ?? ((entry: LogEntry) => console.log(JSON.stringify(entry))),
	);
	const generate = safeGenerate(options.generateId);
	const skipped = safeSkip(options.skip);
	const trust = options.trustIncomingId ?? true;
	const timing = options.serverTiming ?? true;

	return defineMiddleware(async function logger(ctx, next) {
		const start = performance.now();
		const { request, url, ip } = ctx;
		const incoming = request.headers.get(header);
		const id =
			trust && incoming !== null && ID.test(incoming) ? incoming : generate();
		const added: LoggerContext = { requestId: id, log: logOf(write, id) };
		if (upgrading(request) && !skipped(request, url)) {
			const upgrade = { id, method: request.method, path: url.pathname, ip };
			onOperation(ctx, operationLines(write, upgrade));
		}
		const response = await settle(ctx, next(added));
		const duration = since(start);
		const sent = withHeaders(response, (headers) => {
			headers.set(header, id);
			if (timing) headers.append('server-timing', `total;dur=${duration}`);
		});
		if (skipped(request, url)) return sent as typeof response;
		const answered: Answered = {
			id,
			method: request.method,
			path: url.pathname,
			status: sent.status,
			ip,
			operation: operationOf(ctx),
		};
		if (settled(sent)) {
			write(entryOf(answered, duration));
			return sent as typeof response;
		}
		// A stream: logged once it has been sent, or has stopped.
		const body = watched(sent.body as ReadableStream<Uint8Array>, (outcome) =>
			write(
				entryOf(answered, since(start), { timeToHeaders: duration, outcome }),
			),
		);
		return new Response(body, {
			status: sent.status,
			statusText: sent.statusText,
			headers: sent.headers,
		}) as typeof response;
	});
}

/** What the routes after `logger()` read. */
export interface LoggerContext {
	/** This request's id: the incoming one when trusted, else a fresh one. */
	readonly requestId: string;
	/** Entries that carry the id. */
	readonly log: RequestLog;
}

/** The log of the request `id`: each entry written through `write`. */
function logOf(write: (entry: LogEntry) => void, id: string): RequestLog {
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
}

markFactory(logger);
