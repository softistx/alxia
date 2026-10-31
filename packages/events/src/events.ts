import type { Module } from '@alxia/modules';
import type { Tenant, TenantStore } from '@alxia/tenancy';
import type { WorkOptions } from '@nxgt/redis';
import { deliver } from './deliver';
import { dispatchPending, type Send } from './dispatch';
import { type EmitOptions, emitEvent } from './emit';
import {
	type EventEnvelope,
	type EventInput,
	fromWire,
	toWire,
} from './envelope';
import { EventsError } from './errors';
import { type EventQueue, queueName } from './queues';
import { emittedTypes, subscriptionsOf } from './registry';
import { makeRelay, type Relay, type RelayOptions } from './relay';
import type { EmitSource, EventsMongo } from './types';

export interface EventsOptions {
	/** The tenant store: its registry must include `eventsModule`. */
	store: TenantStore<any, any, Tenant, any>;
	/**
	 * The bound `events.<module>` queue of each module that has subscribers
	 * (see `eventsQueue`). Without them `drain` still works; the relay and the
	 * workers need them.
	 */
	queues?: Readonly<Record<string, EventQueue>>;
	/** Pending events read per query. Default 100. */
	batchSize?: number;
}

export interface DeadLetter {
	readonly queue: string;
	readonly module: string;
	readonly jobId: string;
	readonly event: EventEnvelope;
	readonly attempts: number;
	readonly error: { name: string; message: string } | undefined;
	readonly failedAt: Date | undefined;
}

export interface EventWorkers {
	/** Stops taking jobs and waits for the ones running. */
	stop(): Promise<void>;
}

export interface Events {
	/** Writes `event` into the tenant's `_outbox`, in the source handle's transaction. */
	emit(
		source: EmitSource,
		event: EventInput,
		options?: EmitOptions,
	): Promise<EventEnvelope>;
	/**
	 * Runs the pending events of a tenant (every tenant when omitted) through
	 * their subscribers in this process, oldest first, until none is pending.
	 * For runs without Redis. Returns how many events it dispatched.
	 */
	drain(tenant?: string | { readonly id: string }): Promise<number>;
	/** The relay: polls each tenant's outbox and enqueues jobs. Needs `queues`. */
	relay(options: RelayOptions): Relay;
	/** Starts one worker per queue: the subscribers' side of the relay. */
	work(options?: WorkOptions): EventWorkers;
	/** The jobs that used their attempts up, newest first. Needs `queues`. */
	deadLetters(options?: { limit?: number }): Promise<DeadLetter[]>;
	/** Every type the registry declares in `emits`. */
	readonly types: ReadonlySet<string>;
}

/**
 * The event bus of an application. Checks the registry at once: every `emits`
 * is `<module>.<entity>.<verb>` and declared once, every subscriber is of a
 * type some module emits, `eventsModule` is registered, and each module that
 * subscribes has its queue.
 */
export function createEvents(options: EventsOptions): Events {
	const { store } = options;
	const modules: readonly Module[] = store.modules;
	const batchSize = options.batchSize ?? 100;
	if (!modules.some((module) => module.name === 'events')) {
		throw new EventsError(
			'module-missing',
			'the registry lacks eventsModule: it owns _outbox and _inbox',
		);
	}
	const emitted = emittedTypes(modules);
	const subscriptions = subscriptionsOf(modules, emitted);
	const declared = new Set(emitted.keys());
	const queues = options.queues;
	const subscribing = new Set(
		[...subscriptions.values()].flat().map((s) => s.module),
	);

	const need = () => {
		if (!queues) {
			throw new EventsError(
				'missing-queue',
				'this needs the bound events.<module> queues (createEvents({ queues }))',
			);
		}
		for (const module of subscribing) {
			if (!queues[module]) {
				throw new EventsError(
					'missing-queue',
					`module "${module}" has subscribers but no queue "${queueName(module)}"`,
				);
			}
		}
		return queues;
	};
	if (queues) need();

	// `forModule` fails with a ModuleWiringError when the databases are not
	// wired with the events collections.
	const handle = (mongo: unknown) => {
		store.forModule({ mongo, core: store.core } as never, 'events' as never);
		return mongo as EventsMongo;
	};

	const tenantsOf = async <R>(
		tenant: string | { readonly id: string } | undefined,
		fn: (id: string, mongo: EventsMongo) => Promise<R>,
	): Promise<R[]> => {
		if (tenant === undefined) {
			return store.eachTenant((t, mongo) => fn(t.id, handle(mongo)));
		}
		const id = typeof tenant === 'string' ? tenant : tenant.id;
		return [await fn(id, handle(await store.databaseOf(id)))];
	};

	return {
		types: declared,
		emit: (source, event, emitOptions) =>
			emitEvent(declared, source, event, emitOptions),

		async drain(tenant) {
			let total = 0;
			for (let round = 0; ; round++) {
				if (round === 100) {
					throw new EventsError(
						'drain-diverged',
						'drain still found events after 100 rounds: a subscriber emits an event that makes it emit again',
					);
				}
				const counts = await tenantsOf(tenant, (_id, mongo) => {
					const send: Send = (event, subscription) =>
						deliver(mongo, store.core, event, subscription);
					return dispatchPending(mongo, subscriptions, send, batchSize);
				});
				const found = counts.reduce((sum, n) => sum + n, 0);
				total += found;
				if (found === 0) return total;
			}
		},

		relay(relayOptions) {
			const bound = need();
			return makeRelay(relayOptions, async (onError) => {
				const counts = await tenantsOf(undefined, async (id, mongo) => {
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
						return await dispatchPending(mongo, subscriptions, send, batchSize);
					} catch (error) {
						// One tenant's failure leaves its events pending and spares the rest.
						onError(error);
						return 0;
					}
				});
				return counts.reduce((sum, n) => sum + n, 0);
			});
		},

		work(workOptions) {
			const bound = need();
			const workers = Object.entries(bound)
				.filter(([module]) => subscribing.has(module))
				.map(([module, queue]) =>
					queue.work(async ({ data }) => {
						const event = fromWire(data.event);
						const subscription = subscriptions
							.get(event.type)
							?.find((s) => s.module === data.module);
						if (!subscription) {
							throw new EventsError(
								'unknown-subscription',
								`module "${module}" has no subscriber for "${event.type}" in this process's registry`,
							);
						}
						const mongo = handle(await store.databaseOf(data.tenant));
						await deliver(mongo, store.core, event, subscription);
					}, workOptions),
				);
			return {
				async stop() {
					await Promise.all(workers.map((worker) => worker.close()));
				},
			};
		},

		async deadLetters({ limit = 100 } = {}) {
			const bound = need();
			const letters: DeadLetter[] = [];
			for (const [module, queue] of Object.entries(bound)) {
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
			return letters;
		},
	};
}
