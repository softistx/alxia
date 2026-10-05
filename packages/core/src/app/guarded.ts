/**
 * What a 405 or a 426 runs before it tells a path's methods: the chain in
 * force of every route that owns the path, as it stood where each was
 * declared — an unprefixed group's guard among it — so its `Allow` reaches
 * only a request every one of those chains lets through. A prefixed
 * group's chain already runs there (`Scope.enclose`), and a 404, which
 * names nothing, runs the app's chain alone.
 */
import { chain } from './chain';
import type { ChainHook, Definition, MiddlewareHook } from './definition';
import { originOf } from './in-force';
import type { ScopedHooks } from './scope';
import { matches, type ScopePath } from './scope-path';
import { runOf } from './settled';
import type { BaseContext } from './types';
import type { ChainRun } from './validation';

type Ctx = Record<string, unknown> & BaseContext;

/**
 * The chain a 405 or a 426 at `pathname` runs: the app's, as every request
 * no route matches runs it, then each owner's — of the routes `owners`
 * holds, in the order declared — the hooks of its chain in force the
 * app's does not run on this request. Its own middlewares, its validation,
 * never. Each owner runs on a copy of the context the app's chain built,
 * so what one group adds never reaches another's guard; two routes of one
 * group run their chain once. The first that answers is the answer; the
 * router's, with its `Allow`, comes once every one called `next`.
 */
export function guardedHooks(
	unmatched: ScopedHooks,
	owners: Iterable<Definition>,
	pathname: string,
): ScopedHooks {
	let ran: Set<ChainHook> | undefined;
	const chains: ChainHook[][] = [];
	for (const owner of owners) {
		const own: ChainHook[] = [];
		for (const hook of owner.derive) {
			const origin = originOf(hook);
			if (origin === undefined) continue;
			ran ??= runOn(unmatched, pathname);
			if (!ran.has(origin)) own.push(hook);
		}
		if (own.length > 0 && !chains.some((seen) => same(seen, own))) {
			chains.push(own);
		}
	}
	if (chains.length === 0) return unmatched;
	const hook: ChainHook = { kind: 'middleware', run: ownersOf(chains) };
	return { derive: [...unmatched.derive, hook] };
}

/**
 * The middleware that runs each owner's chain in turn, each on a copy of
 * the context, each ending in the next one's; the last in the router's
 * answer. A middleware of one awaits a real response from `next`.
 */
function ownersOf(chains: readonly ChainHook[][]): MiddlewareHook {
	return (ctx, next) => {
		const run = runOf(ctx) as ChainRun;
		const at = async (index: number): Promise<Response> => {
			const hooks = chains[index];
			if (hooks === undefined) return next();
			const owner: ChainRun = {
				...run,
				definition: { ...run.definition, derive: hooks },
			};
			return chain(owner, { ...(ctx as Ctx) }, () => at(index + 1));
		};
		return at(0);
	};
}

/**
 * Whether two owners' chains are the same hooks, as declared: one group's
 * two routes, which would run the same steps on the same context.
 */
function same(a: readonly ChainHook[], b: readonly ChainHook[]): boolean {
	return (
		a.length === b.length &&
		a.every((hook, index) => {
			const other = b[index] as ChainHook;
			return (
				originOf(hook) === originOf(other) && whenOf(hook) === whenOf(other)
			);
		})
	);
}

/** The path a hook runs under alone, if any. */
function whenOf(hook: ChainHook): ScopePath | undefined {
	return 'when' in hook ? hook.when : undefined;
}

/** The hooks of the app's chain a request at `pathname` runs, as declared. */
function runOn(unmatched: ScopedHooks, pathname: string): Set<ChainHook> {
	const ran = new Set<ChainHook>();
	for (const hook of unmatched.derive) {
		const when = whenOf(hook);
		if (when === undefined || matches(when, pathname)) {
			ran.add(originOf(hook) ?? hook);
		}
	}
	return ran;
}
