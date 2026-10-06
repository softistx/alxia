import {
	type BaseContext,
	type Empty,
	markFactory,
	type NextFunction,
} from '@alxia/core';
import type { Container } from '@nxgt/di';
import { exposeFrom } from './expose';
import { LazyScope, type RuntimeScope } from './lazy-scope';
import { lifecycleOf } from './lifecycle';
import type { DiArgs, DiReturn } from './types';

/** A Container as the runtime sees it, its types erased. */
interface RuntimeContainer extends AsyncDisposable {
	createScope(slots?: Readonly<Record<string, unknown>>): RuntimeScope;
}

/** The options once the types have done their work. */
interface RuntimeOptions {
	readonly slots?: (ctx: BaseContext) => unknown;
	readonly onDisposeError?: (error: unknown, ctx: BaseContext) => void;
}

/** Where the context keeps the Scope each `di` entered on it. */
const OWNED = Symbol('@alxia/di owned');

/** The context as `di` writes to it: `next` merges into this same object. */
type Writable = BaseContext & {
	scope?: unknown;
	[OWNED]?: Owned;
};

/** Each `di` entered on a request, to the Scope it owns there. */
type Owned = ReadonlyMap<object, LazyScope>;

/**
 * Runs the rest with `scope` on the context, and gives back the Scope that
 * was there before (another `di`'s), so what that one runs after its own
 * `next` reads its Scope again. Unless something later replaced it; with
 * nothing before it, this Scope stays, so a late resolve is a
 * ScopeDisposedError rather than an undefined.
 */
async function within(
	ctx: Writable,
	scope: LazyScope,
	owned: Owned | undefined,
	next: NextFunction,
) {
	const outer = ctx.scope;
	const before = ctx[OWNED];
	try {
		return await next(
			owned === undefined ? { scope } : { scope, [OWNED]: owned },
		);
	} finally {
		if (outer !== undefined && ctx.scope === scope) ctx.scope = outer;
		if (owned !== undefined && ctx[OWNED] === owned) {
			if (before === undefined) delete ctx[OWNED];
			else ctx[OWNED] = before;
		}
	}
}

function logDisposeError(error: unknown, ctx: BaseContext): void {
	console.error(
		`@alxia/di: disposing the Scope of ${ctx.request.method} ${ctx.url.pathname} failed`,
		error,
	);
}

/**
 * A middleware that gives each request a Scope of `container`, as `scope`
 * in the context of what follows. The Scope is lazy: created, and `slots`
 * called, on its first `resolve`, so a request that resolves nothing costs
 * nothing. It is disposed of once the rest of the route has answered,
 * whether it replied or threw.
 *
 * ```ts
 * const deps = di(container, { slots: ({ request }) => ({ tenant: request.headers.get('x-tenant') ?? 'public' }) });
 * const app = alxia()
 *   .plugin(deps.lifecycle)
 *   .use(deps)
 *   .group('/orders', (g) => g.use(deps.expose({ orders: Orders })).get('/', ...));
 * ```
 */
export function di<Singletons, Scoped, Slots, Reads = Empty>(
	container: Container<Singletons, Scoped, Slots>,
	...args: DiArgs<Slots, Reads>
): DiReturn<Singletons, Scoped, Reads> {
	const runtime = container as unknown as RuntimeContainer;
	const { slots, onDisposeError = logDisposeError }: RuntimeOptions =
		(args[0] as RuntimeOptions | undefined) ?? {};
	async function di(ctx: Writable, next: NextFunction) {
		// The Scopes each `di` entered on this request, on the context itself:
		// made per fetch, so a Request fetched twice gets two, and carried by
		// core's copies of it (`{ ...ctx }` keeps an own symbol key).
		const entered = ctx[OWNED]?.get(di);
		// Given again on this request, after another `di` maybe: the first one
		// owns the Scope; this one only puts it back on the context.
		if (entered !== undefined) return within(ctx, entered, undefined, next);
		const scope = new LazyScope(async () =>
			runtime.createScope(
				slots
					? ((await slots(ctx)) as Readonly<Record<string, unknown>>)
					: undefined,
			),
		);
		// A new Map, never the one on the context: core runs a 405's owners
		// each on its own copy of the context, and a Map they shared would
		// carry one group's Scope, and the Slots its derive gave, to another.
		const owned: Owned = new Map(ctx[OWNED]).set(di, scope);
		try {
			return await within(ctx, scope, owned, next);
		} finally {
			// After `next`: a streamed body still being sent may not use the
			// Scope's values. See the guide.
			await scope[Symbol.asyncDispose]().catch((error: unknown) => {
				try {
					onDisposeError(error, ctx);
				} catch {
					// A logger that throws must not replace the response either.
				}
			});
		}
	}

	const expose = markFactory(function expose(
		tokens: Parameters<typeof exposeFrom>[0],
	) {
		return exposeFrom(tokens);
	});

	return Object.assign(di, {
		expose,
		lifecycle: lifecycleOf(async () => {
			await runtime[Symbol.asyncDispose]();
		}),
	}) as never;
}

markFactory(di);
