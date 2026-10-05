/**
 * Environment variables, validated once, at startup, with any Standard
 * Schema: a missing or malformed one stops the process with every issue,
 * not the first request that reads it.
 */
import { EnvError } from './error';
import { type OutputOf, pathOf, type StandardSchema } from './standard';

/**
 * `source` — `Bun.env` by default — checked by `schema`, its output typed
 * and frozen: `readonly`, in its type too.
 * Throws an `EnvError` naming every refused variable. The schema must be
 * synchronous: the environment is read before anything awaits.
 *
 * To check each variable by its own schema, keep secrets out of what is
 * printed and generate a `.env.example`, use `defineEnv`.
 *
 * ```ts
 * export const env = parseEnv(z.object({ PORT: z.coerce.number().default(3000), DATABASE_URL: z.url() }));
 * ```
 */
export function parseEnv<Schema extends StandardSchema<unknown>>(
	schema: Schema,
	source: Record<string, string | undefined> = Bun.env,
): Readonly<OutputOf<Schema>> {
	const result = schema['~standard'].validate({ ...source });
	if (result instanceof Promise) {
		throw new TypeError('parseEnv(): the schema must validate synchronously');
	}
	if (result.issues !== undefined) {
		throw new EnvError(
			result.issues.map((issue) => ({
				path: pathOf(issue.path),
				message: issue.message,
			})),
		);
	}
	return Object.freeze(result.value) as Readonly<OutputOf<Schema>>;
}
