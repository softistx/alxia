export type EventsErrorCode =
	| 'invalid-type'
	| 'undeclared-type'
	| 'duplicate-emit'
	| 'foreign-type'
	| 'tenant-mismatch'
	| 'unknown-subscription'
	| 'module-missing'
	| 'missing-queue'
	| 'no-transaction'
	| 'invalid-payload'
	| 'drain-diverged';

/**
 * A refusal of the event bus: at boot (a type nobody declares, a subscriber
 * of a type nobody emits, a queue missing) or at `emit` (an undeclared type,
 * a payload JSON cannot carry, a call outside a transaction). `code` is stable.
 */
export class EventsError extends Error {
	constructor(
		readonly code: EventsErrorCode,
		message: string,
	) {
		super(message);
		this.name = 'EventsError';
	}
}
