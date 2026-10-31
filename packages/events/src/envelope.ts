import { z } from 'zod';

/** What a subscriber is handed, and what the `_outbox` keeps. */
export interface EventEnvelope<Payload = unknown> {
	/** The `_outbox` document's `_id`, as 24 hex digits. Unique, and the relay's order. */
	readonly id: string;
	/** `<module>.<entity>.<verb>`, declared in the emitter's `emits`. */
	readonly type: string;
	readonly version: number;
	/** The tenant's id (the fixed tenant's on a `single` store). */
	readonly tenant: string;
	readonly occurredAt: Date;
	/** Who caused it: the mongo handle's actor, or `null` (a job, the system). */
	readonly actor: string | null;
	readonly aggregate: { readonly type: string; readonly id: string };
	/** JSON data: checked at `emit`. */
	readonly payload: Payload;
}

/** What `emit` takes; everything but `type`, `aggregate` and `payload` has a default. */
export interface EventInput<Payload = unknown> {
	readonly type: string;
	readonly aggregate: { readonly type: string; readonly id: string };
	readonly payload: Payload;
	/** Default 1. Raise it when the payload's shape changes incompatibly. */
	readonly version?: number;
	/** Default: the mongo handle's actor, else `null`. */
	readonly actor?: string | null;
	/** Default: now. */
	readonly occurredAt?: Date;
}

const TYPE = /^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*$/;

/** `<module>.<entity>.<verb>`, lower case, three segments. */
export const isEventType = (value: string) => TYPE.test(value);

const json = z.json();

/** Whether a payload survives JSON as it is (a `Date` or an `ObjectId` does not). */
export const isJson = (value: unknown) => json.safeParse(value).success;

/** The envelope as a queue carries it: the date as an ISO string. */
export const wireEnvelope = z.object({
	id: z.string(),
	type: z.string(),
	version: z.number(),
	tenant: z.string(),
	occurredAt: z.string(),
	actor: z.string().nullable(),
	aggregate: z.object({ type: z.string(), id: z.string() }),
	payload: z.any(),
});

export type WireEnvelope = z.output<typeof wireEnvelope>;

export const toWire = (event: EventEnvelope): WireEnvelope => ({
	...event,
	occurredAt: event.occurredAt.toISOString(),
});

export const fromWire = (wire: WireEnvelope): EventEnvelope => ({
	...wire,
	occurredAt: new Date(wire.occurredAt),
});
