/**
 * One middleware's call: the `next` it is given, called once, and what its
 * result answers — its own reply, the rest's response, or a socket's
 * upgrade parked behind a stand-in response.
 */
import { Reply } from '../reply/reply';
import type { MiddlewareHook } from './definition';
import {
	behind,
	CALL,
	type Ctx,
	type Definition,
	failure,
	ignore,
	labelOf,
	type Next,
	type Parked,
} from './middleware-next';
import { settledFrom } from './settled';

/** One middleware's call, and the `next` it is given. */
export class Call {
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
		const next = ((added?: object) => this.#call(added)) as Next;
		next.behind = behind;
		next[CALL] = this;
		this.next = next;
	}

	/** `next.behind(added)`: the rest run as `next(added)` runs it, the middleware's reply sent without waiting. */
	behind(added: object | undefined): Promise<Response> {
		const pending = this.#call(added);
		this.#behind = true;
		pending.catch(ignore);
		return pending;
	}

	/** Whether `next.behind()` ran the rest: the middleware's own reply does not wait for it. */
	#behind = false;

	/**
	 * `next`, and its `behind`: one function shared by every call, which
	 * finds its call on `next` — an `Object.assign` per call cost a route
	 * behind three middlewares some 15%.
	 */
	readonly next: Next;

	#call(added: object | undefined): Promise<Response> {
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
	}

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
		if (this.#behind || Bun.peek.status(pending) !== 'pending') {
			// It settled the rest's error: the error goes on, its response kept.
			const settled = settledFrom(this.#ctx, pending, result);
			if (settled !== undefined) throw settled.error;
			return this.#own(result);
		}
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
	 * A middleware that throws after the `next()` it called: the rest's
	 * error, if any, is logged — whether the rest still runs or already
	 * rejected, never left unhandled — and the middleware's goes on.
	 */
	#thrown(error: unknown): never {
		// The rest's own error, rethrown, goes on: logged once, where answered.
		this.#pending?.catch((rest: unknown) => {
			if (rest !== error) console.error(rest);
		});
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
