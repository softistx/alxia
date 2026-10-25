import { describe, expect, test } from 'bun:test';
import {
	GENERIC,
	plainErrors,
	refusal,
	strictErrors,
} from '../../test/errors/refusal';

describe('apiRefusal', () => {
	const errors = strictErrors();

	test('an API refusal: its message and status', () => {
		const error = refusal('todos.errors.title-taken', 'x', {
			http: { status: 409 },
		});
		expect(errors.apiRefusal(error, 'en')).toEqual({
			message: 'Another todo already has this title.',
			status: 409,
		});
	});

	test('a refusal sent on HTTP 200 answers 400', () => {
		const error = refusal('todos.errors.title-taken', 'x');
		expect(errors.apiRefusal(error, 'en')?.status).toBe(400);
	});

	test('a form step answers the generic refusal with the API status', () => {
		const raw = refusal(
			'BAD_USER_INPUT',
			'Raw',
			{ http: { status: 400 } },
			400,
		);
		expect(errors.apiRefusal(raw, 'en')).toEqual({
			message: GENERIC.en,
			status: 400,
		});
		expect(plainErrors().apiRefusal(raw, 'en')?.message).toBe('Raw');
	});

	test('an unreachable API is the app words, with a 503', () => {
		expect(
			errors.apiRefusal(new Response(null, { status: 503 }), 'fr'),
		).toEqual({
			message: 'Le service est indisponible.',
			status: 503,
		});
		expect(errors.unavailableMessage('en')).toBe('The service is unavailable.');
	});

	test('anything else is not a refusal', () => {
		expect(
			errors.apiRefusal(new Response(null, { status: 500 }), 'en'),
		).toBeUndefined();
		expect(errors.apiRefusal(new Error('boom'), 'en')).toBeUndefined();
		expect(errors.apiRefusal(undefined, 'en')).toBeUndefined();
	});
});

describe('fieldErrors', () => {
	test('a `fields` that is not a list is no field', () => {
		const error = refusal('todos.errors.title-taken', 'Taken', {
			fields: 'title',
		});
		expect(strictErrors().fieldErrors(error, 'en')).toEqual({});
	});
});
