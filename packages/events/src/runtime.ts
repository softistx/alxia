import type { Tenant, TenantStore } from '@alxia/tenancy';
import type { WorkOptions } from '@nxgt/redis';
import { deliver } from './deliver';
import { dispatchPending, type Send } from './dispatch';
import { fromWire, toWire } from './envelope';
import { EventsError } from './errors';
import type { DeadLetter, EventWorkers } from './events';
import { type EventQueue, queueName } from './queues';
import type { Subscription } from './registry';
import { makeRelay, type Relay, type RelayOptions } from './relay';
import type { EventsMongo } from './types';

/** What the bus's verbs share; data only. */
export interface Runtime {
	readonly store: TenantStore<unknown, unknown, Tenant, unknown>;
	readonly subscriptions: ReadonlyMap<string, readonly Subscription[]>;
	/** The modules that have subscribers. */
	readonly subscribing: ReadonlySet<string>;
	readonly batchSize: number;
	/** The bound queues, or an `EventsError` when none were given. */
	queues(): Readonly<Record<string, EventQueue>>;
	/** Runs `fn` on one tenant, or on each when `tenant` is omitted. */
	tenantsOf<R>(
		tenant: string | { readonly id: string } | undefined,
		fn: (id: string, mongo: EventsMongo) => Promise<R>,
	): Promise<R[]>;
	/** A tenant's database as a handle with the events collections. */
	handle(mongo: unknown): EventsMongo;
}

const sum = (counts: number[]) => counts.reduce((total, n) => total + n, 0);

export async function drain(
	rt: Runtime,
	tenant: string | { readonly id: string } | undefined,
): Promise<number> {
	let total = 0;
	for (let round = 0; ; round++) {
		if (round === 100) {
			throw new EventsError(
				'drain-diverged',
				'drain still found events after 100 rounds: a subscriber emits an event that makes it emit again',
			);
		}
		const found = sum(
			await rt.tenantsOf(tenant, (id, mongo) => {
				const send: Send = (event, subscription) =>
					deliver(rt.store, mongo, id, event, subscription);
				return dispatchPending(mongo, id, rt.subscriptions, send, rt.batchSize);
			}),
		);
		total += found;
		if (found === 0) return total;
	}
}

export function relay(rt: Runtime, options: RelayOptions): Relay {
	const bound = rt.queues();
	return makeRelay(options, async (onError) =>
		sum(
			await rt.tenantsOf(undefined, async (id, mongo) => {
				const send: Send = (event, subscription) =>
					(bound[subscription.module] as EventQueue).add(
						{
							tenant: id,
							module: subscription.module,
							event: toWire(event),
						},
						{ id: `${event.id}:${subscription.id}` },
					);
				try {
					return await dispatchPending(
						mongo,
						id,
						rt.subscriptions,
						send,
						rt.batchSize,
					);
				} catch (error) {
					// One tenant's failure leaves its events pending and spares the rest.
					onError(error);
					return 0;
				}
			}),
		),
	);
}

export function work(rt: Runtime, options?: WorkOptions): EventWorkers {
	const workers = Object.entries(rt.queues())
		.filter(([module]) => rt.subscribing.has(module))
		.map(([module, queue]) =>
			queue.work(async ({ data }) => {
				const event = fromWire(data.event);
				const subscription = rt.subscriptions
					.get(event.type)
					?.find((s) => s.module === data.module);
				if (!subscription) {
					throw new EventsError(
						'unknown-subscription',
						`module "${module}" has no subscriber for "${event.type}" in this process's registry`,
					);
				}
				if (event.tenant !== data.tenant) {
					throw new EventsError(
						'tenant-mismatch',
						`job ${event.id} is for tenant "${data.tenant}" but carries an event of tenant "${event.tenant}"`,
					);
				}
				const mongo = rt.handle(await rt.store.databaseOf(data.tenant));
				await deliver(rt.store, mongo, data.tenant, event, subscription);
			}, options),
		);
	return {
		async stop() {
			await Promise.all(workers.map((worker) => worker.close()));
		},
	};
}

export async function deadLetters(
	rt: Runtime,
	limit: number,
): Promise<DeadLetter[]> {
	const letters: DeadLetter[] = [];
	for (const [module, queue] of Object.entries(rt.queues())) {
		for (const job of await queue.list('failed', { limit })) {
			if (!job.data) continue;
			letters.push({
				queue: queueName(module),
				module,
				jobId: job.id,
				event: fromWire(job.data.event),
				attempts: job.attempt,
				error: job.error,
				failedAt: job.finished,
			});
		}
	}
	const time = (letter: DeadLetter) => letter.failedAt?.getTime() ?? 0;
	return letters.sort((a, b) => time(b) - time(a)).slice(0, limit);
}
