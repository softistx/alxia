import { HttpError } from './http-error';

export { HttpError, type HttpErrorOptions } from './http-error';

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
 * A request the route's schemas refused, as `refusalOf` reads it:
 * the first part that failed, in the order params, query, headers,
 * cookies, body, and every issue, each naming its own part.
 */
export interface ValidationRefusal {
	readonly kind: 'validation';
	readonly part: RequestPart;
	readonly issues: readonly ValidationIssue[];
}

/**
 * A request body larger than its route's `bodyLimit`, as `refusalOf`
 * reads it: the limit, in bytes. Its default answer is the 413 of
 * `ContentTooLargeBody`.
 */
export interface BodyLimitRefusal {
	readonly kind: 'body_limit';
	readonly limit: number;
}

/**
 * Why the app refused a request before its handler ran, as `refusalOf`
 * reads it, told apart by `kind`: `validation` or `body_limit`. A
 * middleware that answers some kinds throws the others on, so a kind
 * added later reaches the default answer.
 */
export type Refusal = ValidationRefusal | BodyLimitRefusal;

/** The kinds of refusal: `validation`, `body_limit`. */
export type RefusalKind = Refusal['kind'];

/** The refusal of one `Kind`: `refusalOf(error)` narrowed by its `kind`. */
export type RefusalOfKind<Kind extends RefusalKind> = Extract<
	Refusal,
	{ readonly kind: Kind }
>;

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

/** The body of the 413 a route with a `bodyLimit` answers to a larger body. */
export interface ContentTooLargeBody {
	readonly error: 'content_too_large';
	/** The route's limit, in bytes. */
	readonly limit: number;
}

/**
 * A request body larger than its route's `bodyLimit`: what reading it
 * throws, as soon as its `Content-Length` or the bytes counted pass the
 * limit. A middleware before the read may answer it, reading
 * `refusalOf(error)`; the route answers its 413 otherwise.
 */
export class ContentTooLargeError extends HttpError<413, ContentTooLargeBody> {
	override readonly name = 'ContentTooLargeError';
	/** The route's limit, in bytes. */
	readonly limit: number;

	constructor(limit: number) {
		super(
			413,
			{ error: 'content_too_large', limit },
			{
				message: `The request body is larger than the route's limit of ${limit} bytes`,
				detail: `The request body is larger than the limit of ${limit} bytes`,
				extensions: { limit },
			},
		);
		this.limit = limit;
	}
}

/**
 * A request a `validate` refused: what it throws, carrying the refusal.
 * Thrown, so that a middleware before the `validate` answers it in its
 * own format — `try { return await next() } catch (error) { … }`, reading
 * `refusalOf(error)` — before the route answers the 400 of
 * `ValidationErrorBody`.
 */
export class ValidationError extends HttpError<400, ValidationErrorBody> {
	override readonly name = 'ValidationError';
	readonly refusal: ValidationRefusal;

	constructor(refusal: ValidationRefusal) {
		super(
			400,
			{ error: 'validation', issues: refusal.issues },
			{
				message: `The request's ${refusal.part} is invalid`,
				detail: `The request's ${refusal.part} is invalid`,
				extensions: { issues: refusal.issues },
			},
		);
		this.refusal = refusal;
	}
}

/**
 * The refusal `error` is: a
 * `ValidationError` a `validate` threw, or the `ContentTooLargeError` a
 * body past its limit throws; `undefined` for any other error. What a
 * middleware reads to answer a refusal itself:
 *
 * ```ts
 * const problems = defineMiddleware(async ({ reply }, next) => {
 *   try {
 *     return await next();
 *   } catch (error) {
 *     const refusal = refusalOf(error);
 *     if (refusal?.kind !== 'validation') throw error;
 *     return reply(422, { detail: `the ${refusal.part} is invalid` });
 *   }
 * });
 * ```
 */
export function refusalOf(error: unknown): Refusal | undefined {
	if (error instanceof ValidationError) return error.refusal;
	if (error instanceof ContentTooLargeError) {
		return { kind: 'body_limit', limit: error.limit };
	}
	return undefined;
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
