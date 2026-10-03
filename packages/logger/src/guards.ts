import type { LogEntry, LoggerOptions } from './logger';

/** What a request id may be, incoming or made: 1 to 128 of `\w.:@-`. */
export const ID = /^[\w.:@-]{1,128}$/;

/** Says a failure of the logging itself, and nothing more: even a broken `console.error`. */
export function report(error: unknown): void {
	try {
		console.error(error);
	} catch {}
}

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
	typeof (value as PromiseLike<unknown> | undefined)?.then === 'function';

/**
 * `write`, never throwing: an entry that cannot be written is lost, not the
 * request. An async `write` that rejects is caught too.
 */
export function safeWrite(
	write: (entry: LogEntry) => void,
): (entry: LogEntry) => void {
	return (entry) => {
		try {
			const result: unknown = write(entry);
			if (isThenable(result)) Promise.resolve(result).catch(report);
		} catch (error) {
			report(error);
		}
	};
}

/** `generateId`, or `crypto.randomUUID()` when it throws or makes no valid id. */
export function safeGenerate(
	generateId: LoggerOptions['generateId'],
): () => string {
	return () => {
		try {
			const id = generateId?.();
			if (id !== undefined && ID.test(id)) return id;
		} catch (error) {
			report(error);
		}
		return crypto.randomUUID();
	};
}

/** `skip`, logging the request when it throws. */
export function safeSkip(
	skip: LoggerOptions['skip'],
): (request: Request, url: URL) => boolean {
	return (request, url) => {
		try {
			return skip?.(request, url) ?? false;
		} catch (error) {
			report(error);
			return false;
		}
	};
}
