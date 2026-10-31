import type { EventEnvelope } from './envelope';
import { EventsError } from './errors';
import type { Subscription } from './registry';
import type { EventsMongo } from './types';

/** Hands one event to one subscriber: enqueue it, or run it in this process. */
export type Send = (
	event: EventEnvelope,
	subscription: Subscription,
) => Promise<unknown>;

interface PendingRow {
	_id: { toHexString(): string };
	type: string;
	version: number;
	tenant: string;
	occurredAt: Date;
	actor: string | null;
	aggregate: { type: string; id: string };
	payload: unknown;
}

const envelopeOf = (row: PendingRow): EventEnvelope => ({
	id: row._id.toHexString(),
	type: row.type,
	version: row.version,
	tenant: row.tenant,
	occurredAt: row.occurredAt,
	actor: row.actor,
	aggregate: row.aggregate,
	payload: row.payload,
});

/**
 * Sends the tenant's pending events, oldest `_id` first, to each subscriber of
 * their type through `send`, and marks each one dispatched once all its
 * subscribers have been sent. Order is by `_id` among the events committed when the scan runs: a transaction that commits late can be sent after a later one. The first failure stops the pass and is thrown:
 * the event stays pending, so order holds and the next pass starts from it.
 * Returns how many events it dispatched.
 */
export async function dispatchPending(
	mongo: EventsMongo,
	tenant: string,
	subscriptions: ReadonlyMap<string, readonly Subscription[]>,
	send: Send,
	batchSize: number,
): Promise<number> {
	const collection = mongo.db._outbox.raw;
	let dispatched = 0;
	for (;;) {
		const rows = (await collection
			.find({ dispatchedAt: null })
			.sort({ _id: 1 })
			.limit(batchSize)
			.toArray()) as unknown as PendingRow[];
		for (const row of rows) {
			if (row.tenant !== tenant) {
				// A row copied from another tenant's database, or written by hand: it
				// would reach subscribers under a tenant it does not belong to.
				throw new EventsError(
					'events.tenant-mismatch',
					`the outbox of tenant "${tenant}" holds event ${row._id.toHexString()} of tenant "${row.tenant}"`,
				);
			}
			const event = envelopeOf(row);
			for (const subscription of subscriptions.get(event.type) ?? []) {
				await send(event, subscription);
			}
			// The subscribers were sent before the mark: a crash here sends them again,
			// and the job id and the inbox make that harmless.
			await collection.updateOne(
				{ _id: row._id as never },
				{ $set: { dispatchedAt: new Date() } },
			);
			dispatched += 1;
		}
		if (rows.length < batchSize) return dispatched;
	}
}
