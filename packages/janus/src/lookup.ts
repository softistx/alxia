import type { Authenticated } from '@nxgt/janus';
import type { Auth } from './types';

export type Found = Authenticated<{ readonly type: string }> | null;

/**
 * Each request's lookups, by instance and by `type`: an open `session()`
 * and a required one behind it, of the same `type`, look the session up
 * once. They live as long as the `Request` object; a lookup that failed is
 * forgotten, so the next dispatch of that object asks again.
 */
const lookups = new WeakMap<
	object,
	WeakMap<Request, Map<string, Promise<Found>>>
>();

export function authenticateOnce(
	auth: Auth<{ readonly type: string }>,
	request: Request,
	type: string | undefined,
): Promise<Found> {
	let byRequest = lookups.get(auth);
	if (byRequest === undefined) {
		byRequest = new WeakMap();
		lookups.set(auth, byRequest);
	}
	let byType = byRequest.get(request);
	if (byType === undefined) {
		byType = new Map();
		byRequest.set(request, byType);
	}
	const key = type ?? '';
	let found = byType.get(key);
	if (found === undefined) {
		found = auth.authenticate(
			request,
			type === undefined ? undefined : { type },
		);
		byType.set(key, found);
		const asked = found;
		asked.catch(() => {
			if (byType.get(key) === asked) byType.delete(key);
		});
	}
	return found;
}
