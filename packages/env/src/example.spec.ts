import { describe, expect, test } from 'bun:test';
import * as v from 'valibot';
import { z } from 'zod';
import { defineEnv } from './define';
import { envExample } from './example';

describe('envExample', () => {
	test('names, expected types, defaults and descriptions; never a secret', () => {
		const env = defineEnv(
			{
				DATABASE_URL: z.url().describe('Postgres connection string'),
				PORT: z.coerce.number().default(3000),
				API_KEY: z.string().min(1).default('dev-key'),
				LOG_LEVEL: z.enum(['debug', 'info']).default('info'),
				SENTRY_DSN: z.url().optional(),
				DEBUG: z.stringbool().default(false),
				CACHE: v.optional(
					v.pipe(v.string(), v.description('Cache dir')),
					'tmp',
				),
				ORIGINS: z.string().default('a b'),
			},
			{
				source: { DATABASE_URL: 'postgres://localhost/db' },
				secret: ['API_KEY'],
			},
		);
		expect(envExample(env)).toBe(`# Postgres connection string
# string (url), required
DATABASE_URL=

# number, optional, default 3000
PORT=3000

# string, optional, secret
API_KEY=

# "debug" | "info", optional, default info
LOG_LEVEL=info

# string (url), optional
# SENTRY_DSN=

# string, optional, default false
DEBUG=false

# Cache dir
# string, optional, default tmp
CACHE=tmp

# string, optional, default a b
ORIGINS="a b"
`);
		expect(envExample(env)).not.toContain('dev-key');
	});

	test('refuses what defineEnv did not make', () => {
		expect(() => envExample({})).toThrow(TypeError);
	});
});
