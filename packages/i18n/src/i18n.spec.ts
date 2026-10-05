import { describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { getLanguage } from '@nxgt/i18n';
import { i18n } from '../test/catalogues';
import { createI18n } from './i18n';

/** A service, deep down: no language passed. */
async function describeCart(count: number) {
	await Bun.sleep(1);
	return i18n.t('home.items', { count });
}

const app = alxia()
	.use(i18n)
	.get('/', async ({ t, language, reply }) => {
		expectTypeOf(language).toEqualTypeOf<'en' | 'fr'>();
		return reply(200, {
			title: t('home.title'),
			cart: await describeCart(3),
			error: t('errors.not-found'),
		});
	});

describe('i18n', () => {
	test("t speaks the request's language, ICU and the shared keys included", async () => {
		const fr_ = await (
			await app.request('/', { headers: { 'accept-language': 'fr-FR' } })
		).json();
		expect(fr_.title).toBe('Bienvenue');
		expect(fr_.cart).toBe('3 articles');
		expect(fr_.error).not.toBe('errors.not-found');
		const en_ = await (await app.request('/?lang=en')).json();
		expect(en_).toMatchObject({ title: 'Welcome', cart: '3 items' });
	});

	test('concurrent requests keep their own language', async () => {
		const languages = Array.from({ length: 10 }, (_, index) =>
			index % 2 ? 'fr' : 'en',
		);
		const titles = await Promise.all(
			languages.map(
				async (lang) =>
					(await (await app.request(`/?lang=${lang}`)).json()).title,
			),
		);
		expect(titles).toEqual(
			languages.map((lang) => (lang === 'fr' ? 'Bienvenue' : 'Welcome')),
		);
	});

	test('outside a request: the fallback; keys are typed', () => {
		expect(i18n.t('home.title')).toBe('Welcome');
		expect(i18n.language()).toBe('en');
		// @ts-expect-error: not a key of the catalogue
		expect(i18n.t('home.nope')).toBe('home.nope');
	});
});

describe('an error answered', () => {
	test("a try/catch middleware after it speaks the request's language", async () => {
		const failing = alxia()
			.use(i18n)
			.use(async ({ reply }, next) => {
				try {
					return await next();
				} catch {
					return reply(500, {
						message: i18n.t('home.title'),
						nxgt: getLanguage(),
					});
				}
			})
			.get('/boom', async () => {
				await Bun.sleep(1);
				throw new Error('boom');
			});
		const answer = await failing.request('/boom?lang=fr');
		expect(await answer.json()).toEqual({ message: 'Bienvenue', nxgt: 'fr' });
	});
});

describe('several plugins, and requests within requests', () => {
	test('two instances on one app keep their own language', async () => {
		const de = { home: { title: 'Willkommen' } } as const;
		const other = createI18n({
			resources: { en: { home: { title: 'Welcome' } }, de },
			fallback: 'en',
		});
		const both = alxia()
			.use(i18n)
			.use(other)
			.get('/', async ({ reply }) => {
				await Bun.sleep(1);
				return reply(200, [i18n.language(), other.language(), getLanguage()]);
			});
		expect(await (await both.request('/?lang=fr')).json()).toEqual([
			'fr',
			'en',
			'fr',
		]);
	});

	test('a request made from inside another leaves its language alone', async () => {
		const inner = alxia()
			.use(i18n)
			.get('/', ({ reply }) => reply(200, i18n.language()));
		const outer = alxia()
			.use(i18n)
			.get('/', async ({ reply }) => {
				const before = i18n.language();
				const nested = await (await inner.request('/?lang=en')).text();
				return reply(200, [before, nested, i18n.language()]);
			});
		expect(await (await outer.request('/?lang=fr')).json()).toEqual([
			'fr',
			'en',
			'fr',
		]);
	});
});

describe("@nxgt/i18n's own getLanguage", () => {
	test("speaks the alxia request's language", async () => {
		const spoken = alxia()
			.use(i18n)
			.get('/nxgt', async ({ reply }) => {
				await Bun.sleep(1);
				return reply(200, getLanguage());
			});
		expect(await (await spoken.request('/nxgt?lang=fr')).text()).toBe('fr');
		expect(getLanguage()).toBe('en');
	});
});
