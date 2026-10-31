import { type Mongo, type MongoConfig, openMongo } from '@nxgt/mongo';
import type { ObjectId } from 'mongodb';
import { type DatabaseNaming, namer } from './names';

export interface TenantDatabasesOptions<C> {
	/** The prefix of every tenant database, or a function from the tenant id. */
	database: DatabaseNaming;
	/** How many open `Mongo`s stay cached; the least recently used leaves first. Default 10. */
	size?: number;
	/**
	 * The wiring of one tenant's database, on the shared client:
	 * `defineMongo({ client, database, collections })`. A `client` in the
	 * config is never closed by the `Mongo`, which is what makes eviction safe.
	 */
	configure: (database: string) => MongoConfig<C>;
}

export interface TenantDatabases<C> {
	/** The database name of a tenant. Throws a `TypeError` for anything but a tenant id. */
	nameOf(tenantId: string | ObjectId): string;
	/** The tenant's `Mongo`, cached. `.as(actor)` on it stamps a request's writes. */
	open(tenantId: string | ObjectId): Promise<Mongo<C>>;
	/** How many tenants are cached right now. */
	readonly cached: number;
	/** Forgets every cached `Mongo`. The shared client is the caller's to close. */
	close(): Promise<void>;
}

/**
 * A cached factory of per-tenant `Mongo`s over the ONE `MongoClient` the
 * application connected. Opening one only builds lazy collection handles.
 */
export function createTenantDatabases<C>(
	options: TenantDatabasesOptions<C>,
): TenantDatabases<C> {
	const { size = 10, configure } = options;
	if (!Number.isInteger(size) || size < 1) {
		throw new RangeError('the tenant cache holds at least one entry');
	}
	const nameOf = namer(options.database);
	// Insertion order is recency order: a hit is deleted and set again.
	const cache = new Map<string, Promise<Mongo<C>>>();

	function evict() {
		while (cache.size > size) {
			const [oldest] = cache.keys();
			if (oldest === undefined) return;
			const evicted = cache.get(oldest);
			cache.delete(oldest);
			// Closed in the background: a request still holding it keeps working.
			evicted?.then((mongo) => mongo.close()).catch(() => {});
		}
	}

	return {
		nameOf,
		async open(tenantId) {
			const database = nameOf(tenantId);
			const hit = cache.get(database);
			if (hit) {
				cache.delete(database);
				cache.set(database, hit);
				return await hit;
			}
			const opened = openMongo(configure(database));
			// A failed open is forgotten, so the next call tries again.
			opened.catch(() => {
				if (cache.get(database) === opened) cache.delete(database);
			});
			cache.set(database, opened);
			evict();
			return await opened;
		},
		get cached() {
			return cache.size;
		},
		async close() {
			const all = [...cache.values()];
			cache.clear();
			await Promise.allSettled(
				all.map(async (opened) => (await opened).close()),
			);
		},
	};
}
