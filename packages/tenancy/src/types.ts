import type { Module, ModuleName } from '@alxia/modules';
import type { Mongo } from '@nxgt/mongo';
import type { Migration, migrationStatus } from '@nxgt/mongo/migrations';
import type { ModuleScope, ModuleSource } from './modules';

export type TenantStatus = 'provisioning' | 'active' | 'archived';

/**
 * What the tenancy layer needs to know of a tenant. The host's record may hold
 * more (`T extends Tenant`) and gets it back untouched in the scope.
 */
export interface Tenant {
	/** The 24 hex digits of an `ObjectId` on a `perOrganization` store. */
	readonly id: string;
	readonly slug: string;
	readonly name: string;
	/** Only an `active` tenant is resolved from a request. */
	readonly status: TenantStatus;
}

/**
 * The account a request is made by. Anonymous: `null`. `@alxia/access` has its
 * own `Viewer` of the same shape (`{ id }`), so neither package needs the
 * other: a value of one is accepted where the other is asked for.
 */
export interface Viewer {
	readonly id: string;
}

/**
 * Whether an account belongs to a tenant. Answers what the membership is (a
 * role, `true`...) or `null`/`false` for a non-member, so one read gives both
 * the check and the role.
 */
export type Membership<M = true> = (
	tenantId: string,
	accountId: string,
) => Promise<M | null | false>;

/** Admits nobody. */
export const noMembers: Membership<never> = async () => null;

/**
 * Where the tenants are registered, in the host's core database. A port: the
 * host adapts its own collection to it.
 */
export interface TenantRegistry<T extends Tenant> {
	findById(id: string): Promise<T | undefined>;
	/** `slug` arrives lower-cased. */
	findBySlug(slug: string): Promise<T | undefined>;
	/** Every registered tenant, whatever its status; soft-deleted ones only with `withDeleted`. */
	list(options: { withDeleted: boolean }): Promise<T[]>;
	/**
	 * Registers a tenant as `provisioning`. A taken slug rejects with
	 * `@nxgt/mongo`'s `ConflictError` or a `TenancyError` `slug-taken`.
	 */
	create(input: { slug: string; name: string }, actor: string): Promise<T>;
	/** Marks the tenant `active` (optimistic lock included, if it has one). */
	activate(tenant: T, actor: string): Promise<T>;
}

/**
 * What a request about a tenant gets: the tenant, ITS database with the
 * viewer as actor, the host's core database, and the viewer's membership.
 * Plugin code touches `mongo` and never names a database.
 */
export interface TenantScope<C, K, T extends Tenant, M> {
	readonly tenant: T;
	readonly mongo: Mongo<C>;
	/** The host's core database handle, with no actor. On a `single` store, the one database. */
	readonly core: Mongo<K>;
	/** `undefined` on a `single` store, which checks no membership. */
	readonly member: M;
}

export type Resolution<T> =
	| { kind: 'found'; tenant: T }
	| { kind: 'none' }
	| { kind: 'unknown'; ref: string };

export interface EachTenantOptions {
	/**
	 * Visit every registered tenant, any status, soft-deleted ones included.
	 * Default: the `active` ones.
	 */
	withDeleted?: boolean;
}

export type MigrateMode =
	| { kind: 'apply'; dryRun: boolean }
	| { kind: 'status' }
	| { kind: 'rollback'; to: string; dryRun: boolean };

export interface MigrationOutcome {
	database: string;
	/** Ids applied, reverted or (dry run) pending, by mode; none for a status. */
	ids: string[];
	status: Awaited<ReturnType<typeof migrationStatus>>;
}

export interface TenantStore<C, K, T extends Tenant, M> {
	readonly kind: 'perOrganization' | 'single';
	/** The host's core database handle, no actor. */
	readonly core: Mongo<K>;
	/** The active tenant a ref (id or slug, any case) names. */
	resolve(ref: string): Promise<T | undefined>;
	/** The tenant a request names, `none` when it names none. */
	tenantOf(request: Request): Promise<Resolution<T>>;
	/** The tenant's database, no actor. */
	databaseOf(tenant: string | { readonly id: string }): Promise<Mongo<C>>;
	/** The scope of a request; throws a `TenancyError` when it has none. */
	scope(
		request: Request,
		viewer: Viewer | null,
	): Promise<TenantScope<C, K, T, M>>;
	/** The registry the store was given (`modules`), in dependency order. */
	readonly modules: readonly Module[];
	/**
	 * A module's handles from a scope (or a tenant visited by `eachTenant`):
	 * its own collections and its `dependsOn` ones, typed through `Register`.
	 * Throws a `ModuleWiringError` for a module the registry lacks or a
	 * collection the databases are not wired with.
	 */
	forModule<Name extends ModuleName>(
		source: ModuleSource<C, K>,
		name: Name,
	): ModuleScope<Name, C, K>;
	/** Runs `fn` on each tenant in turn and returns the results. */
	eachTenant<R>(
		fn: (tenant: T, mongo: Mongo<C>) => Promise<R>,
		options?: EachTenantOptions,
	): Promise<R[]>;
	/** Registers a tenant, prepares its database, activates it. */
	provision(input: { slug: string; name: string }, actor: string): Promise<T>;
	/** Brings one tenant's database to what the code says: sync, then migrations. Idempotent. */
	prepare(tenantId: string): Promise<void>;
	/** `db:sync`: the core database, then every tenant's. The database names. */
	sync(): Promise<string[]>;
	/** `db:migrate`: the core list on the core database, the tenant list on each tenant's. */
	migrate(mode: MigrateMode): Promise<MigrationOutcome[]>;
	/** Forgets what the store cached. The shared client is the caller's to close. */
	close(): Promise<void>;
}

export interface MigrationLists {
	/**
	 * The registry: indexes come from its collections (the databases' wiring),
	 * migrations from `migrationsOf` and `coreMigrationsOf`, run before the
	 * explicit lists below.
	 */
	modules?: readonly Module[];
	/** Applied to every tenant database. */
	migrations?: Migration[];
	/** Applied to the core database. */
	coreMigrations?: Migration[];
}
