import { defineModule } from '@alxia/modules';
import { defineCollection, id } from '@nxgt/mongo';
import { z } from 'zod';

const DAY = 24 * 3600;

/** How long a dispatched `_outbox` row stays, in seconds. */
export const OUTBOX_TTL = 7 * DAY;
/** How long an `_inbox` row stays, in seconds: longer than any retry window. */
export const INBOX_TTL = 30 * DAY;

/**
 * The events of a tenant, written in the transaction of the change that
 * caused them. `dispatchedAt: null` means the relay has not enqueued them yet.
 */
export const outbox = defineCollection({
	name: '_outbox',
	schema: z.object({
		_id: id(),
		type: z.string(),
		version: z.number().int(),
		tenant: z.string(),
		occurredAt: z.date(),
		actor: z.string().nullable(),
		aggregate: z.object({ type: z.string(), id: z.string() }),
		payload: z.any(),
		dispatchedAt: z.date().nullable().default(null),
	}),
	indexes: [
		// The relay's scan: pending rows, oldest `_id` first.
		{ key: { dispatchedAt: 1, _id: 1 }, name: '_outbox_pending' },
		// A dispatched row goes 7 days later; a pending one (null) never does.
		{
			key: { dispatchedAt: 1 },
			expireAfterSeconds: OUTBOX_TTL,
			name: '_outbox_ttl',
		},
	],
});

/** What a subscriber has applied: one row per (event, subscriber). */
export const inbox = defineCollection({
	name: '_inbox',
	schema: z.object({
		_id: id(),
		eventId: z.string(),
		subscriber: z.string(),
	}),
	timestamps: { createdAt: 'at', updatedAt: false },
	indexes: [
		{
			key: { eventId: 1, subscriber: 1 },
			unique: true,
			name: '_inbox_once',
		},
		{ key: { at: 1 }, expireAfterSeconds: INBOX_TTL, name: '_inbox_ttl' },
	],
});

/**
 * The kernel module that owns `_outbox` and `_inbox`: put it in the registry
 * so the tenant databases are wired with, and synced for, both collections.
 */
export const eventsModule = defineModule({
	name: 'events',
	collections: { _outbox: outbox, _inbox: inbox },
});
