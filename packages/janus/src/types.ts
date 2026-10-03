import type { SharedApi, SignedIn } from '@nxgt/janus';

/** Anything `janus()` answered: the part of it this package calls. */
export type Auth<U extends { readonly type: string }> = Pick<
	SharedApi<U>,
	'authenticate' | 'signOut' | 'cookie'
>;

/** The users an `auth` instance knows, as a union narrowed by `user.type`. */
export type UserOfAuth<A> = A extends Auth<infer U> ? U : never;

/**
 * What `sendSession` takes: the part of `@nxgt/janus`'s `SignedIn` — or of
 * `signUp`'s answer — that opens a session.
 */
export interface SessionOpened<U>
	extends Pick<SignedIn<U>, 'token' | 'session' | 'user'> {
	readonly deviceToken?: string | null;
}

/**
 * What the routes behind `session()` call, bound to their request: no
 * `ctx`, no `Auth` to pass.
 *
 * ```ts
 * const signedIn = await accounts.patient.signIn(body, { device: auth.device });
 * return reply.ok({ id: auth.send(signedIn).id });
 * ```
 */
export interface RequestAuth {
	/** The device token the request carries, for `signIn(…, { device })`: `null` when none. */
	readonly device: string | null;
	/**
	 * Sends the session cookie — and the device cookie, with a
	 * `deviceToken` — and answers the user: `sendSession`, bound.
	 */
	send<U>(signedIn: SessionOpened<U>): U;
	/** Revokes the request's session and clears its cookie: `signOut`, bound. */
	signOut(): Promise<boolean>;
}
