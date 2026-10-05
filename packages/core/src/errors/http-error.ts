/**
 * `HttpError`: what a handler or a middleware throws to answer with a
 * status, in the app's error format — its `body` by default, an RFC 9457
 * problem under `alxia({ errors: 'problem' })`, built from its `type`,
 * `title`, `detail` and `extensions`.
 */

/** What an `HttpError` says beside its status and body: its message, and its problem's members. */
export interface HttpErrorOptions {
	/** The error's message, for the logs: `HTTP <status>` by default. Never sent. */
	readonly message?: string;
	/** The problem's `type`, a URI naming the kind of problem: `about:blank` by default. */
	readonly type?: string;
	/** The problem's `title`: the status's reason phrase by default (`Not Found`). */
	readonly title?: string;
	/** The problem's `detail`, what went wrong with this occurrence: the `title` by default. */
	readonly detail?: string;
	/**
	 * The problem's extension members, sent beside `type`, `title`,
	 * `status`, `detail` and `instance`, which they never replace.
	 */
	readonly extensions?: Readonly<Record<string, unknown>>;
	/** What caused it, as `Error`'s `cause`. */
	readonly cause?: unknown;
}

/**
 * An error a handler or a middleware throws to answer with `status`.
 * Uncaught, the route boundary answers it: with `body` by default, or,
 * under `alxia({ errors: 'problem' })`, with an `application/problem+json`
 * body made of `type`, `title`, `status`, `detail`, `instance` and the
 * `extensions`:
 *
 * ```ts
 * throw new HttpError(409, { error: 'taken' }, {
 *   type: 'https://example.com/problems/taken',
 *   detail: `${login} is taken`,
 *   extensions: { login },
 * });
 * ```
 *
 * Prefer returning `reply(status, body)`: a reply is checked against the
 * route's `responds`, at compile time and at runtime. A thrown `HttpError`
 * is not: it answers a status the route may never have declared.
 */
export class HttpError<
	Status extends number = number,
	Body = unknown,
> extends Error {
	override readonly name: string = 'HttpError';
	readonly status: Status;
	readonly body: Body;
	/** The problem's `type`; `about:blank` when none is given. */
	readonly type: string | undefined;
	/** The problem's `title`; the status's reason phrase when none is given. */
	readonly title: string | undefined;
	/** The problem's `detail`; the `title` when none is given. */
	readonly detail: string | undefined;
	/** The problem's extension members. */
	readonly extensions: Readonly<Record<string, unknown>> | undefined;

	/** `options` may be the message alone, as before 0.5. */
	constructor(status: Status, body: Body, options?: string | HttpErrorOptions) {
		const given = typeof options === 'string' ? { message: options } : options;
		super(
			given?.message ?? `HTTP ${status}`,
			given?.cause === undefined ? undefined : { cause: given.cause },
		);
		this.status = status;
		this.body = body;
		this.type = given?.type;
		this.title = given?.title;
		this.detail = given?.detail;
		this.extensions = given?.extensions;
	}
}
