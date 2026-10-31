import {
	ConflictError,
	isObjectIdString,
	type Mongo,
	type MongoActor,
	type MongoConfig,
} from '@nxgt/mongo';
import { migrate } from '@nxgt/mongo/migrations';
import { createTenantDatabases, type TenantDatabases } from './databases';
import { organizationRequired, slugTaken, unknownOrganization } from './errors';
import { dbOf, migrateTargets } from './migrate';
import { bindModules } from './modules';
import type { DatabaseNaming } from './names';
import type {
	EachTenantOptions,
	Membership,
	MigrationLists,
	Resolution,
	Tenant,
	TenantRegistry,
	TenantStore,
	Viewer,
} from './types';

export const DEFAULT_HEADER = 'x-organization-id';

export interface PerOrganizationOptions<C, K, T extends Tenant, M>
	extends MigrationLists {
	/** The host's core database: the tenant registry, accounts, cross-tenant data. */
	core: Mongo<K>;
	registry: TenantRegistry<T>;
	/** The prefix of a tenant database (`<prefix><id>`), or a function from the tenant id. */
	database: DatabaseNaming;
	/** Open tenant databases kept in the cache. Default 10. */
	size?: number;
	/** The wiring of one tenant database, on the shared client. */
	configure: (database: string) => MongoConfig<C>;
	/** The request header naming the tenant, by id or slug. Default `x-organization-id`. */
	header?: string;
	/** Whether the viewer belongs to the tenant, and as what. */
	membership: Membership<M>;
	/** Extra work on the core database during `sync()` (an auth library's collections, say). */
	syncCore?: (core: Mongo<K>) => Promise<void>;
}

/** A `perOrganization` store, and the pieces it is made of. */
export interface PerOrganizationStore<C, K, T extends Tenant, M>
	extends TenantStore<C, K, T, M> {
	readonly kind: 'perOrganization';
	readonly header: string;
	readonly databases: TenantDatabases<C>;
}

// `fn` for every active tenant, or every one with `withDeleted`.
async function eachOf<C, T extends Tenant, R>(
	registry: TenantRegistry<T>,
	databases: TenantDatabases<C>,
	fn: (tenant: T, mongo: Mongo<C>) => Promise<R>,
	{ withDeleted = false }: EachTenantOptions = {},
): Promise<R[]> {
	const all = await registry.list({ withDeleted });
	const visited = withDeleted
		? all
		: all.filter((tenant) => tenant.status === 'active');
	const results: R[] = [];
	for (const tenant of visited) {
		results.push(await fn(tenant, await databases.open(tenant.id)));
	}
	return results;
}

// `db:sync`: the core, then every organisation's database; their names.
async function syncAll<C, K, T extends Tenant, M>(
	options: PerOrganizationOptions<C, K, T, M>,
	databases: TenantDatabases<C>,
): Promise<string[]> {
	const { core, registry } = options;
	await core.sync();
	await options.syncCore?.(core);
	const names = [dbOf(core).databaseName];
	for (const tenant of await registry.list({ withDeleted: true })) {
		await (await databases.open(tenant.id)).sync();
		names.push(databases.nameOf(tenant.id));
	}
	return names;
}

/**
 * One database per organisation next to the host's core database, as
 * `<prefix><id>` on the one `MongoClient` the application connected. A request
 * names its organisation in a header; the scope it gets is that organisation's
 * database, and refuses a viewer who is no member.
 */
export function perOrganization<C, K, T extends Tenant, M>(
	options: PerOrganizationOptions<C, K, T, M>,
): PerOrganizationStore<C, K, T, M> {
	const { core, registry, membership } = options;
	const header = options.header ?? DEFAULT_HEADER;
	const { modules, forModule, migrations, coreMigrations } = bindModules(
		options.modules ?? [],
		options,
	);
	const databases = createTenantDatabases<C>({
		database: options.database,
		configure: options.configure,
		...(options.size === undefined ? {} : { size: options.size }),
	});

	async function resolve(ref: string): Promise<T | undefined> {
		const text = ref.trim();
		if (!text) return undefined;
		const slug = text.toLowerCase();
		const tenant = isObjectIdString(text)
			? await registry.findById(text)
			: await registry.findBySlug(slug);
		// `provisioning` and `archived` tenants are not resolved: a request never
		// reaches a database that is not ready or that was retired.
		return tenant?.status === 'active' ? tenant : undefined;
	}

	async function tenantOf(request: Request): Promise<Resolution<T>> {
		const ref = request.headers.get(header)?.trim();
		if (!ref) return { kind: 'none' };
		const tenant = await resolve(ref);
		return tenant ? { kind: 'found', tenant } : { kind: 'unknown', ref };
	}

	const idOf = (tenant: string | { readonly id: string }) =>
		typeof tenant === 'string' ? tenant : tenant.id;

	async function prepare(tenantId: string): Promise<void> {
		const mongo = await databases.open(tenantId);
		await mongo.sync();
		await migrate(dbOf(mongo), migrations);
	}

	async function* everyTarget() {
		const all = await registry.list({ withDeleted: true });
		for (const tenant of all) {
			yield { db: dbOf(await databases.open(tenant.id)), migrations };
		}
	}

	return {
		kind: 'perOrganization',
		core,
		modules,
		forModule,
		header,
		databases,
		resolve,
		tenantOf,
		databaseOf: (tenant) => databases.open(idOf(tenant)),
		async scope(request: Request, viewer: Viewer | null) {
			const found = await tenantOf(request);
			if (found.kind === 'none') throw organizationRequired(header);
			if (found.kind === 'unknown') throw unknownOrganization();
			const { tenant } = found;
			const member = viewer ? await membership(tenant.id, viewer.id) : null;
			// The same answer as an unknown organisation: a caller who is no member
			// learns nothing about which organisations exist.
			if (!viewer || member === null || member === false) {
				throw unknownOrganization();
			}
			const mongo = await databases.open(tenant.id);
			return {
				tenant,
				mongo: mongo.as(viewer.id as MongoActor<C>),
				core,
				member,
			};
		},
		eachTenant: (fn, scope) => eachOf(registry, databases, fn, scope),
		async provision(input, actor) {
			let created: T;
			try {
				created = await registry.create({ ...input }, actor);
			} catch (error) {
				if (error instanceof ConflictError) throw slugTaken(input.slug);
				throw error;
			}
			// If the database step fails the tenant stays `provisioning` and the
			// error is thrown; `prepare` again, then `activate`, is the retry.
			await prepare(created.id);
			return registry.activate(created, actor);
		},
		prepare,
		sync: () => syncAll(options, databases),
		migrate: (mode) =>
			migrateTargets(
				{ db: dbOf(core), migrations: coreMigrations },
				migrations,
				everyTarget,
				mode,
			),
		close: () => databases.close(),
	};
}
