/**
 * The close codes of a socket relay: the ones it sends of its own, and the
 * mapping of what a socket reports to what a peer may send.
 */

/**
 * The close code `proxy.ws` sent a client when the upstream could not be
 * reached, 1014, bad gateway.
 *
 * @deprecated The upstream is now opened before the upgrade: one that
 * cannot be reached answers a 502 (a 504 past `timeout`) over HTTP, and no
 * socket opens. Nothing sends this code any more.
 */
export const BAD_GATEWAY_CLOSE = 1014;

/**
 * The close code of both sides of a relay when one is more than
 * `maxBuffered` bytes behind the other: 1013, try again later.
 */
export const OVERLOADED_CLOSE = 1013;

/**
 * A close code a peer may send: 1000-1003, 1007-1014 and 3000-4999. 1005
 * (no code) closes with 1000; any other — 1006 and 1015, reserved for what
 * a socket reports, or one no peer may send — with 1011.
 */
export function sendable(code: number): number {
	if (code === 1005) return 1000;
	const valid =
		(code >= 1000 && code <= 1003) ||
		(code >= 1007 && code <= 1014) ||
		(code >= 3000 && code <= 4999);
	return valid ? code : 1011;
}
