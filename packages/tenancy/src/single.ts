import type { Mongo, MongoActor } from '@nxgt/mongo';
import { migrate } from '@nxgt/mongo/migrations';
import { unknownOrganization } from './errors';
import { dbOf, migrateTargets } from './migrate';
import { bindModules } from './modules';
import type {
	MigrationLists,
	Resolution,
	Tenant,
	TenantStore,
	Viewer,
} from './types';

export interface SingleOptions<C, K, T extends Tenant> extends MigrationLists {
	/** The one database. */
	mongo: Mongo<C>;
	/**
	 * The core database, when the host keeps one apart. Default: the same
	 * handle as `mongo`, so core and tenant collections share the database.
	 */
	core?: Mongo<K>;
	/** The fixed tenant (`status` is taken as `active`). */
	tenant: Omit<T, 'status'> & { status?: 'active' };
}

export interface SingleStore<C, K, T extends Tenant>
	extends TenantStore<C, K, T, undefined> {
	readonly kind: 'single';
}

/**
 * One database and one fixed tenant, for a host that serves a single
 * organisation. No header and no membership check: the scope always carries the
 * fixed tenant and access is left to permissions. It answers the same contract
 * as `perOrganization`, so code written against `TenantStore` runs on both.
 */
export function single<C, K = C, T extends Tenant = Tenant>(
	options: SingleOptions<C, K, T>,
): SingleStore<C, K, T> {
	const { mongo } = options;
	const core = (options.core ?? mongo) as unknown as Mongo<K>;
	const apart = options.core !== undefined && dbOf(core) !== dbOf(mongo);
	const tenant = { ...options.tenant, status: 'active' } as unknown as T;
	const { modules, forModule, migrations, coreMigrations } = bindModules(
		options.modules ?? [],
		options,
	);

	const names = (ref: string) => {
		const text = ref.trim().toLowerCase();
		return (
			text === tenant.id.toLowerCase() || text === tenant.slug.toLowerCase()
		);
	};
	const idOf = (value: string | { readonly id: string }) =>
		typeof value === 'string' ? value : value.id;
	const only = (value: string | { readonly id: string }) => {
		if (idOf(value) !== tenant.id) throw unknownOrganization();
	};

	async function prepare(tenantId: string): Promise<void> {
		only(tenantId);
		await mongo.sync();
		if (apart) await core.sync();
		// With no database apart, the core list runs on the one database too,
		// core first: a module's `coreMigrations` are not lost.
		await migrate(
			dbOf(mongo),
			apart ? migrations : [...coreMigrations, ...migrations],
		);
		if (apart) await migrate(dbOf(core), coreMigrations);
	}

	return {
		kind: 'single',
		core,
		modules,
		forModule,
		async resolve(ref) {
			return names(ref) ? tenant : undefined;
		},
		async tenantOf(): Promise<Resolution<T>> {
			return { kind: 'found', tenant };
		},
		async databaseOf(value) {
			only(value);
			return mongo;
		},
		async scope(_request: Request, viewer: Viewer | null) {
			return {
				tenant,
				mongo: viewer ? mongo.as(viewer.id as MongoActor<C>) : mongo,
				core,
				member: undefined,
			};
		},
		async eachTenant(fn) {
			return [await fn(tenant, mongo)];
		},
		async provision(_input, _actor) {
			await prepare(tenant.id);
			return tenant;
		},
		prepare,
		async sync() {
			await mongo.sync();
			const names = [dbOf(mongo).databaseName];
			if (apart) {
				await core.sync();
				names.unshift(dbOf(core).databaseName);
			}
			return names;
		},
		migrate: (mode) =>
			apart
				? migrateTargets(
						{ db: dbOf(core), migrations: coreMigrations },
						migrations,
						async function* () {
							yield { db: dbOf(mongo), migrations };
						},
						mode,
					)
				: migrateTargets(
						undefined,
						[...coreMigrations, ...migrations],
						async function* () {
							yield {
								db: dbOf(mongo),
								migrations: [...coreMigrations, ...migrations],
							};
						},
						mode,
					),
		async close() {},
	};
}
