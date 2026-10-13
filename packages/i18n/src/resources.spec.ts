import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { createI18n } from './i18n';

type Key = 'hello' | 'bye';
const en = { hello: 'Hello', bye: 'Bye' };
const fr = { hello: 'Bonjour', bye: 'Au revoir' };
const de = { hello: 'Hallo', bye: 'Tschüss' };

describe('runtime resources', () => {
	test('start empty, answer the keys until the resources come', async () => {
		const i18n = createI18n<Key>({ fallback: 'en' });
		expect(i18n.supported).toEqual(['en']);
		expect(i18n.t('hello')).toBe('hello');
		i18n.setResources({ en, fr });
		expect(i18n.t('hello')).toBe('Hello');
		const app = alxia()
			.use(i18n)
			.get('/', ({ t, reply }) => reply(200, t('bye')));
		expect(await (await app.request('/?lang=fr')).text()).toBe('Au revoir');
	});

	test('supported follows the new resources, the language middleware too', async () => {
		const i18n = createI18n<Key>({ resources: { en, fr }, fallback: 'en' });
		const supported = i18n.supported;
		expect(supported).toEqual(['en', 'fr']);
		const app = alxia()
			.use(i18n)
			.get('/', ({ language, reply }) => reply(200, language));
		expect(await (await app.request('/?lang=de')).text()).toBe('en');
		i18n.setResources({ en, de });
		expect(i18n.supported).toEqual(['en', 'de']);
		expect(i18n.supported).toBe(supported);
		expect(await (await app.request('/?lang=de')).text()).toBe('de');
		expect(await (await app.request('/?lang=fr')).text()).toBe('en');
	});

	test('languages seeds supported until the resources come', () => {
		const i18n = createI18n<Key>({
			languages: ['en', 'fr'],
			fallback: 'en',
		});
		expect(i18n.supported).toEqual(['en', 'fr']);
	});

	test('a request in flight keeps the snapshot it started with', async () => {
		const i18n = createI18n<Key>({ resources: { en, fr }, fallback: 'en' });
		const app = alxia()
			.use(i18n)
			.get('/', async ({ t, reply }) => {
				const before = t('hello');
				await Bun.sleep(20);
				return reply(200, [before, t('hello'), i18n.t('hello')]);
			});
		const flying = app.request('/?lang=fr');
		await Bun.sleep(5);
		i18n.setResources({ en: { hello: 'Hi' }, fr: { hello: 'Salut' } });
		expect(await (await flying).json()).toEqual([
			'Bonjour',
			'Bonjour',
			'Bonjour',
		]);
		expect(await (await app.request('/?lang=fr')).json()).toEqual([
			'Salut',
			'Salut',
			'Salut',
		]);
		expect(i18n.t('hello')).toBe('Hi');
	});

	test('the catalogue map is copied: replacing a language later changes nothing', () => {
		const given: Record<string, Record<string, string>> = { en, fr };
		const i18n = createI18n<Key>({ resources: given, fallback: 'en' });
		Reflect.set(given, 'en', { hello: 'Changed' });
		Reflect.deleteProperty(given, 'fr');
		expect(i18n.t('hello')).toBe('Hello');
		const next: Record<string, Record<string, string>> = { en, de };
		i18n.setResources(next);
		Reflect.deleteProperty(next, 'de');
		Reflect.set(next, 'en', { hello: 'Changed' });
		expect(i18n.supported).toEqual(['en', 'de']);
		expect(i18n.t('hello')).toBe('Hello');
	});

	test('refuses resources without the fallback, changing nothing', () => {
		const i18n = createI18n<Key>({ resources: { en, fr }, fallback: 'en' });
		expect(() => i18n.setResources({ fr })).toThrow(
			'there is no catalogue for the fallback "en"',
		);
		expect(i18n.supported).toEqual(['en', 'fr']);
		expect(i18n.t('hello')).toBe('Hello');
	});
});

describe('refusals', () => {
	test('resources without the fallback, or languages without it, throw', () => {
		expect(() =>
			createI18n<Key>({ resources: { fr }, fallback: 'en' }),
		).toThrow('there is no catalogue for the fallback "en"');
		expect(() =>
			createI18n<Key>({ languages: ['en'], fallback: 'fr' }),
		).toThrow('the fallback "fr" is not supported');
	});

	test('a fallback that names no literal catalogue does not compile', () => {
		const _refused = () => {
			// @ts-expect-error de is not a language of resources
			createI18n({ resources: { en, fr }, fallback: 'de' });
			// @ts-expect-error de is not a Language
			createI18n<Key, 'en' | 'fr'>({ fallback: 'de' });
		};
		expect(_refused).toBeFunction();
	});

	test('setResources on a literal catalogue keeps its languages', () => {
		const i18n = createI18n({ resources: { en, fr }, fallback: 'en' });
		// @ts-expect-error fr is missing
		i18n.setResources({ en });
		i18n.setResources({ en, fr });
		expect(i18n.supported).toEqual(['en', 'fr']);
	});
});

describe('typed keys', () => {
	test('an explicit Key refuses the others', () => {
		const i18n = createI18n<Key>({ resources: { en, fr }, fallback: 'en' });
		expect(i18n.t('hello')).toBe('Hello');
		// @ts-expect-error not a key of Key
		expect(i18n.t('nope')).toBe('nope');
		alxia()
			.use(i18n)
			.get('/', ({ t, reply }) => {
				// @ts-expect-error not a key of Key
				t('nope');
				return reply(200, t('bye'));
			});
	});

	test('a literal catalogue still infers its keys', () => {
		const i18n = createI18n({ resources: { en, fr }, fallback: 'en' });
		expect(i18n.t('hello')).toBe('Hello');
		// @ts-expect-error not a key of the catalogue
		i18n.t('nope');
	});
});
