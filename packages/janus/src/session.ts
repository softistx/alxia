import {
	type Alxia,
	alxia,
	type Empty,
	type Reply,
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

/**
 * Who a request belongs to, as a plugin: `auth.authenticate(request)`, and
 * the routes declared after it read `user` and `session` — typed by the
 * user schema, narrowed by `type`.
 *
 * **An outage is not anonymous**: a store that cannot answer throws
 * `STORE_FAILED`, which `janusErrors()` answers 503, never 401.
 *
 * A session renewed in passing is sent again as a cookie, after the route —
 * only to a request that presented it as one (a `Bearer` client is never
 * handed a cookie), and never over a session cookie the route set itself.
 *
 * ```ts
 * app.use(session(accounts, { required: true })).get('/me', ({ user, reply }) => reply.ok(user));
 * ```
 */
export function session<
	A extends Auth<{ readonly type: string }>,
	const T extends UserOfAuth<A>['type'] = UserOfAuth<A>['type'],
>(
	auth: A,
	options: SessionOptions<T> & { readonly required: true },
): Alxia<
	{
		readonly user: UserOf<A, T>;
		readonly session: Session;
		readonly auth: RequestAuth;
	},
	Empty,
	'',
	Reply<401, UnauthenticatedBody>
>;
export function session<
	A extends Auth<{ readonly type: string }>,
	const T extends UserOfAuth<A>['type'] = UserOfAuth<A>['type'],
>(
	auth: A,
	options?: SessionOptions<T> & { readonly required?: false },
): Alxia<
	{
		readonly user: UserOf<A, T> | null;
		readonly session: Session | null;
		readonly auth: RequestAuth;
	},
	Empty,
	'',
	never
>;
export function session<
	A extends Auth<{ readonly type: string }>,
	const T extends UserOfAuth<A>['type'] = UserOfAuth<A>['type'],
>(
	auth: A,
	options?: SessionOptions<T>,
): Alxia<
	{
		readonly user: UserOf<A, T> | null;
		readonly session: Session | null;
		readonly auth: RequestAuth;
	},
	Empty,
	'',
	Reply<401, UnauthenticatedBody>
>;
export function session(
	auth: Auth<{ readonly type: string }>,
	options: SessionOptions<string> = {},
): unknown {
	const current = new WeakMap<Request, Found>();
	const unauthenticated: UnauthenticatedBody = { error: 'unauthenticated' };
	return alxia()
		.derive(async (ctx) => {
			const { request, reply } = ctx;
			const found = await authenticateOnce(auth, request, options.type);
			current.set(request, found);
			if (found === null && options.required === true) {
				return reply(401, unauthenticated);
			}
			const bound: RequestAuth = {
				device: deviceOf(ctx, options.device),
				send: (signedIn) => sendSession(ctx, auth, signedIn, options),
				signOut: () => signOut(ctx, auth),
			};
			return {
				user: found?.user ?? null,
				session: found?.session ?? null,
				auth: bound,
			};
		})
		.wrap(async ({ request }, next) => {
			const response = await next();
			const found = current.get(request);
			if (found?.renewed !== true) return response;
			// The route's own cookie wins: a sign-in or a sign-out behind this
			// plugin must not be undone by the session it replaced.
			const name = `${auth.cookie.name}=`;
			const presented = new Bun.CookieMap(
				request.headers.get('cookie') ?? '',
			).get(auth.cookie.name);
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
			);
		});
}
