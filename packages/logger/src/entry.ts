/**
 * The entries the logger writes of a request: its line once answered, a
 * streamed body's once it ended, at a level read from its status.
 */
import type { OperationSummary } from '@alxia/core';
import type { Outcome } from './body';
import type { LogEntry } from './logger';

/** What the request's entry says of it, whenever it is written. */
export interface Answered {
	readonly id: string;
	readonly method: string;
	readonly path: string;
	readonly status: number;
	readonly ip: string | undefined;
	readonly operation: OperationSummary | undefined;
}

/** What a streamed body's entry says beside the rest. */
interface Streamed {
	readonly timeToHeaders: number;
	readonly outcome: Outcome;
}

/** The request's entry. */
export function entryOf(
	answered: Answered,
	duration: number,
	streamed?: Streamed,
): LogEntry {
	const { id, method, path, status, ip, operation } = answered;
	const outcome =
		streamed === undefined || streamed.outcome === 'completed'
			? ''
			: ` ${streamed.outcome}`;
	return {
		time: new Date().toISOString(),
		level: levelOf(status, streamed?.outcome),
		requestId: id,
		message: `${method} ${path} ${status}${outcome}`,
		method,
		path,
		status,
		duration,
		...streamed,
		...(ip === undefined ? {} : { ip }),
		...(operation === undefined
			? {}
			: {
					...(operation.name === undefined
						? {}
						: { operationName: operation.name }),
					operationType: operation.type,
				}),
	};
}

/** Milliseconds since `start`, to two decimals. */
export function since(start: number): number {
	return Math.round((performance.now() - start) * 100) / 100;
}

/** By the status, then raised by a body that did not end well. */
function levelOf(status: number, outcome?: Outcome): LogEntry['level'] {
	if (status >= 500 || outcome === 'errored') return 'error';
	if (status >= 400 || outcome === 'aborted') return 'warn';
	return 'info';
}
