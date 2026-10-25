import { describe, expect, test } from 'bun:test';
import { CATALOGUE } from '../../test/errors/catalogue';
import { format, type Lang } from '../../test/errors/format';
import { createApiMessages } from './messages';

function filled() {
	const messages = createApiMessages<Lang>({ format });
	messages.set('en', CATALOGUE.en);
	messages.set('fr', CATALOGUE.fr);
	return messages;
}

describe('apiMessage', () => {
	const messages = filled();

	test("words a plural in the language's rules", () => {
		const code = 'todos.errors.items-outside-list';
		expect(messages.apiMessage(code, { count: 1, name: 'Home' }, 'en')).toBe(
			'One item is outside Home.',
		);
		expect(messages.apiMessage(code, { count: 3, name: 'Home' }, 'fr')).toBe(
			'3 éléments sont hors de Home.',
		);
	});

	test('a number is formatted for the language ({outOf, number})', () => {
		const values = { case: 'other', outOf: 1000.5 };
		expect(messages.apiMessage('notes.errors.length-over', values, 'en')).toBe(
			'A note cannot be over 1,000.5.',
		);
		// A no-break space groups the thousands in French.
		expect(
			messages
				.apiMessage('notes.errors.length-over', values, 'fr')
				?.replace(/\s/g, '_'),
		).toContain('1_000,5');
	});

	test('a select picks its arm, and a count given as text is a number', () => {
		expect(
			messages.apiMessage(
				'notes.errors.length-over',
				{ case: 'lowered', outOf: 10, count: '4' },
				'en',
			),
		).toBe('4 notes are already over 10: shorten them first.');
	});

	test('is undefined for a code the catalogue lacks, or a value it needs and lacks', () => {
		expect(
			messages.apiMessage('todos.errors.brand-new', {}, 'en'),
		).toBeUndefined();
		expect(
			messages.apiMessage('todos.errors.due-after-end', {}, 'en'),
		).toBeUndefined();
		expect(
			messages.apiMessage(
				'todos.errors.due-after-end',
				{ endDate: 'soon' },
				'en',
			),
		).toBeUndefined();
	});

	test('is undefined for a message that does not parse', () => {
		const broken = createApiMessages<Lang>({ format });
		broken.set('en', { 'a.errors.b': { message: 'A {stray', params: [] } });
		expect(broken.apiMessage('a.errors.b', {}, 'en')).toBeUndefined();
	});
});

describe('a formatter that throws', () => {
	test('is a message that did not format, so the caller falls back', () => {
		const messages = createApiMessages<Lang>({
			format: () => {
				throw new Error('formatter broke');
			},
		});
		messages.set('en', { 'a.errors.b': { message: 'B', params: [] } });
		expect(messages.apiMessage('a.errors.b', {}, 'en')).toBeUndefined();
	});
});

describe('the store', () => {
	const entry = (message: string) => ({ message, params: [] });

	test('set replaces a language, add merges, clear forgets', () => {
		const messages = createApiMessages<Lang>({ format });
		messages.set('en', { 'a.errors.b': entry('B') });
		expect(messages.apiMessage('a.errors.b', {}, 'en')).toBe('B');
		messages.set('en', { 'a.errors.c': entry('C') });
		expect(messages.apiMessage('a.errors.b', {}, 'en')).toBeUndefined();
		messages.add('en', { 'a.errors.d': entry('D') });
		expect(messages.apiMessage('a.errors.c', {}, 'en')).toBe('C');
		expect(messages.apiMessage('a.errors.d', {}, 'en')).toBe('D');
		expect(messages.apiMessage('a.errors.d', {}, 'fr')).toBeUndefined();
		messages.clear();
		expect(messages.apiMessage('a.errors.c', {}, 'en')).toBeUndefined();
	});

	test('messageOf reads an entry, and add on a new language creates it', () => {
		const messages = createApiMessages<Lang>({ format });
		messages.add('fr', { 'a.errors.b': entry('B') });
		expect(messages.messageOf('fr', 'a.errors.b')?.message).toBe('B');
		expect(messages.messageOf('en', 'a.errors.b')).toBeUndefined();
	});

	test('two instances never share messages', () => {
		const one = createApiMessages<Lang>({ format });
		const other = createApiMessages<Lang>({ format });
		one.set('en', { 'a.errors.b': entry('B') });
		expect(other.messageOf('en', 'a.errors.b')).toBeUndefined();
	});
});
