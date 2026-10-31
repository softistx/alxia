import { ConflictError } from '@nxgt/mongo';
import type { EventEnvelope } from './envelope';
import type { Subscription } from './registry';
import type { EventsMongo, SubscriberContext } from './types';

export type Delivery = 'applied' | 'duplicate';

/**
 * Runs one subscriber for one event, once: in one transaction it looks for the
 * `_inbox` row of (event, subscriber), writes it, and calls the handler with
 * the transaction's handle. A row already there makes the call a no-op, and a
 * handler that throws rolls the row back with its effects, so a retry starts
 * clean. This is what turns at-least-once delivery into one effect.
 */
export async function deliver(
	mongo: EventsMongo,
	core: unknown,
	event: EventEnvelope,
	subscription: Subscription,
): Promise<Delivery> {
	try {
		return await mongo.transaction(async (tx) => {
			const key = { eventId: event.id, subscriber: subscription.id };
			if (await tx.db._inbox.findFirst(key)) return 'duplicate';
			await tx.db._inbox.create(key);
			const context: SubscriberContext = {
				mongo: tx as never,
				core: core as never,
				tenant: event.tenant,
				module: subscription.module,
			};
			await subscription.handler(event, context);
			return 'applied';
		});
	} catch (error) {
		// Two deliveries raced past the check: the unique index let one through,
		// and that one's effects stand.
		if (error instanceof ConflictError) {
			return 'duplicate';
		}
		throw error;
	}
}
