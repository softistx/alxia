import { collectionsOf, defineModule } from '@alxia/modules';
import {
	perOrganization,
	single,
	type Tenant,
	type TenantRegistry,
} from '@alxia/tenancy';
import {
	connectMongo,
	defineCollection,
	defineMongo,
	id,
	openMongo,
	type TypedCollection,
} from '@nxgt/mongo';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import {
	type Events,
	type EventsMongo,
	eventsModule,
	type Subscriber,
} from '../src';

export const orders = defineCollection({
	name: 'orders',
	schema: z.object({ _id: id(), label: z.string() }),
	actors: { type: z.string() },
});

export const kept = defineCollection({
	name: 'kept',
	schema: z.object({ _id: id() }),
});

export const invoices = defineCollection({
	name: 'invoices',
	schema: z.object({ _id: id(), orderId: z.string(), n: z.number() }),
});

/** The handle of a tenant database as the specs use it. */
export type TestMongo = Omit<EventsMongo, 'db' | 'transaction'> & {
	readonly db: EventsMongo['db'] & {
		readonly orders: TypedCollection<typeof orders>;
		readonly invoices: TypedCollection<typeof invoices>;
	};
	as(actor: string): TestMongo;
	transaction<T>(fn: (tx: TestMongo) => Promise<T>): Promise<T>;
};

let connection: Awaited<ReturnType<typeof connectMongo>> | undefined;
export async function testClient() {
	connection ??= await connectMongo(Bun.env['MONGO_URI'] as string, {
		appName: 'alxia-events-test',
	});
	return connection.client;
}
export async function closeTestClient() {
	await connection?.close();
	connection = undefined;
}

let counter = 0;
export const unique = (what: string) =>
	`events_${what}_${Date.now().toString(36)}_${++counter}`;

/**
 * The registry of the specs: `shop` emits, `<billing>` subscribes, and the
 * kernel's `events` module owns the outbox. The subscriber module's name is
 * unique per call so that specs sharing a Redis never share a queue.
 */
export function registry(
	subscribers: Record<string, Subscriber>,
	billing = unique('billing'),
) {
	return {
		billing,
		modules: [
			eventsModule,
			defineModule({
				name: 'shop',
				dependsOn: ['events'],
				collections: { orders },
				emits: ['shop.order.placed', 'shop.order.cancelled'],
			}),
			defineModule({
				name: billing,
				dependsOn: ['shop'],
				collections: { invoices },
				subscribers,
			}),
		],
	};
}

type Modules = ReturnType<typeof registry>['modules'];

const wiringOf = async (modules: Modules) => {
	const client = await testClient();
	const collections = collectionsOf(modules) as never;
	return (database: string) =>
		defineMongo({ client, database, collections }) as never;
};

/** One database, one fixed tenant. */
export async function openSingle(modules: Modules) {
	const configure = await wiringOf(modules);
	const mongo = await openMongo(configure(unique('single')));
	const store = single({
		mongo,
		tenant: { id: 'only', slug: 'only', name: 'Only' },
		modules,
	});
	await store.prepare('only');
	return store;
}

/** `count` tenants, each in its own database. */
export async function openOrganizations(modules: Modules, count = 2) {
	const core = await openMongo(
		defineMongo({
			client: await testClient(),
			database: unique('core'),
			collections: { kept: kept },
		}),
	);
	const tenants: Tenant[] = Array.from({ length: count }, (_, index) => ({
		id: new ObjectId().toHexString(),
		slug: `org-${index}`,
		name: `Org ${index}`,
		status: 'active',
	}));
	const port: TenantRegistry<Tenant> = {
		findById: async (value) => tenants.find((t) => t.id === value),
		findBySlug: async (slug) => tenants.find((t) => t.slug === slug),
		list: async () => tenants,
		create: async () => {
			throw new Error('not used');
		},
		activate: async (tenant) => tenant,
	};
	const store = perOrganization({
		core,
		registry: port,
		database: unique('org_'),
		configure: await wiringOf(modules),
		membership: async () => true,
		modules,
	});
	for (const tenant of tenants) await store.prepare(tenant.id);
	return { store, tenants };
}

/** Places an order and emits its event in one transaction; the order's id. */
export const place = (
	events: Events,
	tenant: { readonly id: string },
	mongo: TestMongo,
	label: string,
): Promise<string> =>
	mongo.transaction(async (tx) => {
		const order = await tx.db.orders.create({ label });
		await events.emit(
			{ tenant, mongo: tx as never },
			{
				type: 'shop.order.placed',
				aggregate: { type: 'order', id: order.id },
				payload: { label },
			},
		);
		return order.id as string;
	});

/** The one tenant of a `single` store and its database. */
export async function soleTenant(
	store: Awaited<ReturnType<typeof openSingle>>,
): Promise<{ tenant: Tenant; mongo: TestMongo }> {
	const [found] = await store.eachTenant(async (tenant, mongo) => ({
		tenant,
		mongo: mongo as unknown as TestMongo,
	}));
	return found as { tenant: Tenant; mongo: TestMongo };
}

/** A tenant's database with its collections open to the specs. */
export const databaseOf = async (
	store: { databaseOf(tenant: string): Promise<unknown> },
	tenant: string,
): Promise<TestMongo> => (await store.databaseOf(tenant)) as TestMongo;

/** The transaction handle a subscriber is given, typed for the specs. */
export const handleOf = (context: { readonly mongo: unknown }) =>
	context.mongo as TestMongo;
