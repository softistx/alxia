import {
	check,
	defineMiddleware,
	type Empty,
	type InferOutput,
	type Middleware,
	type Next,
	type Reply,
	type StandardSchemaV1,
	type ValidationIssue,
} from '@alxia/core';
import type { Jwt, JwtClaims, VerifyResult } from './jwt';

export interface BearerOptions<Schema extends StandardSchemaV1 | undefined> {
	readonly jwt: Jwt;
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

type User<Schema> = Schema extends StandardSchemaV1
	? InferOutput<Schema>
	: JwtClaims;

/**
 * What `bearer()` makes: a middleware that gives `user`, or answers the 401.
 */
export type Bearer<Schema extends StandardSchemaV1 | undefined = undefined> =
	Middleware<
		Empty,
		Promise<Reply<401, UnauthorizedBody> | Next<{ user: User<Schema> }>>
	>;

/**
 * A guard, as a middleware: every request it runs on needs a valid token —
 * `Authorization: Bearer <token>`, or a cookie — and the routes declared
 * after it read its claims, checked by `schema`, as `user`. Without one, a
 * 401, which is part of each such route's type. Given to `app.use`, a
 * request no route matches is refused too, before its 404.
 *
 * ```ts
 * app.use(bearer({ jwt, schema: z.object({ sub: z.string(), role: z.enum(['admin', 'user']) }) }))
 *    .get('/me', ({ user, reply }) => reply(200, user));
 * ```
 */
export function bearer<Schema extends StandardSchemaV1 | undefined = undefined>(
	options: BearerOptions<Schema>,
): NoInfer<Bearer<Schema>> {
	const refuse = (
		reason: UnauthorizedBody['reason'],
		issues?: readonly ValidationIssue[],
	) => {
		const body: UnauthorizedBody =
			issues === undefined
				? { error: 'unauthorized', reason }
				: { error: 'unauthorized', reason, issues };
		return body;
	};
	return defineMiddleware(async ({ request, reply }, next) => {
		const header = request.headers.get('authorization');
		let token = header?.match(/^Bearer\s+(.+)$/i)?.[1];
		let from: 'headers' | 'cookies' = 'headers';
		if (token === undefined && options.cookie !== undefined) {
			const cookies = new Bun.CookieMap(request.headers.get('cookie') ?? '');
			token = cookies.get(options.cookie) ?? undefined;
			from = 'cookies';
		}
		const challenge = { headers: { 'www-authenticate': 'Bearer' } };
		if (token === undefined) return reply(401, refuse('missing'), challenge);
		const verified = await options.jwt.verify(token);
		if (!verified.ok) return reply(401, refuse(verified.reason), challenge);
		if (options.schema === undefined) {
			return next({ user: verified.claims as User<Schema> });
		}
		const checked = await check(options.schema, verified.claims, from);
		if (!checked.ok)
			return reply(401, refuse('claims', checked.issues), challenge);
		return next({ user: checked.value as User<Schema> });
	});
}
