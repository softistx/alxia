/**
 * The dev switch: whether an app helps the developer running it — the
 * route table `listen` prints, a hint on a 404 or a 405, the error page of
 * a 500, the warning of a middleware given after routes. Fail closed: off
 * unless the developer said so.
 */

/**
 * `alxia({ dev })`, else whether `NODE_ENV` is exactly `development`: on
 * under the templates' `dev` script (`NODE_ENV=development bun --hot …`),
 * off everywhere else — `NODE_ENV` unset, `production`, `test`, `staging`,
 * `Production` — so a deployment that forgot `NODE_ENV` never shows a
 * stack. Anything but a boolean throws.
 */
export function devOf(dev: unknown): boolean {
	// `Bun.env`, not `process.env.NODE_ENV`, which `bun build` replaces with
	// the mode of the build: a bundle built with `NODE_ENV=development`
	// would stay in dev wherever it runs.
	if (dev === undefined) return Bun.env['NODE_ENV'] === 'development';
	if (typeof dev !== 'boolean') {
		throw new TypeError(
			`alxia(): dev must be true or false, not ${JSON.stringify(dev)}`,
		);
	}
	return dev;
}
