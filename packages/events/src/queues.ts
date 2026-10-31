import { type BoundQueue, type Duration, defineQueue } from '@nxgt/redis';
import { z } from 'zod';
import { wireEnvelope } from './envelope';

/** The payload of a job on `events.<module>`: one event for one module's subscriber. */
export const eventJob = z.object({
	tenant: z.string(),
	module: z.string(),
	event: wireEnvelope,
});

export type EventJobSchema = typeof eventJob;
export type EventJob = z.output<typeof eventJob>;
export type EventQueue = BoundQueue<EventJobSchema>;

/** The queue name of a module's subscribers. */
export const queueName = (module: string) => `events.${module}`;

export interface EventsQueueOptions {
	/** Runs of one job before it lands in the dead letters. Default 5. */
	attempts?: number;
	/** Wait before the first retry, doubling. Default `5s`. */
	backoff?: Duration;
}

/**
 * The definition of `events.<module>`. Bind it with `bindQueue(client, …)` or
 * wire it in `defineRedis`, and give the bound queue to `createEvents`.
 */
export function eventsQueue(module: string, options: EventsQueueOptions = {}) {
	return defineQueue({
		name: queueName(module),
		schema: eventJob,
		attempts: options.attempts ?? 5,
		backoff: { base: options.backoff ?? '5s', max: '1h' },
		// Failed jobs are the dead letters: keep them long enough to be looked at.
		keepFailed: '30d',
	});
}
