import {
	type BaseContext,
	check,
	defineMiddleware,
	type Empty,
	errorFormat,
	type InferOutput,
	type Middleware,
	markFactory,
	type Next,
	type Problem,
	problem,
	problemOf,
	type Reply,
	type StandardSchemaV1,
	type ValidationIssue,
} from '@alxia/core';
import type { JwtClaims, Verifier, VerifyResult } from './jwt';

export interface BearerOptions<Schema extends StandardSchemaV1 | undefined> {
	readonly jwt: Verifier;
	/** Checks the claims: what the routes behind the guard read as `user`. */
	readonly schema?: Schema;
	/** Reads the token from this cookie when no `Authorization` header carries one. */
	readonly cookie?: string;
}

/** The body of the 401. */
export interface UnauthorizedBody {
	readonly error: 'unauthorized';
	readonly reason:
		| 'missing'
		| Exclude<VerifyResult, { ok: true }>['reason']
		| 'claims';
	readonly issues?: readonly ValidationIssue[];
}

/**
 * The 401 under `alxia({ errors: 'problem' })`: an RFC 9457 problem sent
 * as `application/problem+json`, `reason` and `issues` its extensions.
 */
export type UnauthorizedProblem = Problem<401, Omit<UnauthorizedBody, 'error'>>;

type User<Schema> = Schema extends StandardSchemaV1
	? InferOutput<Schema>
	: JwtClaims;

/**
 * What `bearer()` makes: a middleware that gives `user`, or answers the 401.
 */
export type Bearer<Schema extends StandardSchemaV1 | undefined = undefined> =
	Middleware<
		Empty,
		Promise<
			| Reply<401, UnauthorizedBody | UnauthorizedProblem>
			| Next<{ user: User<Schema> }>
		>
	>;

/**
 * A guard, as a middleware: every request it runs on needs a valid token —
 * `Authorization: Bearer <token>`, or a cookie — and the routes declared
 * after it read its claims, checked by `schema`, as `user`. Without one, a
 * 401, which is part of each such route's type: `UnauthorizedBody`, or
 * `UnauthorizedProblem` under `alxia({ errors: 'problem' })`. Given to
 * `app.use`, a request no route matches is refused too, before its 404.
 *
 * ```ts
 * app.use(bearer({ jwt, schema: z.object({ sub: z.string(), role: z.enum(['admin', 'user']) }) }))
 *    .get('/me', ({ user, reply }) => reply(200, user));
 * ```
 */
export function bearer<Schema extends StandardSchemaV1 | undefined = undefined>(
	options: BearerOptions<Schema>,
): NoInfer<Bearer<Schema>> {
	return defineMiddleware(async function bearer(ctx, next) {
		const { request } = ctx;
		const header = request.headers.get('authorization');
		let token = header?.match(/^Bearer\s+(.+)$/i)?.[1];
		let from: 'headers' | 'cookies' = 'headers';
		if (token === undefined && options.cookie !== undefined) {
			const cookies = new Bun.CookieMap(request.headers.get('cookie') ?? '');
			token = cookies.get(options.cookie) ?? undefined;
			from = 'cookies';
		}
		if (token === undefined) return refuse(ctx, 'missing');
		const verified = await options.jwt.verify(token);
		if (!verified.ok) return refuse(ctx, verified.reason);
		if (options.schema === undefined) {
			return next({ user: verified.claims as User<Schema> });
		}
		const checked = await check(options.schema, verified.claims, from);
		if (!checked.ok) return refuse(ctx, 'claims', checked.issues);
		return next({ user: checked.value as User<Schema> });
	});
}

/** The 401, with its challenge, in the format of the app that serves the request. */
function refuse(
	ctx: BaseContext,
	reason: UnauthorizedBody['reason'],
	issues?: readonly ValidationIssue[],
): Reply<401, UnauthorizedBody | UnauthorizedProblem> {
	const challenge = { headers: { 'www-authenticate': 'Bearer' } };
	const why = issues === undefined ? { reason } : { reason, issues };
	if (errorFormat(ctx) === 'problem') {
		const detail =
			reason === 'missing'
				? 'The request carries no bearer token'
				: `The bearer token is refused: ${reason}`;
		return problem(problemOf(ctx, { status: 401, detail, ...why }), challenge);
	}
	return ctx.reply(401, { error: 'unauthorized', ...why }, challenge);
}

markFactory(bearer);
