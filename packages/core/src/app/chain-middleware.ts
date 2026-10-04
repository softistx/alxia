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
 * result, or a promise of it. What `rest` resolves to that is not a
 * response — a socket's upgrade — reaches the middleware as a stand-in
 * response, which it must return as it is: the socket is open by then.
 */
export function middleware(
	hook: MiddlewareHook,
	ctx: Ctx,
	merge: (ctx: Ctx, added: object) => void,
	rest: () => Promise<unknown>,
	definition: RouteDefinition | SocketDefinition,
): unknown {
	const fail = (why: string) =>
		new TypeError(
			`${'method' in definition ? definition.method : 'WS'} ${definition.path}: ${why}`,
		);
	let state: 'idle' | 'called' | 'settled' = 'idle';
	let parked: { stand: Response; value: unknown } | undefined;
	const next = (added?: object): Promise<Response> => {
		if (state === 'called') throw fail('a middleware called next() twice');
		if (state === 'settled') {
			throw fail('a middleware called next() after it returned');
		}
		state = 'called';
		if (added !== null && typeof added === 'object') merge(ctx, added);
		if ('method' in definition) return rest() as Promise<Response>;
		return rest().then((downstream) => {
			if (downstream instanceof Response) return downstream;
			parked = { stand: new Response(null), value: downstream };
			return parked.stand;
		});
	};
	const settle = (result: unknown): unknown => {
		state = 'settled';
		if (parked !== undefined) {
			if (result === parked.stand) return parked.value;
			throw fail(
				'a middleware returned another response than next() resolved to, once the socket was open: return it as it is',
			);
		}
		if (result instanceof Reply || result instanceof Response) return result;
		const name = hook.name ? ` (${hook.name})` : '';
		throw fail(
			`a middleware${name} returned ${result === undefined ? 'nothing' : typeof result}: return next(), a reply or a Response`,
		);
	};
	const result = hook(ctx, next);
	return result instanceof Promise ? result.then(settle) : settle(result);
}
