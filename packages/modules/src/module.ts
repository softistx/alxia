// A job a module declares: it runs for each scope the host iterates (an
// organization, a tenant, a site: the host decides) on a schedule through a
// queue named `<module>.<job>`, and on demand by that name.
export interface ModuleJob {
	// The cron and timezone the queue adds the job on.
	schedule: { cron: string; timezone: string };
	// Tries before the queue gives up, and the wait before the first retry
	// (`"1m"`). An idempotent job retries safely.
	attempts: number;
	backoff: { base: string };
	// The work for one scope. `scope` is whatever the host passes (a typed
	// database handle, for instance); what it returns is reported by the host.
	run: (scope: never, now: Date) => Promise<unknown>;
}

// A module's manifest: everything the application learns about a module is
// read from here, so adding a module touches only the registry list.
export interface ModuleDefinition<Name extends string = string> {
	// Unique. Others name it in `dependsOn`.
	name: Name;
	// The modules this one may call through their `api`. Checked: every name
	// exists, no cycle.
	dependsOn?: readonly string[];
	// The collections of the main database, and of a core one. Values are
	// whatever the host's database layer defines a collection with.
	collections?: Readonly<Record<string, unknown>>;
	coreCollections?: Readonly<Record<string, unknown>>;
	// The module's GraphQL SDL, one string per file.
	typeDefs?: readonly string[];
	// The module's resolvers, as the host's GraphQL layer types them.
	resolvers?: Readonly<Record<string, unknown>>;
	// What the module's service is, built per request from the request's scope.
	services?: (scope: never) => unknown;
	// Permissions the module declares, each `<area>:read` or `<area>:manage`
	// (`notes:read`, `notes:manage`), and the roles that hold them by default.
	permissions?: readonly string[];
	defaultGrants?: Readonly<Record<string, readonly string[]>>;
	// The module's error codes.
	codes?: readonly string[];
	// Texts by locale then key, merged across modules by `textsOf`.
	texts?: Readonly<Record<string, Readonly<Record<string, string>>>>;
	// Migrations of the core database and of each scope's, in the order they
	// must run. Opaque here: the host's migration runner types them.
	coreMigrations?: readonly unknown[];
	migrations?: readonly unknown[];
	// Scheduled jobs by name.
	jobs?: Readonly<Record<string, ModuleJob>>;
	// The names of the events the module emits, and its handlers by event name.
	emits?: readonly string[];
	subscribers?: Readonly<
		Record<string, (event: never, context: never) => unknown>
	>;
	// The one thing another module may call: its public surface.
	api?: unknown;
}

export type Module<Name extends string = string> = Readonly<
	ModuleDefinition<Name>
>;

// The one way to declare a module: the manifest, frozen. Its own type is kept
// (`collections` by name), so the typed handles are derived from the registry.
export function defineModule<const D extends ModuleDefinition>(
	definition: D,
): Readonly<D> {
	return Object.freeze({ ...definition });
}
