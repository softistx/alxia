/**
 * The operations a socket runs after its upgrade, for the observers around
 * that upgrade. A socket's upgrade has been answered before its first
 * operation, so `operationOf` cannot carry them: an observer subscribes
 * during the upgrade (`onOperation`), and the plugin serving the socket
 * tells it of each operation's start and end (`startOperation`). Kept on
 * the upgrade's run, which the socket's context shares.
 */
import type { OperationReport } from './operation';
import { runOf } from './settled';

/** How an operation over a socket ended: answered, or answered with errors. */
export type OperationOutcome = 'ok' | 'errors';

/**
 * Told of each operation a socket runs, as it starts. What it returns, when
 * it returns a function, is told how the operation ended.
 */
export type OperationObserver = (
	operation: OperationReport,
) => ((outcome: OperationOutcome) => void) | undefined;

/** The observers a socket's run has been given. */
const OBSERVERS: unique symbol = Symbol.for('alxia.operation-observers');

type Observed = { [OBSERVERS]?: OperationObserver[] };

/** The run of `ctx` when it is a socket's: an upgrade, then its socket's context. */
function socketRun(ctx: object): Observed | undefined {
	const run = runOf(ctx);
	return run === undefined || 'method' in run.definition
		? undefined
		: (run as Observed);
}

/**
 * Subscribes `observer` to each operation the socket `ctx` upgrades to will
 * run. For an observer around the upgrade, such as `@alxia/logger` and
 * `@alxia/telemetry`, which call it before `next()`. `false`, and nothing
 * subscribed, when `ctx` is not a socket route's: a request's operation is
 * read with `operationOf`.
 *
 * ```ts
 * onOperation(ctx, ({ type, name }) => (outcome) => console.log(type, name, outcome));
 * ```
 */
export function onOperation(ctx: object, observer: OperationObserver): boolean {
	const run = socketRun(ctx);
	if (run === undefined) return false;
	run[OBSERVERS] = [...(run[OBSERVERS] ?? []), observer];
	return true;
}

/**
 * Tells the observers of the socket `ctx` that an operation starts, and
 * gives back the function to call once, when it ends. For a plugin that
 * serves a query language over a socket, such as `@alxia/graphql`, given
 * the socket's context (`socket.data`). With no observer, or a context
 * that is not a socket's, it tells no one. An observer that throws is
 * logged, and costs the operation nothing.
 *
 * ```ts
 * const end = startOperation(socket.data, { type: 'subscription', name: 'OnNote' });
 * end('ok');
 * ```
 */
export function startOperation(
	ctx: object,
	report: OperationReport,
): (outcome: OperationOutcome) => void {
	const observers = socketRun(ctx)?.[OBSERVERS] ?? [];
	const ends = observers.flatMap((observer) => {
		const end = guarded(() => observer(report));
		return end === undefined ? [] : [end];
	});
	let ended = false;
	return (outcome) => {
		if (ended) return;
		ended = true;
		for (const end of ends) guarded(() => end(outcome));
	};
}

/** `run`'s result, or `undefined` once what it threw has been logged. */
function guarded<T>(run: () => T): T | undefined {
	try {
		return run();
	} catch (error) {
		console.error(error);
		return undefined;
	}
}
