/**
 * The one warning, in development, of a middleware given after routes:
 * `use(mw)` does not run on the routes declared before it. Never in
 * production nor under `bun test`: `NODE_ENV` says which.
 */
import type { AppState } from './app-state';
import { reach, type ScopePath } from './scope-path';

/** Whether the process is a developer's: neither `production` nor `test`. */
export function developing(): boolean {
	const mode = process.env.NODE_ENV;
	return mode !== 'production' && mode !== 'test';
}

/**
 * Warns, once per app, when middlewares are given after routes they
 * would run on had they come first: those under `path`, given one.
 */
export function warnLate(
	state: AppState,
	label: string,
	path: ScopePath | undefined,
): void {
	if (state.warnedLate || state.routes.length === 0 || !developing()) return;
	const before = state.routes
		.filter(
			(route) => path === undefined || reach(path, route.path) !== 'never',
		)
		.map(({ method, path: at }) => `${method} ${at}`);
	if (before.length === 0) return;
	state.warnedLate = true;
	const routes = listed(before);
	console.warn(
		`${label}: the middleware runs on the routes declared after it and on requests no route matches, not on the ${routes} declared before it. Give it to use() before them if they need it.`,
	);
}

/** Up to five routes, then how many more. */
function listed(routes: readonly string[]): string {
	const shown = routes.slice(0, 5).join(', ');
	const more = routes.length - 5;
	const noun = routes.length === 1 ? 'route' : `${routes.length} routes`;
	return `${noun} (${shown}${more > 0 ? `, and ${more} more` : ''})`;
}
