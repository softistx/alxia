import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { jsonActions } from './json-actions';
import type { StandardSchemaV1 } from './standard-schema';

const { readInput } = jsonActions();

const post = (body: unknown) =>
	new Request('http://ui.test/x', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});

const statusOf = (promise: Promise<unknown>) =>
	promise.then(
		() => 200,
		(error: { init?: { status?: number }; data?: unknown }) =>
			`${error.init?.status} ${error.data}`,
	);

const REFUSED = '400 The form sent an input the API would refuse';

describe('readInput with a Zod schema', () => {
	const schema = z.object({ name: z.string().min(1) });

	test('answers the input the schema accepts, typed', async () => {
		const input: { name: string } = await readInput(
			post({ input: { name: 'Ada' } }),
			schema,
		);
		expect(input).toEqual({ name: 'Ada' });
	});

	test('answers the schema output, not the raw input', async () => {
		const coerced = z.object({ n: z.coerce.number() });
		expect(await readInput(post({ input: { n: '3' } }), coerced)).toEqual({
			n: 3,
		});
	});

	test('a refused input is a 400', async () => {
		expect(
			await statusOf(readInput(post({ input: { name: '' } }), schema)),
		).toBe(REFUSED);
	});

	test('a body with no input, or a null body, is a 400', async () => {
		expect(await statusOf(readInput(post({}), schema))).toBe(REFUSED);
		expect(await statusOf(readInput(post(null), schema))).toBe(REFUSED);
	});

	test('the body is still checked for its origin', async () => {
		const request = new Request('http://ui.test/x', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				origin: 'http://evil.test',
			},
			body: '{"input":{"name":"Ada"}}',
		});
		expect(await statusOf(readInput(request, schema))).toBe(
			'403 Cross-site request refused',
		);
	});
});

describe('readInput with a hand-written Standard Schema', () => {
	const evenSchema = (
		validate: StandardSchemaV1<number>['~standard']['validate'],
	): StandardSchemaV1<unknown, number> => ({
		'~standard': { version: 1, vendor: 'test', validate },
	});

	test('a sync validation', async () => {
		const schema = evenSchema((value) =>
			typeof value === 'number' && value % 2 === 0
				? { value }
				: { issues: [{ message: 'odd' }] },
		);
		const value: number = await readInput(post({ input: 4 }), schema);
		expect(value).toBe(4);
		expect(await statusOf(readInput(post({ input: 3 }), schema))).toBe(REFUSED);
	});

	test('an async validation is awaited', async () => {
		const schema = evenSchema(async (value) => {
			await Bun.sleep(1);
			return typeof value === 'number' && value % 2 === 0
				? { value }
				: { issues: [{ message: 'odd' }] };
		});
		expect(await readInput(post({ input: 6 }), schema)).toBe(6);
		expect(await statusOf(readInput(post({ input: 5 }), schema))).toBe(REFUSED);
	});
});
