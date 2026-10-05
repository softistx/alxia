/**
 * The app's error format, and the RFC 9457 problems alxia answers with
 * under `alxia({ errors: 'problem' })`: an escaped `HttpError` (a
 * refusal's 400 and 413 among them), a 500, and the router's 404, 405
 * and 426, each as an `application/problem+json` body with `type`,
 * `title`, `status`, `detail` and `instance`.
 */
import type { ValidationIssue } from './errors';
import type { HttpError } from './http-error';
import { statusText } from './status-text';

/**
 * How the app answers the errors it answers itself: `json`, its bodies
 * of `{ error: … }` (the default), or `problem`, RFC 9457 problem details.
 */
export type ErrorFormat = 'json' | 'problem';

/**
 * A problem as alxia sends it: the five members RFC 9457 defines, each
 * present, and the extension members `Extensions` gives. Declare it in the
 * OpenAPI document as the `Problem` schema the errors guide gives.
 */
export type Problem<
	Status extends number = number,
	Extensions extends object = object,
> = {
	/** A URI naming the kind of problem: `about:blank` for one the status says all of. */
	readonly type: string;
	/** A short summary of the kind of problem: the status's reason phrase for `about:blank`. */
	readonly title: string;
	readonly status: Status;
	/** What went wrong with this occurrence. */
	readonly detail: string;
	/** The request's path: the occurrence. */
	readonly instance: string;
} & Extensions;

/** The 400 of a request a `validate` refused, as a problem: every issue in `issues`. */
export type ValidationProblem = Problem<
	400,
	{ readonly issues: readonly ValidationIssue[] }
>;

/** The 413 of a body past its route's `bodyLimit`, as a problem: the limit in bytes. */
export type ContentTooLargeProblem = Problem<413, { readonly limit: number }>;

/** The members a problem is made of: its status, and what defaults when left out. */
export type ProblemInit<Status extends number = number> = {
	readonly status: Status;
	readonly type?: string;
	readonly title?: string;
	readonly detail?: string;
} & Readonly<Record<string, unknown>>;

type Members = 'type' | 'title' | 'status' | 'detail' | 'instance';

/**
 * The problem `init` describes, on the request of `ctx`: `type`
 * `about:blank`, `title` the status's reason phrase and `detail` the
 * title unless given, `instance` the request's path, and every other
 * member of `init` an extension. What a middleware answers with in the
 * app's format:
 *
 * ```ts
 * return errorFormat(ctx) === 'problem'
 *   ? problem(problemOf(ctx, { status: 402, detail: 'The plan is over its quota', quota }))
 *   : reply(402, { error: 'quota' });
 * ```
 */
export function problemOf<const Init extends ProblemInit>(
	ctx: { readonly url: URL },
	init: Init,
): Problem<Init['status'], Omit<Init, Members>> {
	const { status, type, title, detail, ...extensions } = init;
	return made(
		status,
		ctx.url.pathname,
		extensions,
		type,
		title,
		detail,
	) as Problem<Init['status'], Omit<Init, Members>>;
}

/** An escaped `HttpError` as a problem, on the request at `instance`. */
export function problemOfError(error: HttpError, instance: string): Problem {
	return made(
		error.status,
		instance,
		error.extensions ?? {},
		error.type,
		error.title,
		error.detail,
	) as Problem;
}

/** A problem, its five members first, then the extensions that do not reuse their names. */
function made(
	status: number,
	instance: string,
	extensions: Readonly<Record<string, unknown>>,
	type = 'about:blank',
	title = statusText(status),
	detail = title,
): Record<string, unknown> {
	const problem: Record<string, unknown> = {
		type,
		title,
		status,
		detail,
		instance,
	};
	for (const [key, value] of Object.entries(extensions)) {
		if (!Object.hasOwn(problem, key)) problem[key] = value;
	}
	return problem;
}
