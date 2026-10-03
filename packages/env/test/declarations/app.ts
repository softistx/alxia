// An app's environment, behind exported values whose types are inferred: a
// declaration build must be able to name each one through `@alxia/env` and
// the schema's own library alone (TS2883 otherwise).
import { parseEnv } from '@alxia/env';
import { z } from 'zod';

export const env = parseEnv(
	z.object({
		PORT: z.coerce.number().default(3000),
		DATABASE_URL: z.url(),
	}),
	{ DATABASE_URL: 'postgres://localhost/db' },
);

export function envOf<S extends z.ZodType>(schema: S) {
	return parseEnv(schema, {});
}
