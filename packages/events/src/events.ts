import type { Module } from '@alxia/modules';
import type { Tenant, TenantStore } from '@alxia/tenancy';
import type { WorkOptions } from '@nxgt/redis';
import { type EmitOptions, emitEvent } from './emit';
import type { EventEnvelope, EventInput } from './envelope';
import { EventsError } from './errors';
import { type EventQueue, queueName } from './queues';
import { emittedTypes, subscriptionsOf } from './registry';
import type { Relay, RelayOptions } from './relay';
import { deadLetters, drain, type Runtime, relay, work } from './runtime';
import type { EmitSource, EventsMongo } from './types';

export interface EventsOptions {
	/** The tenant store: its registry must include `eventsModule`. */
	store: TenantStore<unknown, any, Tenant, unknown>;
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
			'events.module-missing',
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
				'events.missing-queue',
				'this needs the bound events.<module> queues (createEvents({ queues }))',
			);
		}
		for (const module of subscribing) {
			if (!queues[module]) {
				throw new EventsError(
					'events.missing-queue',
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
		// `as never`: only the check matters. `forModule` reads `mongo`'s keys and
		// ignores the typed narrowing, and `mongo` is untyped here (a tenant's
		// handle, whatever collections its host wired).
		store.forModule({ mongo, core: store.core } as never, 'events' as never);
		return mongo as EventsMongo;
	};

	const tenantsOf: Runtime['tenantsOf'] = async (tenant, fn) => {
		if (tenant === undefined) {
			return store.eachTenant((t, mongo) => fn(t.id, handle(mongo)));
		}
		const id = typeof tenant === 'string' ? tenant : tenant.id;
		return [await fn(id, handle(await store.databaseOf(id)))];
	};
	const rt: Runtime = {
		store,
		subscriptions,
		subscribing,
		batchSize,
		queues: need,
		tenantsOf,
		handle,
	};

	return {
		types: declared,
		emit: (source, event, emitOptions) =>
			emitEvent(declared, source, event, emitOptions),
		drain: (tenant) => drain(rt, tenant),
		relay: (relayOptions) => relay(rt, relayOptions),
		work: (workOptions) => work(rt, workOptions),
		deadLetters: ({ limit = 100 } = {}) => deadLetters(rt, limit),
	};
}
