/**
 * A method and path declared twice on one app. Most often two apps built
 * on one shared base: each `base.use(…).plugin(routes)` declares on `base`
 * itself, so the second adds the routes again. `fork()` gives each its own.
 */
import type { Router } from '../router/router';
import type { Definition } from './definition';

/**
 * Throws when `router` already has `method` at `path`; `same` tells
 * whether that is the very route declared again, the sign of a shared base.
 *
 * ```text
 * GET /todos is declared twice, by the same route: two apps built on one base each mounted it on the base itself; build each on base.fork()
 * ```
 */
export function refuseTwice(
	router: Router<Definition>,
	method: string,
	path: string,
	same: (declared: Definition) => boolean,
): void {
	const declared = router.methodsAt(path)?.get(method);
	if (declared === undefined) return;
	throw new TypeError(
		same(declared)
			? `${method} ${path} is declared twice, by the same route: two apps built on one base each mounted it on the base itself; build each on base.fork()`
			: `${method} ${path} is declared twice: keep one; if two apps are built on one base, build each on base.fork()`,
	);
}
