/**
 * Factories: functions that make a middleware, or a plugin, when called.
 * Marked, so that one given uncalled — `use(cors)` for `use(cors())` —
 * throws where it is declared, naming it, rather than answering every
 * request with a 500.
 */

/** What a factory makes, once called. */
export type FactoryKind = 'middleware' | 'plugin';

/**
 * Where a factory carries its mark: a symbol of the global registry, so
 * that a factory of a package built against another copy of
 * `@alxia/core` is recognised too.
 */
const FACTORY: unique symbol = Symbol.for('alxia.factory');

/**
 * Marks `factory` as a function that makes a middleware — or, with
 * `'plugin'`, a plugin — and returns it, unchanged: `use(factory)`, a
 * route given it, and `plugin(factory)` then throw at declaration, saying
 * to call it. Every package of alxia marks its own; mark yours the same
 * way:
 *
 * ```ts
 * export function auditLog(options: AuditOptions = {}) {
 *   return defineMiddleware(async function auditLog(ctx, next) { ... });
 * }
 * markFactory(auditLog);
 * ```
 */
export function markFactory<Factory extends (...args: never[]) => unknown>(
	factory: Factory,
	kind: FactoryKind = 'middleware',
): Factory {
	if (typeof factory !== 'function') {
		throw new TypeError('markFactory(): the factory is not a function');
	}
	Object.defineProperty(factory, FACTORY, { value: kind });
	return factory;
}

/** What `value` makes when it is a marked factory, else nothing. */
export function factoryOf(value: unknown): FactoryKind | undefined {
	return typeof value === 'function'
		? (value as { [FACTORY]?: FactoryKind })[FACTORY]
		: undefined;
}

/** Where a factory was given: to `use`, among a route's middlewares, or to `plugin`. */
export type GivenTo = 'use' | 'route' | 'plugin';

/**
 * Why `value` cannot stand at `at` — `use(): argument 1`, `GET /x:
 * middleware 2`, `plugin(): argument 1` — when it is a factory given
 * uncalled; else nothing.
 *
 * ```text
 * use(): argument 1 looks like a factory (cors): call it, use(cors())
 * ```
 */
export function uncalledFactory(
	value: unknown,
	at: string,
	givenTo: GivenTo,
): string | undefined {
	const kind = factoryOf(value);
	if (kind === undefined) return undefined;
	const name = (value as { name: string }).name || 'factory';
	return `${at} looks like a factory (${name}): call it, ${fix(kind, givenTo, `${name}()`)}`;
}

function fix(kind: FactoryKind, givenTo: GivenTo, called: string): string {
	if (kind === 'plugin') {
		return givenTo === 'plugin'
			? `plugin(${called})`
			: `and give the plugin it makes to plugin(): plugin(${called})`;
	}
	if (givenTo === 'plugin') {
		return `and give the middleware it makes to use(): use(${called})`;
	}
	return givenTo === 'use'
		? `use(${called})`
		: `${called} among the route's middlewares`;
}
