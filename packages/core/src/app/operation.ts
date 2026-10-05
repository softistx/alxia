/**
 * What a request says of the operation it ran, for the observers around it.
 * A GraphQL endpoint reports each operation it executes; the logger and the
 * telemetry read one summary, without importing each other. Kept on the
 * request's run, which every copy of its context shares.
 */
import { runOf } from './settled';

/** One operation a request executed. */
export interface OperationReport {
	readonly type: 'query' | 'mutation' | 'subscription';
	/** The operation's name; none when it is anonymous. */
	readonly name?: string | undefined;
}

/**
 * What an observer reads: the one operation a request ran, or, when it ran
 * several (a batched array body), `type: 'batch'` and the names of all of
 * them, joined by commas.
 */
export interface OperationSummary {
	readonly type: OperationReport['type'] | 'batch';
	readonly name?: string | undefined;
}

/** The operations a request's run has been told of. */
const REPORTED: unique symbol = Symbol.for('alxia.operations');

type Reported = { [REPORTED]?: OperationReport[] };

/**
 * Tells the observers around a request which operation it executes. For a
 * plugin that serves a query language, such as `@alxia/graphql`, which calls
 * it for each operation it executes. A socket's operations are not
 * reported here: its upgrade has been answered already, so they go to
 * `startOperation`. A context with no run is ignored.
 *
 * ```ts
 * reportOperation(ctx, { type: 'query', name: 'GetNotes' });
 * ```
 */
export function reportOperation(ctx: object, report: OperationReport): void {
	const run = runOf(ctx);
	if (run === undefined || !('method' in run.definition)) return;
	const held = run as Reported;
	held[REPORTED] = [...(held[REPORTED] ?? []), report];
}

/**
 * The operation the request ran, once its endpoint has reported it: what
 * `@alxia/logger` and `@alxia/telemetry` read after `next()`. `undefined`
 * when none was reported, a request no operation endpoint served, or one
 * refused before it executed.
 *
 * ```ts
 * const operation = operationOf(ctx); // { type: 'query', name: 'GetNotes' }
 * ```
 */
export function operationOf(ctx: object): OperationSummary | undefined {
	const reports = (runOf(ctx) as Reported | undefined)?.[REPORTED];
	const [first, ...rest] = reports ?? [];
	if (first === undefined) return undefined;
	if (rest.length === 0) return { type: first.type, name: first.name };
	const names = [first, ...rest].flatMap(({ name }) =>
		name === undefined ? [] : [name],
	);
	return {
		type: 'batch',
		name: names.length === 0 ? undefined : names.join(','),
	};
}
