import type { StandardSchema } from './standard';

export interface Described {
	readonly shape: Readonly<Record<string, StandardSchema<unknown>>>;
	readonly secret: ReadonlySet<string>;
}

/**
 * The shape behind each `env`, for `envExample` to read. On `globalThis`
 * under a `Symbol.for` key, so an app's copy of this package and the bin's
 * share it.
 */
const DESCRIBED = Symbol.for('alxia.env.described');
const scope = globalThis as { [key: symbol]: unknown };
export const described = (scope[DESCRIBED] ??= new WeakMap()) as WeakMap<
	object,
	Described
>;

const COLLECT: unique symbol = Symbol.for('alxia.env.collect') as never;

/**
 * Set by `alxia-env example`, which imports the app's env module only for
 * its schema: `defineEnv` then refuses nothing and hands each env here.
 * `Symbol.for`, so two copies of this package share it.
 */
export function collector(): object[] | undefined {
	return (globalThis as { [COLLECT]?: object[] })[COLLECT];
}

/** Starts collecting; `stop()` ends it, so a later `defineEnv` throws again. */
export function collect(): { envs: object[]; stop(): void } {
	const envs: object[] = [];
	const scope = globalThis as { [COLLECT]?: object[] };
	scope[COLLECT] = envs;
	return { envs, stop: () => delete scope[COLLECT] };
}
