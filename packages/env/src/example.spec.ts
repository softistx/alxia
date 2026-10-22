import { describe, expect, test } from 'bun:test';
import { type } from 'arktype';
import * as v from 'valibot';
import { z } from 'zod';
import { defineEnv } from './define';
import { envExample } from './example';
import type { StandardSchema } from './standard';

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

	test('Zod, Valibot and ArkType schemas keep their lines', () => {
		const env = defineEnv(
			{
				Z_DESCRIBED: z.string().describe('A zod string'),
				Z_PLAIN: z.string(),
				Z_ENUM: z.enum(['x', 'y']).describe('A zod enum'),
				V_PLAIN: v.optional(v.picklist(['p', 'q']), 'p'),
				A_PLAIN: type('string'),
				A_DESCRIBED: type('string').describe('An ark string'),
				A_UNION: type("'a'|'b'"),
			},
			{
				source: {
					Z_DESCRIBED: 'a',
					Z_PLAIN: 'a',
					Z_ENUM: 'x',
					A_PLAIN: 'a',
					A_DESCRIBED: 'a',
					A_UNION: 'a',
				},
			},
		);
		expect(envExample(env)).toBe(`# A zod string
# string, required
Z_DESCRIBED=

# string, required
Z_PLAIN=

# A zod enum
# "x" | "y", required
Z_ENUM=

# "p" | "q", optional, default p
V_PLAIN=p

# a string
# string, required
A_PLAIN=

# An ark string
# string, required
A_DESCRIBED=

# "a" or "b"
# "a" | "b", required
A_UNION=
`);
	});

	test('refuses what defineEnv did not make', () => {
		expect(() => envExample({})).toThrow(TypeError);
	});

	describe('Standard JSON Schema', () => {
		const withJson = (
			input: () => Record<string, unknown>,
		): StandardSchema<unknown> => ({
			'~standard': {
				version: 1,
				vendor: 'hand-written',
				validate: (value) =>
					value === undefined
						? { issues: [{ message: 'Required' }] }
						: { value },
				jsonSchema: { input, output: input },
			} as StandardSchema<unknown>['~standard'],
		});

		test('describes a schema the shape readers do not fit', () => {
			const env = defineEnv(
				{
					HOST: withJson(() => ({ type: 'string', description: 'Bind host' })),
					MODE: withJson(() => ({ enum: ['a', 'b'] })),
					URL_: withJson(() => ({ type: 'string', format: 'uri' })),
					PORT: withJson(() => ({ type: 'integer' })),
				},
				{ source: { HOST: 'h', MODE: 'a', URL_: 'u', PORT: '1' } },
			);
			const text = envExample(env);
			expect(text).toContain('# Bind host\n# string, required\nHOST=');
			expect(text).toContain('# "a" | "b", required\nMODE=');
			expect(text).toContain('# string (uri), required\nURL_=');
			expect(text).toContain('# integer, required\nPORT=');
		});

		test('a jsonSchema.input that is not an object gives nothing', () => {
			const env = defineEnv(
				{
					STR: withJson((() => 'string') as never),
					NUL: withJson((() => null) as never),
				},
				{ source: { STR: 'x', NUL: 'x' } },
			);
			expect(envExample(env)).toBe('# required\nSTR=\n\n# required\nNUL=\n');
		});

		test('a nullable type, and anyOf of typed members, are joined', () => {
			const env = defineEnv(
				{
					NULLABLE: withJson(() => ({ type: ['string', 'null'] })),
					EITHER: withJson(() => ({
						anyOf: [{ type: 'string' }, { type: 'number' }],
					})),
					UNTYPED: withJson(() => ({
						anyOf: [{ type: 'string' }, { description: 'anything' }],
					})),
				},
				{ source: { NULLABLE: 'x', EITHER: 'x', UNTYPED: 'x' } },
			);
			const text = envExample(env);
			expect(text).toContain('# string | null, required\nNULLABLE=');
			expect(text).toContain('# string | number, required\nEITHER=');
			expect(text).toContain('# required\nUNTYPED=');
		});

		test('the JSON Schema description fills in when the shape gives none', () => {
			const base = v.string();
			const schema = {
				...base,
				'~standard': {
					...base['~standard'],
					jsonSchema: {
						input: () => ({ type: 'string', description: 'From JSON Schema' }),
					},
				},
			} as unknown as StandardSchema<unknown>;
			const env = defineEnv({ NAME: schema }, { source: { NAME: 'x' } });
			expect(envExample(env)).toBe(
				'# From JSON Schema\n# string, required\nNAME=\n',
			);
		});

		test('a jsonSchema.input that throws is treated as absent', () => {
			const env = defineEnv(
				{
					BAD: withJson(() => {
						throw new Error('cannot represent');
					}),
				},
				{ source: { BAD: 'x' } },
			);
			expect(envExample(env)).toBe('# required\nBAD=\n');
		});
	});
});
