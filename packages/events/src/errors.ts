export type EventsErrorCode =
	| 'events.invalid-type'
	| 'events.undeclared-type'
	| 'events.foreign-type'
	| 'events.tenant-mismatch'
	| 'events.unknown-subscription'
	| 'events.module-missing'
	| 'events.missing-queue'
	| 'events.no-transaction'
	| 'events.invalid-payload'
	| 'events.drain-diverged';

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
