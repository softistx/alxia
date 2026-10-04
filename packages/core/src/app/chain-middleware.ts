/**
 * How a chain runs a `wrap` hook and a middleware: `next` called once,
 * before the middleware settles, and a socket's upgrade parked behind a
 * stand-in response.
 */
import { Reply } from '../reply/reply';
import type {
	MiddlewareHook,
	RouteDefinition,
	SocketDefinition,
	WrapHook,
} from './definition';
import type { BaseContext } from './types';

type Ctx = Record<string, unknown> & BaseContext;

/** A `wrap` hook run around `rest`: its reply, or the response it returns. */
export async function wrapped(
	hook: WrapHook,
	ctx: Ctx,
	rest: () => Promise<unknown>,
): Promise<unknown> {
	const result = hook(ctx, rest as () => Promise<Response>);
	return result instanceof Promise ? await result : result;
}

/**
 * A middleware run with `next`, which merges what it is given into the
 * context and runs `rest`, once, before the middleware settles: its
 * result, or a promise of it.
 *
 * - Nothing returned once `next()` was called: the rest's response, as
 *   Koa and Hono answer `await next()` with no return.
 * - A reply of its own returned before the `next()` it called settled —
 *   `next(); return reply(403)`: the rest runs anyway, so the reply is
 *   sent once it has, and an error it throws is logged, not left
 *   unhandled.
 * - What `rest` resolves to that is not a response — a socket's upgrade —
 *   reaches the middleware as a stand-in response. The socket is open by
 *   then: what the middleware returns after it, or throws, is ignored, as
 *   a `wrap` is skipped.
 */
export function middleware(
	hook: MiddlewareHook,
	ctx: Ctx,
	merge: (ctx: Ctx, added: object) => void,
	rest: () => Promise<unknown>,
	definition: RouteDefinition | SocketDefinition,
): unknown {
	const label = `${'method' in definition ? definition.method : 'WS'} ${definition.path}`;
	const fail = (why: string) => new TypeError(`${label}: ${why}`);
	let state: 'idle' | 'called' | 'settled' = 'idle';
	let pending: Promise<unknown> | undefined;
	let parked: { stand: Response; value: unknown } | undefined;
	const next = (added?: object): Promise<Response> => {
		if (state === 'called') throw fail('a middleware called next() twice');
		if (state === 'settled') {
			throw fail('a middleware called next() after it returned');
		}
		state = 'called';
		if (added !== null && typeof added === 'object') merge(ctx, added);
		pending =
			'method' in definition
				? rest()
				: rest().then((downstream) => {
						if (downstream instanceof Response) return downstream;
						parked = { stand: new Response(null), value: downstream };
						return parked.stand;
					});
		return pending as Promise<Response>;
	};
	const own = (result: unknown): unknown => {
		if (parked !== undefined) return parked.value;
		if (result instanceof Reply || result instanceof Response) return result;
		const name = hook.name ? ` (${hook.name})` : '';
		throw fail(
			`a middleware${name} returned ${result === undefined ? 'nothing' : typeof result}: return next(), a reply or a Response`,
		);
	};
	const settle = (result: unknown): unknown => {
		state = 'settled';
		if (pending === undefined) return own(result);
		if (result === undefined) {
			return pending.then((downstream) => parked?.value ?? downstream);
		}
		if (Bun.peek.status(pending) !== 'pending') return own(result);
		console.warn(
			`${label}: a middleware returned before the next() it called settled: the rest of the route ran anyway; await next(), or return it`,
		);
		return pending.then(
			() => own(result),
			(error: unknown) => {
				console.error(error);
				return own(result);
			},
		);
	};
	const upgraded = (error: unknown): unknown => {
		if (parked === undefined) throw error;
		console.error(error);
		return parked.value;
	};
	const result = hook(ctx, next);
	return result instanceof Promise
		? result.then(settle, upgraded)
		: settle(result);
}
