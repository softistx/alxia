/**
 * How a chain runs a middleware: `next` called once,
 * before the middleware settles, and a socket's upgrade parked behind a
 * stand-in response. The call itself is `Call` (`middleware-call.ts`).
 */
import type { MiddlewareHook } from './definition';
import { Call } from './middleware-call';
import type { Ctx, Definition } from './middleware-next';

/**
 * A middleware run with `next`, which merges what it is given into the
 * context and runs `rest`, once, before the middleware settles: its
 * result, or a promise of it.
 *
 * - `next()`'s own promise returned, the usual `return next(added)`: that
 *   promise, as it is — the chain pays nothing more for it.
 * - Nothing returned once `next()` was called: the rest's response, as
 *   Koa and Hono answer `await next()` with no return.
 * - A reply of its own returned before the `next()` it called settled —
 *   `next(); return reply(403)`: the rest runs anyway, so the reply is
 *   sent once it has, with a warning, and an error the rest throws then
 *   is logged. An error of the rest the middleware does not read is never
 *   left unhandled: `next()`'s promise is given a handler before any
 *   rejection could be reported, unless the middleware returned it.
 * - What `rest` resolves to that is not a response — a socket's upgrade —
 *   reaches the middleware as a stand-in response. The socket is open by
 *   then: what the middleware returns after it, or throws, is ignored.
 */
export function middleware(
	hook: MiddlewareHook,
	ctx: Ctx,
	merge: (ctx: Ctx, added: object) => void,
	rest: () => Promise<unknown>,
	definition: Definition,
): unknown {
	return new Call(hook, ctx, merge, rest, definition).run();
}
