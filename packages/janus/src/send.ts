import type { ResponseSettings } from '@alxia/core';
import { type DeviceCookieOptions, sendDevice } from './device';
import type { Auth, SessionOpened } from './types';

/** What `sendSession` takes besides: the device cookie's options. */
export interface SendSessionOptions {
	readonly device?: DeviceCookieOptions;
}

/**
 * Sends the session cookie — after `signUp`, `signIn`, anything that
 * answered a token and its session — and answers the user. The token is in
 * the cookie, never in the body. With a `deviceToken`, the device cookie
 * too.
 *
 * ```ts
 * const signedIn = await auth.signIn(body, { device: deviceOf(ctx) });
 * return reply(200, { id: sendSession(ctx, auth, signedIn).id });
 * ```
 */
export function sendSession<U>(
	ctx: { readonly set: ResponseSettings },
	auth: Pick<Auth<{ readonly type: string }>, 'cookie'>,
	signedIn: SessionOpened<U>,
	options: SendSessionOptions = {},
): U {
	ctx.set.headers.append(
		'set-cookie',
		auth.cookie.serialize(signedIn.token, signedIn.session),
	);
	if (typeof signedIn.deviceToken === 'string') {
		sendDevice(ctx, signedIn.deviceToken, options.device);
	}
	return signedIn.user;
}

/**
 * Revokes the session the request presents and clears the cookie — cleared
 * whatever the answer, so a browser holding a stale cookie drops it too.
 */
export async function signOut(
	ctx: { readonly request: Request; readonly set: ResponseSettings },
	auth: Pick<Auth<{ readonly type: string }>, 'signOut' | 'cookie'>,
): Promise<boolean> {
	const revoked = await auth.signOut(ctx.request);
	ctx.set.headers.append('set-cookie', auth.cookie.clear());
	return revoked;
}
