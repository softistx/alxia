import { describe, expect, expectTypeOf, test } from 'bun:test';
import { z } from 'zod';
import { parseEnv } from './env';
import { EnvError } from './error';

const Env = z.object({
	PORT: z.coerce.number().int().default(3000),
	DATABASE_URL: z.url(),
	DEBUG: z
		.enum(['true', 'false'])
		.transform((value) => value === 'true')
		.default(false),
});

describe('parseEnv', () => {
	test('typed and frozen', () => {
		const env = parseEnv(Env, {
			DATABASE_URL: 'postgres://localhost/db',
			PORT: '8080',
		});
		expectTypeOf(env).toEqualTypeOf<{
			readonly PORT: number;
			readonly DATABASE_URL: string;
			readonly DEBUG: boolean;
		}>();
		// @ts-expect-error frozen, and its type says so
		expect(() => (env.PORT = 1)).toThrow(TypeError);
		expect(env).toEqual({
			PORT: 8080,
			DATABASE_URL: 'postgres://localhost/db',
			DEBUG: false,
		});
		expect(Object.isFrozen(env)).toBe(true);
	});

	test('every issue at once', () => {
		try {
			parseEnv(Env, { PORT: 'x' });
			throw new Error('expected an EnvError');
		} catch (error) {
			expect(error).toBeInstanceOf(EnvError);
			expect(
				(error as EnvError).issues.map((issue) => issue.path).sort(),
			).toEqual(['DATABASE_URL', 'PORT']);
		}
	});

	test('refuses an asynchronous schema', () => {
		const slow = z.object({ A: z.string().refine(async () => true) });
		expect(() => parseEnv(slow, { A: 'a' })).toThrow();
	});
});
