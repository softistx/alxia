/**
 * Which hooks of a route's chain are in force — taken from the scope it
 * was declared in — rather than its own: every hook a scope holds is
 * entered in `origins`, and so is each copy of it given a path
 * (`scopedAt`), under the same original. What a 405 runs reads it
 * (`guarded.ts`): a route's own middlewares never run there, and a hook
 * the app's chain already ran is not run twice.
 */
import type { ChainHook } from './definition';
import type { ScopePath } from './scope-path';

const IN_FORCE = Symbol.for('alxia.inForce');

type Shared = { [IN_FORCE]?: WeakMap<ChainHook, ChainHook> };

/**
 * Each hook of a chain in force, and each copy of it, to the hook it was
 * declared as: one map for every copy of core, as their marks are
 * (`Symbol.for`).
 */
const origins = sharedOrigins(globalThis as Shared);

function sharedOrigins(global: Shared): WeakMap<ChainHook, ChainHook> {
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

/** The hook `hook` was declared as, if it is one of a chain in force. */
export function originOf(hook: ChainHook): ChainHook | undefined {
	return origins.get(hook);
}
