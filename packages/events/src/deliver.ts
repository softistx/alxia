import type { Tenant, TenantStore } from '@alxia/tenancy';
import { ConflictError } from '@nxgt/mongo';
import type { EventEnvelope } from './envelope';
import type { Subscription } from './registry';
import type { EventsMongo, SubscriberContext } from './types';

export type Delivery = 'applied' | 'duplicate';

/**
 * Runs one subscriber for one event, once: in one transaction it looks for the
 * `_inbox` row of (event, subscriber), writes it, and calls the handler with
 * the transaction's handle narrowed to the subscriber's module
 * (`store.forModule`), and `tenant` is the one delivered to, never the
 * outbox row's. A row already there makes the call a no-op, and a
 * handler that throws rolls the row back with its effects, so a retry starts
 * clean. This is what turns at-least-once delivery into one effect.
 */
export async function deliver(
	store: Pick<TenantStore<unknown, any, Tenant, unknown>, 'core' | 'forModule'>,
	mongo: EventsMongo,
	tenant: string,
	event: EventEnvelope,
	subscription: Subscription,
): Promise<Delivery> {
	try {
		return await mongo.transaction(async (tx) => {
			const key = { eventId: event.id, subscriber: subscription.id };
			if (await tx.db._inbox.findFirst(key)) return 'duplicate';
			await tx.db._inbox.create(key);
			// The registry is erased at this layer, so the module and handle types are cast.
			const scope = store.forModule(
				{ mongo: tx as never, core: store.core },
				subscription.module as never,
			);
			// Safe: the handles are typed by the erased registry, as above.
			const context = {
				...scope,
				tenant,
				module: subscription.module,
			} as unknown as SubscriberContext;
			await subscription.handler(event, context);
			return 'applied';
		});
	} catch (error) {
		// Two deliveries raced past the check: the unique index let one through,
		// and that one's effects stand.
		// Only the inbox race is a duplicate: a handler's own unique-index
		// conflict must fail the delivery, or the event would be acked and lost.
		if (
			error instanceof ConflictError &&
			(await mongo.db._inbox.findFirst({
				eventId: event.id,
				subscriber: subscription.id,
			}))
		) {
			return 'duplicate';
		}
		throw error;
	}
}
