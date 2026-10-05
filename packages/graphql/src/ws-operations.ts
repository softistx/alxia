/**
 * Each operation of a socket, from its `subscribe` to its end, told to the
 * observers around the socket's upgrade — `@alxia/logger`,
 * `@alxia/telemetry` — through core's `startOperation`: its type and name,
 * then whether it ended with errors.
 */
import { type OperationOutcome, startOperation } from '@alxia/core';
import { type DocumentNode, getOperationAST } from 'graphql';
import type { ServerOptions } from 'graphql-ws';

/** An operation started, until it ends. */
interface Open {
	readonly end: (outcome: OperationOutcome) => void;
	outcome: OperationOutcome;
}

/** The operations of one socket, by their `graphql-ws` id. */
export class SocketOperations {
	readonly #ctx: object;
	readonly #open = new Map<string, Open>();

	/** `ctx`: the socket's context, which carries its upgrade's observers. */
	constructor(ctx: object) {
		this.#ctx = ctx;
	}

	/** The operation `id` starts: the one of `document` that `operationName` names. */
	begin(
		id: string,
		document: DocumentNode,
		operationName: string | null | undefined,
	): void {
		// graphql-ws closes a socket that reuses an open id; end it all the same.
		this.end(id);
		const operation = getOperationAST(document, operationName);
		if (operation === undefined || operation === null) return;
		const end = startOperation(this.#ctx, {
			type: operation.operation,
			name: operation.name?.value,
		});
		this.#open.set(id, { end, outcome: 'ok' });
	}

	/** The operation `id` answered with errors: a result's `errors`, or an error message. */
	failed(id: string): void {
		const open = this.#open.get(id);
		if (open !== undefined) open.outcome = 'errors';
	}

	/** The operation `id` ended: completed, stopped by its client, or failed. */
	end(id: string): void {
		const open = this.#open.get(id);
		if (open === undefined) return;
		this.#open.delete(id);
		open.end(open.outcome);
	}

	/**
	 * The socket closed: an operation still open then is one whose run threw,
	 * which `graphql-ws` answers by closing the socket, and ends with errors.
	 */
	closed(): void {
		for (const id of [...this.#open.keys()]) {
			this.failed(id);
			this.end(id);
		}
	}
}

/** What `graphql-ws` keeps of each socket for its hooks: its operations. */
interface Followed {
	readonly operations: SocketOperations;
}

/**
 * `graphql-ws`'s hooks that follow each operation: a result with errors
 * marks it, an error message ends it, and so does its completion — sent,
 * stopped by the client, or cut by the socket's close.
 */
export function following<E extends Followed>(): Pick<
	ServerOptions<Record<string, unknown> | undefined, E>,
	'onNext' | 'onError' | 'onComplete'
> {
	return {
		onNext({ extra }, id, _payload, _args, result) {
			if (result.errors !== undefined && result.errors.length > 0) {
				extra.operations.failed(id);
			}
		},
		onError({ extra }, id) {
			extra.operations.failed(id);
			extra.operations.end(id);
		},
		onComplete({ extra }, id) {
			extra.operations.end(id);
		},
	};
}
