import { collectionsOf, coreCollectionsOf, defineModule } from '@alxia/modules';
import {
	connectMongo,
	defineCollection,
	defineMongo,
	id,
	type Mongo,
	openMongo,
} from '@nxgt/mongo';
import { defineMigration, type Migration } from '@nxgt/mongo/migrations';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import type { Tenant, TenantRegistry, TenantStatus } from '../src';

export const ACCOUNT_A = 'account-a';
export const ACCOUNT_B = 'account-b';

// A tenant collection that stamps actors, and the core's registry.
export const notes = defineCollection({
	name: 'notes',
	schema: z.object({ _id: id(), text: z.string().min(1) }),
	timestamps: true,
	actors: { type: z.string() },
	indexes: [{ key: { text: 1 }, name: 'notes_text' }],
});

export const organizations = defineCollection({
	name: 'organizations',
	schema: z.object({
		_id: id(),
		slug: z.string(),
		name: z.string(),
		status: z
			.enum(['provisioning', 'active', 'archived'])
			.default('provisioning'),
	}),
	timestamps: true,
	softDelete: true,
	optimisticLock: true,
	actors: { type: z.string() },
	indexes: [{ key: { slug: 1 }, unique: true, name: 'organizations_slug' }],
});

export const marker = (id: string): Migration =>
	defineMigration({
		id,
		async up({ db, session }) {
			await db
				.collection('markers')
				.insertOne({ _id: id as never }, session ? { session } : {});
		},
		async down({ db, session }) {
			await db
				.collection('markers')
				.deleteOne({ _id: id as never }, session ? { session } : {});
		},
	});

let connection: Awaited<ReturnType<typeof connectMongo>> | undefined;
export async function testClient() {
	connection ??= await connectMongo(Bun.env['MONGO_URI'] as string, {
		appName: 'alxia-tenancy-test',
	});
	return connection.client;
}
export async function closeTestClient() {
	await connection?.close();
	connection = undefined;
}

let counter = 0;
/** A database name no other spec uses. */
export const unique = (what: string) =>
	`tenancy_${what}_${Date.now().toString(36)}_${++counter}`;

/** `configure` for a tenant store: the test collections on the shared client. */
export async function tenantWiring() {
	const client = await testClient();
	return (database: string) =>
		defineMongo({ client, database, collections: { notes } });
}

export async function openCore(database = unique('core')) {
	return openMongo(
		defineMongo({
			client: await testClient(),
			database,
			collections: { organizations },
			autoSync: true,
		}),
	);
}

export async function openTenantDb(database = unique('single')) {
	return openMongo((await tenantWiring())(database));
}

export type CoreHandle = Awaited<ReturnType<typeof openCore>>;

export interface Org extends Tenant {
	readonly version: number;
}

/** The registry port over a real `organizations` collection of a core database. */
export function mongoRegistry(core: CoreHandle): TenantRegistry<Org> {
	const toOrg = (doc: {
		_id: ObjectId;
		slug: string;
		name: string;
		status: TenantStatus;
		version: number;
	}): Org => ({
		id: doc._id.toHexString(),
		slug: doc.slug,
		name: doc.name,
		status: doc.status,
		version: doc.version,
	});
	const collection = core.db.organizations;
	return {
		async findById(value) {
			const doc = await collection.findById(new ObjectId(value));
			return doc ? toOrg(doc) : undefined;
		},
		async findBySlug(slug) {
			const doc = await collection.findFirst({ slug });
			return doc ? toOrg(doc) : undefined;
		},
		async list({ withDeleted }) {
			return (await collection.findMany({ withDeleted })).map(toOrg);
		},
		async create(input, actor) {
			return toOrg(await collection.as(actor).create({ ...input }));
		},
		async activate(tenant, actor) {
			return toOrg(
				await collection.as(actor).update(new ObjectId(tenant.id), {
					status: 'active',
					version: tenant.version,
				}),
			);
		},
	};
}

/** Registers a tenant without a database. */
export async function register(
	core: CoreHandle,
	overrides: { slug?: string; status?: TenantStatus; deleted?: boolean } = {},
) {
	counter += 1;
	const created = await core.db.organizations.as(ACCOUNT_A).create({
		name: `Organization ${counter}`,
		slug: overrides.slug ?? `org-${Date.now().toString(36)}-${counter}`,
		status: overrides.status ?? 'active',
	});
	const org = (await mongoRegistry(core).findById(
		created._id.toHexString(),
	)) as Org;
	if (overrides.deleted) {
		await core.db.organizations.as(ACCOUNT_A).delete(created._id);
	}
	return org;
}

export type TestMongo<C> = Mongo<C>;

export const tags = defineCollection({
	name: 'tags',
	schema: z.object({ _id: id(), label: z.string().min(1) }),
	actors: { type: z.string() },
});

/**
 * The registry of the contract: `notes` (a tenant collection and the two marker
 * migrations), `tags` (depends on notes, one more tenant collection) and
 * `orgs` (the registry's collection, in the core database).
 */
export function testModules(ids: [string, string]) {
	return [
		defineModule({
			name: 'notes',
			collections: { notes },
			migrations: ids.map((id) => marker(id)),
		}),
		defineModule({ name: 'tags', dependsOn: ['notes'], collections: { tags } }),
		defineModule({ name: 'orgs', coreCollections: { organizations } }),
	] as const;
}

type Collections = Record<string, ReturnType<typeof defineCollection>>;

/** `configure` for a tenant store whose collections come from the registry. */
export async function moduleWiring(modules: ReturnType<typeof testModules>) {
	const client = await testClient();
	const collections = collectionsOf(modules) as unknown as Collections;
	return (database: string) => defineMongo({ client, database, collections });
}

/** The core database wired with the registry's core collections. */
export async function openModuleCore(modules: ReturnType<typeof testModules>) {
	return openMongo(
		defineMongo({
			client: await testClient(),
			database: unique('core'),
			collections: coreCollectionsOf(modules) as unknown as {
				organizations: typeof organizations;
			},
			autoSync: true,
		}),
	);
}

/** One database wired with the tenant and the core collections of the registry. */
export async function openModuleSingle(
	modules: ReturnType<typeof testModules>,
) {
	return openMongo(
		defineMongo({
			client: await testClient(),
			database: unique('single'),
			collections: {
				...collectionsOf(modules),
				...coreCollectionsOf(modules),
			} as unknown as Collections,
		}),
	);
}
