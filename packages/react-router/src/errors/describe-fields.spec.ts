import { describe, expect, test } from 'bun:test';
import { plainErrors, refusal, strictErrors } from '../../test/errors/refusal';

const INVALID = 'validation.errors.invalid-input';

describe('fieldErrors', () => {
	const errors = strictErrors();

	test("words each field's code by input path, the API's message as fallback", () => {
		const error = refusal(INVALID, 'Invalid input', {
			fields: [
				{ path: 'title', code: 'todos.errors.title-taken', message: 'x' },
				{
					path: 'list.name',
					code: 'todos.errors.brand-new',
					message: 'Nom refusé',
				},
			],
		});
		expect(errors.fieldErrors(error, 'fr')).toEqual({
			title: 'Une autre tâche a déjà ce titre.',
			'list.name': 'Nom refusé',
		});
	});

	test("a field's message names its own params", () => {
		const error = refusal(INVALID, 'Invalid input', {
			fields: [
				{
					path: 'password',
					code: 'notes.errors.too-many-attempts',
					message: 'x',
					params: { minutes: 1 },
				},
			],
		});
		expect(errors.fieldErrors(error, 'en')).toEqual({
			password: 'Too many attempts. Try again in 1 minute.',
		});
	});

	test('a day a field names reads as a long date of the language', () => {
		const error = refusal(INVALID, 'Invalid input', {
			fields: [
				{
					path: 'due',
					code: 'todos.errors.due-after-end',
					message: 'x',
					params: { endDate: '2027-02-12' },
				},
			],
		});
		expect(errors.fieldErrors(error, 'fr')['due']).toContain('12 février 2027');
	});

	test('is empty for an error without fields', () => {
		expect(errors.fieldErrors(refusal(undefined, 'x'), 'en')).toEqual({});
	});

	test('a refusal naming one field gives it the error message', () => {
		const error = refusal('todos.errors.title-taken', 'x', { field: 'title' });
		expect(errors.fieldErrors(error, 'en')).toEqual({
			title: errors.apiErrorMessage(error, 'en'),
		});
		expect(errors.fieldErrors(error, 'en')['title']).toBe(
			'Another todo already has this title.',
		);
	});

	test('extensions.fields wins over extensions.field', () => {
		const error = refusal(INVALID, 'x', {
			field: 'ignored',
			fields: [{ path: 'a', code: 'nope', message: 'A' }],
		});
		expect(errors.fieldErrors(error, 'en')).toEqual({ a: 'A' });
	});

	test('the one field of an error with no API code says the generic refusal only with `refused`', () => {
		const error = refusal('BAD_USER_INPUT', 'Raw', { field: 'title' });
		expect(plainErrors().fieldErrors(error, 'en')).toEqual({ title: 'Raw' });
		expect(errors.fieldErrors(error, 'en')['title']).toBe(
			'This request could not be processed.',
		);
	});
});

describe('translateCode', () => {
	const errors = plainErrors();

	test('words a code, else the fallback', () => {
		expect(errors.translateCode('todos.errors.title-taken', 'x', 'en')).toBe(
			'Another todo already has this title.',
		);
		expect(
			errors.translateCode('todos.errors.brand-new', 'Fallback', 'en'),
		).toBe('Fallback');
		expect(errors.translateCode(undefined, 'Fallback', 'en')).toBe('Fallback');
	});

	test('fills the values in', () => {
		expect(
			errors.translateCode('notes.errors.too-many-attempts', 'x', 'fr', {
				minutes: 5,
			}),
		).toBe('Trop de tentatives. Réessayez dans 5 minutes.');
	});
});
