import type { EventEnvelope } from './envelope';
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
 * subscribers have been sent. The first failure stops the pass and is thrown:
 * the event stays pending, so order holds and the next pass starts from it.
 * Returns how many events it dispatched.
 */
export async function dispatchPending(
	mongo: EventsMongo,
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
