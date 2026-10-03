import { describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia, type BaseContext, type Empty } from '@alxia/core';
import { language } from './language';
import { match, negotiate, parseAcceptLanguage } from './negotiate';

const app = alxia()
	.use(
		language({
			supported: ['en', 'fr', 'pt-BR'],
			fallback: 'en',
			persist: { secure: false },
		}),
	)
	.get('/', ({ language: current, languageSource, reply }) => {
		expectTypeOf(current).toEqualTypeOf<'en' | 'fr' | 'pt-BR'>();
		return reply(200, { language: current, source: languageSource });
	});

const get = async (path: string, headers: Record<string, string> = {}) => {
	const response = await app.request(path, { headers });
	return { body: await response.json(), response };
};

describe('language', () => {
	test('the query first, then the cookie, then Accept-Language, then the fallback', async () => {
		expect((await get('/?lang=fr', { cookie: 'language=pt-BR' })).body).toEqual(
			{ language: 'fr', source: 'query' },
		);
		expect(
			(await get('/', { cookie: 'language=pt-BR', 'accept-language': 'fr' }))
				.body,
		).toEqual({ language: 'pt-BR', source: 'cookie' });
		expect(
			(await get('/', { 'accept-language': 'de, fr-CA;q=0.8, en;q=0.5' })).body,
		).toEqual({ language: 'fr', source: 'header' });
		expect((await get('/', { 'accept-language': 'pt' })).body.language).toBe(
			'pt-BR',
		);
		expect((await get('/?lang=klingon')).body).toEqual({
			language: 'en',
			source: 'fallback',
		});
	});

	test('Content-Language and Vary on the response; a query language kept in the cookie', async () => {
		const { response } = await get('/?lang=fr');
		expect(response.headers.get('content-language')).toBe('fr');
		expect(response.headers.get('vary')).toBe('Accept-Language, Cookie');
		expect(response.headers.getSetCookie()[0]).toContain('language=fr');
	});

	test('a path segment, and a resolver', async () => {
		const byPath = alxia()
			.use(
				language({
					supported: ['en', 'fr'],
					fallback: 'en',
					order: ['path'],
					resolve: (ctx) => ctx.request.headers.get('x-saved') ?? undefined,
				}),
			)
			.get('/:lang/hello', ({ language: current, reply }) =>
				reply(200, current),
			);
		expect(await (await byPath.request('/fr/hello')).text()).toBe('fr');
		expect(
			await (
				await byPath.request('/de/hello', { headers: { 'x-saved': 'fr' } })
			).text(),
		).toBe('fr');
	});

	test('the headers a resolver reads are in Vary', async () => {
		const app = alxia()
			.use(
				language({
					supported: ['en', 'fr'],
					fallback: 'en',
					order: ['header'],
					resolve: ({ request }) =>
						request.headers.get('authorization') === 'Bearer ada'
							? 'fr'
							: undefined,
					vary: ['Authorization'],
				}),
			)
			.get('/', ({ language: lang, reply }) => reply(200, lang));
		const response = await app.request('/', {
			headers: { authorization: 'Bearer ada' },
		});
		expect(await response.text()).toBe('fr');
		expect(response.headers.get('vary')).toBe('Accept-Language, Authorization');
	});

	test('a resolver reads what an earlier plugin adds, typed by its parameter', async () => {
		interface User {
			readonly locale: string | null;
		}
		const byUser = language({
			supported: ['en', 'fr'],
			fallback: 'en',
			order: ['header'],
			resolve: ({ user }: BaseContext & { user: User | null }) =>
				user?.locale ?? undefined,
			vary: ['Authorization'],
		});
		expectTypeOf(byUser['~requires']).toEqualTypeOf<{ user: User | null }>();
		const app = alxia()
			.derive(({ request }) => ({
				user:
					request.headers.get('authorization') === 'Bearer ada'
						? ({ locale: 'fr' } as User)
						: null,
			}))
			.use(byUser)
			.get('/', ({ language: lang, reply }) => {
				expectTypeOf(lang).toEqualTypeOf<'en' | 'fr'>();
				return reply(200, lang);
			});
		const read = async (headers: Record<string, string>) =>
			(await app.request('/', { headers })).text();
		expect(await read({ authorization: 'Bearer ada' })).toBe('fr');
		expect(await read({})).toBe('en');
		expect(
			await read({ authorization: 'Bearer ada', 'accept-language': 'en' }),
		).toBe('en');
	});

	test('an unannotated resolver reads nothing more, and a plain one needs nothing', () => {
		expectTypeOf(
			language({
				supported: ['en'],
				fallback: 'en',
				resolve: (ctx) => {
					expectTypeOf(ctx).toEqualTypeOf<BaseContext>();
					return undefined;
				},
			})['~requires'],
		).toEqualTypeOf<Empty>();
		expectTypeOf(
			language({ supported: ['en'], fallback: 'en' })['~requires'],
		).toEqualTypeOf<Empty>();
	});

	test('an app that does not give what the resolver reads is refused', () => {
		const byUser = language({
			supported: ['en', 'fr'],
			fallback: 'en',
			resolve: ({ user }: { user: { locale: string } }) => user.locale,
		});
		const _refused = () => {
			// @ts-expect-error the plugin reads "user", which this app's context does not give
			alxia().use(byUser);
			alxia()
				.derive(() => ({ user: { locale: 1 } }))
				// @ts-expect-error the plugin reads "user", which this app's context gives with another type
				.use(byUser);
		};
		expect(_refused).toBeFunction();
	});

	test('a key of BaseContext annotated with a type it does not give is refused', () => {
		const wrong = language({
			supported: ['en'],
			fallback: 'en',
			resolve: ({ url }: { url: string }) => url.slice(1),
		});
		expectTypeOf(wrong['~requires']).toEqualTypeOf<{ url: string }>();
		const _refused = () => {
			// @ts-expect-error the plugin reads "url", which this app's context gives with another type
			alxia().use(wrong);
		};
		expect(_refused).toBeFunction();
	});

	test('a resolver annotated any is refused on every app', () => {
		const loose = language({
			supported: ['en'],
			fallback: 'en',
			resolve: (ctx: any) => ctx.user.locale,
		});
		expectTypeOf(loose['~requires']).toEqualTypeOf<{
			readonly '~any': "the plugin's resolve reads its context as any: annotate what it reads, or leave it unannotated";
		}>();
		const _refused = () => {
			// @ts-expect-error the plugin's resolve reads its context as any
			alxia().use(loose);
			alxia()
				.derive(() => ({ user: { locale: 'fr' } }))
				// @ts-expect-error the plugin's resolve reads its context as any, whatever the app gives
				.use(loose);
		};
		expect(_refused).toBeFunction();
	});

	test('a resolver annotated unknown or object needs nothing', async () => {
		const byUnknown = language({
			supported: ['en', 'fr'],
			fallback: 'en',
			resolve: (ctx: unknown) =>
				ctx instanceof Object && 'url' in ctx ? 'fr' : undefined,
		});
		const byObject = language({
			supported: ['en', 'fr'],
			fallback: 'en',
			resolve: (ctx: object) => ('url' in ctx ? 'fr' : undefined),
		});
		expectTypeOf(byUnknown['~requires']).toEqualTypeOf<Empty>();
		expectTypeOf(byObject['~requires']).toEqualTypeOf<Empty>();
		for (const plugin of [byUnknown, byObject]) {
			const served = alxia()
				.use(plugin)
				.get('/', ({ language: current, reply }) => reply(200, current));
			expect(await (await served.request('/')).text()).toBe('fr');
		}
	});

	test('a fallback it does not support is refused', () => {
		// @ts-expect-error: 'de' is not one of the supported languages
		expect(() => language({ supported: ['en', 'fr'], fallback: 'de' })).toThrow(
			'not supported',
		);
	});
});

describe('negotiate', () => {
	test('weights, refusals, regions', () => {
		expect(parseAcceptLanguage('fr;q=0.5, en, de;q=0')).toEqual([
			{ tag: 'en', q: 1 },
			{ tag: 'fr', q: 0.5 },
		]);
		expect(negotiate('*', ['fr', 'en'])).toBe('fr');
		expect(match('EN-gb', ['en', 'fr'])).toBe('en');
		expect(negotiate('de', ['en'])).toBeUndefined();
	});
});
