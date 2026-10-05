/**
 * A route's own run, once the router has found it: one loop over its
 * chain — the `derive`s and middlewares in force where it was declared, then
 * its own, its validation among them, in the order declared — then its
 * handler. A request no route matches runs the app's chain the same way,
 * before its 404. A middleware given a path runs when the request's path
 * matches it. What any of it throws is answered by `boundary.ts`.
 */
import { type AnyReply, Reply } from '../reply/reply';
import type { StatusCode } from '../types/status';
import { middleware } from './chain-middleware';
import type { ChainHook } from './definition';
import { matches, type ScopePath } from './scope-path';
import { checkReply, isRedirect, send } from './send';
import type { BaseContext, ResponseSchemas } from './types';
import { type ChainRun, validateStep } from './validation';

type Ctx = Record<string, unknown> & BaseContext;
type Settles<T> = T | Promise<T>;
type Responses = ResponseSchemas | undefined;

/**
 * Runs the chain of a route, step by step: a `derive` adds to the context
 * or ends the request, a middleware runs the rest inside it, a `validate`
 * checks the request, a `responds` checks every reply after it; past the
 * last, `last` — the handler — reads the context they built. Each reply is
 * checked by the `responds` in force where it is made, then sent. A
 * socket's upgrade skips the `responds`: it has no response to check. A
 * step may throw at once: the caller awaits it inside its `try`.
 */
export function chain<Last>(
	run: ChainRun,
	ctx: Ctx,
	last: (ctx: Ctx) => Promise<AnyReply | Response | Last>,
): Settles<Response | Last> {
	return new Runner(run, ctx, last).step(0, ctx, undefined);
}

/**
 * One request's walk down its chain. The steps that never wait — a
 * `derive` that returns at once, a `responds`, a middleware given a path
 * the request is not under — run in one loop, without a promise of their
 * own.
 */
class Runner<Last> {
	readonly #run: ChainRun;
	/** The route's own context: the request's cookies, as they arrived. */
	readonly #ctx: Ctx;
	readonly #last: (ctx: Ctx) => Promise<AnyReply | Response | Last>;
	readonly #socket: boolean;

	constructor(
		run: ChainRun,
		ctx: Ctx,
		last: (ctx: Ctx) => Promise<AnyReply | Response | Last>,
	) {
		this.#run = run;
		this.#ctx = ctx;
		this.#last = last;
		this.#socket = !('method' in run.definition);
	}

	/**
	 * What a step adds goes on the context it runs with and on the route's
	 * own: after a `validate` of the cookies, the steps run with a copy
	 * holding the validated ones.
	 */
	readonly merge = (current: Ctx, added: object): void => {
		Object.assign(current, added);
		if (current !== this.#ctx) Object.assign(this.#ctx, added);
	};

	step(from: number, ctx: Ctx, given: Responses): Settles<Response | Last> {
		const steps = this.#run.definition.derive;
		let responses = given;
		for (let index = from; ; index++) {
			const hook = steps[index] as ChainHook | undefined;
			if (hook === undefined) {
				return this.#answer(this.#last(ctx), responses, true);
			}
			switch (hook.kind) {
				case 'derive': {
					if (hook.when !== undefined && !this.#under(hook.when)) continue;
					const added = hook.run(ctx);
					if (added instanceof Promise) {
						const at = responses;
						return added.then((settled) =>
							this.#derived(settled, index + 1, ctx, at),
						);
					}
					if (added instanceof Reply) return this.#answer(added, responses);
					if (added !== null && typeof added === 'object') {
						this.merge(ctx, added);
					}
					continue;
				}
				case 'responds':
					if (!this.#socket) responses = hook.responses;
					continue;
				case 'validate':
					return this.#validate(hook.schemas, index + 1, ctx, responses);
				case 'middleware': {
					if (hook.when !== undefined && !this.#under(hook.when)) continue;
					const at = responses;
					let downstream: Promise<Response | Last> | undefined;
					const result = middleware(
						hook.run,
						ctx,
						this.merge,
						() => {
							downstream = this.#rest(index + 1, ctx, at);
							return downstream;
						},
						this.#run.definition,
					);
					// `return next()`: the rest's response, already sent.
					if (result === downstream) return downstream as Promise<Response>;
					return this.#answer(result as Settles<Response | Last>, at);
				}
			}
		}
	}

	/** Whether the request is under `path`, which a scoped step runs on alone. */
	#under(path: ScopePath): boolean {
		return matches(path, this.#run.request.url.pathname);
	}

	/** A `derive`'s promise, settled: a reply ends the request, an object is added. */
	#derived(
		added: unknown,
		next: number,
		ctx: Ctx,
		responses: Responses,
	): Settles<Response | Last> {
		if (added instanceof Reply) return this.#answer(added, responses);
		if (added !== null && typeof added === 'object') this.merge(ctx, added);
		return this.step(next, ctx, responses);
	}

	#validate(
		schemas: Parameters<typeof validateStep>[1],
		next: number,
		ctx: Ctx,
		responses: Responses,
	): Promise<Response | Last> {
		return validateStep(this.#run, schemas, ctx, this.#ctx.cookies).then(
			(validated) => this.step(next, validated, responses),
		);
	}

	/** What `next()` runs: the rest of the chain, always a promise, its errors rejections. */
	#rest(
		from: number,
		ctx: Ctx,
		responses: Responses,
	): Promise<Response | Last> {
		try {
			const result = this.step(from, ctx, responses);
			return result instanceof Promise ? result : Promise.resolve(result);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	#answer(
		result: Settles<AnyReply | Response | Last>,
		responses: Responses,
		handler = false,
	): Settles<Response | Last> {
		return result instanceof Promise
			? result.then((settled) => sent(this.#run, settled, responses, handler))
			: sent(this.#run, result, responses, handler);
	}
}

/**
 * A step's result as the chain returns it: a reply sent, once checked by
 * the `responds` in force. Synchronous but for a reply it checks. The
 * handler's reply must have a status `responds` declares; a middleware's
 * is checked when its status is declared, and sent as it is otherwise, as
 * its type says.
 */
function sent<Last>(
	run: ChainRun,
	result: AnyReply | Response | Last,
	responses: Responses,
	handler: boolean,
): Settles<Response | Last> {
	if (!(result instanceof Reply)) return result;
	const { definition, set } = run;
	const signal = run.request.request.signal;
	if (
		responses === undefined ||
		isRedirect(result) ||
		(!handler && responses[result.status as StatusCode] === undefined)
	) {
		return send(result, set, signal);
	}
	return checkReply(
		'method' in definition ? definition.method : 'WS',
		definition.path,
		responses,
		result,
		run.validateResponses,
	).then((checked) => send(checked, set, signal));
}
