import { describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia, type BaseContext, type Empty } from '@alxia/core';
import { getLanguage, resources as shared } from '@nxgt/i18n';
import { createI18n } from './i18n';

const en = {
	...shared.en,
	home: {
		title: 'Welcome',
		items: '{count, plural, =0 {No items} one {One item} other {# items}}',
	},
} as const;
const fr = {
	...shared.fr,
	home: {
		title: 'Bienvenue',
		items:
			'{count, plural, =0 {Aucun article} one {Un article} other {# articles}}',
	},
} as const;

const i18n = createI18n({ resources: { en, fr }, fallback: 'en' });

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

describe("resolve reads the app's context", () => {
	interface User {
		readonly language: string | null;
	}
	const byUser = createI18n({
		resources: { en, fr },
		fallback: 'en',
		order: ['query'],
		resolve: ({ user }: BaseContext & { user: User | null }) =>
			user?.language ?? undefined,
	});
	/** Derives a user from `x-user-language`, or `null`. */
	const auth = alxia().derive(({ request }) => {
		const language = request.headers.get('x-user-language');
		const user: User | null = language === null ? null : { language };
		return { user };
	});

	test("an annotated resolve speaks the user's language, the languages and keys still inferred", async () => {
		expectTypeOf(byUser['~requires']).toEqualTypeOf<{ user: User | null }>();
		expectTypeOf(byUser.supported).toEqualTypeOf<('en' | 'fr')[]>();
		const served = alxia()
			.use(auth)
			.use(byUser)
			.get('/', ({ language, t, reply }) => {
				expectTypeOf(language).toEqualTypeOf<'en' | 'fr'>();
				return reply(200, t('home.title'));
			});
		const title = async (headers: Record<string, string>, path = '/') =>
			(await served.request(path, { headers })).text();
		expect(await title({ 'x-user-language': 'fr' })).toBe('Bienvenue');
		expect(await title({})).toBe('Welcome');
		expect(await title({ 'x-user-language': 'fr' }, '/?lang=en')).toBe(
			'Welcome',
		);
	});

	test('an unannotated resolve, or none, requires nothing', () => {
		const plain = createI18n({
			resources: { en, fr },
			fallback: 'en',
			resolve: (ctx) => {
				expectTypeOf(ctx).toEqualTypeOf<BaseContext>();
				return undefined;
			},
		});
		expectTypeOf(plain['~requires']).toEqualTypeOf<Empty>();
		expectTypeOf(i18n['~requires']).toEqualTypeOf<Empty>();
		alxia().use(plain).use(i18n);
	});

	test('an app that does not give what resolve reads is refused, and so is any', () => {
		const loose = createI18n({
			resources: { en, fr },
			fallback: 'en',
			resolve: (ctx: any) => ctx.user.language,
		});
		const _refused = () => {
			// @ts-expect-error the plugin reads "user", which this app's context does not give
			alxia().use(byUser);
			alxia()
				.derive(() => ({ user: { language: 1 } }))
				// @ts-expect-error the plugin reads "user", which this app's context gives with another type
				.use(byUser);
			// @ts-expect-error the plugin's resolve reads its context as any
			alxia().use(auth).use(loose);
		};
		expect(_refused).toBeFunction();
	});
});

describe('onError', () => {
	test("an error hook speaks the request's language", async () => {
		const failing = alxia()
			.use(i18n)
			.onError((_error, { reply }) =>
				reply(500, { message: i18n.t('home.title'), nxgt: getLanguage() }),
			)
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
