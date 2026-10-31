import type { Mongo, TypedCollection } from '@nxgt/mongo';
import type { inbox, outbox } from './collections';
import type { EventEnvelope } from './envelope';

/**
 * A database handle that has the events collections: the `mongo` of a scope or
 * of a transaction, once `eventsModule` is in the registry. `Mongo<C>` of a
 * host whose wiring includes them is assignable.
 */
export interface EventsMongo {
	readonly db: {
		readonly _outbox: TypedCollection<typeof outbox>;
		readonly _inbox: TypedCollection<typeof inbox>;
	};
	readonly actor: unknown;
	readonly session: unknown;
	transaction<T>(fn: (tx: EventsMongo) => Promise<T>): Promise<T>;
}

/** What `emit` is given: the tenant, and the handle the domain write goes through. */
export interface EmitSource {
	readonly tenant: { readonly id: string };
	/** A transaction's handle, so the event commits or rolls back with the change. */
	readonly mongo: EventsMongo;
}

/**
 * What a subscriber receives beside the event. `mongo` is in the transaction
 * that also records the `_inbox` row: write the effects through it, and a
 * redelivery cannot apply them twice. Anything not in the database (a mail, a
 * request) must be idempotent by itself, or be a queued job with its own id.
 */
export interface SubscriberContext<C = any, K = any> {
	readonly mongo: Mongo<C>;
	readonly core: Mongo<K>;
	readonly tenant: string;
	/** The module the subscriber belongs to. */
	readonly module: string;
}

export type Subscriber = (
	event: EventEnvelope,
	context: SubscriberContext,
) => unknown;
