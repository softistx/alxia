import { expectedOf } from './describe';
import { EnvError, type EnvIssue } from './error';
import { printable, REDACTED } from './redact';
import { collector, described } from './registry';
import { type OutputOf, pathOf, type StandardSchema } from './standard';

/** The variables, each by its own schema. */
export type EnvShape = Readonly<Record<string, StandardSchema<unknown>>>;

type Flat<T> = { [K in keyof T]: T[K] } & {};

/**
 * What `defineEnv` returns: a schema with a default is a required key, a
 * schema that lets `undefined` through (`.optional()`) an optional one.
 */
export type Env<Shape extends EnvShape> = Flat<
	{
		readonly [K in keyof Shape as undefined extends OutputOf<Shape[K]>
			? never
			: K]: OutputOf<Shape[K]>;
	} & {
		readonly [K in keyof Shape as undefined extends OutputOf<Shape[K]>
			? K
			: never]?: OutputOf<Shape[K]>;
	}
>;

export interface DefineEnvOptions<Shape extends EnvShape> {
	/** Variables printed as `***` by `toJSON`, `inspect` and `toString`, and kept out of every error. */
	readonly secret?: readonly (keyof Shape & string)[];
	/** Where the variables are read from: `Bun.env`, or an object in a test. */
	readonly source?: Readonly<Record<string, string | undefined>>;
}

function check(
	name: string,
	schema: StandardSchema<unknown>,
	raw: string | undefined,
	secret: boolean,
	into: EnvIssue[],
): unknown {
	const result = schema['~standard'].validate(raw);
	if (result instanceof Promise) {
		throw new TypeError(
			`defineEnv(): the schema of ${name} must validate synchronously`,
		);
	}
	if (result.issues === undefined) return result.value;
	const expected = expectedOf(schema);
	for (const issue of result.issues) {
		// A validator may echo the value it refused: never a secret's.
		const message =
			secret && raw ? issue.message.replaceAll(raw, REDACTED) : issue.message;
		const rest = pathOf(issue.path);
		into.push({ path: rest ? `${name}.${rest}` : name, message, expected });
	}
	return undefined;
}

/**
 * The environment, each variable checked by its own schema — any Standard
 * Schema — once, when this is called. It throws one `EnvError` that lists
 * every missing or invalid variable, never a secret's value, and returns the
 * values frozen and typed. A `secret` prints as `***`.
 *
 * ```ts
 * export const env = defineEnv(
 * 	{ DATABASE_URL: z.url(), PORT: z.coerce.number().default(3000) },
 * 	{ secret: ['DATABASE_URL'] },
 * );
 * // app.decorate({ env })
 * ```
 */
export function defineEnv<const Shape extends EnvShape>(
	shape: Shape,
	options: DefineEnvOptions<Shape> = {},
): Env<Shape> {
	const source = options.source ?? Bun.env;
	const secret = new Set<string>(options.secret);
	const values: Record<string, unknown> = {};
	const issues: EnvIssue[] = [];
	for (const [name, schema] of Object.entries(shape)) {
		const value = check(name, schema, source[name], secret.has(name), issues);
		if (value !== undefined) values[name] = value;
	}
	const collecting = collector();
	if (issues.length > 0 && collecting === undefined) throw new EnvError(issues);
	const env = printable(values, secret);
	described.set(env, { shape, secret });
	collecting?.push(env);
	return env as Env<Shape>;
}
