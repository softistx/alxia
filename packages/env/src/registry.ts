import type { StandardSchema } from './standard';

export interface Described {
	readonly shape: Readonly<Record<string, StandardSchema<unknown>>>;
	readonly secret: ReadonlySet<string>;
}

/** The shape behind each `env`, for `envExample` to read. */
export const described = new WeakMap<object, Described>();

const COLLECT = Symbol.for('alxia.env.collect');

/**
 * Set by `alxia-env example`, which imports the app's env module only for
 * its schema: `defineEnv` then refuses nothing and hands each env here.
 * `Symbol.for`, so two copies of this package share it.
 */
export function collector(): object[] | undefined {
	return (globalThis as { [COLLECT]?: object[] })[COLLECT];
}

export function collect(): object[] {
	const list: object[] = [];
	(globalThis as { [COLLECT]?: object[] })[COLLECT] = list;
	return list;
}
