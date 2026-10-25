import { describe, expect, test } from 'bun:test';
import type { Lang } from '../../test/errors/format';
import {
	filledMessages,
	GENERIC,
	plainErrors,
	refusal,
	strictErrors,
} from '../../test/errors/refusal';
import { createApiErrors } from './api-errors';

describe('apiErrorMessage', () => {
	const errors = strictErrors();

	test('words a code the catalogue holds', () => {
		const error = refusal('todos.errors.title-taken', 'x');
		expect(errors.apiErrorMessage(error, 'fr')).toBe(
			'Une autre tâche a déjà ce titre.',
		);
	});

	test("falls back to the API's message for an unknown code", () => {
		const error = refusal('todos.errors.brand-new', 'Nouveau');
		expect(errors.apiErrorMessage(error, 'fr')).toBe('Nouveau');
	});

	test('names the values the extensions carry, and params win over them', () => {
		const code = 'notes.errors.too-many-attempts';
		expect(
			errors.apiErrorMessage(refusal(code, 'x', { minutes: 2 }), 'en'),
		).toBe('Too many attempts. Try again in 2 minutes.');
		expect(
			errors.apiErrorMessage(
				refusal(code, 'x', { minutes: 99, params: { minutes: 1 } }),
				'en',
			),
		).toBe('Too many attempts. Try again in 1 minute.');
	});

	test('a count is worded in the plural of the language', () => {
		const code = 'todos.errors.items-outside-list';
		const error = refusal(code, 'x', { params: { count: 1, name: 'Home' } });
		expect(errors.apiErrorMessage(error, 'en')).toBe(
			'One item is outside Home.',
		);
		expect(errors.apiErrorMessage(error, 'fr')).toBe(
			'Un élément est hors de Home.',
		);
	});

	test('a day reads as a long date of the language', () => {
		const error = refusal('todos.errors.due-after-end', 'x', {
			params: { endDate: '2027-02-12' },
		});
		expect(errors.apiErrorMessage(error, 'en')).toBe(
			'The list ends on February 12, 2027: a todo cannot be due later.',
		);
	});

	test("a value that is not a day leaves the API's own message", () => {
		const error = refusal('todos.errors.due-after-end', 'Ends on soon.', {
			params: { endDate: 'soon' },
		});
		expect(errors.apiErrorMessage(error, 'en')).toBe('Ends on soon.');
	});
});

describe('refused', () => {
	test('an error with no API code says the generic refusal, never the raw message', () => {
		const errors = strictErrors();
		expect(errors.apiErrorMessage(refusal(undefined, 'Boom'), 'en')).toBe(
			GENERIC.en,
		);
		const raw = refusal(
			'BAD_USER_INPUT',
			'Variable "$email" got invalid value',
		);
		expect(errors.apiErrorMessage(raw, 'fr')).toBe(GENERIC.fr);
	});

	test("without it, such an error says the API's message", () => {
		const errors = plainErrors();
		expect(errors.apiErrorMessage(refusal(undefined, 'Boom'), 'en')).toBe(
			'Boom',
		);
		expect(errors.apiErrorMessage(refusal('BAD_USER_INPUT', 'Bad'), 'en')).toBe(
			'Bad',
		);
	});
});

describe('byCode', () => {
	const errors = strictErrors();

	test.each([
		['validation.errors.query-too-deep', { depth: 12, max: 10 }],
		['validation.errors.query-too-wide', { fields: 600, maxFields: 500 }],
	])('%s says one message that reads no param', (code, params) => {
		expect(errors.apiErrorMessage(refusal(code, 'x', { params }), 'fr')).toBe(
			'Requête trop lourde.',
		);
	});

	test('a code with no entry goes to the catalogue; an entry receives the error', () => {
		expect(
			errors.apiErrorMessage(refusal('todos.errors.title-taken', 'x'), 'en'),
		).toBe('Another todo already has this title.');
		const seen: string[] = [];
		const own = createApiErrors<Lang>({
			messages: filledMessages(),
			unavailable: () => '',
			byCode: {
				'todos.errors.title-taken': (error, language) => {
					seen.push(`${error.code}/${language}`);
					return 'own';
				},
			},
		});
		const taken = refusal('todos.errors.title-taken', 'x');
		expect(own.apiErrorMessage(taken, 'en')).toBe('own');
		expect(seen).toEqual(['todos.errors.title-taken/en']);
	});

	test('an inherited property name is not a code', () => {
		const lax = createApiErrors<Lang>({
			messages: filledMessages(),
			unavailable: () => '',
			isApiCode: () => true,
		});
		expect(lax.apiErrorMessage(refusal('toString', 'Plain'), 'en')).toBe(
			'Plain',
		);
	});
});
