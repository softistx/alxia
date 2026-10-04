import {
	defineMiddleware,
	type Empty,
	type Middleware,
	type MiddlewareMark,
	type Next,
	type Reply,
	settle,
	withHeaders,
} from '@alxia/core';
import type { Session } from '@nxgt/janus';
import { type DeviceCookieOptions, deviceOf } from './device';
import { authenticateOnce, type Found } from './lookup';
import { sendSession, signOut } from './send';
import type { Auth, RequestAuth, UserOfAuth } from './types';

export interface SessionOptions<T extends string> {
	/** Only a user of this type is authenticated here; any other is anonymous. */
	readonly type?: T;
	/**
	 * `true`: an anonymous request is answered 401 and the route never runs,
	 * so `user` is never `null` in it — and the 401 is in its type. A
	 * `boolean` known only at runtime keeps the 401 in the type, and `user`
	 * may be `null`.
	 */
	readonly required?: boolean;
	/** The device cookie `auth.device` reads and `auth.send` sets. */
	readonly device?: DeviceCookieOptions;
}

/** The body of the 401 a required session answers. */
export interface UnauthenticatedBody {
	readonly error: 'unauthenticated';
}

type UserOf<A, T> = Extract<UserOfAuth<A>, { readonly type: T }>;

/** What a session gives the routes after it. */
type Given<User, S> = {
	readonly user: User;
	readonly session: S;
	readonly auth: RequestAuth;
};

/** What `session()` makes: a middleware that gives `Added`, or answers `Refused`. */
export type SessionMiddleware<
	Added extends object,
	Refused = never,
> = Middleware<Empty, Promise<Refused | Next<Added>>> & MiddlewareMark;

/**
 * Who a request belongs to, as a middleware: `auth.authenticate(request)`,
 * and the routes declared after it read `user` and `session` — typed by
 * the user schema, narrowed by `type`. Given to `app.use`, it runs on a
 * request no route matches too: a required session answers it 401 before
 * its 404.
 *
 * **An outage is not anonymous**: a store that cannot answer throws
 * `STORE_FAILED`, which `janusErrors()` — given to `use` before it —
 * answers 503, never 401.
 *
 * A session renewed in passing is sent again as a cookie, after the route —
 * only to a request that presented it as one (a `Bearer` client is never
 * handed a cookie), and never over a session cookie the route set itself.
 *
 * ```ts
 * app.use(janusErrors(), session(accounts, { required: true }))
 *    .get('/me', ({ user, reply }) => reply.ok(user));
 * ```
 */
export function session<
	A extends Auth<{ readonly type: string }>,
	const T extends UserOfAuth<A>['type'] = UserOfAuth<A>['type'],
>(
	auth: A,
	options: SessionOptions<T> & { readonly required: true },
): SessionMiddleware<
	Given<UserOf<A, T>, Session>,
	Reply<401, UnauthenticatedBody>
>;
export function session<
	A extends Auth<{ readonly type: string }>,
	const T extends UserOfAuth<A>['type'] = UserOfAuth<A>['type'],
>(
	auth: A,
	options?: SessionOptions<T> & { readonly required?: false },
): SessionMiddleware<Given<UserOf<A, T> | null, Session | null>>;
export function session<
	A extends Auth<{ readonly type: string }>,
	const T extends UserOfAuth<A>['type'] = UserOfAuth<A>['type'],
>(
	auth: A,
	options?: SessionOptions<T>,
): SessionMiddleware<
	Given<UserOf<A, T> | null, Session | null>,
	Reply<401, UnauthenticatedBody>
>;
export function session(
	auth: Auth<{ readonly type: string }>,
	options: SessionOptions<string> = {},
): unknown {
	const unauthenticated: UnauthenticatedBody = { error: 'unauthenticated' };
	return defineMiddleware(async (ctx, next) => {
		const { request, reply } = ctx;
		const found = await authenticateOnce(auth, request, options.type);
		if (found === null && options.required === true) {
			return reply(401, unauthenticated);
		}
		const bound: RequestAuth = {
			device: deviceOf(ctx, options.device),
			send: (signedIn) => sendSession(ctx, auth, signedIn, options),
			signOut: () => signOut(ctx, auth),
		};
		// Settled: a refusal's 400, an error's answer, still carry the renewal.
		const response = await settle(
			ctx,
			next({
				user: found?.user ?? null,
				session: found?.session ?? null,
				auth: bound,
			}),
		);
		return found?.renewed === true
			? renewed(auth, request, found, response)
			: response;
	});
}

/**
 * A session renewed in passing, sent again as a cookie: only to a request
 * that presented it as one, and never over a cookie the route set itself —
 * a sign-in or a sign-out behind it must not be undone by the session it
 * replaced.
 */
function renewed<R extends Response>(
	auth: Auth<{ readonly type: string }>,
	request: Request,
	found: NonNullable<Found>,
	response: R,
): R {
	const name = `${auth.cookie.name}=`;
	const presented = new Bun.CookieMap(request.headers.get('cookie') ?? '').get(
		auth.cookie.name,
	);
	if (
		presented !== found.token ||
		response.headers.getSetCookie().some((value) => value.startsWith(name))
	) {
		return response;
	}
	return withHeaders(response, (headers) =>
		headers.append(
			'set-cookie',
			auth.cookie.serialize(found.token, found.session),
		),
	) as R;
}
