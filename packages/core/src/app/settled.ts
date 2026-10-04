/**
 * What `settle` leaves on a route's run: the error an observer settled,
 * and the response it answered with, so that the error goes on to the
 * middlewares around it — a try/catch there catches it — while the
 * response the observers made is the one sent when none answers it.
 */
import type { ChainRun } from './validation';

/** Where a route's context keeps its run, for `settle`: shared by every copy of core. */
export const RUN: unique symbol = Symbol.for('alxia.run');

/** The error `settle` answered last, the `next()` it read it from, the response made of it. */
export interface Settled {
	/** The `next()` promise that rejected, until its middleware returned. */
	pending: Promise<unknown> | undefined;
	readonly error: unknown;
	/** What the observers around the error returned, the outermost last. */
	response?: Response | undefined;
}

/** The run of a route's context, if it has one. */
export function runOf(ctx: object): ChainRun | undefined {
	return (ctx as { [RUN]?: ChainRun })[RUN];
}

/**
 * Whether the middleware of `ctx` that returned `result` settled the
 * error of `pending`, its `next()`: then `result` is kept as the response
 * the error is answered with, and the error is to be thrown on.
 */
export function settledFrom(
	ctx: object,
	pending: Promise<unknown>,
	result: unknown,
): Settled | undefined {
	const settled = runOf(ctx)?.settled;
	if (settled?.pending !== pending || !(result instanceof Response)) {
		return undefined;
	}
	settled.pending = undefined;
	settled.response = result;
	return settled;
}

/** The response the observers made of `error`, when it is the one they settled. */
export function settledResponse(
	run: ChainRun,
	error: unknown,
): Response | undefined {
	const settled = run.settled;
	return settled !== undefined && settled.error === error
		? settled.response
		: undefined;
}
