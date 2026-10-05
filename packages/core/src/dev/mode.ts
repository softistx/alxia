/**
 * The dev switch: whether an app helps the developer running it — the
 * route table `listen` prints, a hint on a 404 or a 405, the error page of
 * a 500. Off where the app is deployed or tested.
 */

/** The environments the dev helps never run in. */
const QUIET = new Set(['production', 'test']);

/**
 * `alxia({ dev })`, else whether `NODE_ENV` is neither `production` nor
 * `test`: on in a plain `bun run`, off in a container built with
 * `NODE_ENV=production` and under `bun test`. Anything but a boolean throws.
 */
export function devOf(dev: unknown): boolean {
	if (dev === undefined) return !QUIET.has(process.env['NODE_ENV'] ?? '');
	if (typeof dev !== 'boolean') {
		throw new TypeError(
			`alxia(): dev must be true or false, not ${JSON.stringify(dev)}`,
		);
	}
	return dev;
}
