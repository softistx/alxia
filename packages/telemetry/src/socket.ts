/**
 * The spans of a socket's operations: one per operation, from its start to
 * its end, a child of the upgrade's span. A socket can stay open for hours,
 * so no span lasts as long as it: the upgrade's ends with its answer, as
 * OpenTelemetry advises for a long-lived connection, and each operation is
 * a span of its own in the upgrade's trace.
 */
import type { OperationObserver, OperationOutcome } from '@alxia/core';
import { continuing, type Telemetry, withTelemetry } from '@nxgt/telemetry';
import { operationSpan } from './attributes';

/**
 * Opens a span for each operation of the socket whose upgrade `traceparent`
 * names, on `instance`: `query GetNotes`, with `graphql.operation.*`,
 * ended when the operation ends, an error when it was answered with errors.
 */
export function operationSpans(
	instance: Telemetry,
	traceparent: string,
): OperationObserver {
	return (operation) => {
		const { promise: ended, resolve: end } =
			Promise.withResolvers<OperationOutcome>();
		const { name, attributes } = operationSpan(operation);
		void withTelemetry(instance, () =>
			continuing(traceparent, name, { kind: 'server' }, async (scope) => {
				scope.attributes(attributes);
				if ((await ended) === 'errors') scope.status = 'error';
			}),
		);
		return end;
	};
}
