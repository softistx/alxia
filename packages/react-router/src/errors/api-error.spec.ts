import { describe, expect, test } from 'bun:test';
import { ApiError } from '@nxgt/graphql-client';
import {
	type ApiErrorLike,
	attemptsLeftOf,
	isApiErrorLike,
	valuesOf,
	waitMinutes,
} from './api-error';

const refusal = new ApiError(
	[
		{
			message: 'Taken',
			extensions: { code: 'todos.errors.title-taken', http: { status: 409 } },
		},
	],
	null,
	200,
);

describe('ApiErrorLike', () => {
	test('is what @nxgt/graphql-client builds: the assignment is the type check', () => {
		const like: ApiErrorLike = refusal;
		expect(like.code).toBe('todos.errors.title-taken');
		expect(like.status).toBe(409);
		expect(like.errors[0]?.message).toBe('Taken');
	});
});

describe('isApiErrorLike', () => {
	test('is true for a real ApiError', () => {
		expect(isApiErrorLike(refusal)).toBe(true);
	});

	test('is true for an error of the same shape, such as another copy of the client', () => {
		const copy = Object.assign(new Error('x'), {
			name: 'ApiError',
			errors: [],
			status: 400,
			code: undefined,
		});
		expect(isApiErrorLike(copy)).toBe(true);
	});

	test('is false for a plain object that is not an Error, whatever its name and errors', () => {
		expect(
			isApiErrorLike({ name: 'ApiError', errors: [{ message: 'x' }] }),
		).toBe(false);
	});

	test('is false for anything else', () => {
		const plain = { name: 'ApiError', errors: [], status: 400 };
		expect(isApiErrorLike(plain)).toBe(false);
		expect(isApiErrorLike(new Error('x'))).toBe(false);
		expect(isApiErrorLike(new Response(null, { status: 503 }))).toBe(false);
		expect(isApiErrorLike(undefined)).toBe(false);
		const noStatus = Object.assign(new Error('x'), {
			name: 'ApiError',
			errors: [],
		});
		expect(isApiErrorLike(noStatus)).toBe(false);
	});
});

describe('waitMinutes', () => {
	test("reads the API's minutes, else rounds the seconds up, never zero", () => {
		expect(waitMinutes({ minutes: 3, retryAfter: 1 })).toBe(3);
		expect(waitMinutes({ params: { minutes: 4 } })).toBe(4);
		expect(waitMinutes({ retryAfter: 61 })).toBe(2);
		expect(waitMinutes({ retryAfter: 0 })).toBe(1);
		expect(waitMinutes(undefined)).toBe(1);
	});
});

describe('valuesOf', () => {
	test('lets params win over the extensions beside them', () => {
		expect(valuesOf({ minutes: 1, params: { minutes: 5, name: 'a' } })).toEqual(
			{ minutes: 5, name: 'a', params: { minutes: 5, name: 'a' } },
		);
		expect(valuesOf({ retryAfter: 9 })).toEqual({ retryAfter: 9 });
		expect(valuesOf(undefined)).toBeUndefined();
	});
});

describe('attemptsLeftOf', () => {
	const refused = (extensions: Record<string, unknown> | undefined) =>
		new ApiError(
			[{ message: 'Wrong code', ...(extensions && { extensions }) }],
			null,
			401,
		);

	test('reads extensions.attemptsLeft, 0 included', () => {
		expect(attemptsLeftOf(refused({ attemptsLeft: 3 }))).toBe(3);
		expect(attemptsLeftOf(refused({ attemptsLeft: 0 }))).toBe(0);
	});

	test('reads params.attemptsLeft when the extensions carry none', () => {
		expect(attemptsLeftOf(refused({ params: { attemptsLeft: 2 } }))).toBe(2);
	});

	test('prefers the extensions over the params', () => {
		expect(
			attemptsLeftOf(refused({ attemptsLeft: 4, params: { attemptsLeft: 2 } })),
		).toBe(4);
	});

	test('is undefined when nothing is sent', () => {
		expect(attemptsLeftOf(refused({}))).toBeUndefined();
		expect(attemptsLeftOf(refused(undefined))).toBeUndefined();
		expect(attemptsLeftOf(new ApiError([], null, 401))).toBeUndefined();
	});

	test('is undefined for a value that is not a count', () => {
		for (const value of ['3', -1, 1.5, Number.NaN, null, true]) {
			expect(attemptsLeftOf(refused({ attemptsLeft: value }))).toBeUndefined();
		}
	});

	test('falls through to the params when the extensions value is not a count', () => {
		expect(
			attemptsLeftOf(
				refused({ attemptsLeft: 'x', params: { attemptsLeft: 1 } }),
			),
		).toBe(1);
	});
});
