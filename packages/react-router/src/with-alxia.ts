/**
 * `withAlxia(fn)`: a loader, an action or a middleware handed the alxia
 * context as `alxia`, typed even under the generated `Route.*Args`.
 */
import type { AnyAlxia } from '@alxia/core';
import {
	type AlxiaContextOf,
	alxiaOf,
	type ProviderLike,
	type RegisteredApp,
} from './context';
import type { ReactRouterServer } from './server';

/**
 * What `withAlxia` adds to React Router's arguments: `alxia`, what
 * `alxiaOf<App>(context)` returns. Typed by `Register` by default; name a
 * server, `AlxiaArgs<typeof server>`, as `alxiaOf<typeof server>` does.
 */
export interface AlxiaArgs<
	App extends AnyAlxia | ReactRouterServer<AnyAlxia> = RegisteredApp,
> {
	readonly alxia: AlxiaContextOf<App>;
}

/**
 * A loader, an action or a middleware given `alxia`, the alxia context, beside
 * React Router's arguments. Annotate the parameter as the generated arguments
 * and `AlxiaArgs`:
 *
 * ```ts
 * export const loader = withAlxia(({ alxia, params }: Route.LoaderArgs & AlxiaArgs) => {
 *   return { name: alxia.user?.name ?? null, id: params.id };
 * });
 * ```
 *
 * It returns a function of React Router's arguments alone (`Args` without
 * `alxia`), with `fn`'s return type, so `useLoaderData<typeof loader>` and `Route.ComponentProps` read what
 * `fn` returns. A middleware's `next` is passed on. Throws `alxiaOf`'s error
 * on a request that did not come through `reactRouter()`.
 */
export function withAlxia<
	Args extends AlxiaArgs<AnyAlxia> & { readonly context: ProviderLike },
	Rest extends unknown[],
	Result,
>(
	fn: (args: Args, ...rest: Rest) => Result,
): (args: Omit<Args, 'alxia'>, ...rest: Rest) => Result {
	return (args, ...rest) =>
		fn({ ...args, alxia: alxiaOf(args.context) } as unknown as Args, ...rest);
}
