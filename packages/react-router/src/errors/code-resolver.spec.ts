import { describe, expect, test } from 'bun:test';
import { CATALOGUE } from '../../test/errors/catalogue';
import { format, type Lang } from '../../test/errors/format';
import { apiCodeResolver, type CodeIssueLike } from './code-resolver';
import { createApiMessages } from './messages';

// Local mirrors of `@nxgt/material`'s `Translate` and `CodeResolverOptions`
// (material is not a dependency): the resolver must be assignable to them.
type TranslationContext =
	| {
			[k: string]:
				| ((children: never) => unknown)
				| string
				| number
				| boolean
				| object;
	  }
	| undefined;
type MaterialTranslate = (
	key: never,
	context?: TranslationContext,
	provideLanguage?: (() => Lang) | Lang,
) => string;
type MaterialCodeResolverOptions = {
	translate?: MaterialTranslate;
	codeOf?: (issue: CodeIssueLike) => string | undefined;
	language?: Lang;
};

const messages = createApiMessages<Lang>({ format });
messages.set('en', CATALOGUE.en);
messages.set('fr', CATALOGUE.fr);

let language: Lang = 'fr';
const resolver = apiCodeResolver(messages, {
	translate: (key) => `app:${key}`,
	language: () => language,
});

describe('apiCodeResolver', () => {
	test("is what material's useCodeResolver takes: the assignment is the type check", () => {
		const options: MaterialCodeResolverOptions = resolver;
		expect(options.translate).toBeDefined();
	});

	test("an API code is worded as the API's catalogue words it, in the page's language", () => {
		expect(resolver.translate('validation.errors.required')).toBe(
			'Obligatoire.',
		);
		language = 'en';
		expect(resolver.translate('validation.errors.required')).toBe('Required.');
		language = 'fr';
	});

	test('a language named by the call, or by a function, wins', () => {
		const code = 'validation.errors.required';
		expect(resolver.translate(code, undefined, 'en')).toBe('Required.');
		expect(resolver.translate(code, undefined, () => 'en')).toBe('Required.');
	});

	test('the context is the message values', () => {
		expect(
			resolver.translate('todos.errors.items-outside-list', {
				count: 2,
				name: 'Home',
			}),
		).toBe('2 éléments sont hors de Home.');
	});

	test('any other key takes the app translator', () => {
		expect(resolver.translate('material.zod.too_small')).toBe(
			'app:material.zod.too_small',
		);
	});

	test('an API code the catalogue lacks comes back as it is, for the form library to word', () => {
		expect(resolver.translate('todos.errors.brand-new')).toBe(
			'todos.errors.brand-new',
		);
	});

	test("codeOf reads a refinement's params.code, and none from an issue without one", () => {
		expect(
			resolver.codeOf({
				code: 'custom',
				params: { code: 'todos.errors.title-taken' },
			}),
		).toBe('todos.errors.title-taken');
		expect(resolver.codeOf({ code: 'too_small' })).toBeUndefined();
		expect(
			resolver.codeOf({ code: 'custom', params: { code: 3 } }),
		).toBeUndefined();
	});

	test('the app can bring its own codeOf and its own test for an API code', () => {
		const own = apiCodeResolver(messages, {
			translate: (key) => `app:${key}`,
			language: () => 'en',
			codeOf: (issue) =>
				issue.code === 'too_small' ? 'validation.errors.required' : undefined,
			isApiCode: (key) => key.startsWith('validation.'),
		});
		expect(own.codeOf({ code: 'too_small' })).toBe(
			'validation.errors.required',
		);
		expect(own.translate('validation.errors.required')).toBe('Required.');
		expect(own.translate('todos.errors.items-outside-list')).toBe(
			'app:todos.errors.items-outside-list',
		);
	});
});
