import { describe, expect, expectTypeOf, test } from 'bun:test';
import { inspect } from 'node:util';
import { type } from 'arktype';
import * as v from 'valibot';
import { z } from 'zod';
import { defineEnv } from './define';
import { EnvError } from './error';

const source = {
	DATABASE_URL: 'postgres://user:hunter2@localhost/db',
	API_KEY: 'sk-live-123',
};

const shape = {
	DATABASE_URL: z.url(),
	PORT: z.coerce.number().default(3000),
	API_KEY: z.string().min(1),
	SENTRY_DSN: z.url().optional(),
};

function failure(run: () => unknown): EnvError {
	try {
		run();
	} catch (error) {
		return error as EnvError;
	}
	throw new Error('expected an EnvError');
}

describe('defineEnv', () => {
	test('typed: a default is required, optional is optional, and frozen', () => {
		const env = defineEnv(shape, { source, secret: ['API_KEY'] });
		expectTypeOf(env).toEqualTypeOf<{
			readonly DATABASE_URL: string;
			readonly PORT: number;
			readonly API_KEY: string;
			readonly SENTRY_DSN?: string | undefined;
		}>();
		expect(env).toEqual({ ...source, PORT: 3000 });
		expect(Object.isFrozen(env)).toBe(true);
		expect('SENTRY_DSN' in env).toBe(false);
	});

	test('reads Bun.env without a source', () => {
		const name = 'ALXIA_ENV_SPEC';
		Bun.env[name] = '7';
		const env = defineEnv({ [name]: z.coerce.number() });
		expect(env[name]).toBe(7);
		delete Bun.env[name];
	});

	test('one error lists every variable, with its expected type', () => {
		const error = failure(() =>
			defineEnv(shape, { source: { PORT: 'x', SENTRY_DSN: 'nope' } }),
		);
		expect(error).toBeInstanceOf(EnvError);
		expect(error.issues.map(({ path, expected }) => [path, expected])).toEqual([
			['DATABASE_URL', 'string (url)'],
			['PORT', 'number'],
			['API_KEY', 'string'],
			['SENTRY_DSN', 'string (url)'],
		]);
		expect(error.message).toStartWith('The environment is invalid:\n');
		expect(error.message).toContain('  API_KEY: ');
		expect(error.message).toContain('; expected number');
	});

	test('a validator that echoes the value does not leak a secret', () => {
		const error = failure(() =>
			defineEnv(
				{ TOKEN: v.pipe(v.string(), v.url()) },
				{ source: { TOKEN: 'sk-not-a-url' }, secret: ['TOKEN'] },
			),
		);
		expect(error.message).not.toContain('sk-not-a-url');
		expect(JSON.stringify(error.issues)).not.toContain('sk-not-a-url');
		const open = failure(() =>
			defineEnv(
				{ TOKEN: v.pipe(v.string(), v.url()) },
				{ source: { TOKEN: 'sk-not-a-url' } },
			),
		);
		expect(open.message).toContain('sk-not-a-url');
	});

	test('redacts wherever it is printed', () => {
		const env = defineEnv(shape, {
			source,
			secret: ['API_KEY', 'DATABASE_URL'],
		});
		const printed = [
			JSON.stringify(env),
			inspect(env),
			String(env),
			`${env}`,
			Bun.inspect(env),
		];
		for (const text of printed) {
			expect(text).toContain('***');
			expect(text).not.toContain('sk-live-123');
			expect(text).not.toContain('hunter2');
			expect(text).toContain('3000');
		}
		expect(inspect(env)).toContain("API_KEY: '***'");
		expect(env.API_KEY).toBe('sk-live-123');
	});

	test('refuses an asynchronous schema', () => {
		const slow = { A: z.string().refine(async () => true) };
		expect(() => defineEnv(slow, { source: { A: 'a' } })).toThrow(
			'defineEnv(): the schema of A must validate synchronously',
		);
	});

	test('secret names only variables of the shape', () => {
		// @ts-expect-error NOPE is not in the shape
		defineEnv(shape, { source, secret: ['NOPE'] });
	});

	test('Valibot and ArkType', () => {
		const sources = { PORT: '8080', URL: 'https://example.com' };
		const valibot = defineEnv(
			{
				PORT: v.optional(v.pipe(v.string(), v.transform(Number)), '3000'),
				URL: v.pipe(v.string(), v.url()),
			},
			{ source: sources },
		);
		const arktype = defineEnv(
			{
				PORT: type('string.integer.parse'),
				URL: type('string.url'),
			},
			{ source: sources },
		);
		expectTypeOf(valibot).toEqualTypeOf<{
			readonly PORT: number;
			readonly URL: string;
		}>();
		expectTypeOf(arktype.PORT).toEqualTypeOf<number>();
		expect({ ...valibot }).toEqual({ PORT: 8080, URL: sources.URL });
		expect({ ...arktype }).toEqual({ PORT: 8080, URL: sources.URL });
		const error = failure(() =>
			defineEnv({ URL: v.pipe(v.string(), v.url()) }, { source: {} }),
		);
		expect(error.issues[0]?.expected).toBe('string');
	});
});
