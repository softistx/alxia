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
type Definition = RouteDefinition | SocketDefinition;

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
 *   then: what the middleware returns after it, or throws, is ignored, as
 *   a `wrap` is skipped.
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

/** One middleware's call, and the `next` it is given. */
class Call {
	readonly #hook: MiddlewareHook;
	readonly #ctx: Ctx;
	readonly #merge: (ctx: Ctx, added: object) => void;
	readonly #rest: () => Promise<unknown>;
	readonly #definition: Definition;
	#state: 'idle' | 'called' | 'settled' = 'idle';
	/** Whether the middleware is still running its synchronous part. */
	#inline = true;
	#pending: Promise<unknown> | undefined;
	#parked: Parked | undefined;

	constructor(
		hook: MiddlewareHook,
		ctx: Ctx,
		merge: (ctx: Ctx, added: object) => void,
		rest: () => Promise<unknown>,
		definition: Definition,
	) {
		this.#hook = hook;
		this.#ctx = ctx;
		this.#merge = merge;
		this.#rest = rest;
		this.#definition = definition;
	}

	readonly next = (added?: object): Promise<Response> => {
		if (this.#state !== 'idle') {
			throw failure(
				this.#definition,
				this.#state === 'called'
					? 'a middleware called next() twice'
					: 'a middleware called next() after it returned',
			);
		}
		this.#state = 'called';
		if (added !== null && typeof added === 'object') {
			this.#merge(this.#ctx, added);
		}
		const pending =
			'method' in this.#definition
				? this.#rest()
				: this.#rest().then((downstream) => this.#park(downstream));
		this.#pending = pending;
		// Called once the middleware's promise is out: handled now.
		if (!this.#inline) pending.catch(ignore);
		return pending as Promise<Response>;
	};

	run(): unknown {
		let result: unknown;
		try {
			result = this.#hook(this.#ctx, this.next);
		} catch (error) {
			return this.#thrown(error);
		}
		this.#inline = false;
		const pending = this.#pending;
		if (pending !== undefined && result === pending) {
			this.#state = 'settled';
			if (this.#parked === undefined && 'method' in this.#definition) {
				return pending;
			}
			return pending.then((downstream) => this.#parked?.value ?? downstream);
		}
		// Called, not returned: whatever the middleware does with it.
		pending?.catch(ignore);
		if (!(result instanceof Promise)) return this.#settle(result);
		if ('method' in this.#definition) {
			return result.then(
				(settled) => this.#settle(settled),
				(error: unknown) => this.#thrown(error),
			);
		}
		return result.then(
			(settled) => this.#settle(settled),
			(error: unknown) => {
				if (this.#parked === undefined) return this.#thrown(error);
				console.error(error);
				return this.#parked.value;
			},
		);
	}

	/** A socket's upgrade, parked: the middleware reads a stand-in response. */
	#park(downstream: unknown): Response {
		if (downstream instanceof Response) return downstream;
		this.#parked = { stand: new Response(null), value: downstream };
		return this.#parked.stand;
	}

	#settle(result: unknown): unknown {
		this.#state = 'settled';
		const pending = this.#pending;
		if (pending === undefined) return this.#own(result);
		if (result === undefined) {
			return pending.then((downstream) => this.#parked?.value ?? downstream);
		}
		if (Bun.peek.status(pending) !== 'pending') return this.#own(result);
		console.warn(
			`${labelOf(this.#definition)}: a middleware returned before the next() it called settled: the rest of the route ran anyway; await next(), or return it`,
		);
		const after = () => this.#own(result);
		return pending.then(after, (error: unknown) => {
			console.error(error);
			return after();
		});
	}

	/**
	 * A middleware that throws while the `next()` it called still runs:
	 * the rest's error, if any, is logged, the middleware's goes on.
	 */
	#thrown(error: unknown): never {
		const pending = this.#pending;
		if (pending !== undefined && Bun.peek.status(pending) === 'pending') {
			pending.catch(console.error);
		}
		throw error;
	}

	/** What the middleware's own result answers: the upgrade once parked, else its reply or `Response`. */
	#own(result: unknown): unknown {
		if (this.#parked !== undefined) return this.#parked.value;
		if (result instanceof Reply || result instanceof Response) return result;
		const name = this.#hook.name ? ` (${this.#hook.name})` : '';
		throw failure(
			this.#definition,
			`a middleware${name} returned ${result === undefined ? 'nothing' : typeof result}: return next(), a reply or a Response`,
		);
	}
}

function ignore(): void {}

/** A socket's upgrade, parked behind the stand-in response `next()` resolved to. */
interface Parked {
	readonly stand: Response;
	readonly value: unknown;
}

function labelOf(definition: Definition): string {
	return `${'method' in definition ? definition.method : 'WS'} ${definition.path}`;
}

function failure(definition: Definition, why: string): TypeError {
	return new TypeError(`${labelOf(definition)}: ${why}`);
}
