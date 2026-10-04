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
 *   sent once it has, with a warning. An error of the rest the middleware
 *   did not read — it returned or threw without awaiting `next()` — is
 *   logged, never left unhandled.
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
	const route = 'method' in definition;
	let state: 'idle' | 'called' | 'settled' = 'idle';
	let pending: Promise<unknown> | undefined;
	let parked: Parked | undefined;
	const next = (added?: object): Promise<Response> => {
		if (state !== 'idle') {
			throw failure(
				definition,
				state === 'called'
					? 'a middleware called next() twice'
					: 'a middleware called next() after it returned',
			);
		}
		state = 'called';
		if (added !== null && typeof added === 'object') merge(ctx, added);
		pending = route
			? rest()
			: rest().then((downstream) => {
					if (downstream instanceof Response) return downstream;
					parked = { stand: new Response(null), value: downstream };
					return parked.stand;
				});
		// Handled from the start: an error the middleware does not read is
		// logged when it settles, never reported as unhandled.
		pending.catch(ignore);
		return pending as Promise<Response>;
	};
	const settle = (result: unknown): unknown => {
		state = 'settled';
		if (pending === undefined) return own(hook, definition, result, parked);
		if (result === undefined) {
			return pending.then((downstream) => parked?.value ?? downstream);
		}
		const status = Bun.peek.status(pending);
		if (status === 'fulfilled') return own(hook, definition, result, parked);
		// Returned before the `next()` it called settled, or after it failed:
		// the rest's error is logged.
		if (status === 'pending') {
			console.warn(
				`${labelOf(definition)}: a middleware returned before the next() it called settled: the rest of the route ran anyway; await next(), or return it`,
			);
		}
		const after = () => own(hook, definition, result, parked);
		return pending.then(after, (error: unknown) => {
			console.error(error);
			return after();
		});
	};
	// A middleware that throws once it called `next()`: the rest's error,
	// if any, is logged, and the middleware's goes on to `onError`.
	const thrown = (error: unknown): never => {
		if (pending !== undefined && Bun.peek.status(pending) !== 'fulfilled') {
			pending.catch(console.error);
		}
		throw error;
	};
	let result: unknown;
	try {
		result = hook(ctx, next);
	} catch (error) {
		thrown(error);
	}
	if (!(result instanceof Promise)) return settle(result);
	if (route) return result.then(settle, thrown);
	return result.then(settle, (error: unknown) => {
		if (parked === undefined) return thrown(error);
		console.error(error);
		return parked.value;
	});
}

function ignore(): void {}

/** A socket's upgrade, parked behind the stand-in response `next()` resolved to. */
interface Parked {
	readonly stand: Response;
	readonly value: unknown;
}

/** What a middleware's own result answers: the upgrade once parked, else its reply or `Response`. */
function own(
	hook: MiddlewareHook,
	definition: RouteDefinition | SocketDefinition,
	result: unknown,
	parked: Parked | undefined,
): unknown {
	if (parked !== undefined) return parked.value;
	if (result instanceof Reply || result instanceof Response) return result;
	const name = hook.name ? ` (${hook.name})` : '';
	throw failure(
		definition,
		`a middleware${name} returned ${result === undefined ? 'nothing' : typeof result}: return next(), a reply or a Response`,
	);
}

function labelOf(definition: RouteDefinition | SocketDefinition): string {
	return `${'method' in definition ? definition.method : 'WS'} ${definition.path}`;
}

function failure(
	definition: RouteDefinition | SocketDefinition,
	why: string,
): TypeError {
	return new TypeError(`${labelOf(definition)}: ${why}`);
}
