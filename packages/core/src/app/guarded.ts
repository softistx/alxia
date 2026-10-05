/**
 * What a 405 or a 426 runs before it tells a path's methods: the chain of
 * every route that owns the path, as it stood where each was declared —
 * an unprefixed group's guard among it — so its `Allow` reaches only a
 * request those chains let through. A prefixed group's chain already runs
 * there (`Scope.enclose`), and a 404, which names nothing, runs the app's
 * chain alone.
 *
 * A hook of a chain in force is told from a route's own by `origins`:
 * every hook a scope holds is entered there, and so is each copy of it
 * given a path (`scopedAt`), under the same original, so a hook the app's
 * chain already ran is not run twice.
 */
import type { ChainHook, Definition } from './definition';
import type { ScopedHooks } from './scope';
import { matches, type ScopePath } from './scope-path';

const IN_FORCE = Symbol.for('alxia.inForce');

/**
 * Each hook of a chain in force, and each copy of it, to the hook it was
 * declared as: one map for every copy of core, as their marks are
 * (`Symbol.for`), so a plugin built with another copy is read alike.
 */
const origins = sharedOrigins(
	globalThis as { [IN_FORCE]?: WeakMap<ChainHook, ChainHook> },
);

function sharedOrigins(global: {
	[IN_FORCE]?: WeakMap<ChainHook, ChainHook>;
}): WeakMap<ChainHook, ChainHook> {
	const shared = global[IN_FORCE] ?? new WeakMap<ChainHook, ChainHook>();
	global[IN_FORCE] = shared;
	return shared;
}

/** Enters a hook a scope takes for its routes: one of a chain in force. */
export function inForce<Hook extends ChainHook>(hook: Hook): Hook {
	if (!origins.has(hook)) origins.set(hook, hook);
	return hook;
}

/** `hook`, run under `when` alone: in force if `hook` is, as the same hook. */
export function scopedAt(hook: ChainHook, when: ScopePath): ChainHook {
	const copy = { ...hook, when } as ChainHook;
	const origin = origins.get(hook);
	if (origin !== undefined) origins.set(copy, origin);
	return copy;
}

/**
 * The chain a 405 or a 426 at `pathname` runs: the app's, as every request
 * no route matches runs it, then, of each route `owners` holds in the order
 * declared, the hooks of its chain in force that the app's does not run on
 * this request — its own middlewares, its validation, never. A hook two
 * routes share runs once. The first that answers is the answer; the
 * router's, with its `Allow`, comes once every one called `next`.
 */
export function guardedHooks(
	unmatched: ScopedHooks,
	owners: Iterable<Definition>,
	pathname: string,
): ScopedHooks {
	let ran: Set<ChainHook> | undefined;
	const guards: ChainHook[] = [];
	for (const owner of owners) {
		for (const hook of owner.derive) {
			const origin = origins.get(hook);
			if (origin === undefined) continue;
			ran ??= runOn(unmatched, pathname);
			if (ran.has(origin)) continue;
			ran.add(origin);
			guards.push(hook);
		}
	}
	return guards.length === 0
		? unmatched
		: { derive: [...unmatched.derive, ...guards] };
}

/** The hooks of the app's chain a request at `pathname` runs, as declared. */
function runOn(unmatched: ScopedHooks, pathname: string): Set<ChainHook> {
	const ran = new Set<ChainHook>();
	for (const hook of unmatched.derive) {
		const when = 'when' in hook ? hook.when : undefined;
		if (when === undefined || matches(when, pathname)) {
			ran.add(origins.get(hook) ?? hook);
		}
	}
	return ran;
}
