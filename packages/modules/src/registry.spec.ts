import { describe, expect, test } from 'bun:test';
import { defineModule, type ModuleJob } from './module';
import {
	codesOf,
	collectionsOf,
	coreCollectionsOf,
	coreMigrationsOf,
	defaultGrantsOf,
	jobsOf,
	ModuleGraphError,
	migrationsOf,
	permissionsOf,
	resolveModules,
	textsOf,
	typeDefsOf,
} from './registry';

const m = (name: string, dependsOn: string[] = []) =>
	defineModule({ name, dependsOn });

describe('resolveModules', () => {
	test('orders a module after everything it depends on', () => {
		const names = resolveModules([
			m('invoicing', ['sales']),
			m('sales', ['pricing']),
			m('pricing'),
		]).map((module) => module.name);
		expect(names).toEqual(['pricing', 'sales', 'invoicing']);
	});

	test('keeps the list order between independent modules', () => {
		const names = resolveModules([m('b'), m('a'), m('c')]).map((x) => x.name);
		expect(names).toEqual(['b', 'a', 'c']);
	});

	test('refuses a dependency cycle, naming it', () => {
		expect(() =>
			resolveModules([m('a', ['b']), m('b', ['c']), m('c', ['a'])]),
		).toThrow('dependency cycle: a -> b -> c -> a');
		expect(() => resolveModules([m('a', ['a'])])).toThrow(
			'dependency cycle: a -> a',
		);
	});

	test('refuses a dependency that is not registered, naming both', () => {
		let error: unknown;
		try {
			resolveModules([m('sales', ['pricing'])]);
		} catch (caught) {
			error = caught;
		}
		expect(error).toBeInstanceOf(ModuleGraphError);
		expect((error as Error).message).toBe(
			'module "sales" depends on "pricing", which is not registered',
		);
	});

	test('refuses a module registered twice', () => {
		expect(() => resolveModules([m('a'), m('a')])).toThrow(
			'module "a" is registered twice',
		);
	});

	test('refuses a collection two modules declare, in either database', () => {
		const notes = {};
		expect(() =>
			resolveModules([
				defineModule({ name: 'a', collections: { notes } }),
				defineModule({ name: 'b', collections: { notes } }),
			]),
		).toThrow('collection "notes" is declared by two modules ("a" and "b")');
		expect(() =>
			resolveModules([
				defineModule({ name: 'a', coreCollections: { notes } }),
				defineModule({ name: 'b', coreCollections: { notes } }),
			]),
		).toThrow('core collection "notes" is declared by two modules');
	});
});

describe('the readers', () => {
	const job = (cron: string): ModuleJob => ({
		schedule: { cron, timezone: 'UTC' },
		attempts: 3,
		backoff: { base: '1m' },
		run: async () => undefined,
	});
	const list = resolveModules([
		defineModule({
			name: 'b',
			dependsOn: ['a'],
			typeDefs: ['type B'],
			codes: ['b.errors.y'],
			permissions: ['b:read', 'a:read'],
			defaultGrants: { admin: ['b:read'], viewer: ['b:read'] },
			texts: { en: { 'b.title': 'B' }, fr: { 'b.title': 'Bé' } },
			migrations: ['b1'],
			coreMigrations: ['cb1'],
			jobs: { sweep: job('0 3 * * *') },
			collections: { bs: 1 },
			coreCollections: { cores: 1 },
		}),
		defineModule({
			name: 'a',
			typeDefs: ['type A'],
			codes: ['a.errors.x'],
			permissions: ['a:read'],
			defaultGrants: { admin: ['a:read'] },
			texts: { en: { 'a.title': 'A' } },
			migrations: ['a1', 'a2'],
			coreMigrations: ['ca1'],
			collections: { as: 1 },
		}),
	]);

	test('gather type definitions and codes in dependency order', () => {
		expect(typeDefsOf(list)).toEqual(['type A', 'type B']);
		expect(codesOf(list)).toEqual(['a.errors.x', 'b.errors.y']);
	});

	test('permissions are listed once, grants merged by role', () => {
		expect(permissionsOf(list)).toEqual(['a:read', 'b:read']);
		expect(defaultGrantsOf(list)).toEqual({
			admin: ['a:read', 'b:read'],
			viewer: ['b:read'],
		});
	});

	test('migrations follow dependsOn order', () => {
		expect(migrationsOf(list)).toEqual(['a1', 'a2', 'b1']);
		expect(coreMigrationsOf(list)).toEqual(['ca1', 'cb1']);
	});

	test('jobs are named <module>.<job>', () => {
		const [found, ...rest] = jobsOf(list);
		expect(rest).toEqual([]);
		expect(found?.name).toBe('b.sweep');
		expect(found?.module).toBe('b');
		expect(found?.job.schedule.cron).toBe('0 3 * * *');
	});

	test('texts merge by locale; a repeated key is refused', () => {
		expect(textsOf(list)).toEqual({
			en: { 'a.title': 'A', 'b.title': 'B' },
			fr: { 'b.title': 'Bé' },
		});
		expect(() =>
			textsOf([
				defineModule({ name: 'x', texts: { en: { k: '1' } } }),
				defineModule({ name: 'y', texts: { en: { k: '2' } } }),
			]),
		).toThrow('text (en) "k" is declared by two modules ("x" and "y")');
	});

	test('collections merge across modules', () => {
		expect(Object.keys(collectionsOf(list))).toEqual(['as', 'bs']);
		expect(Object.keys(coreCollectionsOf(list))).toEqual(['cores']);
	});
});
