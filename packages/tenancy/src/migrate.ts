import type { Migration } from '@nxgt/mongo/migrations';
import { migrate, migrationStatus, rollback } from '@nxgt/mongo/migrations';
import type { Db } from 'mongodb';
import { UnknownMigrationError } from './errors';
import type { MigrateMode, MigrationOutcome } from './types';

/** The driver's `Db` under a `Mongo`, for what takes a plain `Db`. */
export function dbOf(mongo: { readonly db: unknown }): Db {
	return mongo.db as unknown as Db;
}

export interface MigrationTarget {
	db: Db;
	migrations: Migration[];
}

async function runIn(
	{ db, migrations }: MigrationTarget,
	mode: MigrateMode,
): Promise<MigrationOutcome> {
	let ids: string[] = [];
	if (mode.kind === 'apply') {
		const result = await migrate(db, migrations, { dryRun: mode.dryRun });
		ids = mode.dryRun ? result.pending : result.applied.map((r) => r.id);
	} else if (mode.kind === 'rollback') {
		const result = await rollback(db, migrations, {
			to: mode.to,
			dryRun: mode.dryRun,
		});
		ids = mode.dryRun ? result.pending : result.reverted.map((r) => r.id);
	}
	return {
		database: db.databaseName,
		ids,
		status: await migrationStatus(db, migrations),
	};
}

const holds = (migrations: Migration[], id: string) =>
	migrations.some((migration) => migration.id === id);

/**
 * Runs `mode` on the core target, then on each tenant target. One database
 * failing stops the loop with its name in the error. A rollback touches only
 * the list(s) that hold its id, and an id no list holds is refused before
 * anything is reverted.
 */
export async function migrateTargets(
	core: MigrationTarget | undefined,
	tenantLists: Migration[],
	tenants: () => AsyncIterable<MigrationTarget>,
	mode: MigrateMode,
): Promise<MigrationOutcome[]> {
	const concerns = (migrations: Migration[]) =>
		mode.kind !== 'rollback' || holds(migrations, mode.to);
	const coreConcerned = core !== undefined && concerns(core.migrations);
	const tenantsConcerned = concerns(tenantLists);
	if (mode.kind === 'rollback' && !coreConcerned && !tenantsConcerned) {
		throw new UnknownMigrationError(mode.to);
	}
	const outcomes: MigrationOutcome[] = [];
	if (core && coreConcerned) outcomes.push(await runIn(core, mode));
	if (!tenantsConcerned) return outcomes;
	for await (const target of tenants()) {
		try {
			outcomes.push(await runIn(target, mode));
		} catch (error) {
			throw new Error(`migration failed in ${target.db.databaseName}`, {
				cause: error,
			});
		}
	}
	return outcomes;
}
