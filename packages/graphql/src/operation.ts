/**
 * The plugin that tells the observers around the endpoint — `@alxia/logger`,
 * `@alxia/telemetry` — which operation each request executes.
 */
import { reportOperation } from '@alxia/core';
import { getOperationAST } from 'graphql';
import type { Plugin } from 'graphql-yoga';

interface Executed {
	readonly document: Parameters<typeof getOperationAST>[0];
	readonly operationName?: string | null | undefined;
	readonly contextValue: unknown;
}

/** Reports the operation of `args`: its type, and its name when it has one. */
function report(args: Executed): void {
	const operation = getOperationAST(args.document, args.operationName);
	if (operation === undefined || operation === null) return;
	reportOperation(args.contextValue as object, {
		type: operation.operation,
		name: operation.name?.value,
	});
}

/**
 * A Yoga plugin reporting each operation Yoga executes or subscribes to,
 * through core's `reportOperation`: a batched body reports each of its
 * operations, a request refused before it executes none.
 */
export function reportsOperations(): Plugin {
	return {
		onExecute: ({ args }) => report(args),
		onSubscribe: ({ args }) => report(args),
	};
}
