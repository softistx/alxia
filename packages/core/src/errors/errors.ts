/** Where a refused value was read from. */
export type ValidationTarget =
	| 'params'
	| 'query'
	| 'headers'
	| 'cookies'
	| 'body'
	| 'message';

export interface ValidationIssue {
	readonly target: ValidationTarget;
	readonly path: readonly (string | number)[];
	readonly code: string;
	readonly message: string;
}

/** A part of the request a route validates: where a refused value was read from. */
export type RequestPart = Exclude<ValidationTarget, 'message'>;

/**
 * A request the route's schemas refused, as an `onRefusal` hook reads it:
 * the first part that failed, in the order params, query, headers,
 * cookies, body, and every issue, each naming its own part.
 */
export interface ValidationRefusal {
	readonly kind: 'validation';
	readonly part: RequestPart;
	readonly issues: readonly ValidationIssue[];
}

/**
 * A request body larger than its route's `bodyLimit`, as an `onRefusal`
 * hook reads it: the limit, in bytes. Its default is the 413 of
 * `ContentTooLargeBody`.
 */
export interface BodyLimitRefusal {
	readonly kind: 'body_limit';
	readonly limit: number;
}

/**
 * Why the app refused a request before its handler ran, as an `onRefusal`
 * hook reads it, told apart by `kind`: `validation` or `body_limit`. A
 * kind added later reaches a hook that returns nothing for it as its
 * default.
 */
export type Refusal = ValidationRefusal | BodyLimitRefusal;

/** The body of the 400 every route that validates its request may answer. */
export interface ValidationErrorBody {
	readonly error: 'validation';
	readonly issues: readonly ValidationIssue[];
}

/** The body of the 500 any route may answer. Nothing of the error leaks. */
export interface InternalErrorBody {
	readonly error: 'internal';
}

/** The body of the 404, 405 and 426 the app answers outside every route. */
export interface RoutingErrorBody {
	readonly error: 'not_found' | 'method_not_allowed' | 'upgrade_required';
}

/**
 * An error a handler or a hook throws to answer with `status` and `body`.
 *
 * Prefer returning `reply(status, body)`: a reply is part of the route's
 * type, and the client sees it. A thrown `HttpError` is not, so the client
 * reads it as a status the route never declared.
 */
export class HttpError<
	Status extends number = number,
	Body = unknown,
> extends Error {
	override readonly name: string = 'HttpError';
	readonly status: Status;
	readonly body: Body;

	constructor(status: Status, body: Body, message?: string) {
		super(message ?? `HTTP ${status}`);
		this.status = status;
		this.body = body;
	}
}

/** The body of the 413 a route with a `bodyLimit` answers to a larger body. */
export interface ContentTooLargeBody {
	readonly error: 'content_too_large';
	/** The route's limit, in bytes. */
	readonly limit: number;
}

/**
 * A request body larger than its route's `bodyLimit`: what reading it
 * throws, as soon as its `Content-Length` or the bytes counted pass the
 * limit. It is answered as a `body_limit` refusal: by the route's
 * `onRefusal` hook, or with its 413. The `onError` hooks never see it.
 */
export class ContentTooLargeError extends HttpError<413, ContentTooLargeBody> {
	override readonly name = 'ContentTooLargeError';
	/** The route's limit, in bytes. */
	readonly limit: number;

	constructor(limit: number) {
		super(
			413,
			{ error: 'content_too_large', limit },
			`The request body is larger than the route's limit of ${limit} bytes`,
		);
		this.limit = limit;
	}
}

/**
 * A reply that did not match the schema its route declares for its status.
 * It is answered as a 500: the client must never read an undeclared shape.
 */
export class ResponseValidationError extends Error {
	override readonly name = 'ResponseValidationError';
	readonly status: number;
	readonly issues: readonly ValidationIssue[];

	constructor(
		method: string,
		path: string,
		status: number,
		issues: readonly ValidationIssue[],
		/** Set by `undeclared`, for a status the route has no schema for. */
		message?: string,
	) {
		super(
			message ??
				`${method} ${path}: the ${status} reply does not match its schema: ${issues
					.map(
						(issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
					)
					.join('; ')}`,
		);
		this.status = status;
		this.issues = issues;
	}

	/** A reply whose status the route declares no schema for. */
	static undeclared(
		method: string,
		path: string,
		status: number,
	): ResponseValidationError {
		return new ResponseValidationError(
			method,
			path,
			status,
			[
				{
					target: 'body',
					path: [],
					code: 'undeclared_status',
					message: `the route declares no ${status} reply`,
				},
			],
			`${method} ${path} declares no ${status} reply`,
		);
	}
}
