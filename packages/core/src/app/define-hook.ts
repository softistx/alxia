/**
 * `defineHook` and `defineWrap`: the hooks a route takes in its list, written
 * once and given to as many routes as read them.
 */
import type { AnyReply } from '../reply/reply';
import type { ChainHook } from './definition';
import type {
	Empty,
	HookContext,
	MaybePromise,
	NoHookYet,
	RouteHook,
	RouteWrap,
} from './types';

type DeriveFn<Requires, Result> = (
	ctx: HookContext<Requires>,
) => MaybePromise<Result>;
type WrapFn<Requires, Result> = (
	ctx: HookContext<Requires>,
	next: () => Promise<Response>,
) => MaybePromise<Result>;

/**
 * A hook for a route's list: `app.patch('/:id', [canView], schema, handler)`.
 * It runs after the hooks in force where the route is declared and the ones
 * before it in the list, before the request is validated. What it returns
 * is added to the context of the hooks after it and of the handler; a reply
 * it returns ends the request, and joins the route's type.
 *
 * Given the hook, it reads the base context: `defineHook(({ request }) => …)`.
 * Given nothing, it takes what the hook reads beyond it — a `user` an
 * earlier hook derives, a path parameter — and then the hook:
 *
 * ```ts
 * const canView = defineHook<{ user: User; params: { id: string } }>()(
 *   async ({ user, params, reply }) =>
 *     (await mayView(user, params.id)) ? undefined : reply(403, { error: 'forbidden' as const }),
 * );
 * ```
 *
 * A route whose context does not give what it reads is a compile error. It
 * reads `params`, `query` and `cookies` as they arrived, strings, and never
 * `body`: a check that needs the validated request belongs in the handler.
 *
 * One signature, not two overloads: an overloaded call written inside a
 * route's list would leave the list untyped.
 */
export function defineHook<Requires extends object = Empty, Result = NoHookYet>(
	hook?: DeriveFn<Requires, Result>,
): 0 extends 1 & Result
	? RouteHook<Requires, Result>
	: [Result] extends [NoHookYet]
		? [NoHookYet] extends [Result]
			? <Returned>(
					hook: DeriveFn<Requires, Returned>,
				) => RouteHook<Requires, Returned>
			: RouteHook<Requires, Result>
		: RouteHook<Requires, Result> {
	if (hook === undefined) {
		return ((run: unknown) => tag('derive', run)) as never;
	}
	return tag('derive', hook) as never;
}

/**
 * A hook around the rest of a route, for its list: `next()` runs the hooks
 * after it in the list, validation and the handler, and resolves to the
 * response. It returns that, another `Response`, or a reply of its own,
 * which joins the route's type. A socket's upgrade skips it. Given nothing,
 * it takes what the hook reads, as `defineHook` does:
 *
 * ```ts
 * const exclusive = defineWrap<{ params: { id: string } }>()(
 *   async ({ params, reply }, next) =>
 *     (await locks.tryRun(params.id, next)) ?? reply(409, { error: 'busy' as const }),
 * );
 * ```
 */
export function defineWrap<
	Requires extends object = Empty,
	Result extends AnyReply | Response | NoHookYet = NoHookYet,
>(
	hook?: WrapFn<Requires, Result>,
): 0 extends 1 & Result
	? RouteWrap<Requires, Result>
	: [Result] extends [NoHookYet]
		? [NoHookYet] extends [Result]
			? <Returned extends AnyReply | Response>(
					hook: WrapFn<Requires, Returned>,
				) => RouteWrap<Requires, Returned>
			: RouteWrap<Requires, Result>
		: RouteWrap<Requires, Result> {
	if (hook === undefined) {
		return ((run: unknown) => tag('wrap', run)) as never;
	}
	return tag('wrap', hook) as never;
}

function tag(kind: 'derive' | 'wrap', run: unknown): object {
	if (typeof run !== 'function') {
		throw new TypeError(
			`define${kind === 'derive' ? 'Hook' : 'Wrap'}(): the hook is not a function`,
		);
	}
	return Object.freeze({ kind, run });
}

/**
 * The hooks of a route's list as the chain runs them, each checked: a
 * function, or anything not made by `defineHook` or `defineWrap`, is
 * refused where the route is declared.
 */
export function routeHooks(
	list: readonly unknown[],
	label: string,
): readonly ChainHook[] {
	return list.map((hook, index) => {
		if (
			hook === null ||
			typeof hook !== 'object' ||
			!('kind' in hook && 'run' in hook) ||
			(hook.kind !== 'derive' && hook.kind !== 'wrap') ||
			typeof hook.run !== 'function'
		) {
			throw new TypeError(
				`${label}: hook ${index + 1} of the list is not a hook: make it with defineHook() or defineWrap()`,
			);
		}
		return hook as ChainHook;
	});
}
