/**
 * The lines of a socket's operations: one per operation, once it ended,
 * with the request id of the upgrade it came through.
 */
import type { OperationObserver } from '@alxia/core';
import { since } from './entry';
import type { LogEntry } from './logger';

/** What each operation's line says of the upgrade its socket came through. */
export interface Upgrade {
	readonly id: string;
	readonly method: string;
	readonly path: string;
	readonly ip: string | undefined;
}

/** Whether a request asks for a WebSocket: its operations may follow. */
export function upgrading(request: Request): boolean {
	return request.headers.get('upgrade')?.toLowerCase() === 'websocket';
}

/**
 * Writes one line per operation of the socket `upgrade` opened: its type
 * and name, timed from its start to its end, `info` when it was answered,
 * `warn` when with errors.
 */
export function operationLines(
	write: (entry: LogEntry) => void,
	upgrade: Upgrade,
): OperationObserver {
	const { id, method, path, ip } = upgrade;
	return ({ type, name }) => {
		const start = performance.now();
		const label = name === undefined ? type : `${type} ${name}`;
		return (outcome) =>
			write({
				time: new Date().toISOString(),
				level: outcome === 'ok' ? 'info' : 'warn',
				requestId: id,
				message: outcome === 'ok' ? label : `${label} errors`,
				method,
				path,
				duration: since(start),
				outcome,
				...(ip === undefined ? {} : { ip }),
				...(name === undefined ? {} : { operationName: name }),
				operationType: type,
			});
	};
}
