import type { Module, ModuleJob } from './module';

export type ModuleGraphErrorCode =
	| 'modules.duplicate-module'
	| 'modules.unknown-dependency'
	| 'modules.dependency-cycle'
	| 'modules.duplicate-declaration';

// A registry that cannot be loaded or read: a module named twice, a
// dependency that is not registered, a cycle, a name two modules declare
// (a collection, a text, a permission, an emitted event type). `code` is
// stable and namespaced `modules.`, like every boot error of the kernel.
export class ModuleGraphError extends Error {
	constructor(
		readonly code: ModuleGraphErrorCode,
		message: string,
	) {
		super(message);
		this.name = 'ModuleGraphError';
	}
}

// Checks the list and returns it in dependency order (a module after
// everything it depends on, ties in list order).
export function resolveModules(list: readonly Module[]): readonly Module[] {
	const byName = new Map<string, Module>();
	for (const module of list) {
		if (byName.has(module.name)) {
			throw new ModuleGraphError(
				'modules.duplicate-module',
				`module "${module.name}" is registered twice`,
			);
		}
		byName.set(module.name, module);
	}
	for (const module of list) {
		for (const dependency of module.dependsOn ?? []) {
			if (!byName.has(dependency)) {
				throw new ModuleGraphError(
					'modules.unknown-dependency',
					`module "${module.name}" depends on "${dependency}", which is not registered`,
				);
			}
		}
	}
	const ordered: Module[] = [];
	const state = new Map<string, 'visiting' | 'done'>();
	const visit = (module: Module, path: readonly string[]) => {
		const seen = state.get(module.name);
		if (seen === 'done') return;
		if (seen === 'visiting') {
			const cycle = [...path.slice(path.indexOf(module.name)), module.name];
			throw new ModuleGraphError(
				'modules.dependency-cycle',
				`dependency cycle: ${cycle.join(' -> ')}`,
			);
		}
		state.set(module.name, 'visiting');
		for (const dependency of module.dependsOn ?? []) {
			visit(byName.get(dependency) as Module, [...path, module.name]);
		}
		state.set(module.name, 'done');
		ordered.push(module);
	};
	for (const module of list) visit(module, []);
	// Fails here rather than at the first reader that merges them.
	collectionsOf(ordered);
	coreCollectionsOf(ordered);
	permissionsOf(ordered);
	emitsOf(ordered);
	return ordered;
}

function mergeRecords<T>(
	modules: readonly Module[],
	pick: (module: Module) => Readonly<Record<string, T>> | undefined,
	what: string,
): Record<string, T> {
	const merged: Record<string, T> = {};
	const owner = new Map<string, string>();
	for (const module of modules) {
		for (const [key, value] of Object.entries(pick(module) ?? {})) {
			if (key in merged) {
				throw new ModuleGraphError(
					'modules.duplicate-declaration',
					`${what} "${key}" is declared by two modules ("${owner.get(key)}" and "${module.name}")`,
				);
			}
			merged[key] = value;
			owner.set(key, module.name);
		}
	}
	return merged;
}

export const typeDefsOf = (modules: readonly Module[]): string[] =>
	modules.flatMap((module) => module.typeDefs ?? []);

export const codesOf = (modules: readonly Module[]): string[] =>
	modules.flatMap((module) => module.codes ?? []);

// Declares `what` once per name: a second module naming it is refused.
function uniqueNames(
	modules: readonly Module[],
	pick: (module: Module) => readonly string[] | undefined,
	what: string,
): Map<string, string> {
	const owner = new Map<string, string>();
	for (const module of modules) {
		for (const name of pick(module) ?? []) {
			const first = owner.get(name);
			if (first !== undefined) {
				throw new ModuleGraphError(
					'modules.duplicate-declaration',
					first === module.name
						? `module "${module.name}" lists ${what} "${name}" twice`
						: `${what} "${name}" is declared by two modules ("${first}" and "${module.name}")`,
				);
			}
			owner.set(name, module.name);
		}
	}
	return owner;
}

// Every permission once, in the order the modules declare them. A permission
// two modules declare is a `ModuleGraphError`, never merged silently.
export const permissionsOf = (modules: readonly Module[]): string[] => [
	...uniqueNames(modules, (module) => module.permissions, 'permission').keys(),
];

// The event types the modules emit, by owning module, in declaration order. A
// type two modules declare is a `ModuleGraphError`.
export const emitsOf = (modules: readonly Module[]): Map<string, string> =>
	uniqueNames(modules, (module) => module.emits, 'event type');

// The permissions each role holds by default, across modules.
export function defaultGrantsOf(
	modules: readonly Module[],
): Record<string, string[]> {
	const grants: Record<string, Set<string>> = {};
	for (const module of modules) {
		for (const [role, permissions] of Object.entries(
			module.defaultGrants ?? {},
		)) {
			const held = grants[role] ?? new Set<string>();
			for (const permission of permissions) held.add(permission);
			grants[role] = held;
		}
	}
	return Object.fromEntries(
		Object.entries(grants).map(([role, held]) => [role, [...held]]),
	);
}

export const collectionsOf = (modules: readonly Module[]) =>
	mergeRecords(modules, (module) => module.collections, 'collection');

export const coreCollectionsOf = (modules: readonly Module[]) =>
	mergeRecords(modules, (module) => module.coreCollections, 'core collection');

// Migrations in the list's order: given a resolved list, a module's come after
// those of everything it depends on.
export const coreMigrationsOf = (modules: readonly Module[]): unknown[] =>
	modules.flatMap((module) => module.coreMigrations ?? []);

export const migrationsOf = (modules: readonly Module[]): unknown[] =>
	modules.flatMap((module) => module.migrations ?? []);

export interface NamedJob {
	// `<module>.<job>`, the queue's name.
	name: string;
	module: string;
	job: ModuleJob;
}

export const jobsOf = (modules: readonly Module[]): NamedJob[] =>
	modules.flatMap((module) =>
		Object.entries(module.jobs ?? {}).map(([key, job]) => ({
			name: `${module.name}.${key}`,
			module: module.name,
			job,
		})),
	);

// Texts merged by locale. A key two modules give for one locale is refused.
export function textsOf(
	modules: readonly Module[],
): Record<string, Record<string, string>> {
	const locales = new Set(
		modules.flatMap((module) => Object.keys(module.texts ?? {})),
	);
	const merged: Record<string, Record<string, string>> = {};
	for (const locale of locales) {
		merged[locale] = mergeRecords(
			modules,
			(module) => module.texts?.[locale],
			`text (${locale})`,
		);
	}
	return merged;
}
