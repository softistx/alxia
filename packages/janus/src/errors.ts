import {
	type BaseContext,
	defineMiddleware,
	type Middleware,
	type MiddlewareMark,
	type Next,
	type Reply,
} from '@alxia/core';
import {
	JanusError,
	type JanusErrorCode,
	type JanusErrorStatus,
	statusOf,
} from '@nxgt/janus';

/**
 * The body a refusal is answered with: its `code`, and only what the client
 * can act on. Never `reason`, `login`, a hash prefix or a cause: those are
 * for your logs. `@nxgt/janus-hono`'s `bodyOf`, kept twice on purpose.
 */
export interface JanusErrorBody {
	readonly code: JanusErrorCode;
	readonly issues?: JanusError['issues'];
	readonly minLength?: number;
	readonly attemptsLeft?: number;
	readonly retryAfter?: number;
}

export function bodyOf(error: JanusError): JanusErrorBody {
	switch (error.code) {
		case 'USER_INVALID':
			return { code: error.code, issues: error.issues ?? [] };
		case 'PASSWORD_TOO_SHORT':
			return error.minLength === undefined
				? { code: error.code }
				: { code: error.code, minLength: error.minLength };
		case 'CODE_INVALID':
			return error.attemptsLeft === undefined
				? { code: error.code }
				: { code: error.code, attemptsLeft: error.attemptsLeft };
		case 'CREDENTIALS_INVALID':
			return error.retryAfter === undefined
				? { code: error.code }
				: { code: error.code, retryAfter: error.retryAfter };
		default:
			return { code: error.code };
	}
}

export interface JanusErrorsOptions {
	/**
	 * Called with every `JanusError` answered 5xx — `STORE_FAILED` and the
	 * like, the server's to fix — as it is answered: started, not awaited,
	 * so a slow report never holds the response. It cannot change the
	 * answer: one that throws or rejects is a warning.
	 */
	readonly report?: (error: JanusError, ctx: BaseContext) => unknown;
}

/** What `janusErrors()` makes: a middleware that answers what janus throws behind it. */
export type JanusErrors = Middleware<
	object,
	Promise<Next | Reply<JanusErrorStatus, JanusErrorBody>>
> &
	MiddlewareMark;

/**
 * Janus's errors answered, as a middleware: every `JanusError` thrown
 * behind it — by `session()`, `permission()`, a route — a sign-in
 * refused, a login taken, a store down — is answered with janus's status
 * and `bodyOf(error)`, typed on the routes declared after it. A throttled
 * sign-in carries `Retry-After`. Anything else goes on, thrown, to the
 * middlewares before it, the app's `onError` or its 500.
 *
 * Give it to `use` before `session()`, so that a store down while the
 * session is read is answered too:
 *
 * ```ts
 * app.use(janusErrors(), session(accounts)).post('/sign-in', ...);
 * ```
 *
 * **`STORE_FAILED` is a 503**, never a 401 or a 404: an outage is not an
 * answer.
 */
export function janusErrors(options: JanusErrorsOptions = {}): JanusErrors {
	return defineMiddleware(async (ctx, next) => {
		try {
			return await next();
		} catch (error) {
			if (!(error instanceof JanusError)) throw error;
			return answer(error, ctx, options);
		}
	});
}

/** A `JanusError`, answered: its status, its body, reported when a 5xx. */
function answer(
	error: JanusError,
	ctx: BaseContext,
	options: JanusErrorsOptions,
): Reply<JanusErrorStatus, JanusErrorBody> {
	const status: JanusErrorStatus = statusOf(error.code);
	if (status >= 500 && options.report !== undefined) {
		Promise.resolve()
			.then(() => options.report?.(error, ctx))
			.catch((failure: unknown) =>
				process.emitWarning(`janusErrors(): report failed: ${String(failure)}`),
			);
	}
	const body = bodyOf(error);
	return ctx.reply(
		status,
		body,
		error.retryAfter === undefined
			? {}
			: { headers: { 'retry-after': String(error.retryAfter) } },
	);
}

export { statusOf };
