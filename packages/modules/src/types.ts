import type { Module } from './module';

// Merged by the application to name its registry:
//
//   declare module '@alxia/modules' {
//     interface Register { modules: typeof registered }
//   }
//
// where `registered` is your own list, declared `as const`: not the value
// `resolveModules` returns, whose type is the plain `readonly Module[]`.
// biome-ignore lint/suspicious/noEmptyInterface: an interface, to be merged
export interface Register {}

// The registered list, or any list of modules when nothing is registered.
export type Registered = Register extends {
	modules: infer List extends readonly unknown[];
}
	? List
	: readonly Module[];

type IsRegistered = Register extends { modules: readonly unknown[] }
	? true
	: false;

export type ModuleName<List extends readonly unknown[] = Registered> =
	List[number] extends infer M
		? M extends { readonly name: infer N extends string }
			? N
			: never
		: never;

type UnionToIntersection<U> = (
	U extends unknown
		? (value: U) => void
		: never
) extends (value: infer I) => void
	? I
	: never;

type PickedBy<
	List extends readonly unknown[],
	Key extends string,
> = UnionToIntersection<
	List[number] extends infer M
		? M extends { readonly [K in Key]: infer C }
			? C
			: never
		: never
>;

type Open = Readonly<Record<string, unknown>>;

// The collections of the main database, and of the core one, as the manifests
// of a registered list declare them, by name.
export type CollectionsOf<List extends readonly unknown[] = Registered> =
	PickedBy<List, 'collections'>;
export type CoreCollectionsOf<List extends readonly unknown[] = Registered> =
	PickedBy<List, 'coreCollections'>;

// The manifest of `Name` and of the modules its `dependsOn` names.
export type ViewOf<List extends readonly unknown[], Name extends string> =
	| Extract<List[number], { readonly name: Name }>
	| Extract<
			List[number],
			{
				readonly name: Extract<List[number], { readonly name: Name }> extends {
					readonly dependsOn: readonly (infer D extends string)[];
				}
					? D
					: never;
			}
	  >;

// What a module may touch: its own collections and those of the modules in its
// `dependsOn`, by name. With nothing registered, any name.
export type ModuleMongo<
	Name extends ModuleName<List>,
	List extends readonly unknown[] = Registered,
> = IsRegistered extends true
	? Readonly<PickedBy<ViewOf<List, Name>[], 'collections'>>
	: Open;

// The same for the core database: the `coreCollections` of `Name` and of the
// modules its `dependsOn` names. With nothing registered, any name.
export type ModuleCoreMongo<
	Name extends ModuleName<List>,
	List extends readonly unknown[] = Registered,
> = IsRegistered extends true
	? Readonly<PickedBy<ViewOf<List, Name>[], 'coreCollections'>>
	: Open;

// A host's handle (`db` keyed by collection name, and a `transaction`)
// narrowed to `ModuleMongo<Name>`; a module typed against it fails typecheck
// on any other collection.
export type ModuleHandle<
	Name extends ModuleName<List>,
	Handle extends {
		readonly db: object;
		readonly transaction: (...args: never) => unknown;
	},
	List extends readonly unknown[] = Registered,
> = Omit<Handle, 'db' | 'transaction'> & {
	readonly db: IsRegistered extends true
		? Pick<
				Handle['db'],
				Extract<keyof ModuleMongo<Name, List>, keyof Handle['db']>
			>
		: Handle['db'];
	transaction<T>(
		fn: (tx: ModuleHandle<Name, Handle, List>) => Promise<T>,
		options?: Parameters<Handle['transaction']>[1],
	): Promise<T>;
};

// A host's core handle narrowed to `ModuleCoreMongo<Name>` the same way.
export type ModuleCoreHandle<
	Name extends ModuleName<List>,
	Handle extends {
		readonly db: object;
		readonly transaction: (...args: never) => unknown;
	},
	List extends readonly unknown[] = Registered,
> = Omit<Handle, 'db' | 'transaction'> & {
	readonly db: IsRegistered extends true
		? Pick<
				Handle['db'],
				Extract<keyof ModuleCoreMongo<Name, List>, keyof Handle['db']>
			>
		: Handle['db'];
	transaction<T>(
		fn: (tx: ModuleCoreHandle<Name, Handle, List>) => Promise<T>,
		options?: Parameters<Handle['transaction']>[1],
	): Promise<T>;
};
