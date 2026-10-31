import type {
	Module,
	ModuleCoreHandle,
	ModuleHandle,
	ModuleName,
} from '@alxia/modules';
import { coreMigrationsOf, migrationsOf, resolveModules } from '@alxia/modules';
import type { Mongo } from '@nxgt/mongo';
import type { Migration } from '@nxgt/mongo/migrations';
import { ModuleWiringError } from './errors';

/**
 * What a module is handed: its tenant collections on the tenant's database and
 * its core collections on the core one, each typed through `Register` to the
 * module's own collections and those of its `dependsOn`. On a `single` store
 * both handles are on the same database.
 */
export interface ModuleScope<Name extends ModuleName, C, K> {
	readonly mongo: ModuleHandle<Name, Mongo<C>>;
	readonly core: ModuleCoreHandle<Name, Mongo<K>>;
}

/** The databases a module is handed from: a scope, or a tenant visited by `eachTenant`. */
export interface ModuleSource<C, K> {
	readonly mongo: Mongo<C>;
	readonly core: Mongo<K>;
}

export interface ModuleBinding {
	readonly modules: readonly Module[];
	/** Migrations of the registry, then the explicit ones. */
	readonly migrations: Migration[];
	readonly coreMigrations: Migration[];
	forModule<Name extends ModuleName, C, K>(
		source: ModuleSource<C, K>,
		name: Name,
	): ModuleScope<Name, C, K>;
}

const keysOf = (record: Readonly<Record<string, unknown>> | undefined) =>
	Object.keys(record ?? {});

const wired = (mongo: Mongo<never>, key: string) =>
	key in (mongo.db as unknown as object);

/**
 * Reads a registry once: the migrations (`migrationsOf`) a store runs, and
 * the check `forModule` makes. The list is resolved (dependency order,
 * duplicates refused); a collection declared as both a tenant and a core one
 * is refused, since the single store would put both in one database.
 */
export function bindModules(
	list: readonly Module[],
	explicit: {
		migrations?: readonly Migration[] | undefined;
		coreMigrations?: readonly Migration[] | undefined;
	} = {},
): ModuleBinding {
	const modules = resolveModules(list);
	const byName = new Map(modules.map((module) => [module.name, module]));
	const coreKeys = new Map<string, string>();
	for (const module of modules) {
		for (const key of keysOf(module.coreCollections))
			coreKeys.set(key, module.name);
	}
	for (const module of modules) {
		for (const key of keysOf(module.collections)) {
			const other = coreKeys.get(key);
			if (other !== undefined) {
				throw new ModuleWiringError(
					`collection "${key}" is a tenant collection of "${module.name}" and a core collection of "${other}"`,
				);
			}
		}
	}
	return {
		modules,
		migrations: [
			...(migrationsOf(modules) as Migration[]),
			...(explicit.migrations ?? []),
		],
		coreMigrations: [
			...(coreMigrationsOf(modules) as Migration[]),
			...(explicit.coreMigrations ?? []),
		],
		forModule(source, name) {
			const module = byName.get(name);
			if (!module) {
				throw new ModuleWiringError(`module "${name}" is not registered`);
			}
			const reach = [
				module,
				...(module.dependsOn ?? []).map(
					(dependency) => byName.get(dependency) as Module,
				),
			];
			for (const owner of reach) {
				for (const key of keysOf(owner.collections)) {
					if (!wired(source.mongo as Mongo<never>, key)) {
						throw new ModuleWiringError(
							`collection "${key}" of module "${owner.name}" is not wired in the tenant database`,
						);
					}
				}
				for (const key of keysOf(owner.coreCollections)) {
					if (!wired(source.core as Mongo<never>, key)) {
						throw new ModuleWiringError(
							`core collection "${key}" of module "${owner.name}" is not wired in the core database`,
						);
					}
				}
			}
			return source as never;
		},
	};
}
